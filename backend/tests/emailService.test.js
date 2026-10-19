/**
 * Unit tests for the Resend path of backend/services/emailService.js.
 *
 * The Resend API is never contacted: global.fetch is stubbed, so every test
 * asserts exactly what would have been sent plus what the caller reports for
 * each class of failure:
 *
 *   - delivery to an authorized testing recipient (success)
 *   - unauthorized recipient while Resend is in testing mode (pre-check)
 *   - the provider rejecting a recipient anyway (classified the same way)
 *   - other Resend API failures (kept as RESEND_SEND_FAILED)
 *   - a verified sending domain (no testing-mode restriction at all)
 *   - no mail transport configured at all
 *
 * Run: npm test  (from backend/)
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const REAL_FETCH = global.fetch;
const REAL_CONSOLE = { log: console.log, warn: console.warn, error: console.error };

const AUTHORIZED = 'nirbhay3305@gmail.com';

function setResendEnv({
  apiKey = 're_unit_test_key',
  from = 'Velora <onboarding@resend.dev>',
  recipients = AUTHORIZED,
} = {}) {
  process.env.RESEND_API_KEY = apiKey;
  process.env.RESEND_FROM = from;
  process.env.RESEND_TEST_RECIPIENTS = recipients;

  delete process.env.EMAIL_FROM;
  delete process.env.MAIL_MODE;
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASSWORD;
  delete process.env.SMTP_FROM;
}

/** fetch stub. `handler` receives (url, options) and returns a Response-like object. */
function stubFetch(handler) {
  const calls = [];

  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return handler(url, options);
  };

  return calls;
}

const okResponse = (body = { id: 'email_123' }) => ({
  ok: true,
  status: 200,
  json: async () => body,
});

const errorResponse = (status, message) => ({
  ok: false,
  status,
  json: async () => ({ message }),
});

beforeEach(() => {
  setResendEnv();
  // The service logs diagnostics on every send; keep the test output readable.
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
});

afterEach(() => {
  global.fetch = REAL_FETCH;
  console.log = REAL_CONSOLE.log;
  console.warn = REAL_CONSOLE.warn;
  console.error = REAL_CONSOLE.error;
});

test('verification email is delivered to the authorized testing recipient', async () => {
  const { sendVerificationEmail } = await import('../services/emailService.js');

  const calls = stubFetch(() => okResponse());

  const result = await sendVerificationEmail(AUTHORIZED, 'Nirbhay', '123456');

  assert.equal(result.success, true);
  assert.equal(result.delivery, 'resend');
  assert.equal(result.errorCode, null);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.resend.com/emails');

  const payload = JSON.parse(calls[0].options.body);
  assert.deepEqual(payload.to, [AUTHORIZED]);
  assert.equal(payload.from, 'Velora <onboarding@resend.dev>');
  assert.match(payload.subject, /verification/i);
  assert.ok(payload.html.includes('123456'), 'email body carries the OTP');
  assert.ok(payload.text.includes('123456'));
});

test('recipient name/case variations of the authorized address are accepted', async () => {
  const { sendVerificationEmail } = await import('../services/emailService.js');

  const calls = stubFetch(() => okResponse());

  const result = await sendVerificationEmail(
    '"Nirbhay" <Nirbhay3305@Gmail.com>',
    'Nirbhay',
    '654321'
  );

  assert.equal(result.success, true);
  assert.equal(calls.length, 1, 'the provider call still happens');
});

test('unauthorized recipient is rejected BEFORE calling the API with a clear error', async () => {
  const { sendVerificationEmail } = await import('../services/emailService.js');

  const calls = stubFetch(() => okResponse());

  const result = await sendVerificationEmail('someone@example.com', 'Someone', '123456');

  assert.equal(result.success, false);
  assert.equal(result.delivery, 'resend');
  assert.equal(result.errorCode, 'RESEND_RECIPIENT_NOT_ALLOWED');
  assert.equal(calls.length, 0, 'no API call is made for a known-unauthorized recipient');

  // The error must explain the restriction AND name the fix, not expose a raw
  // provider failure.
  assert.match(result.error, /authorized/i);
  assert.match(result.error, /testing mode/i);
  assert.match(result.error, /resend\.com\/domains/);
  assert.ok(result.error.includes(AUTHORIZED), 'error names the authorized recipient');
});

test('the provider rejecting a recipient is classified the same way as the pre-check', async () => {
  // Simulate the allowlist being unset or out of date: the API call happens and
  // Resend answers with its testing-mode restriction.
  setResendEnv({ recipients: '' });

  const { sendVerificationEmail } = await import('../services/emailService.js');

  stubFetch(() =>
    errorResponse(
      403,
      'You can only send testing emails to your own email address. ' +
        'To send emails to other recipients, please verify a domain at resend.com/domains.'
    )
  );

  const result = await sendVerificationEmail('someone@example.com', 'Someone', '123456');

  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'RESEND_RECIPIENT_NOT_ALLOWED');
  assert.match(result.error, /testing mode/i);
  assert.match(result.error, /resend\.com\/domains/);
});

test('a non-restriction Resend API failure stays RESEND_SEND_FAILED', async () => {
  const { sendVerificationEmail } = await import('../services/emailService.js');

  stubFetch(() => errorResponse(500, 'Internal server error'));

  const result = await sendVerificationEmail(AUTHORIZED, 'Nirbhay', '123456');

  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'RESEND_SEND_FAILED');
  assert.equal(result.error, 'Internal server error');
});

test('a network-level Resend failure is reported, not thrown', async () => {
  const { sendVerificationEmail } = await import('../services/emailService.js');

  stubFetch(() => {
    throw new Error('fetch failed');
  });

  const result = await sendVerificationEmail(AUTHORIZED, 'Nirbhay', '123456');

  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'RESEND_SEND_FAILED');
});

test('a verified sending domain has no testing-mode restriction', async () => {
  setResendEnv({ from: 'Velora <mail.example.com>' });

  const { sendVerificationEmail } = await import('../services/emailService.js');

  const calls = stubFetch(() => okResponse());

  const result = await sendVerificationEmail('anyone@example.com', 'Anyone', '123456');

  assert.equal(result.success, true);
  assert.equal(calls.length, 1, 'the allowlist pre-check does not apply off resend.dev');
});

test('password reset emails honor the same restriction', async () => {
  const { sendPasswordResetEmail } = await import('../services/emailService.js');

  const calls = stubFetch(() => okResponse());

  const result = await sendPasswordResetEmail('someone@example.com', 'Someone', 'reset-token');

  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'RESEND_RECIPIENT_NOT_ALLOWED');
  assert.equal(calls.length, 0);
});

test('with no transport configured the send fails loudly instead of claiming success', async () => {
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM;
  delete process.env.RESEND_TEST_RECIPIENTS;
  delete process.env.EMAIL_FROM;

  const { sendVerificationEmail } = await import('../services/emailService.js');

  const result = await sendVerificationEmail(AUTHORIZED, 'Nirbhay', '123456');

  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'SMTP_NOT_CONFIGURED');
  assert.ok(Array.isArray(result.missingConfig));
});

test('missing recipient address is refused without any transport call', async () => {
  const { sendVerificationEmail } = await import('../services/emailService.js');

  const calls = stubFetch(() => okResponse());

  const result = await sendVerificationEmail('', 'Nobody', '123456');

  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'NO_RECIPIENT');
  assert.equal(calls.length, 0);
});
