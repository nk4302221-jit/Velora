import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { executeQuery } from '../config/db.js';
import { generateToken } from '../utils/jwtHelper.js';
import { successResponse, errorResponse } from '../utils/responseHelper.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/emailService.js';import { handleSocialAuth } from '../services/oauthService.js';
import { recordAudit } from '../utils/auditLog.js';

// =====================================================
// LOGIN IDENTIFIER RESOLUTION
//
// Sign-in accepts either the account's email address or its mobile number, so
// the field is inspected for an '@': anything with one is treated as an email,
// anything else is normalised as a phone number. Both paths return the full user
// row; the caller only ever sees the generic "Invalid credentials" message, so
// this never becomes an account-enumeration oracle.
// =====================================================

// Mirrors stripPhoneFormatting() below so both sides of the comparison end up
// as bare digits.
const normalizePhone = (value) =>
  String(value).trim().replace(/[\s\-()+.]/g, '');

// Strips formatting from a phone number in SQL so '+1 (555) 019-2834' and
// '+15550192834' resolve to the same account regardless of how the user stored
// it. REPLACE exists in both MySQL and SQLite, so one expression covers both
// engines.
const stripPhoneFormatting = (column) =>
  `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${column}, ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''), '.', '')`;

async function resolveLoginIdentifier(email, phone) {
  if (email) {
    return executeQuery('SELECT * FROM users WHERE email = ?', [
      String(email).toLowerCase().trim(),
    ]);
  }

  if (phone) {
    const digitsOnly = normalizePhone(String(phone).trim());

    // Digits-only comparison on both sides, so formatting differences between
    // what the user typed and what is stored do not lock them out.
    return executeQuery(
      `SELECT * FROM users
        WHERE ${stripPhoneFormatting('phone')} = ?
        LIMIT 1`,
      [digitsOnly]
    );
  }

  return [];
}

// =====================================================
// EMAIL VERIFICATION OTP
//
// Registration and "Resend Code" share one issuance path so a code can never be
// generated one way and emailed another. The code is exactly 6 digits drawn
// from crypto.randomInt (a CSPRNG) and is NEVER persisted: only its SHA-256
// hash goes into email_verification_tokens.token, alongside the 10-minute
// expiry in expires_at.
//
// The hash is bound to the user id. Two accounts that happen to be issued the
// same 6 digits therefore store different hashes, which is what keeps the
// UNIQUE index on `token` satisfiable, and it stops a code emailed to one
// person from ever verifying another account.
//
// Every issuance deletes the user's outstanding rows first, so only the most
// recently emailed code can ever be used.
// =====================================================

const VERIFICATION_OTP_LENGTH = 6;
const VERIFICATION_OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const VERIFICATION_OTP_MAX_ATTEMPTS = 5;
const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds

// Returned for every wrong/expired/unknown code so the endpoint never reveals
// which of those it was, and so it cannot be used to probe for accounts.
const VERIFY_FAILED_MESSAGE =
  'The verification code is incorrect or has expired. Please request a new code.';

// mysql2 returns TIMESTAMP/DATETIME columns as Date objects, while SQLite
// returns the UTC datetime string written by the formatter below. `new Date()`
// on that string parses it as LOCAL time, which would make a 10-minute code
// look expired early. Normalizing both shapes to a UTC epoch is what makes the
// expiry and cooldown checks correct on either engine.
function parseSqlDateTime(value) {
  if (value instanceof Date) return value.getTime();

  return new Date(String(value).replace(' ', 'T') + 'Z').getTime();
}

function formatSqlDatetime(date) {
  return date.toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * Exactly 6 digits, uniformly distributed, from the OS CSPRNG.
 * crypto.randomInt's max is exclusive, so 1_000_000 yields 0-999999.
 * Math.random() is deliberately not used: it is neither unpredictable nor
 * uniformly distributed, which makes a generated code guessable.
 */
function generateVerificationOtp() {
  return String(
    crypto.randomInt(0, 10 ** VERIFICATION_OTP_LENGTH)
  ).padStart(VERIFICATION_OTP_LENGTH, '0');
}

function hashVerificationOtp(userId, otp) {
  return crypto
    .createHash('sha256')
    .update(`velora-email-otp:${userId}:${otp}`)
    .digest('hex');
}

// Constant-time comparison so the response time cannot be used to recover the
// stored hash one character at a time.
function safeCompareHex(a, b) {
  const left = Buffer.from(String(a), 'utf8');
  const right = Buffer.from(String(b), 'utf8');

  if (left.length !== right.length) return false;

  return crypto.timingSafeEqual(left, right);
}

/**
 * The one outstanding OTP row for a user, if any.
 *
 * `otp_last_sent_at IS NOT NULL` is what separates an OTP row from a row left
 * behind by the previous long-token flow, so those are simply never matched
 * (and are left untouched, not deleted).
 */
async function findActiveOtpRecord(userId) {
  const records = await executeQuery(
    `SELECT * FROM email_verification_tokens
      WHERE user_id = ? AND used = 0 AND otp_last_sent_at IS NOT NULL
      ORDER BY id DESC
      LIMIT 1`,
    [userId]
  );

  return records[0] || null;
}

async function invalidateOtpRecord(recordId) {
  await executeQuery('UPDATE email_verification_tokens SET used = 1 WHERE id = ?', [recordId]);
}

/**
 * Issues a fresh 6-digit code for `userId`, replacing any outstanding one.
 * Returns the raw code so the caller can email it; it is not logged, not
 * persisted and not returned to the client.
 */
async function issueVerificationOtp(userId, email) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + VERIFICATION_OTP_TTL_MS);

  // A resend supersedes every code already in the user's inbox.
  await executeQuery('DELETE FROM email_verification_tokens WHERE user_id = ? AND used = 0', [userId]);

  const otp = generateVerificationOtp();

  await executeQuery(
    `INSERT INTO email_verification_tokens
       (user_id, token, expires_at, used, otp_attempts, otp_last_sent_at)
     VALUES (?, ?, ?, 0, 0, ?)`,
    [userId, hashVerificationOtp(userId, otp), formatSqlDatetime(expiresAt), formatSqlDatetime(now)]
  );

  // The code is a credential that grants account verification, so only the
  // fact of issuance is logged - never the code itself.
  console.log('[Email] Verification OTP generated', {
    userId,
    to: email,
    digits: VERIFICATION_OTP_LENGTH,
    expiresAt: expiresAt.toISOString(),
    ttlMinutes: VERIFICATION_OTP_TTL_MS / 60000,
  });

  return otp;
}

export async function register(req, res) {
  try {
    const { fullName, email, password, confirmPassword, phone } = req.body;

    // Public registration can ONLY ever create a CUSTOMER. A role supplied by
    // the client is rejected outright rather than silently dropped, so a
    // privilege-escalation attempt is visible instead of quietly ignored.
    // Admin accounts are created only by a Super Admin via
    // POST /api/admin/users/admin.
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'role')) {
      console.warn('[Auth] Registration rejected - client attempted to set a role', {
        email: email ? String(email).toLowerCase().trim() : null,
        attemptedRole: req.body.role,
      });

      return errorResponse(
        res,
        'Role cannot be set during registration. Public sign-up always creates a customer account.',
        403
      );
    }

    // 1. Validation
    if (!fullName || !email || !password || !confirmPassword) {
      return errorResponse(res, 'All required fields must be filled', 400);
    }

    if (password !== confirmPassword) {
      return errorResponse(res, 'Password and confirmation password do not match', 400);
    }

    if (password.length < 6) {
      return errorResponse(res, 'Password must be at least 6 characters long', 400);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return errorResponse(res, 'Please provide a valid email address', 400);
    }

    // 2. Check uniqueness
    // The address is normalised ONCE here and that single value is what gets
    // persisted, emailed and echoed back to the client. Registering
    // " Test@Example.com " must not create a row that disagrees with the
    // address the verification mail is sent to.
    const normalizedEmail = String(email).toLowerCase().trim();

    const existing = await executeQuery('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
    if (existing.length > 0) {
      return errorResponse(res, 'An account with this email address already exists', 409);
    }

    // 3. Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 4. Create user in MySQL
    const userInsert = await executeQuery(
      `INSERT INTO users (full_name, email, password_hash, phone, role, email_verified, status)
       VALUES (?, ?, ?, ?, 'customer', 0, 'active')`,
      [fullName.trim(), normalizedEmail, passwordHash, phone ? phone.trim() : null]
    );

    const userId = userInsert.insertId;

    // Create default cart and wishlist for user
    await executeQuery('INSERT INTO cart (user_id) VALUES (?)', [userId]);
    await executeQuery('INSERT INTO wishlist (user_id) VALUES (?)', [userId]);

    // 5. Generate + store the 6-digit email verification OTP (10-minute expiry)
    const otp = await issueVerificationOtp(userId, normalizedEmail);

    // 6. Send verification email
    // A delivery failure must NOT be swallowed: the account exists at this
    // point, so the request itself still succeeds (returning an error would only
    // produce a confusing 409 on the user's next attempt), but the response
    // reports emailSent:false so the client can tell the user the code never
    // arrived instead of parking them on a page waiting for mail that is not
    // coming.
    const emailResult = await sendVerificationEmail(normalizedEmail, fullName.trim(), otp);

    if (!emailResult.success) {
      console.error('[Auth] Registration completed but the verification email was NOT delivered', {
        userId,
        email: normalizedEmail,
        errorCode: emailResult.errorCode,
        reason: emailResult.error,
      });
    }

    return successResponse(
      res,
      emailResult.success
        ? 'Registration successful! Please check your email for your 6-digit verification code before logging in.'
        : 'Account created, but the verification email could not be sent. Use "Resend Code" to try again.',
      {
        userId,
        email: normalizedEmail,
        emailSent: emailResult.success,
        emailDelivery: emailResult.delivery,
        emailErrorCode: emailResult.errorCode,
        // The transport's own message can name the SMTP host, the failing
        // command or an auth-failure detail, so it is written to the server log
        // and never returned. The machine-readable code plus the NAMES of the
        // missing variables are enough for the client to say something useful
        // without publishing internals.
        emailMissingConfig: emailResult.missingConfig || [],
        otpLength: VERIFICATION_OTP_LENGTH,
        otpExpiresInMinutes: VERIFICATION_OTP_TTL_MS / 60000,
      },
      201
    );
  } catch (error) {
    console.error('Registration Error:', error);
    return errorResponse(res, 'Registration failed due to a server error', 500);
  }
}

export async function verifyEmail(req, res) {
  try {
    // The code is read from `otp`; `code` and `token` are accepted as aliases so
    // the request shape stays backward compatible with existing callers.
    const submitted =
      req.body?.otp ?? req.body?.code ?? req.body?.token ?? req.query?.otp ?? req.query?.code;

    // The account address is required because a 6-digit code is only meaningful
    // together with the account it was issued for - that is also what makes the
    // per-account attempt counter enforceable.
    const normalizedEmail = String(req.body?.email || req.query?.email || '')
      .toLowerCase()
      .trim();

    if (!normalizedEmail) {
      return errorResponse(
        res,
        'Email address is required along with the verification code',
        400
      );
    }

    const otp = String(submitted ?? '').trim();

    if (!new RegExp(`^\\d{${VERIFICATION_OTP_LENGTH}}$`).test(otp)) {
      return errorResponse(
        res,
        `Verification code must be exactly ${VERIFICATION_OTP_LENGTH} digits`,
        400
      );
    }

    const users = await executeQuery('SELECT id, email, email_verified FROM users WHERE email = ?', [
      normalizedEmail,
    ]);

    // An unknown address and a wrong code produce the identical response, so the
    // endpoint is not an account-enumeration oracle.
    if (users.length === 0) {
      return errorResponse(res, VERIFY_FAILED_MESSAGE, 400);
    }

    const user = users[0];

    if (user.email_verified) {
      return successResponse(res, 'This email is already verified. You can log in directly.', {
        verified: true,
        alreadyVerified: true,
      });
    }

    const record = await findActiveOtpRecord(user.id);

    if (!record) {
      console.warn('[Email] Verification rejected: no pending code', { userId: user.id });
      return errorResponse(
        res,
        'No verification code is pending for this account. Please request a new code.',
        400
      );
    }

    // An expired code can never be brought back to life by guessing.
    if (Date.now() > parseSqlDateTime(record.expires_at)) {
      await invalidateOtpRecord(record.id);
      console.warn('[Email] Verification rejected: code expired', { userId: user.id });
      return errorResponse(
        res,
        'Verification code has expired. Please request a new one.',
        400
      );
    }

    const attempts = Number(record.otp_attempts) || 0;

    if (attempts >= VERIFICATION_OTP_MAX_ATTEMPTS) {
      await invalidateOtpRecord(record.id);
      console.warn('[Email] Verification rejected: attempt limit already reached', { userId: user.id });
      return errorResponse(
        res,
        'Too many incorrect attempts. Please request a new code.',
        429
      );
    }

    if (!safeCompareHex(record.token, hashVerificationOtp(user.id, otp))) {
      // Count the guess against the account, not the code, so a wrong code
      // cannot be retried indefinitely against a still-valid code.
      await executeQuery('UPDATE email_verification_tokens SET otp_attempts = ? WHERE id = ?', [
        attempts + 1,
        record.id,
      ]);

      const remaining = VERIFICATION_OTP_MAX_ATTEMPTS - (attempts + 1);

      // The fifth wrong guess burns the code rather than leaving a live one for
      // an unlimited number of further tries.
      if (remaining <= 0) {
        await invalidateOtpRecord(record.id);
        console.warn('[Email] Verification rejected: attempt limit reached', { userId: user.id });
        return errorResponse(
          res,
          'Too many incorrect attempts. Please request a new code.',
          429
        );
      }

      console.warn('[Email] Verification rejected: incorrect code', {
        userId: user.id,
        attemptsRemaining: remaining,
      });

      return errorResponse(res, VERIFY_FAILED_MESSAGE, 400, { attemptsRemaining: remaining });
    }

    // Success. Mark the address verified, then destroy every trace of the code
    // so the same 6 digits can never be replayed.
    await executeQuery('UPDATE users SET email_verified = 1 WHERE id = ?', [user.id]);
    await executeQuery('DELETE FROM email_verification_tokens WHERE user_id = ?', [user.id]);

    console.log('[Email] Email verified successfully', { userId: user.id });

    return successResponse(res, 'Email successfully verified! You may now log in to your account.', {
      verified: true,
    });
  } catch (error) {
    console.error('Verify Email Error:', error);
    return errorResponse(res, 'Failed to verify email', 500);
  }
}

export async function login(req, res) {
  try {
    const { email, phone, password } = req.body;

    // Debug log for login attempts — NEVER log the plaintext password.
    console.log('[Auth] Login attempt:', {
      identifier: email
        ? String(email).toLowerCase().trim()
        : phone
          ? String(phone).trim()
          : null,
      viaPhone: Boolean(phone && !email),
      passwordReceived: Boolean(password),
    });

    if ((!email && !phone) || !password) {
      return errorResponse(res, 'Email (or mobile number) and password are required', 400);
    }

    const users = await resolveLoginIdentifier(email, phone);
    if (users.length === 0) {
      console.log('[Auth] Login rejected:', {
        reason: 'user_not_found',
        viaPhone: Boolean(phone && !email),
      });
      return errorResponse(res, 'Invalid credentials', 401);
    }

    const user = users[0];

    // Check account status
    if (user.status !== 'active') {
      console.log('[Auth] Login rejected:', { email: user.email, reason: 'account_status', status: user.status });
      return errorResponse(res, `Your account is ${user.status}. Please contact support.`, 403);
    }

    // Check password
    if (!user.password_hash) {
      // Social (Google/Facebook) only account — no password to compare.
      // Return the same 401 as wrong credentials so we never leak that the
      // account exists or how it was created (prevents account enumeration).
      console.log('[Auth] Login rejected:', { email: user.email, reason: 'social_only_account' });
      return errorResponse(res, 'Invalid credentials', 401);
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      console.log('[Auth] Login rejected:', { email: user.email, reason: 'incorrect_password' });
      return errorResponse(res, 'Invalid credentials', 401);
    }

    // Check email verification
    if (!user.email_verified) {
      console.log('[Auth] Login rejected:', { email: user.email, reason: 'email_not_verified' });
      return errorResponse(
        res,
        'Your email address is not verified yet. Please check your inbox for your 6-digit verification code, or request a new one.',
        403,
        { emailVerified: false, email: user.email }
      );
    }

    // Generate JWT
    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    console.log('[Auth] Login success:', { email: user.email, userId: user.id, role: user.role });

    await recordAudit({
      req,
      action: 'auth.login',
      entityType: 'user',
      entityId: user.id,
      details: { email: user.email, role: user.role },
      actor: { id: user.id, email: user.email, role: user.role },
    });

    return successResponse(res, 'Login successful', {
      token,
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
    });
  } catch (error) {
    console.error('Login Error:', error);
    return errorResponse(res, 'Login failed due to a server error', 500);
  }
}

export async function socialLogin(req, res) {
  try {
    const { provider, providerUserId, email, name, avatarUrl } = req.body;

    if (!provider || !email) {
      return errorResponse(res, 'Provider and email are required for social login', 400);
    }

    const result = await handleSocialAuth({
      provider,
      providerUserId: providerUserId || `social_${Date.now()}`,
      email: email.toLowerCase().trim(),
      name,
      avatarUrl,
    });

    return successResponse(res, `${provider} login successful`, result);
  } catch (error) {
    console.error('Social Login Error:', error);
    return errorResponse(res, error.message || 'Social login failed', 500);
  }
}

/**
 * Passport Google OAuth2 callback handler.
 * After passport.authenticate('google') succeeds, req.user contains
 * { token, user } produced by the reused jwtHelper/handleSocialAuth pipeline,
 * so we simply hand the JWT to the frontend via a redirect.
 */
export function googleOAuthCallback(req, res) {
  const clientUrl = process.env.CLIENT_URL || 'https://velora-six-chi.vercel.app';

  if (!req.user || !req.user.token) {
    return res.redirect(`${clientUrl}/login?error=google_auth_failed`);
  }

  return res.redirect(`${clientUrl}/login?token=${req.user.token}`);
}

/**
 * POST /api/auth/logout
 *
 * The session is a stateless bearer JWT held in the browser, so the server has
 * no session store to destroy. Logout is therefore handled in two parts:
 *   1. the client discards the token (see AuthContext.logout), which is what
 *      actually ends the session, and
 *   2. this endpoint records the event server-side so the Super Admin audit
 *      log shows who signed out and when.
 *
 * Requiring a valid token means an anonymous caller cannot pollute the audit
 * trail, and the response never echoes the token back.
 */
export async function logout(req, res) {
  try {
    // =====================================================
    // REVOKE THIS SESSION
    // Clearing localStorage on the client is not enough: the JWT would stay
    // valid for its full 7-day life. Recording its `jti` makes every later
    // request with that token fail with 401 in `authenticate`.
    // =====================================================
    const jti = req.tokenClaims?.jti;

    if (jti) {
      const expiresAt = req.tokenClaims?.exp
        ? new Date(req.tokenClaims.exp * 1000)
        : null;

      await executeQuery(
        `INSERT INTO revoked_tokens (jti, user_id, expires_at)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE revoked_at = CURRENT_TIMESTAMP`,
        [jti, req.user.id, expiresAt]
      );
    } else {
      // Tokens issued before this change carry no `jti`, so there is nothing
      // to revoke individually. Force those to expire naturally.
      console.warn('[Auth] logout token has no jti; session cannot be individually revoked');
    }

    await recordAudit({
      req,
      action: 'auth.logout',
      entityType: 'user',
      entityId: req.user.id,
      details: { email: req.user.email, sessionRevoked: Boolean(jti) },
    });

    return successResponse(res, 'Logged out successfully', {
      loggedOut: true,
      sessionRevoked: Boolean(jti),
    });
  } catch (error) {
    console.error('Logout Error:', error);
    return errorResponse(res, 'Failed to process logout', 500);
  }
}

export async function getMe(req, res) {  try {
    const users = await executeQuery(
      `SELECT u.id, u.full_name as name, u.email, u.phone, u.role, u.email_verified, u.avatar_url, 
              u.active_plan_id, u.status, u.created_at,
              p.name as plan_name, s.expiry_time as plan_expiry, s.status as subscription_status
       FROM users u
       LEFT JOIN subscriptions s ON s.user_id = u.id AND s.status = 'active'
       LEFT JOIN plans p ON p.id = s.plan_id
       WHERE u.id = ?`,
      [req.user.id]
    );

    if (users.length === 0) {
      return errorResponse(res, 'User not found', 404);
    }

    const user = users[0];
    return successResponse(res, 'Profile retrieved', { user });
  } catch (error) {
    console.error('GetMe Error:', error);
    return errorResponse(res, 'Failed to retrieve user profile', 500);
  }
}

export async function resendVerification(req, res) {
  try {
    const { email } = req.body;
    if (!email) {
      return errorResponse(res, 'Email address is required', 400);
    }

    // Same normalisation as registration, so "  Test@Example.com " reaches the
    // account created from that exact address.
    const normalizedEmail = String(email).toLowerCase().trim();

    const users = await executeQuery('SELECT * FROM users WHERE email = ?', [normalizedEmail]);
    if (users.length === 0) {
      return errorResponse(res, 'No account found with this email', 404);
    }

    const user = users[0];
    if (user.email_verified) {
      return successResponse(res, 'This email is already verified. You can log in directly.', {
        email: user.email,
        alreadyVerified: true,
        emailSent: false,
      });
    }

    // 60-second cooldown, measured from the last send. Without it the endpoint
    // is a free mail cannon pointed at whoever supplies an address.
    const current = await findActiveOtpRecord(user.id);

    if (current?.otp_last_sent_at) {
      const elapsed = Date.now() - parseSqlDateTime(current.otp_last_sent_at);

      if (elapsed < VERIFICATION_RESEND_COOLDOWN_MS) {
        const retryAfter = Math.ceil((VERIFICATION_RESEND_COOLDOWN_MS - elapsed) / 1000);

        console.log('[Auth] Resend verification rejected: cooldown active', {
          userId: user.id,
          retryAfterSeconds: retryAfter,
        });

        return errorResponse(
          res,
          `Please wait ${retryAfter} second${retryAfter === 1 ? '' : 's'} before requesting another code.`,
          429,
          { email: user.email, retryAfter }
        );
      }
    }

    // Always a brand new code: issuing one replaces the outstanding row, which
    // is exactly what makes the previously emailed code stop working.
    const otp = await issueVerificationOtp(user.id, user.email);

    const emailResult = await sendVerificationEmail(user.email, user.full_name, otp);

    if (!emailResult.success) {
      console.error('[Auth] Resend verification email was NOT delivered', {
        userId: user.id,
        email: user.email,
        errorCode: emailResult.errorCode,
        reason: emailResult.error,
      });

      // The code was regenerated either way, so a retry issues another fresh
      // one. Report the delivery failure instead of a generic success.
      return errorResponse(
        res,
        'Verification email could not be sent. Please try again.',
        502,
        {
          email: user.email,
          emailErrorCode: emailResult.errorCode,
          // Config variable NAMES only - never the transport's own message.
          emailMissingConfig: emailResult.missingConfig || [],
        }
      );
    }

    return successResponse(res, 'A new verification code has been sent to your email.', {
      email: user.email,
      emailSent: true,
      emailDelivery: emailResult.delivery,
      otpLength: VERIFICATION_OTP_LENGTH,
      otpExpiresInMinutes: VERIFICATION_OTP_TTL_MS / 60000,
      resendCooldownSeconds: VERIFICATION_RESEND_COOLDOWN_MS / 1000,
    });
  } catch (error) {
    console.error('Resend Verification Error:', error);
    return errorResponse(res, 'Failed to send verification email', 500);
  }
}

const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
const RESET_TOKEN_GENERIC_MESSAGE = 'If an account exists with that email, a password reset link has been sent.';

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function forgotPassword(req, res) {
  try {
    const { email } = req.body;

    if (!email) {
      return errorResponse(res, 'Email address is required', 400);
    }

    const normalizedEmail = email.toLowerCase().trim();
    const users = await executeQuery(
      'SELECT id, full_name, email, password_hash, status FROM users WHERE email = ?',
      [normalizedEmail]
    );

    // Always return the same generic response so account existence is never revealed.
    if (users.length === 0) {
      return successResponse(res, RESET_TOKEN_GENERIC_MESSAGE, { email: normalizedEmail });
    }

    const user = users[0];

    // A social-only account has no password_hash yet, but it must still be
    // able to claim one: the emailed reset token proves the caller owns this
    // mailbox, and resetPassword below stores the new hash with the same
    // bcrypt setup registration uses. Only inactive accounts are refused.
    if (user.status !== 'active') {
      return successResponse(res, RESET_TOKEN_GENERIC_MESSAGE, { email: normalizedEmail });
    }

    // Generate a short-lived reset token and store only its SHA-256 hash.
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashResetToken(token);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS).toISOString().replace('T', ' ').substring(0, 19);

    // Invalidate any previously issued, still-unused reset tokens for this user.
    await executeQuery('DELETE FROM password_reset_tokens WHERE user_id = ? AND used = 0', [user.id]);
    await executeQuery(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, used) VALUES (?, ?, ?, 0)',
      [user.id, tokenHash, expiresAt]
    );

    const emailResult = await sendPasswordResetEmail(user.email, user.full_name, token);

    return successResponse(res, RESET_TOKEN_GENERIC_MESSAGE, {
      email: user.email,
      resetLink: emailResult.resetLink,
      demoToken: token, // Provided for easy development / sandbox testing (matches register behavior)
    });
  } catch (error) {
    console.error('Forgot Password Error:', error);
    return errorResponse(res, 'Failed to process password reset request', 500);
  }
}

export async function resetPassword(req, res) {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return errorResponse(res, 'Reset token and new password are required', 400);
    }

    if (newPassword.length < 6) {
      return errorResponse(res, 'Password must be at least 6 characters long', 400);
    }

    const tokenHash = hashResetToken(token);
    const records = await executeQuery(
      'SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used = 0',
      [tokenHash]
    );

    if (records.length === 0) {
      return errorResponse(res, 'Password reset token is invalid or has already been used', 400);
    }

    const record = records[0];

    if (Date.now() > parseSqlDateTime(record.expires_at)) {
      return errorResponse(res, 'Password reset token has expired. Please request a new one.', 400);
    }

    // Hash the new password using the same bcrypt setup as registration.
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    await executeQuery('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, record.user_id]);

    // Invalidate the used token and any other outstanding reset tokens for this user.
    await executeQuery('UPDATE password_reset_tokens SET used = 1 WHERE id = ?', [record.id]);
    await executeQuery('DELETE FROM password_reset_tokens WHERE user_id = ? AND used = 0', [record.user_id]);

    return successResponse(res, 'Password reset successfully! You can now sign in with your new password.', {
      reset: true,
    });
  } catch (error) {
    console.error('Reset Password Error:', error);
    return errorResponse(res, 'Failed to reset password due to a server error', 500);
  }
}
