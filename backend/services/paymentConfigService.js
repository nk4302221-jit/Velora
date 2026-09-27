import crypto from 'crypto';
import { executeQuery } from '../config/db.js';

const PROVIDER = 'razorpay';

// Values that look like Razorpay credentials but are only demos/placeholders.
// When the effective config matches any of these, the gateway is treated as
// "not configured" so the sandbox simulation path takes over instead of
// crashing against the live Razorpay API with bogus credentials (which surfaced
// as 500/502 failures on checkout).
const PLACEHOLDER_VALUES = new Set([
  '',
  'rzp_test_xxxxxxxxx',
  'rzp_test_xxxxxxxxxxxx',
  'rzp_live_xxxxxxxxxxxx',
  'rzp_test_example123456',
  'your_razorpay_secret_key',
  'your_razorpay_key_id',
  'your_razorpay_secret',
]);

function isPlaceholderValue(value) {
  const s = String(value ?? '').trim().toLowerCase();
  if (s === '') return true;
  if (PLACEHOLDER_VALUES.has(s)) return true;
  if (/^rzp_(test|live)_x+$/.test(s)) return true;
  return /(example|your_|placeholder|changeme|aaaaaaaa|1234)/.test(s);
}

// Server-side encryption for the stored Razorpay secret. Uses an explicit
// CONFIG_ENCRYPTION_KEY when provided, otherwise derives one from JWT_SECRET.
function getEncryptionKey() {
  const source = process.env.CONFIG_ENCRYPTION_KEY || process.env.JWT_SECRET || 'velora_payment_config_key_v1';
  return crypto.createHash('sha256').update(String(source)).digest();
}

export function encryptSecret(plain) {
  if (plain === undefined || plain === null || String(plain).trim() === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSecret(stored) {
  if (!stored) return null;
  try {
    const [ivB64, tagB64, dataB64] = String(stored).split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  } catch (error) {
    console.error('[PaymentConfig] Failed to decrypt stored secret:', error.message);
    return null;
  }
}

function isValidKeyId(keyId) {
  const s = String(keyId ?? '').trim();
  if (typeof keyId !== 'string' || s.length <= 10) return false;
  if (isPlaceholderValue(s)) return false;
  return /^rzp_(test|live)_[A-Za-z0-9]+$/.test(s);
}

function isValidKeySecret(keySecret) {
  const s = String(keySecret ?? '').trim();
  if (s.length < 10) return false;
  return !isPlaceholderValue(s);
}

function inferEnvironment(keyId) {
  return String(keyId).startsWith('rzp_live_') ? 'live' : 'test';
}

export function maskKeyId(keyId) {
  if (!keyId) return null;
  const s = String(keyId);
  if (s.length <= 8) return '••••••••';
  return `${s.slice(0, 4)}••••••${s.slice(-4)}`;
}

// Error code used by the payment service when Razorpay itself refuses the
// credentials (HTTP 401). Callers translate this into an actionable message
// instead of a generic 500.
export const RAZORPAY_CREDENTIALS_REJECTED = 'RAZORPAY_CREDENTIALS_REJECTED';

// Last known gateway verdict, kept in memory so the Admin panel can surface a
// credential problem that was discovered during checkout without issuing an
// extra live gateway call on every page load.
let lastGatewayCheck = { credentialsRejected: false, checkedAt: null };

/**
 * Detects that Razorpay rejected our key_id/key_secret rather than the request
 * itself being malformed. Only format-valid but wrong credentials land here.
 */
export function isRazorpayCredentialsRejected(error) {
  if (!error) return false;

  const status = error.statusCode ?? error.status ?? error.response?.status;
  if (status === 401) return true;

  const description = String(error.error?.description || '');
  const message = String(error.message || '');
  return /authentication failed|unauthori[sz]ed|invalid api key|invalid key_?secret|invalid key_?id/i.test(
    `${description} ${message}`
  );
}

export function recordGatewayCheck(credentialsRejected) {
  lastGatewayCheck = {
    credentialsRejected: Boolean(credentialsRejected),
    checkedAt: new Date().toISOString(),
  };
}

export function getLastGatewayCheck() {
  return { ...lastGatewayCheck };
}

/**
 * Human-readable remediation for rejected credentials. Names the environment
 * variables / admin fields only — never the secret values themselves.
 */
export function credentialsRejectedMessage(source = 'env') {
  const where =
    source === 'admin'
      ? 'the Razorpay credentials saved in the Admin > Payments panel'
      : 'the server .env values RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET';
  return `Razorpay rejected the configured credentials (authentication failed). Replace ${where} with valid Razorpay test keys.`;
}

async function getDbConfig() {
  const rows = await executeQuery('SELECT * FROM payment_configs WHERE provider = ? LIMIT 1', [PROVIDER]);
  return rows[0] || null;
}

/**
 * Resolves the effective Razorpay configuration.
 * Precedence: Admin-configured override (stored server-side) -> server .env.
 * The secret is never exposed to the client.
 */
export async function getRazorpayConfig() {
  let keyId = null;
  let keySecret = null;
  let environment = process.env.RAZORPAY_ENV || 'test';
  let source = 'env';

  let dbConfig = null;
  try {
    dbConfig = await getDbConfig();
  } catch (error) {
    console.warn('[PaymentConfig] Config table unavailable, using env defaults:', error.message);
  }

  if (dbConfig && isValidKeyId(dbConfig.key_id)) {
    keyId = dbConfig.key_id;
    keySecret = decryptSecret(dbConfig.key_secret_encrypted) || null;
    environment = dbConfig.environment || environment;
    source = 'admin';
  } else if (isValidKeyId(process.env.RAZORPAY_KEY_ID) && isValidKeySecret(process.env.RAZORPAY_KEY_SECRET)) {
    keyId = process.env.RAZORPAY_KEY_ID;
    keySecret = process.env.RAZORPAY_KEY_SECRET;
    source = 'env';
  }

  if (keyId && !environment) {
    environment = inferEnvironment(keyId);
  } else if (!keyId) {
    environment = inferEnvironment(keyId) || environment;
  } else if (!isValidKeyId(keyId)) {
    environment = process.env.RAZORPAY_ENV || 'test';
  }

  const configured = Boolean(
    keyId && keySecret && isValidKeyId(keyId) && isValidKeySecret(keySecret)
  );
  const testMode = environment !== 'live';

  return { keyId, keySecret, environment, source, configured, testMode };
}

/** Public-safe status used by the Admin UI. Never includes the secret. */
export async function getRazorpayPublicConfig() {
  const cfg = await getRazorpayConfig();
  const lastCheck = getLastGatewayCheck();
  // A gateway rejection is only meaningful while the same credentials are
  // still effective, so it is ignored once the config changes.
  const credentialsRejected = cfg.configured && lastCheck.credentialsRejected;

  return {
    configured: cfg.configured,
    credentialsRejected,
    lastGatewayCheckAt: credentialsRejected ? lastCheck.checkedAt : null,
    keyId: cfg.keyId ? maskKeyId(cfg.keyId) : null,
    environment: cfg.environment || 'test',
    testMode: cfg.testMode,
    source: cfg.source,
    statusMessage: credentialsRejected
      ? 'Credentials Rejected'
      : cfg.configured
        ? 'Connected'
        : 'Not Configured',
  };
}

/**
 * Saves the Razorpay configuration server-side only.
 * - Blank keySecret keeps the existing stored secret.
 * - The stored secret is encrypted and never returned by any API.
 */
export async function saveRazorpayConfig({ keyId, keySecret, environment } = {}) {
  const env = environment === 'live' ? 'live' : 'test';
  const existing = await getDbConfig();

  const newKeyId = keyId !== undefined && keyId !== null && String(keyId).trim() !== ''
    ? String(keyId).trim()
    : (existing && existing.key_id) || null;

  let newSecret = existing ? existing.key_secret_encrypted : null;
  if (keySecret !== undefined && keySecret !== null && String(keySecret).trim() !== '') {
    newSecret = encryptSecret(String(keySecret).trim());
  }

  if (!existing) {
    await executeQuery(
      `INSERT INTO payment_configs (provider, key_id, key_secret_encrypted, environment, is_active)
       VALUES (?, ?, ?, ?, 1)`,
      [PROVIDER, newKeyId, newSecret, env]
    );
  } else {
    await executeQuery(
      `UPDATE payment_configs SET key_id = ?, key_secret_encrypted = ?, environment = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP
       WHERE provider = ?`,
      [newKeyId, newSecret, env, PROVIDER]
    );
  }

  // New credentials invalidate any previous gateway rejection verdict.
  recordGatewayCheck(false);

  return getRazorpayPublicConfig();
}

/**
 * Tries to create a real Razorpay order server-side to validate the
 * configured credentials without charging the customer.
 */
export async function testRazorpayConfig() {
  const cfg = await getRazorpayConfig();

  if (!cfg.configured) {
    recordGatewayCheck(false);
    return {
      ok: false,
      configured: false,
      testMode: cfg.testMode,
      environment: cfg.environment,
      testOrderId: null,
    };
  }

  const { createRazorpayOrder } = await import('./razorpayService.js');
  try {
    const order = await createRazorpayOrder({
      amount: 100,
      currency: 'INR',
      receipt: `test_rcpt_${Date.now()}`,
      notes: { purpose: 'config-verification', mode: 'test' },
    });

    recordGatewayCheck(false);

    return {
      ok: true,
      configured: true,
      testMode: cfg.testMode,
      environment: cfg.environment,
      testOrderId: order.id,
    };
  } catch (error) {
    const rejected = isRazorpayCredentialsRejected(error?.cause) || isRazorpayCredentialsRejected(error);
    recordGatewayCheck(rejected);

    return {
      ok: false,
      configured: true,
      credentialsRejected: rejected,
      testMode: cfg.testMode,
      environment: cfg.environment,
      testOrderId: null,
      detail: rejected ? credentialsRejectedMessage(cfg.source) : error.message,
    };
  }
}

export default {
  getRazorpayConfig,
  getRazorpayPublicConfig,
  saveRazorpayConfig,
  testRazorpayConfig,
  maskKeyId,
  isRazorpayCredentialsRejected,
  credentialsRejectedMessage,
  getLastGatewayCheck,
  RAZORPAY_CREDENTIALS_REJECTED,
};