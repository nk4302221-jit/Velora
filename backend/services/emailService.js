import nodemailer from 'nodemailer';
import dns from 'node:dns';

/**
 * =====================================================
 * OUTBOUND MAIL TRANSPORT
 *
 * Delivery modes (MAIL_MODE), resolved once at startup:
 *
 *   smtp      Real delivery. Requires SMTP_HOST + SMTP_USER + SMTP_PASSWORD.
 *             This is the ONLY mode allowed when NODE_ENV=production.
 *   ethereal  Nodemailer's shared sandbox account. Mail is accepted by the
 *             SMTP server but goes to an @ethereal.email address, NOT to the
 *             real user inbox. Development / QA only.
 *   console   Nothing is sent anywhere. Development / QA only. Every send is
 *             reported back to the caller as a FAILURE (MAIL_CONSOLE_MODE), so
 *             a verification code can never be claimed as "sent" when it was
 *             not, and the code itself is never printed.
 *   disabled  No usable configuration. Every send fails fast and loudly with
 *             SMTP_NOT_CONFIGURED instead of silently pretending to succeed.
 *
 * The previous implementation fell back to an Ethereal test account whenever
 * SMTP credentials were missing and STILL returned { success: true }. That is
 * why registration appeared to work while the user never received a code:
 * the mail was delivered to a throwaway sandbox mailbox and the API reported
 * success. Falling back is now opt-in only, and a missing configuration is
 * reported as a failure the caller can surface to the user - naming the exact
 * environment variables that are absent, so the problem is diagnosable without
 * reproducing it by hand.
 * =====================================================
 */

const PROD_MODES_ALLOWED = new Set(['smtp']);

let transporterPromise = null;
let resolvedMode = null;
let resolvedFrom = null;

// Connection/auth failures must surface as a fast error rather than leaving an
// HTTP request hanging while the SMTP socket times out.
const SMTP_TIMEOUT_MS = Number(process.env.SMTP_TIMEOUT_MS) || 15000;

/**
 * =====================================================
 * RAILWAY -> GMAIL SMTP IPv4 DNS FIX
 *
 * Railway was resolving smtp.gmail.com to an IPv6 address and then failing
 * with ENETUNREACH.
 *
 * Force Node DNS lookup to return an IPv4 address only.
 * =====================================================
 */
function ipv4Lookup(hostname, options, callback) {
  dns.lookup(
    hostname,
    {
      ...options,
      family: 4,
      all: false,
    },
    callback
  );
}

/**
 * Everything the log is allowed to know about the transport. The password is
 * never read here, so there is no code path that can print it.
 */
function describeConfig() {
  const user = process.env.SMTP_USER || process.env.SMTP_USERNAME || '';

  return {
    mode: resolvedMode,
    host: process.env.SMTP_HOST || null,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: resolveSecure(),

    // Only the domain is logged, never the full mailbox.
    authUser: user ? maskLocalPart(user) : null,

    from: resolvedFrom,

    // Variable NAMES only, never values.
    missing: readSmtpCredentials().missing,
  };
}

function resolveSecure() {
  const explicit = String(process.env.SMTP_SECURE || '').toLowerCase();

  if (explicit === 'true') return true;
  if (explicit === 'false') return false;

  return Number(process.env.SMTP_PORT) === 465;
}

function maskLocalPart(value) {
  const at = String(value).indexOf('@');

  if (at <= 0) return '***';

  return `${'*'.repeat(Math.min(at, 3))}@${String(value).slice(at + 1)}`;
}

function isProduction() {
  return String(process.env.NODE_ENV || '').toLowerCase() === 'production';
}

/**
 * Reads the delivery configuration and reports WHICH variables are absent.
 */
function readSmtpCredentials() {
  const host = (process.env.SMTP_HOST || '').trim();

  const user = (
    process.env.SMTP_USER ||
    process.env.SMTP_USERNAME ||
    ''
  ).trim();

  const pass =
    process.env.SMTP_PASSWORD ||
    process.env.SMTP_PASS ||
    '';

  const from = (
    process.env.SMTP_FROM ||
    process.env.EMAIL_FROM ||
    process.env.MAIL_FROM ||
    ''
  ).trim();

  const missing = [];

  if (!host) missing.push('SMTP_HOST');
  if (!user) missing.push('SMTP_USER');
  if (!pass) missing.push('SMTP_PASSWORD');
  if (!from) missing.push('SMTP_FROM');

  return {
    host,
    user,
    pass,
    from,
    complete: missing.length === 0,
    missing,
  };
}

/**
 * Single wording used for configuration failures.
 */
function configurationError(missing) {
  const list =
    missing && missing.length
      ? missing.join(', ')
      : 'the SMTP_* variables';

  return (
    `Mail transport is not configured. Missing or empty: ${list}. ` +
    'Set them in the server environment (.env) and restart the backend. ' +
    'MAIL_MODE=console delivers nothing and is only useful for offline testing.'
  );
}

/**
 * Resolves delivery mode.
 */
function resolveMode() {
  const requested = String(
    process.env.MAIL_MODE || ''
  ).trim().toLowerCase();

  const creds = readSmtpCredentials();

  // Complete SMTP credentials always use SMTP.
  if (creds.complete) {
    return 'smtp';
  }

  if (requested === 'console') {
    return 'console';
  }

  if (requested === 'ethereal') {
    return 'ethereal';
  }

  if (requested === 'disabled') {
    return 'disabled';
  }

  return 'disabled';
}

function resolveFromAddress() {
  return (
    process.env.SMTP_FROM ||
    process.env.EMAIL_FROM ||
    process.env.MAIL_FROM ||
    '"Velora" <noreply@velora.com>'
  );
}

function assertModeAllowed(mode) {
  if (!isProduction()) return;

  if (!PROD_MODES_ALLOWED.has(mode)) {
    throw new Error(
      `MAIL_MODE="${mode}" is not permitted when NODE_ENV=production. ` +
        'Configure SMTP_HOST / SMTP_USER / SMTP_PASSWORD and set MAIL_MODE=smtp.'
    );
  }
}

/**
 * Creates the SMTP transport.
 *
 * IMPORTANT:
 * `family: 4` + `lookup: ipv4Lookup`
 * forces smtp.gmail.com DNS resolution through IPv4.
 */
function buildSmtpTransport() {
  const { host, user, pass } = readSmtpCredentials();

  const port =
    Number(process.env.SMTP_PORT) || 587;

  const secure = resolveSecure();

  return nodemailer.createTransport({
    host,
    port,
    secure,
    family: 4,
    lookup: ipv4Lookup,

    // Gmail port 587 uses STARTTLS.
    requireTLS: !secure,

    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000,

    auth: {
      user,
      pass,
    },
  });
}

/**
 * Builds and validates the transport.
 */
async function getTransporter() {
  const mode = resolveMode();

  resolvedMode = mode;
  resolvedFrom = resolveFromAddress();

  if (mode === 'disabled') {
    const { missing } = readSmtpCredentials();

    console.error(
      `[Email] No usable mail transport configured. ${configurationError(
        missing
      )}`
    );

    return null;
  }

  assertModeAllowed(mode);

  if (mode === 'console') {
    console.warn(
      '[Email] MAIL_MODE=console - NO EMAIL IS SENT. Every send is reported as a failure.'
    );

    return null;
  }

  if (transporterPromise) {
    return transporterPromise;
  }

  transporterPromise = (async () => {
    if (mode === 'ethereal') {
      console.warn(
        '[Email] MAIL_MODE=ethereal - mail is delivered to a throwaway @ethereal.email sandbox, NOT to the real user inbox.'
      );

      const testAccount =
        await nodemailer.createTestAccount();

      return nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
    }

    const transport = buildSmtpTransport();

    // Verify connection before using it.
    try {
      await transport.verify();
    } catch (error) {
      // Do not cache a failed transport.
      transporterPromise = null;

      throw new Error(
        `SMTP connection failed: ${error.message}`
      );
    }

    return transport;
  })();

  return transporterPromise;
}

/**
 * Startup diagnostic.
 */
export async function logEmailDiagnostics() {
  resolvedMode = resolveMode();
  resolvedFrom = resolveFromAddress();

  const summary = describeConfig();

  console.log(
    '[Email] Mail configuration:',
    summary
  );

  if (summary.mode !== 'smtp') {
    return summary;
  }

  try {
    await getTransporter();

    console.log(
      '[Email] SMTP transporter verified successfully - real email delivery is active.'
    );
  } catch (error) {
    console.error(
      '[Email] SMTP transporter verification failed:',
      error.message
    );
  }

  return summary;
}

/**
 * Exposed for tests / diagnostics.
 * Never returns credentials.
 */
export function getEmailConfigSummary() {
  resolvedMode = resolveMode();
  resolvedFrom = resolveFromAddress();

  return describeConfig();
}

function testMessageUrl(info) {
  try {
    return nodemailer.getTestMessageUrl(info) || null;
  } catch {
    return null;
  }
}

function buildVerificationHtml(fullName, otp) {
  return `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
        <h2 style="color: #0f172a; margin-top: 0;">Welcome to Velora, ${fullName}!</h2>

        <p style="color: #475569; font-size: 16px; line-height: 1.6;">
          Thank you for signing up. Please verify your email address to activate your account and start shopping.
        </p>

        <p style="color: #475569; font-size: 16px; line-height: 1.6; margin: 28px 0 12px;">
          Your Velora verification code is:
        </p>

        <div style="background-color: #2563eb; color: #ffffff; font-size: 34px; font-weight: 700; letter-spacing: 10px; text-align: center; padding: 20px 0; border-radius: 8px;">
          ${otp}
        </div>

        <p style="color: #475569; font-size: 16px; line-height: 1.6; margin: 24px 0 0;">
          This code expires in 10 minutes.
        </p>

        <p style="color: #94a3b8; font-size: 12px; margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 16px;">
          Enter this code on the Velora verification page. If you did not create this account, please ignore this email.
        </p>
      </div>
    `;
}

function buildResetHtml(fullName, resetLink) {
  return `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
        <h2 style="color: #0f172a; margin-top: 0;">Password Reset Request</h2>

        <p style="color: #475569; font-size: 16px; line-height: 1.6;">
          Hi ${fullName}, we received a request to reset the password for your Velora account.
          Click the button below to choose a new password.
        </p>

        <div style="margin: 28px 0;">
          <a href="${resetLink}" style="background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 14px 28px; font-weight: 600; border-radius: 8px; display: inline-block;">
            Reset Password
          </a>
        </div>

        <p style="color: #64748b; font-size: 14px;">
          Or copy and paste this link in your browser:
          <br/>
          <a href="${resetLink}" style="color: #2563eb;">
            ${resetLink}
          </a>
        </p>

        <p style="color: #94a3b8; font-size: 12px; margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 16px;">
          This link will expire in 1 hour. If you did not request a password reset, please ignore this email.
        </p>
      </div>
    `;
}

/**
 * Single funnel for every outbound message.
 */
async function deliver({
  to,
  subject,
  html,
  text,
  link,
  purpose,
}) {
  const mode = resolveMode();

  resolvedMode = mode;
  resolvedFrom = resolveFromAddress();

  console.log(
    `[Email] Preparing ${purpose} email`,
    {
      to,
      subject,
      transport: describeConfig(),
    }
  );

  if (mode === 'console') {
    console.warn(
      `[Email] MAIL_MODE=console - ${purpose} email NOT sent to ${to}. ` +
        'Nothing is delivered anywhere in this mode.'
    );

    if (link) {
      console.warn(`        ${link}`);
    }

    return {
      success: false,
      delivery: 'console',
      previewUrl: null,
      errorCode: 'MAIL_CONSOLE_MODE',
      error:
        'MAIL_MODE=console is active, so no email is delivered. Configure SMTP_HOST / SMTP_USER / SMTP_PASSWORD / SMTP_FROM for real delivery.',
      missingConfig: [],
    };
  }

  let transport;

  try {
    transport = await getTransporter();
  } catch (error) {
    console.error(
      `[Email] Failed to send ${purpose} email: ${error.message}`
    );

    return {
      success: false,
      delivery: mode,
      previewUrl: null,
      errorCode: 'SMTP_UNAVAILABLE',
      error: error.message,
      missingConfig:
        readSmtpCredentials().missing,
    };
  }

  if (!transport) {
    const { missing } =
      readSmtpCredentials();

    return {
      success: false,
      delivery: 'disabled',
      previewUrl: null,
      errorCode: 'SMTP_NOT_CONFIGURED',
      error: configurationError(missing),
      missingConfig: missing,
    };
  }

  try {
    const info =
      await transport.sendMail({
        from: resolvedFrom,
        to,
        subject,
        html,
        text,
      });

    const previewUrl =
      mode === 'ethereal'
        ? testMessageUrl(info)
        : null;

    console.log(
      `[Email] ${purpose} email sent successfully`,
      {
        to,
        delivery: mode,
        messageId:
          info?.messageId || null,
        accepted:
          info?.accepted?.length || 0,
        rejected:
          info?.rejected?.length || 0,
        previewUrl,
      }
    );

    return {
      success: true,
      delivery: mode,
      previewUrl,
      errorCode: null,
      error: null,
      missingConfig: [],
    };
  } catch (error) {
    console.error(
      `[Email] Failed to send ${purpose} email: ${error.message}`,
      {
        to,
        code: error?.code || null,
        command: error?.command || null,
      }
    );

    return {
      success: false,
      delivery: mode,
      previewUrl: null,
      errorCode:
        error?.code ||
        'SMTP_SEND_FAILED',
      error: error.message,
      missingConfig: [],
    };
  }
}

/**
 * Sends account verification email containing the 6-digit code.
 */
export async function sendVerificationEmail(
  toEmail,
  fullName,
  otp
) {
  const recipient =
    String(toEmail || '').trim();

  if (!recipient) {
    console.error(
      '[Email] Failed to send verification email: no recipient address supplied'
    );

    return {
      success: false,
      delivery: 'disabled',
      previewUrl: null,
      errorCode: 'NO_RECIPIENT',
      error:
        'A recipient email address is required',
      missingConfig: [],
    };
  }

  return deliver({
    to: recipient,
    subject:
      'Your Velora Email Verification Code',
    html: buildVerificationHtml(
      fullName || 'there',
      otp
    ),
    text:
      `Your Velora verification code is: ${otp}\n\n` +
      'This code expires in 10 minutes.',
    link: null,
    purpose: 'verification',
  });
}

export async function sendPasswordResetEmail(
  toEmail,
  fullName,
  resetToken
) {
  const recipient =
    String(toEmail || '').trim();

  const clientUrl =
    process.env.CLIENT_URL ||
    'https://velora-six-chi.vercel.app';

  const resetLink =
    `${clientUrl}/reset-password?token=` +
    encodeURIComponent(resetToken);

  if (!recipient) {
    console.error(
      '[Email] Failed to send password reset email: no recipient address supplied'
    );

    return {
      success: false,
      delivery: 'disabled',
      previewUrl: null,
      errorCode: 'NO_RECIPIENT',
      error:
        'A recipient email address is required',
      missingConfig: [],
      resetLink,
    };
  }

  const result = await deliver({
    to: recipient,
    subject:
      'Reset your Velora Account Password',
    html: buildResetHtml(
      fullName || 'there',
      resetLink
    ),
    text:
      `We received a request to reset your Velora password. ` +
      `Visit this link to choose a new password: ${resetLink} ` +
      `(expires in 1 hour)`,
    link: resetLink,
    purpose: 'password reset',
  });

  return {
    ...result,
    resetLink,
  };
}

// =====================================================
// SIGN-IN CODE (OTP LOGIN)
// =====================================================

function buildLoginOtpHtml(
  fullName,
  otp
) {
  return `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
        <h2 style="color: #0f172a; margin-top: 0;">Your Velora sign-in code</h2>

        <p style="color: #475569; font-size: 16px; line-height: 1.6;">
          Hi ${fullName}, you chose to sign in to Velora with a one-time code instead of a password.
        </p>

        <p style="color: #475569; font-size: 16px; line-height: 1.6; margin: 28px 0 12px;">
          Your sign-in code is:
        </p>

        <div style="background-color: #2563eb; color: #ffffff; font-size: 34px; font-weight: 700; letter-spacing: 10px; text-align: center; padding: 20px 0; border-radius: 8px;">
          ${otp}
        </div>

        <p style="color: #475569; font-size: 16px; line-height: 1.6; margin: 24px 0 0;">
          This code expires in 10 minutes and can only be used once.
        </p>

        <p style="color: #94a3b8; font-size: 12px; margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 16px;">
          If you did not try to sign in to Velora, you can ignore this email - no action is needed
          and your password has not changed.
        </p>
      </div>
    `;
}

/**
 * Sends the 6-digit sign-in code.
 */
export async function sendLoginOtpEmail(
  toEmail,
  fullName,
  otp
) {
  const recipient =
    String(toEmail || '').trim();

  if (!recipient) {
    console.error(
      '[Email] Failed to send sign-in code email: no recipient address supplied'
    );

    return {
      success: false,
      delivery: 'disabled',
      previewUrl: null,
      errorCode: 'NO_RECIPIENT',
      error:
        'A recipient email address is required',
      missingConfig: [],
    };
  }

  return deliver({
    to: recipient,
    subject:
      'Your Velora sign-in code',
    html: buildLoginOtpHtml(
      fullName || 'there',
      otp
    ),
    text:
      `Your Velora sign-in code is: ${otp}\n\n` +
      'This code expires in 10 minutes and can only be used once.',
    link: null,
    purpose: 'sign-in code',
  });
}