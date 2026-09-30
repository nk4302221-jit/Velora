import { executeQuery } from '../config/db.js';
import { successResponse, errorResponse } from '../utils/responseHelper.js';
import { isAdminRole } from '../utils/roleHelper.js';
import { createCheckoutSession } from '../services/stripeService.js';
import { createRazorpayOrder, verifyRazorpaySignature } from '../services/razorpayService.js';
import { createPendingOrder, OrderServiceError, deductStockForItems } from '../services/orderService.js';

export async function createOrder(req, res) {
  try {
    const userId = req.user.id;
    const { addressId, paymentMethod } = req.body;

    const created = await createPendingOrder({ userId, addressId, paymentMethod });

    return successResponse(
      res,
      'Order initiated successfully. Proceed to payment.',
      {
        orderId: created.orderId,
        totalAmount: created.totalAmount,
        order: created.order,
      },
      201
    );
  } catch (error) {
    if (error instanceof OrderServiceError) {
      return errorResponse(res, error.message, error.status);
    }
    console.error('CreateOrder Error:', error);
    return errorResponse(res, 'Failed to create order', 500);
  }
}

export async function createCheckoutSessionHandler(req, res) {
  try {
    const userId = req.user.id;
    const { orderId } = req.body;

    if (!orderId) {
      return errorResponse(res, 'Order ID is required to initiate Stripe checkout', 400);
    }

    const orders = await executeQuery('SELECT * FROM orders WHERE id = ? AND user_id = ?', [orderId, userId]);
    if (orders.length === 0) {
      return errorResponse(res, 'Order not found', 404);
    }

    const order = orders[0];
    if (order.payment_status === 'paid') {
      return errorResponse(res, 'This order has already been paid for.', 400);
    }

    const items = await executeQuery('SELECT * FROM order_items WHERE order_id = ?', [orderId]);

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:4000';
    const session = await createCheckoutSession({
      orderId,
      items,
      customerEmail: req.user.email,
      successUrl: `${clientUrl}/orders/${orderId}`,
      cancelUrl: `${clientUrl}/checkout`,
      totalAmount: order.total_amount,
    });

    // Save Stripe session ID in orders table
    await executeQuery(
      'UPDATE orders SET stripe_session_id = ? WHERE id = ?',
      [session.id, orderId]
    );

    return successResponse(res, 'Checkout session created', {
      sessionId: session.id,
      checkoutUrl: session.url,
      isSandboxMock: session.isSandboxMock,
    });
  } catch (error) {
    console.error('CreateCheckoutSession Error:', error);
    return errorResponse(res, 'Failed to create checkout session', 500);
  }
}

export async function confirmOrderPayment(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { paymentIntentId, sessionId } = req.body;

    const orders = await executeQuery('SELECT * FROM orders WHERE id = ? AND user_id = ?', [id, userId]);
    if (orders.length === 0) {
      return errorResponse(res, 'Order not found', 404);
    }

    const order = orders[0];
    if (order.payment_status === 'paid') {
      return successResponse(res, 'Order is already confirmed and paid', { order });
    }

    const isCod = order.payment_method === 'cod';

    // Deduct stock for all order items
    const items = await executeQuery('SELECT product_id, quantity FROM order_items WHERE order_id = ?', [id]);
    await deductStockForItems(items);

    let transactionId = null;
    if (!isCod) {
      transactionId = paymentIntentId || sessionId || `txn_stripe_${Date.now()}`;
    }

    // COD orders are confirmed but intentionally stay "pending" until cash is collected.
    await executeQuery(
      `UPDATE orders 
       SET order_status = 'confirmed', stripe_payment_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [transactionId, id]
    );

    // Record in payments table
    await executeQuery(
      `INSERT INTO payments (order_id, user_id, amount, currency, provider, payment_intent_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        userId,
        order.total_amount,
        'USD',
        isCod ? 'cod' : 'stripe',
        transactionId,
        isCod ? 'pending' : 'succeeded',
      ]
    );

    // Clear user's cart now that order is confirmed
    const carts = await executeQuery('SELECT id FROM cart WHERE user_id = ?', [userId]);
    if (carts.length > 0) {
      await executeQuery('DELETE FROM cart_items WHERE cart_id = ?', [carts[0].id]);
    }

    const updatedOrder = (await executeQuery('SELECT * FROM orders WHERE id = ?', [id]))[0];
    return successResponse(res, 'Payment verified successfully and order confirmed!', { order: updatedOrder });
  } catch (error) {
    console.error('ConfirmOrderPayment Error:', error);
    return errorResponse(res, 'Failed to confirm order payment', 500);
  }
}

export async function createRazorpayOrderHandler(req, res) {
  try {
    const userId = req.user.id;
    const { orderId } = req.body;

    if (!orderId) {
      return errorResponse(res, 'Order ID is required to initiate Razorpay checkout', 400);
    }

    const orders = await executeQuery('SELECT * FROM orders WHERE id = ? AND user_id = ?', [orderId, userId]);
    if (orders.length === 0) {
      return errorResponse(res, 'Order not found', 404);
    }

    const order = orders[0];
    if (order.payment_status === 'paid') {
      return errorResponse(res, 'This order is already paid.', 400);
    }

    const razorpayOrder = await createRazorpayOrder({
      amount: order.total_amount,
      currency: 'INR',
      receipt: `order_rcpt_${orderId}`,
      notes: {
        orderId: String(orderId),
        userId: String(userId),
        customerEmail: req.user.email,
      },
    });

    // Persist the Razorpay order id on the internal order (dedicated column,
    // with legacy stripe_session_id kept for backwards compatibility).
    await executeQuery(
      'UPDATE orders SET razorpay_order_id = ?, stripe_session_id = ? WHERE id = ?',
      [razorpayOrder.id, razorpayOrder.id, orderId]
    );

    return successResponse(res, 'Razorpay order created successfully', {
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      keyId: razorpayOrder.keyId,
      isSandboxMock: razorpayOrder.isSandboxMock,
    });
  } catch (error) {
    console.error('CreateRazorpayOrder Error:', error);
    return errorResponse(res, 'Failed to initiate Razorpay payment', 500);
  }
}

export async function verifyRazorpayPaymentHandler(req, res) {
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

    // Idempotency: a duplicate verification of an already-paid order is a safe
    // no-op, but only when the same payment id is being re-confirmed.
    if (order.payment_status === 'paid') {
      if (order.razorpay_payment_id === razorpayPaymentId) {
        return successResponse(res, 'Order is already marked as paid', { order });
      }
      return errorResponse(res, 'This order has already been paid with a different payment', 409);
    }

    // Verify cryptographic signature (server-side, never trust frontend success)
    const isValid = await verifyRazorpaySignature({
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
    });

    if (!isValid) {
      return errorResponse(res, 'Invalid Razorpay payment signature verification failed', 400);
    }

    // Atomically flip payment status so two concurrent verifications can never
    // both pass the pending check (prevents duplicate stock deduction).
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

    // Deduct stock for all order items (single execution, guarded above)
    const items = await executeQuery('SELECT product_id, quantity FROM order_items WHERE order_id = ?', [orderId]);
    await deductStockForItems(items);

    // Record in payments table
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

    // Clear user's shopping cart
    const carts = await executeQuery('SELECT id FROM cart WHERE user_id = ?', [userId]);
    if (carts.length > 0) {
      await executeQuery('DELETE FROM cart_items WHERE cart_id = ?', [carts[0].id]);
    }

    const updatedOrder = (await executeQuery('SELECT * FROM orders WHERE id = ?', [orderId]))[0];
    return successResponse(res, 'Razorpay payment verified successfully and order confirmed!', { order: updatedOrder });
  } catch (error) {
    console.error('VerifyRazorpayPayment Error:', error);
    return errorResponse(res, 'Failed to verify Razorpay payment', 500);
  }
}

export async function getUserOrders(req, res) {
  try {
    const userId = req.user.id;
    const orders = await executeQuery(
      `SELECT o.*, 
              a.full_name as shipping_name, a.address_line1, a.city, a.state, a.postal_code,
              (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as total_items
       FROM orders o
       LEFT JOIN addresses a ON a.id = o.address_id
       WHERE o.user_id = ?
       ORDER BY o.created_at DESC`,
      [userId]
    );

    return successResponse(res, 'Orders retrieved', { orders });
  } catch (error) {
    console.error('GetUserOrders Error:', error);
    return errorResponse(res, 'Failed to fetch orders', 500);
  }
}

export async function getOrderById(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // admin + super_admin may open any order; a customer may only ever open
    // their own. Customer authorization is unchanged.
    const canViewAnyOrder = isAdminRole(req.user.role);

    const orders = await executeQuery(
      `SELECT o.*, 
              a.full_name as shipping_name, a.phone as shipping_phone,
              a.address_line1, a.address_line2, a.city, a.state, a.country, a.postal_code
       FROM orders o
       LEFT JOIN addresses a ON a.id = o.address_id
       WHERE o.id = ?${canViewAnyOrder ? '' : ' AND o.user_id = ?'}`,
      canViewAnyOrder ? [id] : [id, userId]
    );

    if (orders.length === 0) {
      return errorResponse(res, 'Order not found', 404);
    }

    const order = orders[0];
    const items = await executeQuery(
      'SELECT oi.*, oi.image_url as product_image FROM order_items oi WHERE oi.order_id = ?',
      [id]
    );

    return successResponse(res, 'Order details retrieved', {
      order: {
        ...order,
        items,
      },
    });
  } catch (error) {
    console.error('GetOrderById Error:', error);
    return errorResponse(res, 'Failed to fetch order details', 500);
  }
}
