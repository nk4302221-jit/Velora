import { executeQuery } from '../config/db.js';
import { successResponse, errorResponse } from '../utils/responseHelper.js';
import { createRazorpayOrder, verifyRazorpaySignature } from '../services/razorpayService.js';
import {
  createPendingOrder,
  getPendingOrderIdentitySummary,
  deductStockForItems,
  OrderServiceError,
} from '../services/orderService.js';
import {
  getRazorpayConfig,
  isRazorpayCredentialsRejected,
  credentialsRejectedMessage,
  recordGatewayCheck,
  RAZORPAY_CREDENTIALS_REJECTED,
} from '../services/paymentConfigService.js';

const PAYMENT_METHOD = 'razorpay';

/**
 * Normalizes the current cart into a deterministic "productId:quantity|..." key
 * so order-creation can detect whether a previous pending order still matches
 * the shopper's cart (prevents duplicate order creation on retry).
 */
async function getCartSignature(userId) {
  const carts = await executeQuery('SELECT id FROM cart WHERE user_id = ?', [userId]);
  if (carts.length === 0) return '';
  const items = await executeQuery(
    'SELECT product_id, quantity FROM cart_items WHERE cart_id = ? ORDER BY product_id ASC',
    [carts[0].id]
  );
  return items.map((i) => `${i.product_id}:${i.quantity}`).join('|');
}

/**
 * POST /api/payment/create-order
 *
 * Creates (or reuses) an internal PENDING order and a fresh Razorpay order.
 * The payable amount is always computed server-side from the database cart and
 * membership state — the frontend amount is never trusted.
 */
export async function createPaymentOrder(req, res) {
  try {
    const userId = req.user.id;
    const { addressId } = req.body;

    if (!addressId) {
      return errorResponse(res, 'Please select a delivery address for the order', 400);
    }

    // Duplicate-order guard: reuse the most recent PENDING razorpay order only
    // when the cart composition is unchanged since that order was created.
    const cartSignature = await getCartSignature(userId);
    let internalOrder = null;

    if (cartSignature) {
      const pending = await getPendingOrderIdentitySummary(userId);
      if (pending && pending.signature === cartSignature) {
        const existing = (await executeQuery('SELECT * FROM orders WHERE id = ?', [pending.orderId]))[0];
        if (existing && existing.payment_status === 'pending') {
          internalOrder = existing;
        }
      }
    }

    if (!internalOrder) {
      const created = await createPendingOrder({ userId, addressId, paymentMethod: PAYMENT_METHOD });
      internalOrder = created.order;
    }

    // Always create a fresh Razorpay order against the server-computed total.
    const razorpayOrder = await createRazorpayOrder({
      amount: Number(internalOrder.total_amount),
      currency: 'INR',
      receipt: `order_rcpt_${internalOrder.id}`,
      notes: {
        orderId: String(internalOrder.id),
        userId: String(userId),
        customerEmail: req.user.email,
      },
    });

    await executeQuery(
      'UPDATE orders SET razorpay_order_id = ?, stripe_session_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [razorpayOrder.id, razorpayOrder.id, internalOrder.id]
    );

    return successResponse(
      res,
      'Razorpay order created successfully',
      {
        orderId: internalOrder.id,
        orderNumber: internalOrder.order_number,
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        keyId: razorpayOrder.keyId,
        isSandboxMock: razorpayOrder.isSandboxMock,
      },
      201
    );
  } catch (error) {
    if (error instanceof OrderServiceError) {
      return errorResponse(res, error.message, error.status);
    }

    // Razorpay refused our key_id/key_secret (HTTP 401). Report the actual
    // configuration problem and which settings to replace, instead of the
    // previous opaque 500, and remember the verdict for the Admin panel.
    if (error?.code === RAZORPAY_CREDENTIALS_REJECTED || isRazorpayCredentialsRejected(error)) {
      const cfg = await getRazorpayConfig().catch(() => null);
      recordGatewayCheck(true);
      console.error('[Payment:create-order] Razorpay rejected the configured credentials', {
        source: cfg?.source,
        environment: cfg?.environment,
        keyIdMasked: cfg?.keyId ? `${cfg.keyId.slice(0, 4)}••••••${cfg.keyId.slice(-4)}` : null,
      });
      return errorResponse(res, credentialsRejectedMessage(cfg?.source || 'env'), 502);
    }

    console.error('[Payment:create-order] Failed to initiate Razorpay payment:', {
      message: error.message,
      name: error.name,
      cause: error.cause,
      stack: error.stack,
    });
    if (typeof error?.message === 'string' && /razorpay|gateway|configured|environment|credential/i.test(error.message)) {
      return errorResponse(res, `Failed to initiate Razorpay payment: ${error.message}`, 500);
    }
    return errorResponse(res, 'Failed to initiate Razorpay payment', 500);
  }
}

/**
 * POST /api/payment/verify
 *
 * Verifies the Razorpay payment signature server-side and only then marks the
 * internal order as PAID/CONFIRMED. Duplicate verifications are idempotent for
 * the same payment id and rejected (409) for conflicting payment ids.
 */
export async function verifyPayment(req, res) {
  try {
    const userId = req.user.id;
    const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    if (!orderId || !razorpayPaymentId) {
      return errorResponse(res, 'Order ID and Razorpay Payment ID are required', 400);
    }

    const orders = await executeQuery('SELECT * FROM orders WHERE id = ? AND user_id = ?', [orderId, userId]);
    if (orders.length === 0) {
      return errorResponse(res, 'Order not found', 404);
    }

    const order = orders[0];

    if (order.payment_method !== 'razorpay') {
      return errorResponse(res, 'This order was not initiated with Razorpay', 400);
    }

    // Idempotent duplicate handling
    if (order.payment_status === 'paid') {
      if (order.razorpay_payment_id === razorpayPaymentId) {
        return successResponse(res, 'Order is already marked as paid', { order });
      }
      return errorResponse(res, 'This order has already been paid with a different payment', 409);
    }

    // Server-side cryptographic verification (never trust frontend success)
    const isValid = await verifyRazorpaySignature({
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
    });

    if (!isValid) {
      return errorResponse(res, 'Invalid Razorpay payment signature verification failed', 400);
    }

    // Atomically flip status so concurrent verifications can never double charge
    const markPaid = await executeQuery(
      `UPDATE orders 
       SET payment_status = 'paid', order_status = 'confirmed',
           razorpay_order_id = ?, razorpay_payment_id = ?, stripe_payment_id = ?,
           currency = 'INR', paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND payment_status = 'pending'`,
      [razorpayOrderId, razorpayPaymentId, razorpayPaymentId, orderId]
    );

    if (Number(markPaid.affectedRows ?? 0) === 0) {
      const latest = (await executeQuery('SELECT * FROM orders WHERE id = ?', [orderId]))[0];
      if (latest && latest.payment_status === 'paid' && latest.razorpay_payment_id === razorpayPaymentId) {
        return successResponse(res, 'Order is already marked as paid', { order: latest });
      }
      return errorResponse(res, 'This order has already been paid with a different payment', 409);
    }

    // Deduct stock exactly once (atomic guard above guarantees single execution)
    const items = await executeQuery('SELECT product_id, quantity FROM order_items WHERE order_id = ?', [orderId]);
    await deductStockForItems(items);

    // Record the successful Razorpay transaction
    await executeQuery(
      `INSERT INTO payments (order_id, user_id, amount, currency, provider, payment_intent_id, status, metadata)
       VALUES (?, ?, ?, 'INR', 'razorpay', ?, 'succeeded', ?)`,
      [
        orderId,
        userId,
        order.total_amount,
        razorpayPaymentId,
        JSON.stringify({ razorpay_order_id: razorpayOrderId, razorpay_signature: razorpaySignature }),
      ]
    );

    // Clear the shopper's cart now that the order is confirmed
    const carts = await executeQuery('SELECT id FROM cart WHERE user_id = ?', [userId]);
    if (carts.length > 0) {
      await executeQuery('DELETE FROM cart_items WHERE cart_id = ?', [carts[0].id]);
    }

    const updatedOrder = (await executeQuery('SELECT * FROM orders WHERE id = ?', [orderId]))[0];
    return successResponse(res, 'Razorpay payment verified successfully and order confirmed!', { order: updatedOrder });
  } catch (error) {
    console.error('VerifyPayment Error:', error);
    return errorResponse(res, 'Failed to verify Razorpay payment', 500);
  }
}

/**
 * POST /api/payment/failure
 *
 * Marks an order payment as FAILED when the shopper abandons/cancels the
 * Razorpay checkout or the gateway reports a failed payment. Never downgrades
 * an already PAID order.
 */
export async function markPaymentFailed(req, res) {
  try {
    const userId = req.user.id;
    const { orderId, razorpayOrderId, reason } = req.body;

    if (!orderId) {
      return errorResponse(res, 'Order ID is required', 400);
    }

    const orders = await executeQuery('SELECT * FROM orders WHERE id = ? AND user_id = ?', [orderId, userId]);
    if (orders.length === 0) {
      return errorResponse(res, 'Order not found', 404);
    }

    const order = orders[0];

    if (order.payment_status !== 'pending') {
      return successResponse(res, 'Order status not updated (payment already finalized)', {
        order,
        changed: false,
      });
    }

    const updated = await executeQuery(
      `UPDATE orders 
       SET payment_status = 'failed', razorpay_order_id = COALESCE(?, razorpay_order_id), updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND payment_status = 'pending'`,
      [razorpayOrderId || null, orderId]
    );

    if (Number(updated.affectedRows ?? 0) === 0) {
      const latest = (await executeQuery('SELECT * FROM orders WHERE id = ?', [orderId]))[0];
      return successResponse(res, 'Order status not updated (payment already finalized)', {
        order: latest,
        changed: false,
      });
    }

    await executeQuery(
      `INSERT INTO payments (order_id, user_id, amount, currency, provider, payment_intent_id, status, metadata)
       VALUES (?, ?, ?, 'INR', 'razorpay', NULL, 'failed', ?)`,
      [orderId, userId, order.total_amount, JSON.stringify({ failure_reason: reason || 'payment_not_completed' })]
    );

    const failedOrder = (await executeQuery('SELECT * FROM orders WHERE id = ?', [orderId]))[0];
    return successResponse(res, 'Payment was not completed. Your order has not been confirmed.', {
      order: failedOrder,
      changed: true,
    });
  } catch (error) {
    console.error('MarkPaymentFailed Error:', error);
    return errorResponse(res, 'Failed to record payment failure', 500);
  }
}

/**
 * GET /api/payment/status/:orderId
 *
 * Returns the payment status for an order. Never exposes gateway secrets.
 */
export async function getPaymentStatus(req, res) {
  try {
    const userId = req.user.id;
    const { orderId } = req.params;

    const orders = await executeQuery(
      `SELECT id, order_number, payment_status, order_status, payment_method, currency,
              total_amount, subtotal, discount, shipping,
              razorpay_order_id, razorpay_payment_id, paid_at, created_at, updated_at
       FROM orders
       WHERE id = ? AND user_id = ?`,
      [orderId, userId]
    );

    if (orders.length === 0) {
      return errorResponse(res, 'Order not found', 404);
    }

    const o = orders[0];
    return successResponse(res, 'Payment status retrieved', {
      orderId: o.id,
      orderNumber: o.order_number,
      paymentStatus: o.payment_status,
      orderStatus: o.order_status,
      paymentMethod: o.payment_method,
      currency: o.currency || 'INR',
      amount: Number(o.total_amount),
      subtotal: Number(o.subtotal),
      discount: Number(o.discount),
      shipping: Number(o.shipping),
      razorpayOrderId: o.razorpay_order_id,
      razorpayPaymentId: o.razorpay_payment_id,
      paidAt: o.paid_at,
      createdAt: o.created_at,
      updatedAt: o.updated_at,
    });
  } catch (error) {
    console.error('GetPaymentStatus Error:', error);
    return errorResponse(res, 'Failed to fetch payment status', 500);
  }
}

export default {
  createPaymentOrder,
  verifyPayment,
  markPaymentFailed,
  getPaymentStatus,
};