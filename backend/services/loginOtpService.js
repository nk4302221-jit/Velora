import crypto from 'crypto';
import { executeQuery } from '../config/db.js';

// =====================================================
// SIGN-IN OTP (optional "login with OTP" method)
//
// This is a SELF-CONTAINED subsystem for the optional OTP sign-in method. It
// deliberately does NOT reuse, extend or modify the email-verification OTP that
// lives inside controllers/authController.js: that one is scoped to
// email_verification_tokens, is bound to proving ownership of an address at
// registration time, and revokes itself by setting users.email_verified = 1.
// Sign-in codes grant a session instead, are per-channel, and are single-use.
// Mixing the two would mean changing existing registration / verification
// behaviour, which is out of scope here.
//
// The security properties intentionally mirror the existing implementation so
// the two flows behave identically from a user's point of view:
//
//   * exactly 6 digits, uniformly distributed, from the OS CSPRNG
//     (crypto.randomInt - never Math.random),
//   * the code is NEVER persisted: only its SHA-256 hash is stored,
//   * 10-minute expiry,
//   * a 60-second resend cooldown,
//   * a 5-guess attempt limit, with the last allowed guess burning the code,
//   * the row is deleted on success, so a code is single-use,
//   * the code is never logged and never returned to the client.
// =====================================================

export const LOGIN_OTP_LENGTH = 6;
export const LOGIN_OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const LOGIN_OTP_MAX_ATTEMPTS = 5;
export const LOGIN_OTP_RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds

export const CHANNEL_EMAIL = 'email';
export const CHANNEL_SMS = 'sms';

// A code grants a session, so nothing about it is written to the log when the
// server runs in production. Development keeps the (code-free) issuance record
// because it is the only way to tell "no mail arrived" from "no mail sent".
export const isProduction = () =>
  String(process.env.NODE_ENV || '').toLowerCase() === 'production';

// Returned identically for a wrong code, an expired code and an unknown code,
// so the endpoint cannot be used to probe which of those it was.
export const LOGIN_OTP_FAILED_MESSAGE =
  'The sign-in code is incorrect or has expired. Please request a new code.';

// mysql2 returns DATETIME columns as Date objects, while SQLite returns the UTC
// datetime string written by the formatter below. Normalizing both shapes to a
// UTC epoch is what makes the expiry and cooldown arithmetic correct on either
// engine.
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
 */
function generateLoginOtp() {
  return String(
    crypto.randomInt(0, 10 ** LOGIN_OTP_LENGTH)
  ).padStart(LOGIN_OTP_LENGTH, '0');
}

/**
 * The hash is namespaced by user id AND channel, which does two things:
 *   - two accounts that happen to be issued the same 6 digits store different
 *     hashes, which is what keeps the UNIQUE index on `token` satisfiable, and
 *   - a code mailed to one person can never verify another account, and an
 *     email code can never be replayed against the SMS channel.
 *
 * The prefix is distinct from the email-verification flow's 'velora-email-otp:'
 * so the two subsystems can never collide on identical codes.
 */
function hashLoginOtp(userId, channel, otp) {
  return crypto
    .createHash('sha256')
    .update(`velora-login-otp:${userId}:${channel}:${otp}`)
    .digest('hex');
}

// Constant-time comparison so response timing cannot be used to recover the
// stored hash one character at a time.
function safeCompareHex(a, b) {
  const left = Buffer.from(String(a), 'utf8');
  const right = Buffer.from(String(b), 'utf8');

  if (left.length !== right.length) return false;

  return crypto.timingSafeEqual(left, right);
}

/** The one outstanding code for a (user, channel) pair, if any. */
export async function findActiveLoginOtp(userId, channel) {
  const records = await executeQuery(
    `SELECT * FROM login_otp_codes
      WHERE user_id = ? AND channel = ? AND used = 0
      ORDER BY id DESC
      LIMIT 1`,
    [userId, channel]
  );

  return records[0] || null;
}

/** Whole seconds the caller must still wait before a resend is allowed (0 = now). */
export async function secondsUntilResend(userId, channel) {
  const record = await findActiveLoginOtp(userId, channel);

  if (!record || !record.otp_last_sent_at) return 0;

  const elapsed = Date.now() - parseSqlDateTime(record.otp_last_sent_at);
  const remaining = LOGIN_OTP_RESEND_COOLDOWN_MS - elapsed;

  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

/**
 * Issues a fresh 6-digit code for (user, channel), replacing any outstanding
 * one so only the newest code in the user's inbox can ever be used.
 *
 * Returns the raw code so the caller can deliver it. It is not persisted, not
 * logged and not returned to the client.
 */
export async function issueLoginOtp(userId, channel) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LOGIN_OTP_TTL_MS);

  await executeQuery(
    'DELETE FROM login_otp_codes WHERE user_id = ? AND channel = ? AND used = 0',
    [userId, channel]
  );

  const otp = generateLoginOtp();

  await executeQuery(
    `INSERT INTO login_otp_codes
       (user_id, channel, token, expires_at, used, otp_attempts, otp_last_sent_at)
     VALUES (?, ?, ?, ?, 0, 0, ?)`,
    [
      userId,
      channel,
      hashLoginOtp(userId, channel, otp),
      formatSqlDatetime(expiresAt),
      formatSqlDatetime(now),
    ]
  );

  if (!isProduction()) {
    console.log('[Auth] Sign-in OTP issued', {
      userId,
      channel,
      digits: LOGIN_OTP_LENGTH,
      expiresAt: expiresAt.toISOString(),
      ttlMinutes: LOGIN_OTP_TTL_MS / 60000,
    });
  }

  return otp;
}

/**
 * Checks a submitted code against the outstanding one.
 *
 * Resolves to { ok: true } or { ok: false, reason, attemptsRemaining } where
 * reason is one of:
 *   not_found          no outstanding code (never requested, already used, or
 *                      superseded by a newer one)
 *   expired            past its 10-minute lifetime - row removed
 *   too_many_attempts  the 5-guess budget is gone - row removed
 *   mismatch           wrong code; attemptsRemaining is the budget left
 *
 * On success the row is deleted, so a code can never be replayed.
 */
export async function verifyLoginOtp({ userId, channel, otp }) {
  const record = await findActiveLoginOtp(userId, channel);

  if (!record) {
    return { ok: false, reason: 'not_found' };
  }

  if (parseSqlDateTime(record.expires_at) <= Date.now()) {
    await executeQuery('DELETE FROM login_otp_codes WHERE id = ?', [record.id]);

    return { ok: false, reason: 'expired' };
  }

  const attempts = Number(record.otp_attempts) || 0;

  if (attempts >= LOGIN_OTP_MAX_ATTEMPTS) {
    await executeQuery('DELETE FROM login_otp_codes WHERE id = ?', [record.id]);

    return { ok: false, reason: 'too_many_attempts' };
  }

  const matches = safeCompareHex(
    hashLoginOtp(userId, channel, otp),
    record.token
  );

  if (!matches) {
    const next = attempts + 1;

    // The final allowed guess burns the code, so a 6-digit space can never be
    // walked one guess at a time across two requests.
    if (next >= LOGIN_OTP_MAX_ATTEMPTS) {
      await executeQuery('DELETE FROM login_otp_codes WHERE id = ?', [record.id]);

      return { ok: false, reason: 'too_many_attempts' };
    }

    await executeQuery(
      'UPDATE login_otp_codes SET otp_attempts = ? WHERE id = ?',
      [next, record.id]
    );

    return {
      ok: false,
      reason: 'mismatch',
      attemptsRemaining: LOGIN_OTP_MAX_ATTEMPTS - next,
    };
  }

  await executeQuery('DELETE FROM login_otp_codes WHERE id = ?', [record.id]);

  return { ok: true };
}
