import nodemailer from 'nodemailer';
import dns from 'node:dns';

/**
 * =====================================================
 * OUTBOUND MAIL TRANSPORT
 *
 * Delivery modes:
 *
 *   smtp      Real email delivery.
 *   ethereal  Development/test sandbox only.
 *   console   No email is sent.
 *   disabled  No usable configuration.
 *
 * Production only allows SMTP.
 * =====================================================
 */

const PROD_MODES_ALLOWED = new Set(['smtp']);

let transporterPromise = null;
let resolvedMode = null;
let resolvedFrom = null;

// SMTP timeout
const SMTP_TIMEOUT_MS =
  Number(process.env.SMTP_TIMEOUT_MS) || 15000;

/**
 * Return safe mail configuration information.
 * Password is NEVER returned or logged.
 */
function describeConfig() {
  const user =
    process.env.SMTP_USER ||
    process.env.SMTP_USERNAME ||
    '';

  return {
    mode: resolvedMode,
    host: process.env.SMTP_HOST || null,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: resolveSecure(),
    authUser: user ? maskLocalPart(user) : null,
    from: resolvedFrom,
    missing: readSmtpCredentials().missing,
  };
}

/**
 * SMTP secure setting.
 *
 * Port 465 -> secure true
 * Port 587 -> secure false
 */
function resolveSecure() {
  const explicit = String(
    process.env.SMTP_SECURE || ''
  ).toLowerCase();

  if (explicit === 'true') return true;
  if (explicit === 'false') return false;

  return Number(process.env.SMTP_PORT) === 465;
}

/**
 * Hide mailbox local part in logs.
 */
function maskLocalPart(value) {
  const at = String(value).indexOf('@');

  if (at <= 0) {
    return '***';
  }

  return `${'*'.repeat(Math.min(at, 3))}@${String(
    value
  ).slice(at + 1)}`;
}

/**
 * Check production environment.
 */
function isProduction() {
  return (
    String(process.env.NODE_ENV || '').toLowerCase() ===
    'production'
  );
}

/**
 * Read SMTP configuration.
 *
 * Only variable names are returned in `missing`.
 * Password value is never exposed.
 */
function readSmtpCredentials() {
  const host = (
    process.env.SMTP_HOST || ''
  ).trim();

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

  if (!host) {
    missing.push('SMTP_HOST');
  }

  if (!user) {
    missing.push('SMTP_USER');
  }

  if (!pass) {
    missing.push('SMTP_PASSWORD');
  }

  if (!from) {
    missing.push('SMTP_FROM');
  }

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
 * Standard SMTP configuration error.
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
 * Resolve email delivery mode.
 */
function resolveMode() {
  const requested = String(
    process.env.MAIL_MODE || ''
  )
    .trim()
    .toLowerCase();

  const creds = readSmtpCredentials();

  // Complete SMTP configuration always uses SMTP.
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

/**
 * Resolve sender address.
 */
function resolveFromAddress() {
  return (
    process.env.SMTP_FROM ||
    process.env.EMAIL_FROM ||
    process.env.MAIL_FROM ||
    '"Velora" <noreply@velora.com>'
  );
}

/**
 * Production only permits SMTP.
 */
function assertModeAllowed(mode) {
  if (!isProduction()) {
    return;
  }

  if (!PROD_MODES_ALLOWED.has(mode)) {
    throw new Error(
      `MAIL_MODE="${mode}" is not permitted when NODE_ENV=production. ` +
        'Configure SMTP_HOST / SMTP_USER / SMTP_PASSWORD and set MAIL_MODE=smtp.'
    );
  }
}

/**
 * =====================================================
 * SMTP TRANSPORT
 * =====================================================
 *
 * Railway was attempting to connect to Gmail over IPv6:
 *
 *   ENETUNREACH ...:587
 *
 * Force IPv4 and force DNS lookup to return IPv4.
 * =====================================================
 */
function buildSmtpTransport() {
  const { host, user, pass } =
    readSmtpCredentials();

  const port =
    Number(process.env.SMTP_PORT) || 587;

  return nodemailer.createTransport({
    host,
    port,
    secure: resolveSecure(),

    // Force IPv4.
    family: 4,

    // Force DNS lookup to use IPv4 only.
    lookup: (hostname, options, callback) => {
      dns.lookup(
        hostname,
        {
          ...options,
          family: 4,
        },
        callback
      );
    },

    // Fail fast instead of waiting too long.
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,

    requireTLS:
      !resolveSecure() &&
      process.env.SMTP_REQUIRE_TLS === 'true',

    auth: {
      user,
      pass,
    },
  });
}

/**
 * =====================================================
 * GET TRANSPORTER
 * =====================================================
 */
async function getTransporter() {
  const mode = resolveMode();

  resolvedMode = mode;
  resolvedFrom = resolveFromAddress();

  /**
   * No usable configuration.
   */
  if (mode === 'disabled') {
    const { missing } =
      readSmtpCredentials();

    console.error(
      `[Email] No usable mail transport configured. ${configurationError(
        missing
      )}`
    );

    return null;
  }

  /**
   * Production validation.
   */
  assertModeAllowed(mode);

  /**
   * Console mode.
   */
  if (mode === 'console') {
    console.warn(
      '[Email] MAIL_MODE=console - NO EMAIL IS SENT. ' +
        'Every send is reported as a failure.'
    );

    return null;
  }

  /**
   * Reuse existing transporter.
   */
  if (transporterPromise) {
    return transporterPromise;
  }

  /**
   * Create transporter only once.
   */
  transporterPromise = (async () => {
    /**
     * Ethereal development mode.
     */
    if (mode === 'ethereal') {
      console.warn(
        '[Email] MAIL_MODE=ethereal - mail is delivered to a ' +
          'throwaway @ethereal.email sandbox, NOT to the real user inbox.'
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

    /**
     * Real SMTP mode.
     */
    const transport =
      buildSmtpTransport();

    /**
     * Verify SMTP connection before sending.
     */
    try {
      await transport.verify();
    } catch (error) {
      // Do not cache failed transporter.
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
 * =====================================================
 * STARTUP EMAIL DIAGNOSTICS
 * =====================================================
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
      '[Email] SMTP transporter verified successfully - ' +
        'real email delivery is active.'
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
 * Exposed for tests/diagnostics.
 *
 * Never returns SMTP password.
 */
export function getEmailConfigSummary() {
  resolvedMode = resolveMode();
  resolvedFrom = resolveFromAddress();

  return describeConfig();
}

/**
 * =====================================================
 * ETHEREAL PREVIEW URL
 * =====================================================
 */
function testMessageUrl(info) {
  try {
    return (
      nodemailer.getTestMessageUrl(info) ||
      null
    );
  } catch {
    return null;
  }
}

/**
 * =====================================================
 * VERIFICATION EMAIL HTML
 * =====================================================
 */
function buildVerificationHtml(
  fullName,
  otp
) {
  return `
    <div style="
      font-family: 'Helvetica Neue', Arial, sans-serif;
      max-width: 600px;
      margin: 0 auto;
      padding: 28px;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      background: #ffffff;
    ">
      <h2 style="
        color: #0f172a;
        margin-top: 0;
      ">
        Welcome to Velora, ${fullName}!
      </h2>

      <p style="
        color: #475569;
        font-size: 16px;
        line-height: 1.6;
      ">
        Thank you for signing up.
        Please verify your email address to activate
        your account and start shopping.
      </p>

      <p style="
        color: #475569;
        font-size: 16px;
        line-height: 1.6;
        margin: 28px 0 12px;
      ">
        Your Velora verification code is:
      </p>

      <div style="
        background-color: #2563eb;
        color: #ffffff;
        font-size: 34px;
        font-weight: 700;
        letter-spacing: 10px;
        text-align: center;
        padding: 20px 0;
        border-radius: 8px;
      ">
        ${otp}
      </div>

      <p style="
        color: #475569;
        font-size: 16px;
        line-height: 1.6;
        margin: 24px 0 0;
      ">
        This code expires in 10 minutes.
      </p>

      <p style="
        color: #94a3b8;
        font-size: 12px;
        margin-top: 32px;
        border-top: 1px solid #f1f5f9;
        padding-top: 16px;
      ">
        Enter this code on the Velora verification page.
        If you did not create this account, please ignore this email.
      </p>
    </div>
  `;
}

/**
 * =====================================================
 * PASSWORD RESET HTML
 * =====================================================
 */
function buildResetHtml(
  fullName,
  resetLink
) {
  return `
    <div style="
      font-family: 'Helvetica Neue', Arial, sans-serif;
      max-width: 600px;
      margin: 0 auto;
      padding: 28px;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      background: #ffffff;
    ">
      <h2 style="
        color: #0f172a;
        margin-top: 0;
      ">
        Password Reset Request
      </h2>

      <p style="
        color: #475569;
        font-size: 16px;
        line-height: 1.6;
      ">
        Hi ${fullName}, we received a request to reset
        the password for your Velora account.
        Click the button below to choose a new password.
      </p>

      <div style="margin: 28px 0;">
        <a
          href="${resetLink}"
          style="
            background-color: #2563eb;
            color: #ffffff;
            text-decoration: none;
            padding: 14px 28px;
            font-weight: 600;
            border-radius: 8px;
            display: inline-block;
          "
        >
          Reset Password
        </a>
      </div>

      <p style="
        color: #64748b;
        font-size: 14px;
      ">
        Or copy and paste this link in your browser:
        <br/>

        <a
          href="${resetLink}"
          style="color: #2563eb;"
        >
          ${resetLink}
        </a>
      </p>

      <p style="
        color: #94a3b8;
        font-size: 12px;
        margin-top: 32px;
        border-top: 1px solid #f1f5f9;
        padding-top: 16px;
      ">
        This link will expire in 1 hour.
        If you did not request a password reset,
        please ignore this email.
      </p>
    </div>
  `;
}

/**
 * =====================================================
 * COMMON EMAIL DELIVERY FUNNEL
 * =====================================================
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

  /**
   * Console mode
   */
  if (mode === 'console') {
    console.warn(
      `[Email] MAIL_MODE=console - ${purpose} email NOT sent to ${to}. ` +
        'Nothing is delivered anywhere in this mode.'
    );

    /**
     * Password reset link can be logged.
     *
     * OTP is intentionally never logged.
     */
    if (link) {
      console.warn(`        ${link}`);
    }

    return {
      success: false,
      delivery: 'console',
      previewUrl: null,
      errorCode: 'MAIL_CONSOLE_MODE',
      error:
        'MAIL_MODE=console is active, so no email is delivered. ' +
        'Configure SMTP_HOST / SMTP_USER / SMTP_PASSWORD / SMTP_FROM ' +
        'for real delivery.',
      missingConfig: [],
    };
  }

  let transport;

  /**
   * Get SMTP transporter.
   */
  try {
    transport =
      await getTransporter();
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

  /**
   * No transporter available.
   */
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

  /**
   * Send actual email.
   */
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
 * =====================================================
 * EMAIL VERIFICATION OTP
 * =====================================================
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
      '[Email] Failed to send verification email: ' +
        'no recipient address supplied'
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
    // OTP must never be printed to logs.
    link: null,
    purpose: 'verification',
  });
}

/**
 * =====================================================
 * PASSWORD RESET EMAIL
 * =====================================================
 */
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
      '[Email] Failed to send password reset email: ' +
        'no recipient address supplied'
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

  const result =
    await deliver({
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
        '(expires in 1 hour)',
      link: resetLink,
      purpose: 'password reset',
    });

  return {
    ...result,
    resetLink,
  };
}

/**
 * =====================================================
 * LOGIN OTP
 * =====================================================
 */
function buildLoginOtpHtml(
  fullName,
  otp
) {
  return `
    <div style="
      font-family: 'Helvetica Neue', Arial, sans-serif;
      max-width: 600px;
      margin: 0 auto;
      padding: 28px;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      background: #ffffff;
    ">
      <h2 style="
        color: #0f172a;
        margin-top: 0;
      ">
        Your Velora sign-in code
      </h2>

      <p style="
        color: #475569;
        font-size: 16px;
        line-height: 1.6;
      ">
        Hi ${fullName}, you chose to sign in to Velora
        with a one-time code instead of a password.
      </p>

      <p style="
        color: #475569;
        font-size: 16px;
        line-height: 1.6;
        margin: 28px 0 12px;
      ">
        Your sign-in code is:
      </p>

      <div style="
        background-color: #2563eb;
        color: #ffffff;
        font-size: 34px;
        font-weight: 700;
        letter-spacing: 10px;
        text-align: center;
        padding: 20px 0;
        border-radius: 8px;
      ">
        ${otp}
      </div>

      <p style="
        color: #475569;
        font-size: 16px;
        line-height: 1.6;
        margin: 24px 0 0;
      ">
        This code expires in 10 minutes
        and can only be used once.
      </p>

      <p style="
        color: #94a3b8;
        font-size: 12px;
        margin-top: 32px;
        border-top: 1px solid #f1f5f9;
        padding-top: 16px;
      ">
        If you did not try to sign in to Velora,
        you can ignore this email.
      </p>
    </div>
  `;
}

/**
 * =====================================================
 * LOGIN OTP EMAIL
 * =====================================================
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
      '[Email] Failed to send sign-in code email: ' +
        'no recipient address supplied'
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
    // Never log OTP.
    link: null,
    purpose: 'sign-in code',
  });
}