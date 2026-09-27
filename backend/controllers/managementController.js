import { executeQuery } from '../config/db.js';
import { successResponse, errorResponse } from '../utils/responseHelper.js';
import { recordAudit } from '../utils/auditLog.js';

// =====================================================
// CATEGORIES
// =====================================================

function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

export async function getAllCategories(req, res) {
  try {
    const categories = await executeQuery(
      `SELECT c.id, c.name, c.slug, c.description, c.image_url, c.created_at,
              (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count
         FROM categories c
        ORDER BY c.name ASC`
    );

    return successResponse(res, 'Categories retrieved', { categories });
  } catch (error) {
    console.error('GetAllCategories Error:', error);
    return errorResponse(res, 'Failed to fetch categories', 500);
  }
}

export async function createCategory(req, res) {
  try {
    const { name, description, imageUrl } = req.body || {};

    if (!name || !String(name).trim()) {
      return errorResponse(res, 'Category name is required', 400);
    }

    const trimmedName = String(name).trim();
    const slug = slugify(req.body?.slug || trimmedName);

    if (!slug) {
      return errorResponse(res, 'Could not derive a valid slug from that name', 400);
    }

    const existing = await executeQuery('SELECT id FROM categories WHERE name = ? OR slug = ?', [
      trimmedName,
      slug,
    ]);

    if (existing.length > 0) {
      return errorResponse(res, 'A category with that name or slug already exists', 409);
    }

    const result = await executeQuery(
      'INSERT INTO categories (name, slug, description, image_url) VALUES (?, ?, ?, ?)',
      [trimmedName, slug, description || null, imageUrl || null]
    );

    await recordAudit({
      req,
      action: 'category.created',
      entityType: 'category',
      entityId: result.insertId,
      details: { name: trimmedName, slug },
    });

    const created = await executeQuery('SELECT * FROM categories WHERE id = ?', [result.insertId]);

    return successResponse(res, 'Category created successfully', { category: created[0] }, 201);
  } catch (error) {
    console.error('CreateCategory Error:', error);
    return errorResponse(res, 'Failed to create category', 500);
  }
}

export async function updateCategory(req, res) {
  try {
    const categoryId = parseInt(req.params.id, 10);
    if (Number.isNaN(categoryId)) {
      return errorResponse(res, 'Invalid category ID', 400);
    }

    const { name, description, imageUrl } = req.body || {};

    const existing = await executeQuery('SELECT id, name FROM categories WHERE id = ?', [categoryId]);
    if (existing.length === 0) {
      return errorResponse(res, 'Category not found', 404);
    }

    const updates = [];
    const params = [];

    if (name !== undefined) {
      const trimmedName = String(name).trim();
      if (!trimmedName) {
        return errorResponse(res, 'Category name cannot be empty', 400);
      }
      updates.push('name = ?');
      params.push(trimmedName);
    }

    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description || null);
    }

    if (imageUrl !== undefined) {
      updates.push('image_url = ?');
      params.push(imageUrl || null);
    }

    if (updates.length === 0) {
      return errorResponse(res, 'No editable fields provided', 400);
    }

    await executeQuery(`UPDATE categories SET ${updates.join(', ')} WHERE id = ?`, [
      ...params,
      categoryId,
    ]);

    // Keep the denormalized category_name on products consistent.
    if (name !== undefined) {
      await executeQuery('UPDATE products SET category_name = ? WHERE category_id = ?', [
        String(name).trim(),
        categoryId,
      ]);
    }

    await recordAudit({
      req,
      action: 'category.updated',
      entityType: 'category',
      entityId: categoryId,
      details: { fields: Object.keys(req.body || {}) },
    });

    const updated = await executeQuery('SELECT * FROM categories WHERE id = ?', [categoryId]);

    return successResponse(res, 'Category updated successfully', { category: updated[0] });
  } catch (error) {
    console.error('UpdateCategory Error:', error);
    return errorResponse(res, 'Failed to update category', 500);
  }
}

export async function deleteCategory(req, res) {
  try {
    const categoryId = parseInt(req.params.id, 10);
    if (Number.isNaN(categoryId)) {
      return errorResponse(res, 'Invalid category ID', 400);
    }

    const existing = await executeQuery('SELECT id, name FROM categories WHERE id = ?', [categoryId]);
    if (existing.length === 0) {
      return errorResponse(res, 'Category not found', 404);
    }

    // products.category_id is ON DELETE SET NULL, so products survive the delete.
    const productCount = await executeQuery(
      'SELECT COUNT(*) AS count FROM products WHERE category_id = ?',
      [categoryId]
    );

    await executeQuery('DELETE FROM categories WHERE id = ?', [categoryId]);

    await recordAudit({
      req,
      action: 'category.deleted',
      entityType: 'category',
      entityId: categoryId,
      details: { name: existing[0].name, orphanedProducts: Number(productCount[0]?.count || 0) },
    });

    return successResponse(res, 'Category deleted successfully', {
      orphanedProducts: Number(productCount[0]?.count || 0),
    });
  } catch (error) {
    console.error('DeleteCategory Error:', error);
    return errorResponse(res, 'Failed to delete category', 500);
  }
}

// =====================================================
// INVENTORY
// =====================================================

export async function getInventory(req, res) {
  try {
    const { search, stock, page = 1, limit = 20 } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(200, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push('(name LIKE ? OR brand LIKE ? OR category_name LIKE ?)');
      params.push(term, term, term);
    }

    if (stock === 'low') {
      conditions.push('stock <= 10');
    } else if (stock === 'out') {
      conditions.push('stock = 0');
    } else if (stock === 'in') {
      conditions.push('stock > 10');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await executeQuery(
      `SELECT COUNT(*) AS total FROM products ${whereClause}`,
      params
    );
    const total = Number(countResult[0]?.total || 0);

    const items = await executeQuery(
      `SELECT id, name, brand, category_name, price, discount_price, stock, status, product_image
         FROM products
         ${whereClause}
        ORDER BY stock ASC, name ASC
        LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    const summaryRows = await executeQuery(
      `SELECT
         COALESCE(SUM(stock), 0) AS total_units,
         COALESCE(SUM(CASE WHEN stock = 0 THEN 1 ELSE 0 END), 0) AS out_of_stock,
         COALESCE(SUM(CASE WHEN stock > 0 AND stock <= 10 THEN 1 ELSE 0 END), 0) AS low_stock,
         COUNT(*) AS total_products
       FROM products`
    );

    return res.status(200).json({
      success: true,
      items,
      summary: {
        totalUnits: Number(summaryRows[0]?.total_units || 0),
        outOfStock: Number(summaryRows[0]?.out_of_stock || 0),
        lowStock: Number(summaryRows[0]?.low_stock || 0),
        totalProducts: Number(summaryRows[0]?.total_products || 0),
      },
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('GetInventory Error:', error);
    return errorResponse(res, 'Failed to fetch inventory', 500);
  }
}

export async function updateInventory(req, res) {
  try {
    const productId = parseInt(req.params.id, 10);
    if (Number.isNaN(productId)) {
      return errorResponse(res, 'Invalid product ID', 400);
    }

    const { stock, status } = req.body || {};

    if (stock === undefined && status === undefined) {
      return errorResponse(res, 'Provide stock and/or status to update', 400);
    }

    if (stock !== undefined) {
      const parsedStock = Number(stock);
      if (!Number.isInteger(parsedStock) || parsedStock < 0) {
        return errorResponse(res, 'Stock must be a non-negative whole number', 400);
      }
    }

    if (status !== undefined && !['active', 'inactive'].includes(status)) {
      return errorResponse(res, "Status must be either 'active' or 'inactive'", 400);
    }

    const existing = await executeQuery(
      'SELECT id, name, stock, status FROM products WHERE id = ?',
      [productId]
    );

    if (existing.length === 0) {
      return errorResponse(res, 'Product not found', 404);
    }

    const before = existing[0];

    await executeQuery(
      `UPDATE products
          SET stock = COALESCE(?, stock),
              status = COALESCE(?, status),
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [stock === undefined ? null : Number(stock), status === undefined ? null : status, productId]
    );

    await recordAudit({
      req,
      action: 'inventory.updated',
      entityType: 'product',
      entityId: productId,
      details: {
        product: before.name,
        stockFrom: before.stock,
        stockTo: stock === undefined ? before.stock : Number(stock),
        statusFrom: before.status,
        statusTo: status === undefined ? before.status : status,
      },
    });

    const updated = await executeQuery(
      'SELECT id, name, stock, status FROM products WHERE id = ?',
      [productId]
    );

    return successResponse(res, 'Inventory updated successfully', { product: updated[0] });
  } catch (error) {
    console.error('UpdateInventory Error:', error);
    return errorResponse(res, 'Failed to update inventory', 500);
  }
}

// =====================================================
// COUPONS
// =====================================================

const COUPON_DISCOUNT_TYPES = ['percentage', 'fixed'];
const COUPON_STATUSES = ['active', 'inactive'];

function toNullableDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().replace('T', ' ').substring(0, 19);
}

export async function getCoupons(req, res) {
  try {
    const coupons = await executeQuery(
      'SELECT * FROM coupons ORDER BY created_at DESC'
    );

    return successResponse(res, 'Coupons retrieved', { coupons });
  } catch (error) {
    console.error('GetCoupons Error:', error);
    return errorResponse(res, 'Failed to fetch coupons', 500);
  }
}

function validateCouponPayload(body, { partial = false } = {}) {
  const errors = [];

  if (!partial || body.code !== undefined) {
    const code = String(body.code || '').toUpperCase().trim();
    if (!code) {
      errors.push('Coupon code is required');
    } else if (!/^[A-Z0-9_-]{3,64}$/.test(code)) {
      errors.push('Coupon code may only contain letters, numbers, hyphens and underscores (3-64 chars)');
    }
  }

  if (!partial || body.discountType !== undefined) {
    if (!COUPON_DISCOUNT_TYPES.includes(body.discountType)) {
      errors.push(`Discount type must be one of: ${COUPON_DISCOUNT_TYPES.join(', ')}`);
    }
  }

  if (!partial || body.discountValue !== undefined) {
    const value = Number(body.discountValue);
    if (Number.isNaN(value) || value <= 0) {
      errors.push('Discount value must be a positive number');
    } else if (body.discountType === 'percentage' && value > 100) {
      errors.push('Percentage discount cannot exceed 100');
    }
  }

  if (body.status !== undefined && !COUPON_STATUSES.includes(body.status)) {
    errors.push(`Status must be one of: ${COUPON_STATUSES.join(', ')}`);
  }

  if (body.usageLimit !== undefined && body.usageLimit !== null) {
    const limit = Number(body.usageLimit);
    if (!Number.isInteger(limit) || limit < 1) {
      errors.push('Usage limit must be a whole number of at least 1');
    }
  }

  if (body.minOrderAmount !== undefined && Number(body.minOrderAmount) < 0) {
    errors.push('Minimum order amount cannot be negative');
  }

  return errors;
}

export async function createCoupon(req, res) {
  try {
    const body = req.body || {};

    const errors = validateCouponPayload(body);
    if (errors.length > 0) {
      return errorResponse(res, errors.join('. '), 400);
    }

    const code = String(body.code).toUpperCase().trim();

    const existing = await executeQuery('SELECT id FROM coupons WHERE code = ?', [code]);
    if (existing.length > 0) {
      return errorResponse(res, `Coupon "${code}" already exists`, 409);
    }

    const result = await executeQuery(
      `INSERT INTO coupons
        (code, description, discount_type, discount_value, min_order_amount, max_discount,
         usage_limit, starts_at, expires_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        code,
        body.description || null,
        body.discountType,
        Number(body.discountValue),
        Number(body.minOrderAmount || 0),
        body.maxDiscount === undefined || body.maxDiscount === null || body.maxDiscount === ''
          ? null
          : Number(body.maxDiscount),
        body.usageLimit === undefined || body.usageLimit === null || body.usageLimit === ''
          ? null
          : Number(body.usageLimit),
        toNullableDate(body.startsAt),
        toNullableDate(body.expiresAt),
        body.status || 'active',
      ]
    );

    await recordAudit({
      req,
      action: 'coupon.created',
      entityType: 'coupon',
      entityId: result.insertId,
      details: { code, discountType: body.discountType, value: Number(body.discountValue) },
    });

    const created = await executeQuery('SELECT * FROM coupons WHERE id = ?', [result.insertId]);

    return successResponse(res, 'Coupon created successfully', { coupon: created[0] }, 201);
  } catch (error) {
    console.error('CreateCoupon Error:', error);
    return errorResponse(res, 'Failed to create coupon', 500);
  }
}

export async function updateCoupon(req, res) {
  try {
    const couponId = parseInt(req.params.id, 10);
    if (Number.isNaN(couponId)) {
      return errorResponse(res, 'Invalid coupon ID', 400);
    }

    const body = req.body || {};

    const existing = await executeQuery('SELECT * FROM coupons WHERE id = ?', [couponId]);
    if (existing.length === 0) {
      return errorResponse(res, 'Coupon not found', 404);
    }

    // Validate against the merged record so partial updates stay consistent.
    const merged = {
      code: body.code !== undefined ? body.code : existing[0].code,
      discountType: body.discountType !== undefined ? body.discountType : existing[0].discount_type,
      discountValue:
        body.discountValue !== undefined ? body.discountValue : existing[0].discount_value,
      status: body.status !== undefined ? body.status : existing[0].status,
      usageLimit: body.usageLimit !== undefined ? body.usageLimit : existing[0].usage_limit,
      minOrderAmount:
        body.minOrderAmount !== undefined ? body.minOrderAmount : existing[0].min_order_amount,
    };

    const errors = validateCouponPayload(merged);
    if (errors.length > 0) {
      return errorResponse(res, errors.join('. '), 400);
    }

    const code = String(merged.code).toUpperCase().trim();

    const clash = await executeQuery('SELECT id FROM coupons WHERE code = ? AND id <> ?', [
      code,
      couponId,
    ]);
    if (clash.length > 0) {
      return errorResponse(res, `Coupon "${code}" already exists`, 409);
    }

    await executeQuery(
      `UPDATE coupons
          SET code = ?, description = ?, discount_type = ?, discount_value = ?,
              min_order_amount = ?, max_discount = ?, usage_limit = ?,
              starts_at = ?, expires_at = ?, status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [
        code,
        body.description !== undefined ? body.description : existing[0].description,
        merged.discountType,
        Number(merged.discountValue),
        Number(merged.minOrderAmount || 0),
        body.maxDiscount !== undefined
          ? body.maxDiscount === null || body.maxDiscount === ''
            ? null
            : Number(body.maxDiscount)
          : existing[0].max_discount,
        merged.usageLimit === null || merged.usageLimit === '' ? null : Number(merged.usageLimit),
        body.startsAt !== undefined ? toNullableDate(body.startsAt) : existing[0].starts_at,
        body.expiresAt !== undefined ? toNullableDate(body.expiresAt) : existing[0].expires_at,
        merged.status,
        couponId,
      ]
    );

    await recordAudit({
      req,
      action: 'coupon.updated',
      entityType: 'coupon',
      entityId: couponId,
      details: { code },
    });

    const updated = await executeQuery('SELECT * FROM coupons WHERE id = ?', [couponId]);

    return successResponse(res, 'Coupon updated successfully', { coupon: updated[0] });
  } catch (error) {
    console.error('UpdateCoupon Error:', error);
    return errorResponse(res, 'Failed to update coupon', 500);
  }
}

export async function deleteCoupon(req, res) {
  try {
    const couponId = parseInt(req.params.id, 10);
    if (Number.isNaN(couponId)) {
      return errorResponse(res, 'Invalid coupon ID', 400);
    }

    const existing = await executeQuery('SELECT id, code FROM coupons WHERE id = ?', [couponId]);
    if (existing.length === 0) {
      return errorResponse(res, 'Coupon not found', 404);
    }

    await executeQuery('DELETE FROM coupons WHERE id = ?', [couponId]);

    await recordAudit({
      req,
      action: 'coupon.deleted',
      entityType: 'coupon',
      entityId: couponId,
      details: { code: existing[0].code },
    });

    return successResponse(res, 'Coupon deleted successfully');
  } catch (error) {
    console.error('DeleteCoupon Error:', error);
    return errorResponse(res, 'Failed to delete coupon', 500);
  }
}

// =====================================================
// OFFERS
// =====================================================

export async function getOffers(req, res) {
  try {
    const offers = await executeQuery('SELECT * FROM offers ORDER BY created_at DESC');
    return successResponse(res, 'Offers retrieved', { offers });
  } catch (error) {
    console.error('GetOffers Error:', error);
    return errorResponse(res, 'Failed to fetch offers', 500);
  }
}

function validateOfferPayload(body, { partial = false } = {}) {
  const errors = [];

  if (!partial || body.title !== undefined) {
    if (!body.title || !String(body.title).trim()) {
      errors.push('Offer title is required');
    }
  }

  if (!partial || body.discountType !== undefined) {
    if (!COUPON_DISCOUNT_TYPES.includes(body.discountType)) {
      errors.push(`Discount type must be one of: ${COUPON_DISCOUNT_TYPES.join(', ')}`);
    }
  }

  if (!partial || body.discountValue !== undefined) {
    const value = Number(body.discountValue);
    if (Number.isNaN(value) || value <= 0) {
      errors.push('Discount value must be a positive number');
    } else if (body.discountType === 'percentage' && value > 100) {
      errors.push('Percentage discount cannot exceed 100');
    }
  }

  if (body.status !== undefined && !COUPON_STATUSES.includes(body.status)) {
    errors.push(`Status must be one of: ${COUPON_STATUSES.join(', ')}`);
  }

  if (body.startsAt && body.endsAt) {
    const start = new Date(body.startsAt).getTime();
    const end = new Date(body.endsAt).getTime();
    if (!Number.isNaN(start) && !Number.isNaN(end) && end <= start) {
      errors.push('End date must be after the start date');
    }
  }

  return errors;
}

export async function createOffer(req, res) {
  try {
    const body = req.body || {};

    const errors = validateOfferPayload(body);
    if (errors.length > 0) {
      return errorResponse(res, errors.join('. '), 400);
    }

    const result = await executeQuery(
      `INSERT INTO offers
        (title, description, banner_image, discount_type, discount_value, starts_at, ends_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(body.title).trim(),
        body.description || null,
        body.bannerImage || null,
        body.discountType,
        Number(body.discountValue),
        toNullableDate(body.startsAt),
        toNullableDate(body.endsAt),
        body.status || 'active',
      ]
    );

    await recordAudit({
      req,
      action: 'offer.created',
      entityType: 'offer',
      entityId: result.insertId,
      details: { title: String(body.title).trim() },
    });

    const created = await executeQuery('SELECT * FROM offers WHERE id = ?', [result.insertId]);

    return successResponse(res, 'Offer created successfully', { offer: created[0] }, 201);
  } catch (error) {
    console.error('CreateOffer Error:', error);
    return errorResponse(res, 'Failed to create offer', 500);
  }
}

export async function updateOffer(req, res) {
  try {
    const offerId = parseInt(req.params.id, 10);
    if (Number.isNaN(offerId)) {
      return errorResponse(res, 'Invalid offer ID', 400);
    }

    const body = req.body || {};

    const existing = await executeQuery('SELECT * FROM offers WHERE id = ?', [offerId]);
    if (existing.length === 0) {
      return errorResponse(res, 'Offer not found', 404);
    }

    const merged = {
      title: body.title !== undefined ? body.title : existing[0].title,
      discountType:
        body.discountType !== undefined ? body.discountType : existing[0].discount_type,
      discountValue:
        body.discountValue !== undefined ? body.discountValue : existing[0].discount_value,
      status: body.status !== undefined ? body.status : existing[0].status,
      startsAt: body.startsAt !== undefined ? body.startsAt : existing[0].starts_at,
      endsAt: body.endsAt !== undefined ? body.endsAt : existing[0].ends_at,
    };

    const errors = validateOfferPayload(merged);
    if (errors.length > 0) {
      return errorResponse(res, errors.join('. '), 400);
    }

    await executeQuery(
      `UPDATE offers
          SET title = ?, description = ?, banner_image = ?, discount_type = ?,
              discount_value = ?, starts_at = ?, ends_at = ?, status = ?,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [
        String(merged.title).trim(),
        body.description !== undefined ? body.description : existing[0].description,
        body.bannerImage !== undefined ? body.bannerImage : existing[0].banner_image,
        merged.discountType,
        Number(merged.discountValue),
        toNullableDate(merged.startsAt),
        toNullableDate(merged.endsAt),
        merged.status,
        offerId,
      ]
    );

    await recordAudit({
      req,
      action: 'offer.updated',
      entityType: 'offer',
      entityId: offerId,
      details: { fields: Object.keys(body) },
    });

    const updated = await executeQuery('SELECT * FROM offers WHERE id = ?', [offerId]);

    return successResponse(res, 'Offer updated successfully', { offer: updated[0] });
  } catch (error) {
    console.error('UpdateOffer Error:', error);
    return errorResponse(res, 'Failed to update offer', 500);
  }
}

export async function deleteOffer(req, res) {
  try {
    const offerId = parseInt(req.params.id, 10);
    if (Number.isNaN(offerId)) {
      return errorResponse(res, 'Invalid offer ID', 400);
    }

    const existing = await executeQuery('SELECT id, title FROM offers WHERE id = ?', [offerId]);
    if (existing.length === 0) {
      return errorResponse(res, 'Offer not found', 404);
    }

    await executeQuery('DELETE FROM offers WHERE id = ?', [offerId]);

    await recordAudit({
      req,
      action: 'offer.deleted',
      entityType: 'offer',
      entityId: offerId,
      details: { title: existing[0].title },
    });

    return successResponse(res, 'Offer deleted successfully');
  } catch (error) {
    console.error('DeleteOffer Error:', error);
    return errorResponse(res, 'Failed to delete offer', 500);
  }
}

// =====================================================
// REVIEWS
// =====================================================

const REVIEW_STATUSES = ['pending', 'approved', 'rejected'];

export async function getReviews(req, res) {
  try {
    const { status, rating, page = 1, limit = 20 } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    if (status && status !== 'all') {
      conditions.push('r.status = ?');
      params.push(status);
    }

    if (rating && rating !== 'all') {
      conditions.push('r.rating = ?');
      params.push(Number(rating));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await executeQuery(
      `SELECT COUNT(*) AS total FROM reviews r ${whereClause}`,
      params
    );
    const total = Number(countResult[0]?.total || 0);

    const reviews = await executeQuery(
      `SELECT r.id, r.product_id, r.user_id, r.rating, r.title, r.comment, r.status, r.created_at,
              p.name AS product_name, p.product_image,
              u.full_name AS customer_name, u.email AS customer_email
         FROM reviews r
         JOIN products p ON p.id = r.product_id
         JOIN users u ON u.id = r.user_id
         ${whereClause}
        ORDER BY r.created_at DESC
        LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    const summaryRows = await executeQuery(
      `SELECT
         COALESCE(AVG(rating), 0) AS avg_rating,
         COUNT(*) AS total_reviews,
         COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pending
       FROM reviews`
    );

    return res.status(200).json({
      success: true,
      reviews,
      summary: {
        averageRating: Number(summaryRows[0]?.avg_rating || 0).toFixed(2),
        totalReviews: Number(summaryRows[0]?.total_reviews || 0),
        pending: Number(summaryRows[0]?.pending || 0),
      },
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('GetReviews Error:', error);
    return errorResponse(res, 'Failed to fetch reviews', 500);
  }
}

export async function moderateReview(req, res) {
  try {
    const reviewId = parseInt(req.params.id, 10);
    if (Number.isNaN(reviewId)) {
      return errorResponse(res, 'Invalid review ID', 400);
    }

    const { status } = req.body || {};

    if (!REVIEW_STATUSES.includes(status)) {
      return errorResponse(res, `Status must be one of: ${REVIEW_STATUSES.join(', ')}`, 400);
    }

    const existing = await executeQuery(
      'SELECT id, product_id, user_id, rating, status FROM reviews WHERE id = ?',
      [reviewId]
    );

    if (existing.length === 0) {
      return errorResponse(res, 'Review not found', 404);
    }

    await executeQuery('UPDATE reviews SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
      status,
      reviewId,
    ]);

    // Keep the denormalized product rating consistent with approved reviews only.
    if (status === 'approved') {
      const agg = await executeQuery(
        `SELECT COALESCE(AVG(rating), 0) AS avg_rating, COUNT(*) AS count
           FROM reviews WHERE product_id = ? AND status = 'approved'`,
        [existing[0].product_id]
      );

      await executeQuery('UPDATE products SET rating = ?, rating_count = ? WHERE id = ?', [
        Number(agg[0]?.avg_rating || 0).toFixed(2),
        Number(agg[0]?.count || 0),
        existing[0].product_id,
      ]);
    } else if (existing[0].status === 'approved') {
      const agg = await executeQuery(
        `SELECT COALESCE(AVG(rating), 0) AS avg_rating, COUNT(*) AS count
           FROM reviews WHERE product_id = ? AND status = 'approved'`,
        [existing[0].product_id]
      );

      await executeQuery('UPDATE products SET rating = ?, rating_count = ? WHERE id = ?', [
        Number(agg[0]?.avg_rating || 0).toFixed(2),
        Number(agg[0]?.count || 0),
        existing[0].product_id,
      ]);
    }

    await recordAudit({
      req,
      action: `review.${status}`,
      entityType: 'review',
      entityId: reviewId,
      details: { from: existing[0].status, to: status, productId: existing[0].product_id },
    });

    const updated = await executeQuery('SELECT * FROM reviews WHERE id = ?', [reviewId]);

    return successResponse(res, `Review ${status}`, { review: updated[0] });
  } catch (error) {
    console.error('ModerateReview Error:', error);
    return errorResponse(res, 'Failed to moderate review', 500);
  }
}

export async function deleteReview(req, res) {
  try {
    const reviewId = parseInt(req.params.id, 10);
    if (Number.isNaN(reviewId)) {
      return errorResponse(res, 'Invalid review ID', 400);
    }

    const existing = await executeQuery(
      'SELECT id, product_id, user_id, status FROM reviews WHERE id = ?',
      [reviewId]
    );

    if (existing.length === 0) {
      return errorResponse(res, 'Review not found', 404);
    }

    await executeQuery('DELETE FROM reviews WHERE id = ?', [reviewId]);

    const agg = await executeQuery(
      `SELECT COALESCE(AVG(rating), 0) AS avg_rating, COUNT(*) AS count
         FROM reviews WHERE product_id = ? AND status = 'approved'`,
      [existing[0].product_id]
    );

    await executeQuery('UPDATE products SET rating = ?, rating_count = ? WHERE id = ?', [
      Number(agg[0]?.avg_rating || 0).toFixed(2),
      Number(agg[0]?.count || 0),
      existing[0].product_id,
    ]);

    await recordAudit({
      req,
      action: 'review.deleted',
      entityType: 'review',
      entityId: reviewId,
      details: { productId: existing[0].product_id },
    });

    return successResponse(res, 'Review deleted successfully');
  } catch (error) {
    console.error('DeleteReview Error:', error);
    return errorResponse(res, 'Failed to delete review', 500);
  }
}

// =====================================================
// RETURNS / REFUNDS  (admin view side)
// =====================================================

const RETURN_STATUSES = ['requested', 'approved', 'rejected', 'refunded'];

export async function getReturnRequests(req, res) {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    if (status && status !== 'all') {
      conditions.push('r.status = ?');
      params.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await executeQuery(
      `SELECT COUNT(*) AS total FROM returns r ${whereClause}`,
      params
    );
    const total = Number(countResult[0]?.total || 0);

    const requests = await executeQuery(
      `SELECT r.id, r.order_id, r.user_id, r.reason, r.status, r.refund_amount,
              r.admin_note, r.requested_at, r.resolved_at,
              o.order_number, o.total_amount, o.order_status,
              u.full_name AS customer_name, u.email AS customer_email
         FROM returns r
         JOIN orders o ON o.id = r.order_id
         JOIN users u ON u.id = r.user_id
         ${whereClause}
        ORDER BY r.requested_at DESC
        LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    return res.status(200).json({
      success: true,
      returns: requests,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('GetReturnRequests Error:', error);
    return errorResponse(res, 'Failed to fetch return requests', 500);
  }
}

export async function resolveReturnRequest(req, res) {
  try {
    const returnId = parseInt(req.params.id, 10);
    if (Number.isNaN(returnId)) {
      return errorResponse(res, 'Invalid return ID', 400);
    }

    const { status, adminNote, refundAmount } = req.body || {};

    if (!RETURN_STATUSES.includes(status)) {
      return errorResponse(res, `Status must be one of: ${RETURN_STATUSES.join(', ')}`, 400);
    }

    const existing = await executeQuery(
      'SELECT id, order_id, user_id, status FROM returns WHERE id = ?',
      [returnId]
    );

    if (existing.length === 0) {
      return errorResponse(res, 'Return request not found', 404);
    }

    let resolvedRefund = null;
    if (status === 'refunded') {
      if (refundAmount === undefined || refundAmount === null || refundAmount === '') {
        return errorResponse(res, 'A refund amount is required to mark a return as refunded', 400);
      }

      const amount = Number(refundAmount);
      if (Number.isNaN(amount) || amount < 0) {
        return errorResponse(res, 'Refund amount must be a non-negative number', 400);
      }
      resolvedRefund = amount;
    }

    await executeQuery(
      `UPDATE returns
          SET status = ?,
              admin_note = ?,
              refund_amount = COALESCE(?, refund_amount),
              resolved_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [status, adminNote || null, resolvedRefund, returnId]
    );

    // Reflect the refund on the order so payment history stays truthful.
    if (status === 'refunded') {
      await executeQuery(
        "UPDATE orders SET payment_status = 'refunded', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [existing[0].order_id]
      );
    }

    await recordAudit({
      req,
      action: `return.${status}`,
      entityType: 'return',
      entityId: returnId,
      details: { orderId: existing[0].order_id, from: existing[0].status, to: status },
    });

    const updated = await executeQuery('SELECT * FROM returns WHERE id = ?', [returnId]);

    return successResponse(res, `Return request ${status}`, { return: updated[0] });
  } catch (error) {
    console.error('ResolveReturnRequest Error:', error);
    return errorResponse(res, 'Failed to update return request', 500);
  }
}
