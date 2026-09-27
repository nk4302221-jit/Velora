import Razorpay from 'razorpay';
import crypto from 'crypto';
import { getRazorpayConfig } from './paymentConfigService.js';
import {
  isRazorpayCredentialsRejected,
  recordGatewayCheck,
  RAZORPAY_CREDENTIALS_REJECTED,
} from './paymentConfigService.js';

let razorpayInstance = null;
let instanceCacheKey = '';

async function getRazorpayInstance() {
  const config = await getRazorpayConfig();

  if (!config.configured) {
    return null;
  }

  const cacheKey = `${config.keyId}::${config.keySecret}`;
  if (!razorpayInstance || cacheKey !== instanceCacheKey) {
    razorpayInstance = new Razorpay({
      key_id: config.keyId,
      key_secret: config.keySecret,
    });
    instanceCacheKey = cacheKey;
  }

  return razorpayInstance;
}

/**
 * Creates a Razorpay Order
 * @param {Object} options
 * @param {number} options.amount - In main currency units (e.g. INR or USD)
 * @param {string} options.currency - ISO code (e.g. 'INR', 'USD')
 * @param {string} options.receipt - Unique order/receipt ID
 * @param {Object} options.notes - Optional metadata notes
 */
export async function createRazorpayOrder({ amount, currency = 'INR', receipt, notes = {} }) {
  const config = await getRazorpayConfig();
  const amountInSubunits = Math.round(Number(amount) * 100); // 1 INR/USD = 100 subunits (paise/cents)

  if (!Number.isFinite(amountInSubunits) || amountInSubunits <= 0) {
    throw new Error('Invalid payment amount supplied to Razorpay');
  }

  try {
    const rzp = await getRazorpayInstance();

    if (rzp && config.configured) {
      const order = await rzp.orders.create({
        amount: amountInSubunits,
        currency,
        receipt: String(receipt),
        notes,
      });

      return {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: config.keyId,
        isSandboxMock: false,
      };
    }

    // High-fidelity sandbox/test simulation mode: valid keys are not configured
    // yet (placeholders or admin config absent), so we return a mock order the
    // frontend can "pay" without hitting the real Razorpay API.
    console.warn(
      '[Razorpay Service] Using Sandbox Simulation Mode (keys missing or placeholder) for receipt:',
      receipt
    );
    const mockOrderId = `order_rzp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return {
      id: mockOrderId,
      amount: amountInSubunits,
      currency,
      keyId: config.keyId || null,
      isSandboxMock: true,
    };
  } catch (error) {
    console.error('[Razorpay Service Error]: Failed to create order:', error);
    const detail = error?.error?.description || error?.message || 'Razorpay order creation failed';
    const wrapped = new Error(`Razorpay order could not be created: ${detail}`);
    wrapped.cause = error;
    // Credentials that are present and format-valid but refused by the gateway
    // are tagged so callers can report an actionable configuration problem
    // instead of a generic failure. Deliberately still throws: we never fall
    // back to a simulated payment when credentials were expected to work.
    if (isRazorpayCredentialsRejected(error)) {
      wrapped.code = RAZORPAY_CREDENTIALS_REJECTED;
    }
    throw wrapped;
  }
}

/**
 * Verifies Razorpay payment signature.
 * In sandbox simulation mode (no real keys) any valid-looking payment id passes.
 * @param {Object} data
 * @param {string} data.orderId
 * @param {string} data.paymentId
 * @param {string} data.signature
 */
export async function verifyRazorpaySignature({ orderId, paymentId, signature }) {
  const config = await getRazorpayConfig();

  if (!config.configured) {
    // Sandbox simulation passes valid mock format
    return Boolean(orderId && paymentId);
  }

  const keySecret = config.keySecret;

  try {
    const generatedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    return generatedSignature === signature;
  } catch (error) {
    console.error('[Razorpay Signature Error]:', error);
    return false;
  }
}

export default {
  createRazorpayOrder,
  verifyRazorpaySignature,
};