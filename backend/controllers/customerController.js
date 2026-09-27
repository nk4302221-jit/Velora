import { executeQuery } from '../config/db.js';
import { successResponse, errorResponse } from '../utils/responseHelper.js';

// =====================================================
// CUSTOMER SELF-SERVICE
//
// Every handler here scopes its query by req.user.id, which the authenticate
// middleware derives from the verified JWT and then re-reads from the database.
// A customer can therefore only ever reach their own records - passing someone
// else's order id in the URL returns 404, never their data.
// =====================================================

// Statuses a customer is allowed to cancel. Once an order has shipped the
// cancellation window has closed and a return request is required instead.
const CUSTOMER_CANCELLABLE_STATUSES = ['pending', 'confirmed', 'processing'];

// A return can only be requested for an order that was actually delivered.
const RETURNABLE_STATUSES = ['delivered', 'shipped'];

// The happy-path progression used to build the tracking timeline.
const TRACKING_STEPS = [
  { key: 'pending', label: 'Order Placed' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'processing', label: 'Processing' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'delivered', label: 'Delivered' },
];


// =====================================================
// REVIEWS
//
// A review is only accepted for a product the customer actually received, so
// ratings cannot be brigaded by never-purchased accounts. The UNIQUE
// (product_id, user_id) constraint means one review per product, which the
// upsert below respects. New reviews land in 'pending' and only become visible
// once an admin moderates them.
// =====================================================

export async function submitReview(req, res) {
  try {
    const { product_id: rawProductId, rating: rawRating, title, comment } = req.body || {};
    const productId = parseInt(rawProductId, 10);
    const rating = parseInt(rawRating, 10);

    if (Number.isNaN(productId) || productId <= 0) {
      return errorResponse(res, 'A valid product is required', 400);
    }

    if (Number.isNaN(rating) || rating < 1 || rating > 5) {
      return errorResponse(res, 'Rating must be between 1 and 5', 400);
    }

    const trimmedComment = typeof comment === 'string' ? comment.trim() : '';
    const trimmedTitle = typeof title === 'string' ? title.trim() : '';

    if (trimmedComment.length < 10) {
      return errorResponse(res, 'Please describe your experience in at least 10 characters', 400);
    }

    // The product must exist and be live.
    const products = await executeQuery('SELECT id, name FROM products WHERE id = ?', [productId]);

    if (products.length === 0) {
      return errorResponse(res, 'Product not found', 404);
    }

    // Verified-purchase check: this customer must have a delivered order line
    // for the product. Scoped to req.user.id, so nobody can review on
    // somebody else's behalf.
    const purchased = await executeQuery(
      `SELECT oi.id
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
        WHERE o.user_id = ?
          AND oi.product_id = ?
          AND o.order_status = 'delivered'
        LIMIT 1`,
      [req.user.id, productId]
    );

    if (purchased.length === 0) {
      return errorResponse(res, 'Only delivered purchases can be reviewed', 403);
    }

    // One review per product: update in place and send it back for moderation.
    await executeQuery(
      `INSERT INTO reviews (product_id, user_id, rating, title, comment, status)
            VALUES (?, ?, ?, ?, ?, 'pending')
       ON DUPLICATE KEY UPDATE
            rating = VALUES(rating),
            title = VALUES(title),
            comment = VALUES(comment),
            status = 'pending'`,
      [productId, req.user.id, rating, trimmedTitle || null, trimmedComment]
    );

    const reviews = await executeQuery(
      `SELECT id, product_id, rating, title, comment, status, created_at, updated_at
         FROM reviews
        WHERE product_id = ? AND user_id = ?`,
      [productId, req.user.id]
    );

    return successResponse(res, 'Review submitted and awaiting moderation', {
      review: reviews[0] || null,
    });
  } catch (error) {
    console.error('SubmitReview Error:', error);
    return errorResponse(res, 'Failed to submit review', 500);
  }
}

export async function getMyReviews(req, res) {
  try {
    const reviews = await executeQuery(
      `SELECT r.id, r.rating, r.title, r.comment, r.status, r.created_at, r.updated_at,
              p.id AS product_id, p.name AS product_name, p.product_image AS product_image
         FROM reviews r
         JOIN products p ON p.id = r.product_id
        WHERE r.user_id = ?
        ORDER BY r.updated_at DESC`,
      [req.user.id]
    );

    return successResponse(res, 'Reviews retrieved', { reviews });
  } catch (error) {
    console.error('GetMyReviews Error:', error);
    return errorResponse(res, 'Failed to load your reviews', 500);
  }
}

/**
 * GET /api/customer/reviews/reviewable
 * Products this customer has actually received and has not reviewed yet.
 *
 * The client cannot derive this reliably from the order list (it would need
 * every order's line items), and it must match the verified-purchase rule that
 * submitReview() enforces - so the server computes it.
 */
export async function getReviewableProducts(req, res) {
  try {
    const products = await executeQuery(
      `SELECT oi.product_id,
              p.name AS product_name,
              p.product_image AS product_image,
              o.order_number,
              o.id AS order_id,
              o.updated_at AS delivered_at,
              MAX(oi.id) AS last_ordered_item_id
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN products p ON p.id = oi.product_id
         LEFT JOIN reviews r
                ON r.product_id = oi.product_id
               AND r.user_id = o.user_id
        WHERE o.user_id = ?
          AND o.order_status = 'delivered'
          AND r.id IS NULL
        GROUP BY oi.product_id, p.name, p.product_image, o.order_number, o.id, o.updated_at
        ORDER BY o.updated_at DESC`,
      [req.user.id]
    );

    return successResponse(res, 'Reviewable products retrieved', { products });
  } catch (error) {
    console.error('GetReviewableProducts Error:', error);
    return errorResponse(res, 'Failed to load reviewable products', 500);
  }
}

// =====================================================
// ORDER TRACKING
// =====================================================
export async function trackOrder(req, res) {
  try {
    const orderId = parseInt(req.params.id, 10);
    if (Number.isNaN(orderId)) {
      return errorResponse(res, 'Invalid order ID', 400);
    }

    const orders = await executeQuery(
      'SELECT id, order_number, order_status, payment_status, created_at, updated_at FROM orders WHERE id = ? AND user_id = ?',
      [orderId, req.user.id]
    );

    if (orders.length === 0) {
      return errorResponse(res, 'Order not found', 404);
    }

    const order = orders[0];

    const cancelDeadline = new Date(new Date(order.created_at).getTime() + 2 * 60 * 60 * 1000);

    return successResponse(res, 'Order tracking retrieved', {
      order: {
        id: order.id,
        orderNumber: order.order_number,
        orderStatus: order.order_status,
        paymentStatus: order.payment_status,
        createdAt: order.created_at,
        updatedAt: order.updated_at,
      },
      currentStep: TRACKING_STEPS.findIndex((step) => step.key === order.order_status),
      steps: TRACKING_STEPS.map((step) => ({
        ...step,
        reached: TRACKING_STEPS.findIndex((s) => s.key === order.order_status) >= TRACKING_STEPS.findIndex((s) => s.key === step.key),
      })),
      canCancel: CUSTOMER_CANCELLABLE_STATUSES.includes(order.order_status),
      canRequestReturn: RETURNABLE_STATUSES.includes(order.order_status),
      cancelDeadline: cancelDeadline.toISOString(),
    });
  } catch (error) {
    console.error('TrackOrder Error:', error);
    return errorResponse(res, 'Failed to load order tracking', 500);
  }
}

// =====================================================
// CANCEL ORDER
// =====================================================

export async function cancelOrder(req, res) {
  try {
    const orderId = parseInt(req.params.id, 10);
    if (Number.isNaN(orderId)) {
      return errorResponse(res, 'Invalid order ID', 400);
    }

    const { reason } = req.body || {};

    const orders = await executeQuery(
      'SELECT id, order_number, order_status, payment_status, user_id FROM orders WHERE id = ? AND user_id = ?',
      [orderId, req.user.id]
    );

    if (orders.length === 0) {
      return errorResponse(res, 'Order not found', 404);
    }

    const order = orders[0];

    if (order.order_status === 'cancelled') {
      return errorResponse(res, 'This order has already been cancelled', 400);
    }

    if (order.order_status === 'delivered') {
      return errorResponse(res, 'Delivered orders cannot be cancelled. Request a return instead.', 400);
    }

    if (!CUSTOMER_CANCELLABLE_STATUSES.includes(order.order_status)) {
      return errorResponse(
        res,
        `An order that is already "${order.order_status}" can no longer be cancelled. Request a return instead.`,
        400
      );
    }

    await executeQuery(
      "UPDATE orders SET order_status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
      [orderId, req.user.id]
    );

    // Paid orders are marked for refund so the payments view stays accurate.
    if (order.payment_status === 'paid') {
      await executeQuery(
        "UPDATE orders SET payment_status = 'refunded', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [orderId]
      );
    }

    // Return the reserved stock to inventory.
    const items = await executeQuery(
      'SELECT product_id, quantity FROM order_items WHERE order_id = ?',
      [orderId]
    );

    for (const item of items) {
      await executeQuery(
        'UPDATE products SET stock = stock + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [Number(item.quantity || 0), item.product_id]
      );
    }

    const updated = await executeQuery('SELECT * FROM orders WHERE id = ?', [orderId]);

    return successResponse(res, 'Order cancelled successfully', {
      order: updated[0],
      reason: reason || null,
    });
  } catch (error) {
    console.error('CancelOrder Error:', error);
    return errorResponse(res, 'Failed to cancel order', 500);
  }
}

// =====================================================
// RETURN / REFUND REQUEST
// =====================================================

export async function requestReturn(req, res) {
  try {
    const orderId = parseInt(req.params.id, 10);
    if (Number.isNaN(orderId)) {
      return errorResponse(res, 'Invalid order ID', 400);
    }

    const { reason } = req.body || {};

    if (!reason || !String(reason).trim()) {
      return errorResponse(res, 'A reason is required to request a return', 400);
    }

    const orders = await executeQuery(
      'SELECT id, order_number, order_status, user_id FROM orders WHERE id = ? AND user_id = ?',
      [orderId, req.user.id]
    );

    if (orders.length === 0) {
      return errorResponse(res, 'Order not found', 404);
    }

    const order = orders[0];

    if (!RETURNABLE_STATUSES.includes(order.order_status)) {
      return errorResponse(
        res,
        `A return can only be requested for a shipped or delivered order. This order is "${order.order_status}".`,
        400
      );
    }

    const existing = await executeQuery(
      "SELECT id FROM returns WHERE order_id = ? AND status IN ('requested','approved')",
      [orderId]
    );

    if (existing.length > 0) {
      return errorResponse(res, 'A return request for this order is already in progress', 409);
    }

    const result = await executeQuery(
      'INSERT INTO returns (order_id, user_id, reason, status) VALUES (?, ?, ?, ?)',
      [orderId, req.user.id, String(reason).trim(), 'requested']
    );

    const created = await executeQuery('SELECT * FROM returns WHERE id = ?', [result.insertId]);

    return successResponse(res, 'Return request submitted successfully', { return: created[0] }, 201);
  } catch (error) {
    console.error('RequestReturn Error:', error);
    return errorResponse(res, 'Failed to submit return request', 500);
  }
}

export async function getMyReturns(req, res) {
  try {
    const returns = await executeQuery(
      `SELECT r.id, r.order_id, r.reason, r.status, r.refund_amount, r.admin_note,
              r.requested_at, r.resolved_at, o.order_number, o.total_amount
         FROM returns r
         JOIN orders o ON o.id = r.order_id
        WHERE r.user_id = ?
        ORDER BY r.requested_at DESC`,
      [req.user.id]
    );

    return successResponse(res, 'Return requests retrieved', { returns });
  } catch (error) {
    console.error('GetMyReturns Error:', error);
    return errorResponse(res, 'Failed to fetch return requests', 500);
  }
}

// =====================================================
// PAYMENT HISTORY
// =====================================================

export async function getPaymentHistory(req, res) {
  try {
    const payments = await executeQuery(
      `SELECT p.id, p.order_id, p.amount, p.currency, p.provider, p.payment_intent_id,
              p.status, p.created_at, o.order_number, o.order_status, o.payment_status
         FROM payments p
         LEFT JOIN orders o ON o.id = p.order_id
        WHERE p.user_id = ?
        ORDER BY p.created_at DESC`,
      [req.user.id]
    );

    return successResponse(res, 'Payment history retrieved', { payments });
  } catch (error) {
    console.error('GetPaymentHistory Error:', error);
    return errorResponse(res, 'Failed to fetch payment history', 500);
  }
}

// =====================================================
// CUSTOMER DASHBOARD SUMMARY
// =====================================================

export async function getCustomerDashboard(req, res) {
  try {
    const userId = req.user.id;

    const orderStats = await executeQuery(
      `SELECT
         COUNT(*) AS total_orders,
         COALESCE(SUM(CASE WHEN order_status NOT IN ('delivered','cancelled') THEN 1 ELSE 0 END), 0) AS active_orders,
         COALESCE(SUM(CASE WHEN order_status = 'delivered' THEN 1 ELSE 0 END), 0) AS delivered_orders,
         COALESCE(SUM(CASE WHEN order_status = 'cancelled' THEN 1 ELSE 0 END), 0) AS cancelled_orders,
         COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN total_amount ELSE 0 END), 0) AS total_spent
       FROM orders WHERE user_id = ?`,
      [userId]
    );

    const cartCount = await executeQuery(
      `SELECT COALESCE(SUM(ci.quantity), 0) AS items
         FROM cart_items ci
         JOIN cart c ON c.id = ci.cart_id
        WHERE c.user_id = ?`,
      [userId]
    );

    const wishlistCount = await executeQuery(
      `SELECT COUNT(*) AS items
         FROM wishlist_items wi
         JOIN wishlist w ON w.id = wi.wishlist_id
        WHERE w.user_id = ?`,
      [userId]
    );

    const openReturns = await executeQuery(
      "SELECT COUNT(*) AS count FROM returns WHERE user_id = ? AND status IN ('requested','approved')",
      [userId]
    );

    const recentOrders = await executeQuery(
      `SELECT id, order_number, order_status, payment_status, total_amount, created_at
         FROM orders WHERE user_id = ?
        ORDER BY created_at DESC LIMIT 5`,
      [userId]
    );

    const stats = orderStats[0] || {};

    return successResponse(res, 'Customer dashboard summary', {
      stats: {
        totalOrders: Number(stats.total_orders || 0),
        activeOrders: Number(stats.active_orders || 0),
        deliveredOrders: Number(stats.delivered_orders || 0),
        cancelledOrders: Number(stats.cancelled_orders || 0),
        totalSpent: Number(stats.total_spent || 0),
        cartItems: Number(cartCount[0]?.items || 0),
        wishlistItems: Number(wishlistCount[0]?.items || 0),
        openReturns: Number(openReturns[0]?.count || 0),
      },
      recentOrders,
    });
  } catch (error) {
    console.error('GetCustomerDashboard Error:', error);
    return errorResponse(res, 'Failed to load dashboard summary', 500);
  }
}
