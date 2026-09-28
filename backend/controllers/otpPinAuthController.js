import { executeQuery } from '../config/db.js';
import { generateToken } from '../utils/jwtHelper.js';
import { successResponse, errorResponse } from '../utils/responseHelper.js';
import { sendLoginOtpEmail } from '../services/emailService.js';
import { sendSms, isSmsConfigured } from '../services/smsService.js';
import { recordAudit } from '../utils/auditLog.js';
import {
  CHANNEL_EMAIL,
  CHANNEL_SMS,
  LOGIN_OTP_LENGTH,
  LOGIN_OTP_TTL_MS,
  LOGIN_OTP_RESEND_COOLDOWN_MS,
  LOGIN_OTP_FAILED_MESSAGE,
  issueLoginOtp,
  secondsUntilResend,
  verifyLoginOtp,
} from '../services/loginOtpService.js';
import {
  PIN_LENGTH,
  PIN_MAX_ATTEMPTS,
  PIN_LOCK_MS,
  PIN_SETUP_GRANT_TTL_MS,
  isValidPinFormat,
  isPinEnabled,
  hashPin,
  verifyPin,
  getPinLockSecondsRemaining,
  recordFailedPinAttempt,
  clearPinAttempts,
  issuePinSetupGrant,
  consumePinSetupGrant,
} from '../services/loginPinService.js';

// =====================================================
// OPTIONAL OTP / PIN SIGN-IN
//
// Endpoints for the four additional sign-in combinations:
//
//   email   + OTP      -> POST /otp-pin/send-otp   then /otp-pin/verify-otp
//   mobile  + OTP      -> POST /otp-pin/send-otp   then /otp-pin/verify-otp
//   email   + PIN      -> POST /otp-pin/verify-pin
//   mobile  + PIN      -> POST /otp-pin/verify-pin
//
// Everything here is additive and isolated. Nothing in the existing
// email+password, Google OAuth, email-verification, forgot/reset-password,
// admin, cart, order, checkout or Razorpay code path is read or written here.
//
// The session handed out on success is produced by the EXISTING
// jwtHelper.generateToken() with the SAME payload shape the existing login
// endpoint returns ({ id, email, role }), so GET /api/auth/me, the axios
// interceptor, AuthContext and every route guard work against it with no
// changes at all.
// =====================================================

// Mirrors normalizePhone/stripPhoneFormatting in controllers/authController.js so
// '+1 (555) 019-2834' and '+15550192834' resolve to the same account. The
// existing pair is module-private, so rather than refactor that controller this
// duplicates the two one-line helpers and stays completely independent of it.
const normalizePhone = (value) =>
  String(value).trim().replace(/[\s\-()+.]/g, '');

const stripPhoneFormatting = (column) =>
  `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${column}, ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''), '.', '')`;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const looksLikeEmail = (value) => EMAIL_PATTERN.test(String(value || '').trim());

/**
 * Which channel a sign-in code must travel on. An email address can only be
 * reached by email; anything else is treated as a mobile number, exactly as the
 * existing /api/auth/login route does with its `identifier` field.
 */
const channelForIdentifier = (identifier) =>
  looksLikeEmail(identifier) ? CHANNEL_EMAIL : CHANNEL_SMS;

/** Email -> a***@d***.com, phone -> ******2834. Never echoes a full destination. */
function maskEmail(email) {
  const [local, domain] = String(email || '').split('@');

  if (!domain) return '***';

  const dot = domain.lastIndexOf('.');
  const tld = dot > 0 ? domain.slice(dot) : '';

  return `${String(local || '').slice(0, 1)}***@${domain.slice(0, 1)}***${tld}`;
}

function maskPhone(phone) {
  const digits = normalizePhone(phone);

  if (!digits) return '***';
  if (digits.length <= 4) return '*'.repeat(digits.length);

  return `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}

const maskDestination = (channel, value) =>
  channel === CHANNEL_EMAIL ? maskEmail(value) : maskPhone(value);

/**
 * Resolves the account behind an email address or mobile number.
 * Returns null when nothing matches.
 */
async function findUserByIdentifier(identifier) {
  const value = String(identifier || '').trim();

  if (!value) return null;

  if (looksLikeEmail(value)) {
    const rows = await executeQuery('SELECT * FROM users WHERE email = ?', [
      value.toLowerCase(),
    ]);

    return rows[0] || null;
  }

  const digits = normalizePhone(value);

  // Cheap length gate so a typo cannot turn into a full-table scan.
  if (digits.length < 10 || digits.length > 15) return null;

  const rows = await executeQuery(
    `SELECT * FROM users WHERE ${stripPhoneFormatting('phone')} = ? LIMIT 1`,
    [digits]
  );

  return rows[0] || null;
}

/**
 * Builds the exact response body the existing login endpoint produces, so the
 * frontend can treat an OTP/PIN sign-in and a password sign-in identically.
 * Note what is absent: pin_hash is never included.
 */
function buildAuthPayload(user) {
  return {
    token: generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
    }),
    user: {
      id: user.id,
      name: user.full_name,
      email: user.email,
      role: user.role,
      avatar_url: user.avatar_url,
      phone: user.phone,
      active_plan_id: user.active_plan_id,
      email_verified: Boolean(user.email_verified),
    },
  };
}

/** Same wording and status code the existing login endpoint uses. */
function accountStatusError(res, user) {
  return errorResponse(
    res,
    `Your account is ${user.status}. Please contact support.`,
    403
  );
}

/**
 * The existing login endpoint refuses to issue a session to an unverified
 * address. The OTP/PIN methods hold the same line, so ProtectedRoute behaves
 * identically no matter which method was used to sign in.
 */
function emailNotVerifiedError(res, user) {
  return errorResponse(
    res,
    'Your email address is not verified yet. Please check your inbox for your 6-digit verification code, or request a new one.',
    403,
    { emailVerified: false, email: user.email }
  );
}

/**
 * Shared tail of both successful sign-ins: status gate, email-verification
 * gate, audit entry. Returns the payload to send, or null once it has already
 * written a response.
 */
async function completeSignIn(req, res, user, method) {
  if (user.status !== 'active') {
    accountStatusError(res, user);

    return null;
  }

  if (!user.email_verified) {
    emailNotVerifiedError(res, user);

    return null;
  }

  await recordAudit({
    req,
    action: 'auth.login',
    entityType: 'user',
    entityId: user.id,
    details: { email: user.email, role: user.role, method },
    actor: { id: user.id, email: user.email, role: user.role },
  });

  console.log('[Auth] Sign-in success:', {
    userId: user.id,
    role: user.role,
    method,
  });

  return buildAuthPayload(user);
}

/**
 * POST /api/auth/otp-pin/identify
 *
 * Step 1 of the UI: confirms the identifier belongs to an account and reports
 * which of the two additional methods it can actually use, so the page can show
 * "Send OTP" and/or "Use PIN" instead of failing after the user commits.
 *
 * No secret is involved here, so the same generic 404 the login flow uses for an
 * unknown account is returned rather than a distinguishable response.
 */
export async function identifyAccount(req, res) {
  try {
    const { identifier } = req.body || {};
    const value = String(identifier || '').trim();

    if (!value) {
      return errorResponse(
        res,
        'Email address or mobile number is required',
        400
      );
    }

    if (!looksLikeEmail(value) && normalizePhone(value).length < 10) {
      return errorResponse(
        res,
        'Enter a valid email address or mobile number',
        400
      );
    }

    const user = await findUserByIdentifier(value);

    if (!user) {
      return errorResponse(
        res,
        'No Velora account matches that email address or mobile number.',
        404
      );
    }

    if (user.status !== 'active') {
      return accountStatusError(res, user);
    }

    const channel = channelForIdentifier(value);

    // For a mobile number the account's own `phone` column is authoritative -
    // it is the value the code will be delivered to, not whatever formatting
    // the caller happened to type.
    const destination =
      channel === CHANNEL_EMAIL ? user.email : user.phone;

    const pinEnabled = isPinEnabled(user);

    console.log('[Auth] OTP/PIN identify', {
      userId: user.id,
      channel,
      pinEnabled,
    });

    return successResponse(res, 'Account found', {
      channel,
      destination: maskDestination(channel, destination),
      otpAvailable: true,
      pinAvailable: pinEnabled,
      emailVerified: Boolean(user.email_verified),
      // Lets the page say up front that mobile codes are not deliverable yet
      // rather than after the user asks for one.
      smsConfigured: channel === CHANNEL_SMS ? isSmsConfigured() : null,
      otpLength: LOGIN_OTP_LENGTH,
      pinLength: PIN_LENGTH,
    });
  } catch (error) {
    console.error('OTP/PIN Identify Error:', error);
    return errorResponse(res, 'Failed to look up that account', 500);
  }
}

/**
 * POST /api/auth/otp-pin/send-otp
 *
 * Issues a 6-digit code and delivers it over the identifier's own channel.
 * Email reuses the existing SMTP service; mobile requires an SMS provider,
 * which this project does not ship, so an unconfigured SMS deployment is
 * reported as a 503 with the exact variables that are missing.
 */
export async function sendLoginOtp(req, res) {
  try {
    const { identifier } = req.body || {};
    const value = String(identifier || '').trim();

    if (!value) {
      return errorResponse(
        res,
        'Email address or mobile number is required',
        400
      );
    }

    const user = await findUserByIdentifier(value);

    if (!user) {
      return errorResponse(res, 'Invalid credentials', 401);
    }

    if (user.status !== 'active') {
      return accountStatusError(res, user);
    }

    const channel = channelForIdentifier(value);

    // Fail before issuing anything if the channel cannot deliver, so a code is
    // never generated for a destination that cannot receive it.
    if (channel === CHANNEL_SMS && !isSmsConfigured()) {
      console.warn('[Auth] Mobile OTP sign-in requested but SMS is not configured', {
        userId: user.id,
      });

      return errorResponse(
        res,
        'SMS delivery is not configured on this server, so a sign-in code cannot be sent to a mobile number. Please use your email address, or contact support to enable SMS.',
        503,
        { smsRequired: true, channel: CHANNEL_SMS }
      );
    }

    const retryAfter = await secondsUntilResend(user.id, channel);

    if (retryAfter > 0) {
      return errorResponse(
        res,
        `Please wait ${retryAfter} second${retryAfter === 1 ? '' : 's'} before requesting another code.`,
        429,
        { retryAfter }
      );
    }

    const otp = await issueLoginOtp(user.id, channel);

    const delivery =
      channel === CHANNEL_EMAIL
        ? await sendLoginOtpEmail(user.email, user.full_name, otp)
        : await sendSms({
            to: user.phone,
            message: `Your Velora sign-in code is ${otp}. It expires in 10 minutes.`,
          });

    // The code is never included in a response, successful or not. On failure
    // the row is removed so an undelivered code cannot be sitting in the table.
    if (!delivery.success) {
      await executeQuery(
        'DELETE FROM login_otp_codes WHERE user_id = ? AND channel = ? AND used = 0',
        [user.id, channel]
      );

      return errorResponse(
        res,
        delivery.error ||
          'The sign-in code could not be sent. Please try again shortly.',
        502,
        {
          errorCode: delivery.errorCode,
          missingConfig: delivery.missingConfig || [],
        }
      );
    }

    return successResponse(res, 'Sign-in code sent', {
      channel,
      destination: maskDestination(
        channel,
        channel === CHANNEL_EMAIL ? user.email : user.phone
      ),
      delivery: delivery.delivery,
      otpLength: LOGIN_OTP_LENGTH,
      otpExpiresInMinutes: LOGIN_OTP_TTL_MS / 60000,
      resendCooldownSeconds: LOGIN_OTP_RESEND_COOLDOWN_MS / 1000,
    });
  } catch (error) {
    console.error('OTP/PIN Send OTP Error:', error);
    return errorResponse(res, 'Failed to send the sign-in code', 500);
  }
}

/**
 * POST /api/auth/otp-pin/verify-otp
 *
 * On success this signs the user in exactly as the password flow does, and -
 * only when the account has no PIN yet - also returns a short-lived,
 * single-use grant that is the sole thing setPin will accept. That is what
 * enforces "a PIN can only be created after a successful OTP verification".
 */
export async function verifyLoginOtpCode(req, res) {
  try {
    const { identifier, otp, code } = req.body || {};
    const value = String(identifier || '').trim();
    const submitted = String(otp ?? code ?? '').trim();

    if (!value) {
      return errorResponse(
        res,
        'Email address or mobile number is required',
        400
      );
    }

    if (!new RegExp(`^\\d{${LOGIN_OTP_LENGTH}}$`).test(submitted)) {
      return errorResponse(
        res,
        `The ${LOGIN_OTP_LENGTH}-digit sign-in code is required`,
        400
      );
    }

    const user = await findUserByIdentifier(value);

    if (!user) {
      return errorResponse(res, 'Invalid credentials', 401);
    }

    if (user.status !== 'active') {
      return accountStatusError(res, user);
    }

    const channel = channelForIdentifier(value);
    const result = await verifyLoginOtp({
      userId: user.id,
      channel,
      otp: submitted,
    });

    if (!result.ok) {
      if (result.reason === 'too_many_attempts') {
        return errorResponse(
          res,
          'Too many incorrect attempts. Please request a new sign-in code.',
          429
        );
      }

      if (result.reason === 'mismatch') {
        return errorResponse(res, LOGIN_OTP_FAILED_MESSAGE, 400, {
          attemptsRemaining: result.attemptsRemaining,
        });
      }

      return errorResponse(res, LOGIN_OTP_FAILED_MESSAGE, 400);
    }

    // A verified SMS code is proof the caller controls the number, so the
    // account's mobile is now known-good. This only ever writes the new
    // mobile_verified column for the account that just signed in - no existing
    // column is touched and no other row is affected.
    if (channel === CHANNEL_SMS && !user.mobile_verified) {
      await executeQuery('UPDATE users SET mobile_verified = 1 WHERE id = ?', [
        user.id,
      ]);

      user.mobile_verified = 1;
    }

    const payload = await completeSignIn(req, res, user, 'otp');

    if (!payload) return null;

    // Only hand out a PIN-setup grant to an account that cannot use a PIN yet.
    const pinEnabled = isPinEnabled(user);
    const pinSetupToken = pinEnabled ? null : await issuePinSetupGrant(user.id);

    return successResponse(res, 'Login successful', {
      ...payload,
      method: 'otp',
      channel,
      pinEnabled,
      pinSetup: Boolean(pinSetupToken),
      pinSetupToken,
      pinSetupExpiresInMinutes: pinSetupToken
        ? PIN_SETUP_GRANT_TTL_MS / 60000
        : null,
    });
  } catch (error) {
    console.error('OTP/PIN Verify OTP Error:', error);
    return errorResponse(res, 'Failed to verify the sign-in code', 500);
  }
}

/**
 * POST /api/auth/otp-pin/verify-pin
 *
 * Only reachable by an account that has actually set a PIN. Five wrong guesses
 * lock PIN sign-in for 15 minutes, which is what stops a 6-digit PIN from
 * being walked offline-scale online.
 */
export async function verifyLoginPin(req, res) {
  try {
    const { identifier, pin } = req.body || {};
    const value = String(identifier || '').trim();
    const submitted = String(pin ?? '').trim();

    if (!value) {
      return errorResponse(
        res,
        'Email address or mobile number is required',
        400
      );
    }

    if (!isValidPinFormat(submitted)) {
      return errorResponse(
        res,
        `The ${PIN_LENGTH}-digit PIN is required`,
        400
      );
    }

    const user = await findUserByIdentifier(value);

    if (!user) {
      return errorResponse(res, 'Invalid credentials', 401);
    }

    if (user.status !== 'active') {
      return accountStatusError(res, user);
    }

    if (!isPinEnabled(user)) {
      // Same shape as the existing login's "social-only account" branch: one
      // message for "no such account" and "no PIN set", so this cannot be used
      // to enumerate accounts.
      console.log('[Auth] PIN sign-in rejected:', {
        userId: user.id,
        reason: 'pin_not_enabled',
      });

      return errorResponse(res, 'Invalid credentials', 401);
    }

    const lockedFor = await getPinLockSecondsRemaining(user.id);

    if (lockedFor > 0) {
      return errorResponse(
        res,
        `Too many incorrect PIN attempts. Please try again in ${lockedFor} seconds or use a sign-in code instead.`,
        429,
        { retryAfter: lockedFor, lockedUntilSeconds: lockedFor }
      );
    }

    const matches = await verifyPin(submitted, user.pin_hash);

    if (!matches) {
      const { attemptsRemaining, lockedForSeconds } =
        await recordFailedPinAttempt(user.id);

      console.warn('[Auth] PIN sign-in failed', {
        userId: user.id,
        attemptsRemaining,
        locked: lockedForSeconds > 0,
      });

      if (lockedForSeconds > 0) {
        return errorResponse(
          res,
          `Too many incorrect PIN attempts. Please try again in ${lockedForSeconds} seconds or use a sign-in code instead.`,
          429,
          { retryAfter: lockedForSeconds, lockedUntilSeconds: lockedForSeconds }
        );
      }

      return errorResponse(
        res,
        'The PIN is incorrect. Please try again.',
        400,
        { attemptsRemaining }
      );
    }

    // The PIN is never logged - not here, not on failure, not anywhere.
    await clearPinAttempts(user.id);

    const payload = await completeSignIn(req, res, user, 'pin');

    if (!payload) return null;

    return successResponse(res, 'Login successful', {
      ...payload,
      method: 'pin',
      channel: channelForIdentifier(value),
      pinEnabled: true,
    });
  } catch (error) {
    console.error('OTP/PIN Verify PIN Error:', error);
    return errorResponse(res, 'Failed to verify the PIN', 500);
  }
}

/**
 * PUT /api/auth/otp-pin/pin  (authenticated)
 *
 * Creates the optional 6-digit PIN. Requires the single-use grant handed out by
 * a successful OTP verification, so neither a password session nor a Google
 * session can add a PIN on its own.
 *
 * Responds with { pinEnabled: true } only - the hash is never echoed.
 */
export async function setLoginPin(req, res) {
  try {
    const { pin, confirmPin, setupToken } = req.body || {};
    const submitted = String(pin ?? '').trim();

    if (!isValidPinFormat(submitted)) {
      return errorResponse(
        res,
        `The PIN must be exactly ${PIN_LENGTH} digits`,
        400
      );
    }

    if (submitted !== String(confirmPin ?? '').trim()) {
      return errorResponse(res, 'The two PINs do not match', 400);
    }

    const grant = await consumePinSetupGrant(req.user.id, setupToken);

    if (!grant.ok) {
      return errorResponse(res, grant.message, 403);
    }

    if (isPinEnabled(req.user)) {
      return errorResponse(
        res,
        'A PIN is already set for this account. Remove the existing PIN before creating a new one.',
        409
      );
    }

    const pinHash = await hashPin(submitted);

    await executeQuery(
      'UPDATE users SET pin_hash = ?, pin_enabled = 1 WHERE id = ?',
      [pinHash, req.user.id]
    );

    // Only the fact that a PIN now exists is recorded. The value and the hash
    // are never written to the log.
    console.log('[Auth] PIN created', {
      userId: req.user.id,
      pinLength: PIN_LENGTH,
    });

    return successResponse(res, 'PIN created successfully', {
      pinEnabled: true,
    });
  } catch (error) {
    console.error('OTP/PIN Set PIN Error:', error);
    return errorResponse(res, 'Failed to create the PIN', 500);
  }
}

/**
 * DELETE /api/auth/otp-pin/pin  (authenticated)
 *
 * Removes the PIN so the account falls back to the existing sign-in methods.
 * The user's password, email verification and social links are untouched.
 */
export async function disableLoginPin(req, res) {
  try {
    await executeQuery(
      'UPDATE users SET pin_hash = NULL, pin_enabled = 0 WHERE id = ?',
      [req.user.id]
    );

    await executeQuery('DELETE FROM pin_login_attempts WHERE user_id = ?', [
      req.user.id,
    ]);

    await executeQuery('DELETE FROM pin_setup_grants WHERE user_id = ?', [
      req.user.id,
    ]);

    console.log('[Auth] PIN removed', { userId: req.user.id });

    return successResponse(res, 'PIN removed successfully', {
      pinEnabled: false,
    });
  } catch (error) {
    console.error('OTP/PIN Disable PIN Error:', error);
    return errorResponse(res, 'Failed to remove the PIN', 500);
  }
}

/**
 * GET /api/auth/otp-pin/status  (authenticated)
 *
 * Lets the page (and a future Profile setting) show whether a PIN exists
 * without ever exposing the hash. Reports booleans only.
 */
export async function pinStatus(req, res) {
  try {
    return successResponse(res, 'PIN status retrieved', {
      pinEnabled: isPinEnabled(req.user),
      mobileVerified: Boolean(req.user.mobile_verified),
      hasMobile: Boolean(normalizePhone(req.user.phone)),
      pinLength: PIN_LENGTH,
      pinMaxAttempts: PIN_MAX_ATTEMPTS,
      pinLockMinutes: PIN_LOCK_MS / 60000,
      smsConfigured: isSmsConfigured(),
    });
  } catch (error) {
    console.error('OTP/PIN Status Error:', error);
    return errorResponse(res, 'Failed to retrieve the PIN status', 500);
  }
}
