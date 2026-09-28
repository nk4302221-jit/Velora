// =====================================================
// SMS (minimum integration for "login with mobile + OTP")
//
// WHY THIS FILE IS EMPTY OF PROVIDERS
// ----------------------------------
// Velora has no SMS provider today: no SDK in package.json, no SMS_* variables
// in .env, no sms service anywhere in backend/. Rather than pull in a vendor SDK
// and invent a second delivery pipeline next to the existing SMTP one, this
// module does the only thing that is correct without configuration: it reports
// precisely what is missing and refuses to pretend a message was sent.
//
// That matters for correctness as much as for security. `MAIL_MODE=console`
// deliberately reports itself as a FAILURE so the API can never tell a user "a
// code is on its way" when nothing left the process. This module holds the same
// line for SMS, so POST /api/auth/otp-pin/send-otp answers 503
// SMS_NOT_CONFIGURED instead of silently accepting a mobile number nobody can
// receive a code on.
//
// TO ACTUALLY ENABLE SMS
// ----------------------
// 1. Set the four variables below (see .env.example).
// 2. Implement the HTTP call in sendSms() for the provider you chose and
//    replace the not-implemented return with its result. The rest of the
//    sign-in flow - code generation, hashing, expiry, cooldown, attempt limits
//    - is provider-agnostic and needs no change.
//
// The variable names below are deliberately the lowest common denominator that
// matches the most providers (Twilio-shaped, and compatible with
// MSG91-style api keys if SMS_PROVIDER names them), so switching vendors is a
// config change rather than a code change.
// =====================================================

const REQUIRED_SMS_VARS = [
  'SMS_PROVIDER',
  'SMS_ACCOUNT_SID',
  'SMS_AUTH_TOKEN',
  'SMS_FROM',
];

/**
 * Reads the SMS configuration. Only ever called on the server; the returned
 * object is reduced to booleans before it reaches any response.
 */
function readSmsCredentials() {
  const provider = String(process.env.SMS_PROVIDER || '').trim();
  const accountSid = String(process.env.SMS_ACCOUNT_SID || '').trim();
  const authToken = String(process.env.SMS_AUTH_TOKEN || '').trim();
  const from = String(process.env.SMS_FROM || '').trim();

  const present = {
    SMS_PROVIDER: provider,
    SMS_ACCOUNT_SID: accountSid,
    SMS_AUTH_TOKEN: authToken,
    SMS_FROM: from,
  };

  const missing = REQUIRED_SMS_VARS.filter((name) => !present[name]);

  return {
    provider,
    from,
    missing,
    configured: missing.length === 0,
  };
}

/** True only when every required variable is present. */
export function isSmsConfigured() {
  return readSmsCredentials().configured;
}

/**
 * Startup/diagnostic view of the SMS configuration. Safe to log: it reports
 * which variables are set, never their values.
 */
export function getSmsConfigSummary() {
  const { provider, from, missing, configured } = readSmsCredentials();

  return {
    configured,
    provider: provider || null,
    from: from || null,
    missingConfig: missing,
  };
}

/** Human-readable, actionable description of what an operator must do. */
function configurationError(missing) {
  return (
    'SMS delivery is not configured. Set ' +
    missing.join(', ') +
    ' in the server environment and implement the provider call in ' +
    'backend/services/smsService.js before mobile OTP sign-in can be used. ' +
    'Email OTP sign-in is unaffected and remains fully available.'
  );
}

/**
 * Sends a one-time sign-in code by SMS.
 *
 * Returns the same uniform shape as the email service's deliver():
 *   { success, delivery, errorCode, error, missingConfig }
 *
 * `message` contains the 6-digit code, so it is NEVER logged - not even in
 * development - and is never included in the returned object.
 */
export async function sendSms({ to, message }) {
  const recipient = String(to || '').trim();

  if (!recipient) {
    return {
      success: false,
      delivery: 'disabled',
      errorCode: 'SMS_NO_RECIPIENT',
      error: 'A recipient mobile number is required',
      missingConfig: [],
    };
  }

  const { provider, missing, configured } = readSmsCredentials();

  if (!configured) {
    console.warn(
      '[SMS] Refusing to send: SMS is not configured. Missing:',
      missing.join(', ')
    );

    return {
      success: false,
      delivery: 'disabled',
      errorCode: 'SMS_NOT_CONFIGURED',
      error: configurationError(missing),
      missingConfig: missing,
    };
  }

  // Configuration is present but no transport is implemented yet. Reported as a
  // failure for the same reason MAIL_MODE=console is: a code that never left
  // the process must never be reported as delivered.
  console.warn(
    `[SMS] Provider "${provider}" is configured but no SMS transport is implemented in ` +
      'backend/services/smsService.js. No message was sent.'
  );

  return {
    success: false,
    delivery: 'disabled',
    errorCode: 'SMS_TRANSPORT_NOT_IMPLEMENTED',
    error:
      'SMS is configured (' +
      provider +
      ') but no SMS transport has been implemented in backend/services/smsService.js yet. ' +
      'No message was sent. Email OTP sign-in remains available.',
    missingConfig: [],
  };
}
