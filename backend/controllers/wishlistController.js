import { executeQuery } from '../config/db.js';
import { successResponse, errorResponse } from '../utils/responseHelper.js';

export async function getWishlist(req, res) {
  try {
    const userId = req.user.id;

    let wishlists = await executeQuery('SELECT id FROM wishlist WHERE user_id = ?', [userId]);
    let wishlistId;
    if (wishlists.length === 0) {
      const newWl = await executeQuery('INSERT INTO wishlist (user_id) VALUES (?)', [userId]);
      wishlistId = newWl.insertId;
    } else {
      wishlistId = wishlists[0].id;
    }

    const items = await executeQuery(
      `SELECT wi.id as wishlist_item_id, wi.created_at,
              p.id as product_id, p.name, p.description, p.brand, p.category_name,
              p.price, p.discount_price, p.stock, p.product_image, p.rating, p.status
       FROM wishlist_items wi
       JOIN products p ON p.id = wi.product_id
       WHERE wi.wishlist_id = ?
       ORDER BY wi.created_at DESC`,
      [wishlistId]
    );

    return successResponse(res, 'Wishlist retrieved', { items });
  } catch (error) {
    console.error('GetWishlist Error:', error);
    return errorResponse(res, 'Failed to fetch wishlist', 500);
  }
}

export async function addToWishlist(req, res) {
  try {
    const userId = req.user.id;
    const { productId } = req.body;

    if (!productId) {
      return errorResponse(res, 'Product ID is required', 400);
    }

    // Verify product exists
    const products = await executeQuery('SELECT id FROM products WHERE id = ?', [productId]);
    if (products.length === 0) {
      return errorResponse(res, 'Product not found', 404);
    }

    let wishlists = await executeQuery('SELECT id FROM wishlist WHERE user_id = ?', [userId]);
    let wishlistId;
    if (wishlists.length === 0) {
      const newWl = await executeQuery('INSERT INTO wishlist (user_id) VALUES (?)', [userId]);
      wishlistId = newWl.insertId;
    } else {
      wishlistId = wishlists[0].id;
    }

    // Prevent duplicate wishlist rows
    const existing = await executeQuery(
      'SELECT id FROM wishlist_items WHERE wishlist_id = ? AND product_id = ?',
      [wishlistId, productId]
    );

    if (existing.length > 0) {
      return successResponse(res, 'Product is already in your wishlist', { productId });
    }

    await executeQuery(
      'INSERT INTO wishlist_items (wishlist_id, product_id) VALUES (?, ?)',
      [wishlistId, productId]
    );

    return successResponse(res, 'Product added to wishlist', { productId }, 201);
  } catch (error) {
    console.error('AddToWishlist Error:', error);
    return errorResponse(res, 'Failed to add item to wishlist', 500);
  }
}

export async function removeFromWishlist(req, res) {
  try {
    const userId = req.user.id;
    const { productId } = req.params;

    const wishlists = await executeQuery('SELECT id FROM wishlist WHERE user_id = ?', [userId]);
    if (wishlists.length === 0) {
      return successResponse(res, 'Item removed from wishlist');
    }

    await executeQuery(
      'DELETE FROM wishlist_items WHERE wishlist_id = ? AND product_id = ?',
      [wishlists[0].id, productId]
    );

    return successResponse(res, 'Item removed from wishlist', { productId });
  } catch (error) {
    console.error('RemoveFromWishlist Error:', error);
    return errorResponse(res, 'Failed to remove item from wishlist', 500);
  }
}

export async function moveToCart(req, res) {
  try {
    const userId = req.user.id;
    const { productId } = req.params;

    // Verify product exists and has stock
    const products = await executeQuery('SELECT id, stock FROM products WHERE id = ?', [productId]);
    if (products.length === 0) {
      return errorResponse(res, 'Product not found', 404);
    }
    if (products[0].stock <= 0) {
      return errorResponse(res, 'Product is out of stock', 400);
    }

    // Add to cart
    let carts = await executeQuery('SELECT id FROM cart WHERE user_id = ?', [userId]);
    let cartId = carts.length > 0 ? carts[0].id : (await executeQuery('INSERT INTO cart (user_id) VALUES (?)', [userId])).insertId;

    const cartItems = await executeQuery(
      'SELECT id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ?',
      [cartId, productId]
    );

    if (cartItems.length > 0) {
      await executeQuery(
        'UPDATE cart_items SET quantity = quantity + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [cartItems[0].id]
      );
    } else {
      await executeQuery(
        'INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, 1)',
        [cartId, productId]
      );
    }

    // Remove from wishlist
    const wishlists = await executeQuery('SELECT id FROM wishlist WHERE user_id = ?', [userId]);
    if (wishlists.length > 0) {
      await executeQuery(
        'DELETE FROM wishlist_items WHERE wishlist_id = ? AND product_id = ?',
        [wishlists[0].id, productId]
      );
    }

    return successResponse(res, 'Product moved to shopping cart');
  } catch (error) {
    console.error('MoveToCart Error:', error);
    return errorResponse(res, 'Failed to move product to cart', 500);
  }
}
