/**
 * End-to-end check of the 6-digit email verification OTP flow.
 *
 * Covers: registration issues a hashed OTP -> resend issues a NEW OTP and
 * invalidates the previous one -> resend cooldown answers 429 -> wrong OTP is
 * rejected and counted -> 5 wrong attempts burn the code -> expired OTP is
 * rejected -> correct OTP verifies -> login is blocked before / allowed after.
 *
 * The plaintext code is never taken from an API response (the server does not
 * return it). Where a specific code has to be known up front - the wrong-code,
 * attempt-limit and expiry cases - it is written straight into the database the
 * same way issueVerificationOtp() writes it, so the endpoint under test is
 * still doing the real hash + compare work.
 *
 * Run the backend first, then:  node _test_email_otp.mjs
 */

import crypto from 'node:crypto';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: process.env.ENV_FILE || '.env', quiet: true });

const BASE = process.env.TEST_API || 'http://localhost:5000/api';

let passed = 0;
let failed = 0;

const check = (label, condition, detail = '') => {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`);
  }
};

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON body */
  }

  return { status: res.status, body: json };
}

// =====================================================
// DATABASE HANDLE - mirrors the app's own MySQL-first,
// SQLite-fallback behaviour so the test runs against
// whichever store the running server actually uses.
// =====================================================

let db = null;
let engine = 'mysql';

async function connect() {
  if (process.env.DB_HOST && process.env.DB_HOST !== 'none') {
    try {
      const mysql = (await import('mysql2/promise')).default;
      const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'ecommerce_db',
        // Matches backend/config/db.js so DATETIME/TIMESTAMP round-trips as UTC.
        timezone: 'Z',
      });

      await conn.query('SELECT 1');
      return conn;
    } catch (error) {
      console.log(`(MySQL not reachable - falling back to the embedded SQLite file: ${error.message})`);
    }
  }

  const { DatabaseSync } = await import('node:sqlite');
  engine = 'sqlite';
  return new DatabaseSync(path.resolve(process.cwd(), 'data', 'ecommerce.db'));
}

/** First row of a query, or null. */
async function qGet(sql, params = []) {
  if (engine === 'sqlite') {
    return db.prepare(sql).get(...params) || null;
  }
  const [rows] = await db.execute(sql, params);
  return rows[0] || null;
}

/** First column of the first row, or undefined. */
async function qVal(sql, params = []) {
  const row = await qGet(sql, params);
  return row ? Object.values(row)[0] : undefined;
}

async function qRun(sql, params = []) {
  if (engine === 'sqlite') {
    return db.prepare(sql).run(...params);
  }
  const [result] = await db.execute(sql, params);
  return result;
}

// =====================================================
// OTP PLANTING - byte-for-byte what the backend writes
// =====================================================

const hashOtp = (userId, otp) =>
  crypto.createHash('sha256').update(`velora-email-otp:${userId}:${otp}`).digest('hex');

const sqlDatetime = (date) => date.toISOString().replace('T', ' ').substring(0, 19);

async function plantOtp(userId, otp, { expiresAt, lastSentAt } = {}) {
  const now = new Date();
  await qRun('DELETE FROM email_verification_tokens WHERE user_id = ?', [userId]);
  await qRun(
    `INSERT INTO email_verification_tokens
       (user_id, token, expires_at, used, otp_attempts, otp_last_sent_at)
     VALUES (?, ?, ?, 0, 0, ?)`,
    [
      userId,
      hashOtp(userId, otp),
      sqlDatetime(expiresAt || new Date(now.getTime() + 10 * 60 * 1000)),
      sqlDatetime(lastSentAt || now),
    ]
  );
}

const userIdFor = async (email) => (await qGet('SELECT id FROM users WHERE email = ?', [email]))?.id ?? null;
const verifiedFlag = async (id) => Number((await qGet('SELECT email_verified FROM users WHERE id = ?', [id]))?.email_verified);
const otpRow = (id) => qGet('SELECT * FROM email_verification_tokens WHERE user_id = ? ORDER BY id DESC LIMIT 1', [id]);
const otpRowCount = async (id) => Number(await qVal('SELECT COUNT(*) AS c FROM email_verification_tokens WHERE user_id = ?', [id]));

const password = 'Pass@1234';
const stamp = Date.now();

async function register(tag) {
  const email = `otpflow_${tag}_${stamp}@example.com`;
  const res = await call('/auth/register', {
    method: 'POST',
    body: { fullName: `OTP Flow ${tag}`, email, password, confirmPassword: password },
  });
  return { email, res };
}

db = await connect();
console.log(`\n=== EMAIL VERIFICATION OTP FLOW (db: ${engine}) ===\n`);

console.log('1. HEALTH');
let r = await call('/health');
check('GET /health -> 200', r.status === 200, `status=${r.status}`);

console.log('\n2. REGISTRATION ISSUES AN OTP (never returned to the client)');
const acct = await register('issue');
check('POST /auth/register -> 201', acct.res.status === 201, `status=${acct.res.status} ${acct.res.body?.message || ''}`);

const regData = acct.res.body?.data || {};
check('response carries no verificationToken', regData.verificationToken === undefined);
check('response carries no demoToken/otp value', regData.demoToken === undefined && regData.otp === undefined);
check('server echoes the normalized email', regData.email === acct.email);
check('otpLength is 6', regData.otpLength === 6, `got ${regData.otpLength}`);
check('otpExpiresInMinutes is 10', regData.otpExpiresInMinutes === 10, `got ${regData.otpExpiresInMinutes}`);
check('emailSent flag is present', typeof regData.emailSent === 'boolean');
console.log(`        emailSent=${regData.emailSent} delivery=${regData.emailDelivery} errorCode=${regData.emailErrorCode || 'none'}`);

const issueUserId = await userIdFor(acct.email);
check('an OTP row exists for the new user', issueUserId !== null && (await otpRowCount(issueUserId)) === 1);
check('stored value is a 64-char sha256 hex, not 6 digits', /^[0-9a-f]{64}$/.test((await otpRow(issueUserId))?.token || ''), 'plaintext OTP must never be stored');
const issuedExpiry = (await otpRow(issueUserId))?.expires_at;
const issuedExpiryMs =
  issuedExpiry instanceof Date
    ? issuedExpiry.getTime()
    : Date.parse(String(issuedExpiry).replace(' ', 'T') + 'Z');
const issuedExpiryMins = (issuedExpiryMs - Date.now()) / 60000;
check(
  'expiry is ~10 minutes out',
  issuedExpiryMins > 9 && issuedExpiryMins <= 10.5,
  `${issuedExpiryMins.toFixed(2)} minutes`
);
check('attempts start at 0', Number((await otpRow(issueUserId))?.otp_attempts) === 0);
check('otp_last_sent_at is stamped', Boolean((await otpRow(issueUserId))?.otp_last_sent_at));

console.log('\n3. LOGIN IS BLOCKED WHILE UNVERIFIED');
r = await call('/auth/login', { method: 'POST', body: { email: acct.email, password } });
check('unverified login -> 403', r.status === 403, `status=${r.status} ${r.body?.message || ''}`);

console.log('\n4. RESEND ENFORCES THE 60s COOLDOWN');
r = await call('/auth/resend-verification', { method: 'POST', body: { email: acct.email } });
check('resend inside cooldown -> 429', r.status === 429, `status=${r.status} ${r.body?.message || ''}`);
check('429 body reports retryAfter seconds', Number(r.body?.errors?.retryAfter) > 0 && Number(r.body?.errors?.retryAfter) <= 60, `retryAfter=${r.body?.errors?.retryAfter}`);
check('429 body has no otp/token/code field', !['otp', 'token', 'code', 'verificationToken'].some((k) => k in (r.body?.data || {})));

console.log('\n5. RESEND AFTER THE COOLDOWN ISSUES A NEW OTP');
// Age the existing row past the cooldown instead of sleeping 60s.
await qRun('UPDATE email_verification_tokens SET otp_last_sent_at = ? WHERE user_id = ?', [
  sqlDatetime(new Date(Date.now() - 61 * 1000)),
  issueUserId,
]);
const oldHash = (await otpRow(issueUserId))?.token;

r = await call('/auth/resend-verification', { method: 'POST', body: { email: acct.email } });
const resendData = r.body?.data || {};
console.log(`        status=${r.status} message="${r.body?.message}" emailSent=${resendData.emailSent} delivery=${resendData.emailDelivery} errorCode=${r.body?.errors?.emailErrorCode || 'none'}`);

if (r.status === 200) {
  check('resend reports cooldown of 60s', resendData.resendCooldownSeconds === 60, `got ${resendData.resendCooldownSeconds}`);
  check('resend reports otpLength 6 / 10 min', resendData.otpLength === 6 && resendData.otpExpiresInMinutes === 10);
} else {
  // The transport is not configured. The endpoint must say so rather than
  // claim a code was dispatched, and must not leak the transport's own message.
  check('resend reports the mail failure instead of a false success', r.status >= 400, `status=${r.status}`);
  check('failure carries a machine-readable errorCode', Boolean(r.body?.errors?.emailErrorCode), `got ${r.body?.errors?.emailErrorCode}`);
  check('failure does not leak the transport error string', r.body?.errors?.emailError === undefined, JSON.stringify(r.body?.errors || {}));
}
check('resend returns no OTP/token value', resendData.otp === undefined && resendData.verificationToken === undefined && resendData.demoToken === undefined);
check('previous OTP was invalidated (hash changed)', (await otpRow(issueUserId))?.token !== oldHash);
check('attempts were reset to 0', Number((await otpRow(issueUserId))?.otp_attempts) === 0);

console.log('\n6. WRONG OTP IS REJECTED AND COUNTED');
const wrong = await register('wrong');
const wrongId = await userIdFor(wrong.email);
const goodOtp = '482913';
await plantOtp(wrongId, goodOtp);

r = await call('/auth/verify-email', { method: 'POST', body: { email: wrong.email, otp: '000000' } });
check('wrong 6-digit code -> 400', r.status === 400, `status=${r.status} ${r.body?.message || ''}`);
check('attemptsRemaining reported as 4', r.body?.errors?.attemptsRemaining === 4, `got ${r.body?.errors?.attemptsRemaining}`);
check('attempts counter incremented in DB', Number((await otpRow(wrongId))?.otp_attempts) === 1);
check('account still unverified', (await verifiedFlag(wrongId)) === 0);

r = await call('/auth/verify-email', { method: 'POST', body: { email: wrong.email, otp: '48291' } });
check('5-digit code -> 400 validation error', r.status === 400, `status=${r.status} ${r.body?.message || ''}`);
r = await call('/auth/verify-email', { method: 'POST', body: { email: wrong.email, otp: 'abcdef' } });
check('non-numeric code -> 400 validation error', r.status === 400, `status=${r.status} ${r.body?.message || ''}`);
check('invalid-format guesses are not counted as attempts', Number((await otpRow(wrongId))?.otp_attempts) === 1, `got ${(await otpRow(wrongId))?.otp_attempts}`);

console.log('\n7. FIFTH WRONG ATTEMPT BURNS THE CODE');
for (const guess of ['111111', '222222', '999999']) {
  r = await call('/auth/verify-email', { method: 'POST', body: { email: wrong.email, otp: guess } });
}
check('attempts now 4', Number((await otpRow(wrongId))?.otp_attempts) === 4, `got ${(await otpRow(wrongId))?.otp_attempts}`);
r = await call('/auth/verify-email', { method: 'POST', body: { email: wrong.email, otp: '777777' } });
check('5th wrong code -> 429 too many attempts', r.status === 429, `status=${r.status} ${r.body?.message || ''}`);
check('code invalidated after the limit', Number((await otpRow(wrongId))?.used) === 1);
r = await call('/auth/verify-email', { method: 'POST', body: { email: wrong.email, otp: goodOtp } });
check('the real code is refused after the limit -> 400', r.status === 400, `status=${r.status} ${r.body?.message || ''}`);

console.log('\n8. EXPIRED OTP IS REJECTED');
const expired = await register('expired');
const expiredId = await userIdFor(expired.email);
await plantOtp(expiredId, '123456', { expiresAt: new Date(Date.now() - 60 * 1000) });
r = await call('/auth/verify-email', { method: 'POST', body: { email: expired.email, otp: '123456' } });
check('expired code -> 400', r.status === 400, `status=${r.status} ${r.body?.message || ''}`);
check('expired message mentions expiry', /expired/i.test(r.body?.message || ''), r.body?.message || '');
check('account still unverified', (await verifiedFlag(expiredId)) === 0);

console.log('\n9. CORRECT OTP VERIFIES');
const ok = await register('ok');
const okId = await userIdFor(ok.email);
await plantOtp(okId, '482913');
r = await call('/auth/verify-email', { method: 'POST', body: { email: ok.email, otp: '482913' } });
check('POST /auth/verify-email with the right code -> 200', r.status === 200, `status=${r.status} ${r.body?.message || ''}`);
check('response flags verified: true', r.body?.data?.verified === true);
check('users.email_verified set to 1', (await verifiedFlag(okId)) === 1);
check('OTP row cleared', (await otpRowCount(okId)) === 0);
check('response does not echo the code', !JSON.stringify(r.body || {}).includes('482913'));

console.log('\n10. LOGIN AFTER VERIFICATION');
r = await call('/auth/login', { method: 'POST', body: { email: ok.email, password } });
check('verified login -> 200', r.status === 200, `status=${r.status} ${r.body?.message || ''}`);
check('login returns a JWT', Boolean(r.body?.data?.token));
check('user is flagged email_verified', r.body?.data?.user?.email_verified === true);

console.log('\n11. UNKNOWN EMAIL DOES NOT CONFIRM EXISTENCE');
r = await call('/auth/verify-email', { method: 'POST', body: { email: `nobody_${stamp}@example.com`, otp: '482913' } });
check('unknown email -> 400', r.status === 400, `status=${r.status} ${r.body?.message || ''}`);
r = await call('/auth/verify-email', { method: 'POST', body: { otp: '482913' } });
check('missing email -> 400', r.status === 400, `status=${r.status} ${r.body?.message || ''}`);

console.log('\n12. RESEND ON AN ALREADY-VERIFIED ACCOUNT');
r = await call('/auth/resend-verification', { method: 'POST', body: { email: ok.email } });
check('resend on verified account -> 200 alreadyVerified', r.status === 200 && r.body?.data?.alreadyVerified === true, `status=${r.status} ${r.body?.message || ''}`);

console.log('\n13. UNCHANGED BEHAVIOUR');
r = await call('/auth/register', {
  method: 'POST',
  body: { fullName: 'Escalate', email: `otpflow_esc_${stamp}@example.com`, password, confirmPassword: password, role: 'admin' },
});
check('registration with role=admin -> 403', r.status === 403, `status=${r.status}`);

r = await call('/auth/google');
check('GET /auth/google redirects or fails below 500', r.status < 500, `status=${r.status}`);

r = await call('/products');
check('GET /products -> 200', r.status === 200, `status=${r.status}`);
r = await call('/plans');
check('GET /plans -> 200', r.status === 200, `status=${r.status}`);
r = await call('/products/categories');
check('GET /products/categories -> 200', r.status === 200, `status=${r.status}`);

if (engine === 'mysql') await db.end();

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
