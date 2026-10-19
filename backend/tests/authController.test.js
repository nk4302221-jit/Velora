/**
 * Unit tests for the email-verification surface of
 * backend/controllers/authController.js: registration (including duplicate
 * handling and the concurrent-race duplicate) and POST /resend-verification.
 *
 * The database and the email service are replaced with in-memory fakes via
 * node:test's module mocking, so no MySQL/SQLite instance and no mail
 * provider is required. bcrypt and the rest of the controller stay REAL - the
 * tests exercise the actual controller code paths, only its I/O is faked.
 *
 * Run: npm test  (from backend/, requires --experimental-test-module-mocks)
 */

import { mock, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// =====================================================
// FAKE DATABASE
// =====================================================

const db = {
  /**
   * Queue of results for users-lookup queries.
   *
   * A SINGLE entry is "sticky": every lookup returns it. Registration
   * performs two lookups for one logical account (the uniqueness pre-check,
   * then the 409 handler re-reads the row), and both must see the same user.
   *
   * When the queue holds MULTIPLE entries each lookup consumes one - which is
   * how the duplicate-race test makes the pre-insert SELECT see "nobody" while
   * the post-race lookup sees the account the concurrent request created.
   */
  userResults: [[]],

  /** Row returned for the outstanding-OTP lookup, or null. */
  activeOtp: null,

  /** When set, INSERT INTO users throws this (duplicate-key race). */
  insertUserError: null,

  nextUserId: 41,

  queries: [],

  reset() {
    this.userResults = [[]];
    this.activeOtp = null;
    this.insertUserError = null;
    this.nextUserId = 41;
    this.queries = [];
  },

  sqlOf(matcher) {
    return this.queries.filter((entry) => matcher.test(entry.sql));
  },
};

function nextUserRows() {
  // One entry = the default answer for every lookup in the test.
  if (db.userResults.length === 1) {
    return db.userResults[0];
  }
  // Several entries = a per-call queue (duplicate-race scenario).
  return db.userResults.length > 0 ? db.userResults.shift() : [];
}

async function executeQuery(sql, params = []) {
  const text = String(sql).replace(/\s+/g, ' ').trim();
  db.queries.push({ sql: text, params });

  if (/^SELECT id, email_verified FROM users WHERE email = \?$/i.test(text)) {
    return nextUserRows().map((user) => ({
      id: user.id,
      email_verified: user.email_verified,
    }));
  }

  if (/^SELECT id FROM users WHERE email = \?$/i.test(text)) {
    return nextUserRows().map((user) => ({ id: user.id }));
  }

  if (/^SELECT \* FROM users WHERE email = \?$/i.test(text)) {
    return nextUserRows();
  }

  if (/^INSERT INTO users/i.test(text)) {
    if (db.insertUserError) {
      throw db.insertUserError;
    }

    return { insertId: db.nextUserId };
  }

  if (/email_verification_tokens WHERE user_id = \? AND used = 0 AND otp_last_sent_at IS NOT NULL/i.test(text)) {
    return db.activeOtp ? [db.activeOtp] : [];
  }

  return { affectedRows: 0 };
}

// =====================================================
// FAKE EMAIL SERVICE
// =====================================================

const mail = {
  /** Result returned by sendVerificationEmail (or a function of the recipient). */
  nextResult: () => ({
    success: true,
    delivery: 'resend',
    previewUrl: null,
    errorCode: null,
    error: null,
    missingConfig: [],
  }),

  calls: [],

  reset() {
    this.nextResult = () => ({
      success: true,
      delivery: 'resend',
      previewUrl: null,
      errorCode: null,
      error: null,
      missingConfig: [],
    });
    this.calls = [];
  },
};

async function sendVerificationEmail(to, fullName, otp) {
  mail.calls.push({ to, fullName, otp });
  return mail.nextResult(to, fullName, otp);
}

mock.module('../config/db.js', {
  namedExports: { executeQuery },
});

mock.module('../services/emailService.js', {
  namedExports: {
    sendVerificationEmail,
    sendPasswordResetEmail: async () => ({
      success: true,
      delivery: 'resend',
      previewUrl: null,
      errorCode: null,
      error: null,
      missingConfig: [],
    }),
    RESEND_RECIPIENT_NOT_ALLOWED_CODE: 'RESEND_RECIPIENT_NOT_ALLOWED',
  },
});

const { register, resendVerification } = await import('../controllers/authController.js');

// =====================================================
// REQUEST / RESPONSE HELPERS
// =====================================================

const REAL_CONSOLE = { log: console.log, warn: console.warn, error: console.error };

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

const reqWith = (body) => ({ body, query: {}, params: {} });

const validRegistration = {
  fullName: 'Nirbhay Kumar',
  // Mixed case on purpose: the controller must normalise ONCE to lowercase and
  // use that single value for the row, the email and the response.
  email: 'Nirbhay3305@Gmail.COM',
  password: 'secret123',
  confirmPassword: 'secret123',
};

const duplicateEntryError = Object.assign(new Error("Duplicate entry 'x' for key 'users.email'"), {
  code: 'ER_DUP_ENTRY',
  errno: 1062,
});

beforeEach(() => {
  db.reset();
  mail.reset();
  // Controller diagnostics keep the test output readable.
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
});

afterEach(() => {
  console.log = REAL_CONSOLE.log;
  console.warn = REAL_CONSOLE.warn;
  console.error = REAL_CONSOLE.error;
});

// =====================================================
// REGISTRATION
// =====================================================

test('successful registration creates the account, issues an OTP and reports delivery', async () => {
  const res = mockRes();

  await register(reqWith(validRegistration), res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.email, 'nirbhay3305@gmail.com', 'address is normalized once');
  assert.equal(res.body.data.emailSent, true);
  assert.equal(res.body.data.emailDelivery, 'resend');
  assert.equal(res.body.data.userId, 41);
  assert.equal(res.body.data.otpLength, 6);

  const inserts = db.sqlOf(/^INSERT INTO users/i);
  assert.equal(inserts.length, 1, 'exactly one user row is created');
  assert.equal(inserts[0].params[1], 'nirbhay3305@gmail.com');

  assert.equal(mail.calls.length, 1, 'one verification email is sent');
  assert.equal(mail.calls[0].to, 'nirbhay3305@gmail.com');

  const otpRows = db.sqlOf(/^INSERT INTO email_verification_tokens/i);
  assert.equal(otpRows.length, 1, 'an OTP row is stored');

  const carts = db.sqlOf(/^INSERT INTO cart/i);
  const wishlists = db.sqlOf(/^INSERT INTO wishlist/i);
  assert.equal(carts.length, 1);
  assert.equal(wishlists.length, 1);
});

test('registering an already-registered VERIFIED email -> 409 pointing at sign-in', async () => {
  db.userResults = [[{ id: 7, email_verified: 1 }]];  const res = mockRes();
  await register(reqWith(validRegistration), res);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.success, false);
  assert.match(res.body.message, /already exists/i);
  assert.match(res.body.message, /sign in/i);
  assert.equal(res.body.errors.canResendVerification, false);
  assert.equal(res.body.errors.emailVerified, true);

  assert.equal(db.sqlOf(/^INSERT INTO users/i).length, 0, 'no duplicate user is created');
  assert.equal(mail.calls.length, 0, 'no email is claimed as sent');
});

test('registering an already-registered UNVERIFIED email -> 409 pointing at Resend Code', async () => {
  db.userResults = [[{ id: 8, email_verified: 0 }]];

  const res = mockRes();
  await register(reqWith(validRegistration), res);

  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /not been verified/i);
  assert.match(res.body.message, /verification code/i);
  assert.equal(res.body.errors.existingAccount, true);
  assert.equal(res.body.errors.emailVerified, false);
  assert.equal(res.body.errors.canResendVerification, true);
  assert.equal(res.body.errors.email, 'nirbhay3305@gmail.com');

  assert.equal(db.sqlOf(/^INSERT INTO users/i).length, 0);
  assert.equal(mail.calls.length, 0, 'a false "email sent" is never reported');
});

test('a concurrent duplicate INSERT (unique-index race) produces the same 409, not a 500', async () => {
  // Pre-insert SELECT: nobody. The INSERT itself loses the race, and the
  // 409 handler's follow-up lookup finds the winning account (unverified).
  db.userResults = [[], [{ id: 9, email_verified: 0 }]];
  db.insertUserError = duplicateEntryError;

  const res = mockRes();
  await register(reqWith(validRegistration), res);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.errors.canResendVerification, true);
  assert.equal(db.sqlOf(/^INSERT INTO cart/i).length, 0, 'no cart is created for a lost race');
});

test('registration whose verification email cannot be delivered still creates the account and says so', async () => {
  mail.nextResult = () => ({
    success: false,
    delivery: 'resend',
    previewUrl: null,
    errorCode: 'RESEND_SEND_FAILED',
    error: 'Resend API returned HTTP 500',
    missingConfig: [],
  });

  const res = mockRes();
  await register(reqWith(validRegistration), res);

  assert.equal(res.statusCode, 201, 'the account exists; a confusing 409 must not follow');
  assert.equal(res.body.data.emailSent, false);
  assert.equal(res.body.data.emailErrorCode, 'RESEND_SEND_FAILED');
  assert.match(res.body.message, /could not be sent/i);
  assert.doesNotMatch(res.body.message, /HTTP 500/, 'transport internals stay server-side');
});

test('registration to a testing-mode-unauthorized recipient explains the restriction', async () => {
  mail.nextResult = () => ({
    success: false,
    delivery: 'resend',
    previewUrl: null,
    errorCode: 'RESEND_RECIPIENT_NOT_ALLOWED',
    error:
      'The recipient "other@example.com" is not authorized. Email delivery is restricted while ' +
      'the Resend account is in testing mode. Verify a domain at resend.com/domains.',
    missingConfig: [],
  });

  const res = mockRes();
  await register(reqWith({ ...validRegistration, email: 'other@example.com', confirmPassword: 'secret123' }), res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.emailSent, false);
  assert.equal(res.body.data.emailErrorCode, 'RESEND_RECIPIENT_NOT_ALLOWED');
  assert.match(res.body.message, /testing mode/i);
  assert.match(res.body.message, /authorized recipient/i);
});

test('a client-supplied role is still refused outright', async () => {
  const res = mockRes();
  await register(reqWith({ ...validRegistration, role: 'admin' }), res);

  assert.equal(res.statusCode, 403);
  assert.equal(db.sqlOf(/^INSERT INTO users/i).length, 0);
});

// =====================================================
// RESEND VERIFICATION
// =====================================================

const unverifiedUser = {
  id: 55,
  full_name: 'Nirbhay Kumar',
  email: 'nirbhay3305@gmail.com',
  email_verified: 0,
  status: 'active',
};

test('resend-verification delivers a new code to an unverified account', async () => {
  db.userResults = [[unverifiedUser]];

  const res = mockRes();
  await resendVerification(reqWith({ email: ' Nirbhay3305@Gmail.com ' }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.emailSent, true);
  assert.equal(res.body.data.email, 'nirbhay3305@gmail.com');
  assert.equal(res.body.data.resendCooldownSeconds, 60);
  assert.equal(mail.calls.length, 1);
  assert.equal(mail.calls[0].to, 'nirbhay3305@gmail.com');
  assert.equal(mail.calls[0].fullName, 'Nirbhay Kumar');

  assert.equal(db.sqlOf(/^DELETE FROM email_verification_tokens/i).length, 1, 'old codes are superseded');
  assert.equal(db.sqlOf(/^INSERT INTO email_verification_tokens/i).length, 1);
});

test('resend-verification rejects a missing or malformed email with 400', async () => {
  const missing = mockRes();
  await resendVerification(reqWith({}), missing);
  assert.equal(missing.statusCode, 400);
  assert.match(missing.body.message, /required/i);

  const malformed = mockRes();
  await resendVerification(reqWith({ email: 'not-an-email' }), malformed);
  assert.equal(malformed.statusCode, 400);
  assert.match(malformed.body.message, /valid email/i);

  assert.equal(mail.calls.length, 0);
});

test('resend-verification for an unknown account answers 404 and sends nothing', async () => {
  db.userResults = [[]];

  const res = mockRes();
  await resendVerification(reqWith({ email: 'ghost@example.com' }), res);

  assert.equal(res.statusCode, 404);
  assert.equal(mail.calls.length, 0);
});

test('resend-verification on an already-verified account reports it without sending', async () => {
  db.userResults = [[{ ...unverifiedUser, email_verified: 1 }]];

  const res = mockRes();
  await resendVerification(reqWith({ email: unverifiedUser.email }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.alreadyVerified, true);
  assert.equal(res.body.data.emailSent, false);
  assert.equal(mail.calls.length, 0);
});

test('resend-verification honors the 60s cooldown with 429 + retryAfter', async () => {
  db.userResults = [[unverifiedUser]];
  db.activeOtp = {
    id: 1,
    user_id: 55,
    used: 0,
    otp_last_sent_at: new Date(),
  };

  const res = mockRes();
  await resendVerification(reqWith({ email: unverifiedUser.email }), res);

  assert.equal(res.statusCode, 429);
  assert.ok(Number(res.body.errors.retryAfter) > 0);
  assert.equal(mail.calls.length, 0, 'no email is sent during the cooldown');
});

test('testing-mode-unauthorized recipient -> 422 with the clear explanation, not a 502', async () => {
  db.userResults = [[unverifiedUser]];
  mail.nextResult = () => ({
    success: false,
    delivery: 'resend',
    previewUrl: null,
    errorCode: 'RESEND_RECIPIENT_NOT_ALLOWED',
    error:
      'The recipient "nirbhay3305@gmail.com" is not authorized to receive email from this account. ' +
      'Email delivery is restricted while the Resend account is in testing mode. Only an authorized ' +
      'recipient can receive email until a sending domain is verified at resend.com/domains. ' +
      'Authorized testing recipient(s): nirbhay3305@gmail.com.',
    missingConfig: [],
  });

  const res = mockRes();
  await resendVerification(reqWith({ email: unverifiedUser.email }), res);

  assert.equal(res.statusCode, 422);
  assert.equal(res.body.success, false);
  assert.match(res.body.message, /testing mode/i);
  assert.match(res.body.message, /resend\.com\/domains/);
  assert.equal(res.body.errors.emailErrorCode, 'RESEND_RECIPIENT_NOT_ALLOWED');
});

test('a genuine Resend/transport failure -> 502 with a safe message and machine-readable code', async () => {
  db.userResults = [[unverifiedUser]];
  mail.nextResult = () => ({
    success: false,
    delivery: 'resend',
    previewUrl: null,
    errorCode: 'RESEND_SEND_FAILED',
    error: 'Resend API returned HTTP 500 (internal secret detail)',
    missingConfig: [],
  });

  const res = mockRes();
  await resendVerification(reqWith({ email: unverifiedUser.email }), res);

  assert.equal(res.statusCode, 502);
  assert.equal(res.body.message, 'Verification email could not be sent. Please try again.');
  assert.equal(res.body.errors.emailErrorCode, 'RESEND_SEND_FAILED');
  assert.ok(
    !JSON.stringify(res.body).includes('internal secret detail'),
    'the transport message never reaches the client'
  );
});

test('resend-verification regenerates the OTP even though the client never sees it', async () => {
  db.userResults = [[unverifiedUser]];

  const res = mockRes();
  await resendVerification(reqWith({ email: unverifiedUser.email }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.otp, undefined, 'the code is never returned to the client');
  assert.equal(res.body.data.verificationToken, undefined);

  const issued = mail.calls[0]?.otp || '';
  assert.match(issued, /^\d{6}$/, 'the emailed code is exactly 6 digits');
  assert.ok(!JSON.stringify(res.body).includes(issued), 'the code is not echoed in the response');
});
