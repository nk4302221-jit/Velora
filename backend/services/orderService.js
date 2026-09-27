import { executeQuery } from '../config/db.js';

/**
 * Domain error thrown by the order service layer carrying an HTTP status so
 * controllers can translate it into a proper errorResponse without duplicating
 * the order-creation validations.
 */
export class OrderServiceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'OrderServiceError';
    this.status = status;
  }
}

/**
 * Creates an internal order in PENDING payment state.
 *
 * The final payable amount is ALWAYS recomputed server-side from the database
 * cart + membership state. Values coming from the client (addressId /
 * paymentMethod) are only used to pick the delivery address and gateway — the
 * amount is never trusted from the frontend.
 *
 * @param {Object} params
 * @param {number} params.userId
 * @param {number} params.addressId
 * @param {string} [params.paymentMethod]
 * @returns {Promise<{orderId:number, orderNumber:string, totalAmount:number, subtotal:number, discount:number, shipping:number, currency:string, order:Object}>}
 */
export async function createPendingOrder({ userId, addressId, paymentMethod = 'razorpay' }) {
  const method = ['razorpay', 'stripe', 'cod'].includes(paymentMethod) ? paymentMethod : 'razorpay';

  if (!addressId) {
    throw new OrderServiceError('Please select a delivery address for the order', 400);
  }

  // Verify address belongs to the authenticated user
  const addresses = await executeQuery('SELECT * FROM addresses WHERE id = ? AND user_id = ?', [addressId, userId]);
  if (addresses.length === 0) {
    throw new OrderServiceError('Selected delivery address does not exist', 404);
  }

  // Get cart items
  const carts = await executeQuery('SELECT id FROM cart WHERE user_id = ?', [userId]);
  if (carts.length === 0) {
    throw new OrderServiceError('Cart is empty', 400);
  }

  const cartId = carts[0].id;
  const cartItems = await executeQuery(
    `SELECT ci.quantity, p.id as product_id, p.name, p.price, p.discount_price, p.stock, p.product_image
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     WHERE ci.cart_id = ?`,
    [cartId]
  );

  if (cartItems.length === 0) {
    throw new OrderServiceError('Your cart is empty. Please add products before checking out.', 400);
  }

  // Validate product availability
  for (const item of cartItems) {
    if (item.quantity > item.stock) {
      throw new OrderServiceError(
        `Insufficient stock for "${item.name}". Requested: ${item.quantity}, Available: ${item.stock}`,
        400
      );
    }
  }

  // Apply membership discounts (mirrors cartController.computeCartTotals)
  const userRows = await executeQuery('SELECT active_plan_id FROM users WHERE id = ?', [userId]);
  const activePlanId = userRows[0]?.active_plan_id || null;

  let subtotal = 0;
  let regularDiscount = 0;
  for (const item of cartItems) {
    const p = Number(item.price);
    const disc = item.discount_price ? p - Number(item.discount_price) : 0;
    subtotal += p * item.quantity;
    regularDiscount += Math.max(0, disc) * item.quantity;
  }

  let membershipDiscount = 0;
  let shipping = subtotal > 100 || subtotal === 0 ? 0.0 : 15.0;
  if (activePlanId === 2) {
    membershipDiscount = (subtotal - regularDiscount) * 0.05;
  } else if (activePlanId === 3) {
    membershipDiscount = (subtotal - regularDiscount) * 0.12;
    shipping = 0.0;
  }

  const discount = Number((regularDiscount + membershipDiscount).toFixed(2));
  const totalAmount = Number((subtotal - discount + shipping).toFixed(2));

  // Create order record in PENDING payment state
  const orderResult = await executeQuery(
    `INSERT INTO orders 
     (user_id, address_id, subtotal, discount, shipping, total_amount, payment_status, order_status, payment_method, currency)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', 'pending', ?, 'INR')`,
    [userId, addressId, subtotal, discount, shipping, totalAmount, method]
  );

  const orderId = orderResult.insertId;
  const orderNumber = `VLR-${String(orderId).padStart(6, '0')}`;

  // Assign human-friendly order number (requires the row id first)
  await executeQuery('UPDATE orders SET order_number = ? WHERE id = ?', [orderNumber, orderId]);

  // Snapshot current product price at order creation
  for (const item of cartItems) {
    const unitPrice = item.discount_price ? Number(item.discount_price) : Number(item.price);
    const itemTotal = Number((unitPrice * item.quantity).toFixed(2));

    await executeQuery(
      `INSERT INTO order_items (order_id, product_id, product_name, quantity, price, total, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [orderId, item.product_id, item.name, item.quantity, unitPrice, itemTotal, item.product_image]
    );
  }

  return {
    orderId,
    orderNumber,
    totalAmount,
    subtotal,
    discount,
    shipping,
    currency: 'INR',
    order: {
      id: orderId,
      order_number: orderNumber,
      total_amount: totalAmount,
      payment_method: method,
      currency: 'INR',
    },
  };
}

/**
 * Deducts stock for a list of { product_id, quantity } items without relying on
 * MySQL MAX()/GREATEST() scalar syntax. Stock is clamped to a minimum of zero.
 */
export async function deductStockForItems(items) {
  for (const item of items) {
    const rows = await executeQuery('SELECT stock FROM products WHERE id = ?', [item.product_id]);
    const currentStock = Number(rows[0]?.stock ?? 0);
    const newStock = Math.max(0, currentStock - Number(item.quantity));
    await executeQuery('UPDATE products SET stock = ? WHERE id = ?', [newStock, item.product_id]);
  }
}

/**
 * Returns the items that currently belong to a pending order for a user, keyed
 * as "productId:quantity" so order-creation can be made idempotent when the
 * underlying cart has not changed.
 */
export async function getPendingOrderIdentitySummary(userId) {
  const orders = await executeQuery(
    `SELECT o.id FROM orders o
     WHERE o.user_id = ? AND o.payment_method = 'razorpay' AND o.payment_status = 'pending'
     ORDER BY o.created_at DESC, o.id DESC LIMIT 1`,
    [userId]
  );
  if (orders.length === 0) return null;

  const orderId = orders[0].id;
  const items = await executeQuery(
    'SELECT product_id, quantity FROM order_items WHERE order_id = ? ORDER BY product_id ASC',
    [orderId]
  );
  return {
    orderId,
    signature: items.map((i) => `${i.product_id}:${i.quantity}`).join('|'),
  };
}

export default {
  createPendingOrder,
  getPendingOrderIdentitySummary,
  deductStockForItems,
};