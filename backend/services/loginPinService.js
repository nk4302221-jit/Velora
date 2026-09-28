import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { executeQuery } from '../config/db.js';

// =====================================================
// SIGN-IN PIN (optional "login with PIN" method)
//
// Security model
// --------------
//   * The PIN is 6 digits and is stored ONLY as a bcrypt hash, using the same
//     cost factor the project already uses for passwords (10). The plaintext is
//     never persisted, never logged and never returned to the client.
//   * Wrong guesses are counted in pin_login_attempts. After 5 failures the
//     account is locked out of PIN sign-in for 15 minutes, so a 6-digit space
//     (1,000,000 combinations) cannot be brute-forced. A successful sign-in
//     clears the counter.
//   * A PIN can only be CREATED after a successful OTP verification. That is
//     enforced by a single-use, 10-minute grant (pin_setup_grants) issued by the
//     OTP verification handler and consumed by setPin. Without that grant the
//     endpoint refuses, so neither a password session nor a Google session can
//     silently add a PIN.
//   * Users.pin_enabled is the single source of truth for "may use PIN sign-in".
//     An account that has never set a PIN has pin_hash = NULL and
//     pin_enabled = 0, and is completely unaffected: it keeps using email +
//     password, Google, and OTP exactly as before.
// =====================================================

export const PIN_LENGTH = 6;
export const PIN_MAX_ATTEMPTS = 5;
export const PIN_LOCK_MS = 15 * 60 * 1000; // 15 minutes
export const PIN_SETUP_GRANT_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Matches the bcrypt cost factor used for passwords in this project.
const PIN_BCRYPT_ROUNDS = 10;

export const isProduction = () =>
  String(process.env.NODE_ENV || '').toLowerCase() === 'production';

const PIN_SETUP_GRANT_UNAVAILABLE_MESSAGE =
  'A recent sign-in code verification is required before a PIN can be created. Please verify a new code first.';

// Exactly 6 digits. Deliberately strict: no whitespace, no separators, so the
// stored hash and the submitted value can never disagree about the input.
export const isValidPinFormat = (pin) => new RegExp(`^\\d{${PIN_LENGTH}}$`).test(String(pin ?? ''));

// mysql2 returns DATETIME columns as Date objects, SQLite returns the UTC
// datetime string written by the formatter below.
function parseSqlDateTime(value) {
  if (value instanceof Date) return value.getTime();

  return new Date(String(value).replace(' ', 'T') + 'Z').getTime();
}

function formatSqlDatetime(date) {
  return date.toISOString().replace('T', ' ').substring(0, 19);
}

function safeCompareHex(a, b) {
  const left = Buffer.from(String(a), 'utf8');
  const right = Buffer.from(String(b), 'utf8');

  if (left.length !== right.length) return false;

  return crypto.timingSafeEqual(left, right);
}

// =====================================================
// HASHING
// =====================================================

/** Hashes a 6-digit PIN with bcrypt. The returned hash is the only thing stored. */
export async function hashPin(pin) {
  const salt = await bcrypt.genSalt(PIN_BCRYPT_ROUNDS);

  return bcrypt.hash(String(pin), salt);
}

/** Constant-time-by-construction check of a submitted PIN against a stored hash. */
export async function verifyPin(pin, pinHash) {
  if (!pinHash) return false;

  return bcrypt.compare(String(pin), pinHash);
}

/** True when the account is allowed to use PIN sign-in. */
export const isPinEnabled = (user) =>
  Boolean(user?.pin_enabled) && Boolean(user?.pin_hash);

// =====================================================
// BRUTE-FORCE BRAKE
// =====================================================

async function readAttemptRow(userId) {
  const rows = await executeQuery(
    'SELECT * FROM pin_login_attempts WHERE user_id = ?',
    [userId]
  );

  return rows[0] || null;
}

/** Whole seconds the account is still locked out of PIN sign-in (0 = not locked). */
export async function getPinLockSecondsRemaining(userId) {
  const row = await readAttemptRow(userId);

  if (!row || !row.locked_until) return 0;

  const remainingMs = parseSqlDateTime(row.locked_until) - Date.now();

  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}

/**
 * Records one failed guess and applies the lock once the budget is spent.
 * Returns { attemptsRemaining, lockedForSeconds }.
 */
export async function recordFailedPinAttempt(userId) {
  const row = await readAttemptRow(userId);
  const next = (Number(row?.failed_attempts) || 0) + 1;
  const now = new Date();

  const locked = next >= PIN_MAX_ATTEMPTS;
  const lockedUntil = locked
    ? formatSqlDatetime(new Date(now.getTime() + PIN_LOCK_MS))
    : null;

  // Written as read-then-write rather than an upsert: the syntax for upsert
  // differs between MySQL and SQLite and db.js transparently supports both.
  if (row) {
    await executeQuery(
      `UPDATE pin_login_attempts
          SET failed_attempts = ?, locked_until = ?, updated_at = ?
        WHERE user_id = ?`,
      [next, lockedUntil, formatSqlDatetime(now), userId]
    );
  } else {
    await executeQuery(
      `INSERT INTO pin_login_attempts
         (user_id, failed_attempts, locked_until, updated_at)
       VALUES (?, ?, ?, ?)`,
      [userId, next, lockedUntil, formatSqlDatetime(now)]
    );
  }

  return {
    attemptsRemaining: Math.max(0, PIN_MAX_ATTEMPTS - next),
    lockedForSeconds: locked ? Math.ceil(PIN_LOCK_MS / 1000) : 0,
  };
}

/** Called after a successful PIN sign-in so the budget starts over. */
export async function clearPinAttempts(userId) {
  await executeQuery('DELETE FROM pin_login_attempts WHERE user_id = ?', [userId]);
}

// =====================================================
// SETUP GRANTS (the "only after OTP" gate)
// =====================================================

function hashPinSetupGrant(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/**
 * Issues a single-use permission to create a PIN. Called by the OTP
 * verification handler and only after a code has actually been verified.
 *
 * Any previously outstanding grant is deleted first, so at most one exists and a
 * stale grant can never be replayed.
 */
export async function issuePinSetupGrant(userId) {
  await executeQuery('DELETE FROM pin_setup_grants WHERE user_id = ? AND used = 0', [userId]);

  // 32 CSPRNG bytes, hex encoded - 256 bits of entropy, so the grant cannot be
  // guessed even though it is short-lived and single-use.
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + PIN_SETUP_GRANT_TTL_MS);

  await executeQuery(
    `INSERT INTO pin_setup_grants (user_id, token_hash, expires_at, used)
     VALUES (?, ?, ?, 0)`,
    [userId, hashPinSetupGrant(token), formatSqlDatetime(expiresAt)]
  );

  return token;
}

/**
 * Validates and burns a setup grant.
 *
 * Returns { ok: true } or { ok: false, message } - a single generic message for
 * "no grant", "wrong token" and "expired" so the endpoint cannot be used to
 * learn which.
 */
export async function consumePinSetupGrant(userId, token) {
  const candidate = String(token ?? '').trim();

  if (!candidate) {
    return { ok: false, message: PIN_SETUP_GRANT_UNAVAILABLE_MESSAGE };
  }

  // Looked up by hash, so a wrong token matches nothing and reveals nothing.
  const rows = await executeQuery(
    'SELECT * FROM pin_setup_grants WHERE user_id = ? AND token_hash = ?',
    [userId, hashPinSetupGrant(candidate)]
  );

  const row = rows[0];

  if (!row) {
    return { ok: false, message: PIN_SETUP_GRANT_UNAVAILABLE_MESSAGE };
  }

  if (parseSqlDateTime(row.expires_at) <= Date.now()) {
    await executeQuery('DELETE FROM pin_setup_grants WHERE id = ?', [row.id]);

    return { ok: false, message: PIN_SETUP_GRANT_UNAVAILABLE_MESSAGE };
  }

  if (!safeCompareHex(row.token_hash, hashPinSetupGrant(candidate))) {
    return { ok: false, message: PIN_SETUP_GRANT_UNAVAILABLE_MESSAGE };
  }

  // Single use: consumed whether or not the PIN below turns out to be valid,
  // so a failed attempt cannot be retried against the same grant.
  await executeQuery('DELETE FROM pin_setup_grants WHERE id = ?', [row.id]);

  return { ok: true };
}

export { PIN_SETUP_GRANT_UNAVAILABLE_MESSAGE };
