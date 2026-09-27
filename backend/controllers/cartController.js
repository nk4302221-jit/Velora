import { executeQuery } from '../config/db.js';
import { successResponse, errorResponse } from '../utils/responseHelper.js';

// Helper to calculate pricing with member discounts
function computeCartTotals(items, activePlanId) {
  let subtotal = 0;
  let regularDiscount = 0;

  for (const item of items) {
    const itemPrice = Number(item.price);
    const itemDiscount = item.discount_price ? itemPrice - Number(item.discount_price) : 0;
    subtotal += itemPrice * item.quantity;
    regularDiscount += Math.max(0, itemDiscount) * item.quantity;
  }

  // Membership plan extra perks:
  // Plan 2 (Silver): 5% extra discount
  // Plan 3 (Gold): 12% extra discount + Free Shipping
  let membershipDiscount = 0;
  let shipping = subtotal > 100 || subtotal === 0 ? 0.00 : 15.00;

  if (activePlanId === 2) {
    membershipDiscount = (subtotal - regularDiscount) * 0.05;
  } else if (activePlanId === 3) {
    membershipDiscount = (subtotal - regularDiscount) * 0.12;
    shipping = 0.00; // Free shipping on Gold VIP
  }

  const totalDiscount = regularDiscount + membershipDiscount;
  const finalTotal = Math.max(0, subtotal - totalDiscount + shipping);

  return {
    subtotal: Number(subtotal.toFixed(2)),
    discount: Number(totalDiscount.toFixed(2)),
    membershipDiscount: Number(membershipDiscount.toFixed(2)),
    shipping: Number(shipping.toFixed(2)),
    total: Number(finalTotal.toFixed(2)),
  };
}

export async function getCart(req, res) {
  try {
    const userId = req.user.id;

    // Get user's active membership plan if any
    const userRows = await executeQuery('SELECT active_plan_id FROM users WHERE id = ?', [userId]);
    const activePlanId = userRows[0]?.active_plan_id || null;

    // Get or create cart
    let carts = await executeQuery('SELECT id FROM cart WHERE user_id = ?', [userId]);
    let cartId;
    if (carts.length === 0) {
      const newCart = await executeQuery('INSERT INTO cart (user_id) VALUES (?)', [userId]);
      cartId = newCart.insertId;
    } else {
      cartId = carts[0].id;
    }

    const items = await executeQuery(
      `SELECT ci.id as item_id, ci.quantity, ci.created_at,
              p.id as product_id, p.name, p.description, p.brand, p.category_name,
              p.price, p.discount_price, p.stock, p.product_image, p.status
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       WHERE ci.cart_id = ?
       ORDER BY ci.created_at DESC`,
      [cartId]
    );

    const totals = computeCartTotals(items, activePlanId);

    return successResponse(res, 'Cart retrieved', {
      cartId,
      items,
      totals,
    });
  } catch (error) {
    console.error('GetCart Error:', error);
    return errorResponse(res, 'Failed to fetch shopping cart', 500);
  }
}

export async function addToCart(req, res) {
  try {
    const userId = req.user.id;
    const { productId, quantity = 1 } = req.body;

    if (!productId) {
      return errorResponse(res, 'Product ID is required', 400);
    }

    const reqQty = Math.max(1, parseInt(quantity, 10) || 1);

    // Verify product exists and check stock
    const products = await executeQuery('SELECT * FROM products WHERE id = ?', [productId]);
    if (products.length === 0) {
      return errorResponse(res, 'Product not found', 404);
    }
    const product = products[0];

    if (product.status !== 'active') {
      return errorResponse(res, 'This product is currently unavailable', 400);
    }

    // Get or create cart
    let carts = await executeQuery('SELECT id FROM cart WHERE user_id = ?', [userId]);
    let cartId;
    if (carts.length === 0) {
      const newCart = await executeQuery('INSERT INTO cart (user_id) VALUES (?)', [userId]);
      cartId = newCart.insertId;
    } else {
      cartId = carts[0].id;
    }

    // Check if already in cart
    const existingItems = await executeQuery(
      'SELECT id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ?',
      [cartId, productId]
    );

    let finalQty = reqQty;
    if (existingItems.length > 0) {
      finalQty = existingItems[0].quantity + reqQty;
      if (finalQty > product.stock) {
        return errorResponse(
          res,
          `Cannot add more. Only ${product.stock} items currently in stock (${existingItems[0].quantity} already in cart).`,
          400
        );
      }

      await executeQuery(
        'UPDATE cart_items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [finalQty, existingItems[0].id]
      );
    } else {
      if (reqQty > product.stock) {
        return errorResponse(res, `Cannot add ${reqQty} items. Only ${product.stock} left in stock.`, 400);
      }

      await executeQuery(
        'INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?)',
        [cartId, productId, reqQty]
      );
    }

    return successResponse(res, 'Product added to cart successfully', { productId, quantity: finalQty });
  } catch (error) {
    console.error('AddToCart Error:', error);
    return errorResponse(res, 'Failed to add item to cart', 500);
  }
}

export async function updateCartItem(req, res) {
  try {
    const userId = req.user.id;
    const { itemId } = req.params;
    const { quantity } = req.body;

    const newQty = parseInt(quantity, 10);
    if (isNaN(newQty) || newQty < 1) {
      return errorResponse(res, 'Quantity must be at least 1', 400);
    }

    // Ensure item belongs to user's cart
    const itemRecords = await executeQuery(
      `SELECT ci.id, ci.quantity, p.stock, p.name
       FROM cart_items ci
       JOIN cart c ON c.id = ci.cart_id
       JOIN products p ON p.id = ci.product_id
       WHERE ci.id = ? AND c.user_id = ?`,
      [itemId, userId]
    );

    if (itemRecords.length === 0) {
      return errorResponse(res, 'Cart item not found', 404);
    }

    const item = itemRecords[0];
    if (newQty > item.stock) {
      return errorResponse(res, `Cannot update quantity. Only ${item.stock} available in stock for ${item.name}.`, 400);
    }

    await executeQuery(
      'UPDATE cart_items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newQty, itemId]
    );

    return successResponse(res, 'Cart item quantity updated', { itemId, quantity: newQty });
  } catch (error) {
    console.error('UpdateCartItem Error:', error);
    return errorResponse(res, 'Failed to update cart item', 500);
  }
}

export async function removeCartItem(req, res) {
  try {
    const userId = req.user.id;
    const { itemId } = req.params;

    // Check item ownership
    const itemRecords = await executeQuery(
      `SELECT ci.id FROM cart_items ci
       JOIN cart c ON c.id = ci.cart_id
       WHERE ci.id = ? AND c.user_id = ?`,
      [itemId, userId]
    );

    if (itemRecords.length === 0) {
      return errorResponse(res, 'Cart item not found', 404);
    }

    await executeQuery('DELETE FROM cart_items WHERE id = ?', [itemId]);
    return successResponse(res, 'Item removed from cart', { itemId });
  } catch (error) {
    console.error('RemoveCartItem Error:', error);
    return errorResponse(res, 'Failed to remove item from cart', 500);
  }
}

export async function clearCart(req, res) {
  try {
    const userId = req.user.id;
    const carts = await executeQuery('SELECT id FROM cart WHERE user_id = ?', [userId]);

    if (carts.length > 0) {
      await executeQuery('DELETE FROM cart_items WHERE cart_id = ?', [carts[0].id]);
    }

    return successResponse(res, 'Cart cleared successfully');
  } catch (error) {
    console.error('ClearCart Error:', error);
    return errorResponse(res, 'Failed to clear cart', 500);
  }
}
