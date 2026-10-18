import { executeQuery } from '../config/db.js';
import { successResponse, errorResponse } from '../utils/responseHelper.js';

/**
 * Normalizes an optional JSON column (specifications / images / variants).
 *
 * Accepts an already-encoded string as-is, serializes objects/arrays, and maps
 * undefined/empty values to null so a partial update can leave the column
 * untouched via COALESCE. Keeps both DB engines storing plain TEXT.
 */
function serializeJsonColumn(value) {
  if (value === undefined) return null;
  if (value === null || value === '') return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

export async function getProducts(req, res) {
  try {
    const {
      search,
      category,
      brand,
      minPrice,
      maxPrice,
      rating,
      inStock,
      sort = 'newest',
      page = 1,
      limit = 12,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 12));
    const offset = (pageNum - 1) * limitNum;

    const conditions = ["status = 'active'"];
    const params = [];

    // Search by product name, brand, or category
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push('(name LIKE ? OR brand LIKE ? OR category_name LIKE ? OR description LIKE ?)');
      params.push(term, term, term, term);
    }

    // Category filter
    if (category && category !== 'all') {
      conditions.push('category_name = ?');
      params.push(category);
    }

    // Brand filter
    if (brand && brand !== 'all') {
      conditions.push('brand = ?');
      params.push(brand);
    }

    // Price range filters
    if (minPrice && !isNaN(Number(minPrice))) {
      conditions.push('price >= ?');
      params.push(Number(minPrice));
    }
    if (maxPrice && !isNaN(Number(maxPrice))) {
      conditions.push('price <= ?');
      params.push(Number(maxPrice));
    }

    // Rating filter
    if (rating && !isNaN(Number(rating))) {
      conditions.push('rating >= ?');
      params.push(Number(rating));
    }

    // Availability / stock
    if (inStock === 'true' || inStock === '1') {
      conditions.push('stock > 0');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Sort order
    let orderBy = 'ORDER BY created_at DESC';
    if (sort === 'price-low') orderBy = 'ORDER BY price ASC';
    else if (sort === 'price-high') orderBy = 'ORDER BY price DESC';
    else if (sort === 'rating') orderBy = 'ORDER BY rating DESC';
    else if (sort === 'popular') orderBy = 'ORDER BY rating_count DESC';

    // Total count query
    const countSql = `SELECT COUNT(*) as total FROM products ${whereClause}`;
    const countResult = await executeQuery(countSql, params);
    const total = countResult[0]?.total || 0;
    const totalPages = Math.ceil(total / limitNum);

    // Data query with SQL pagination
    const dataSql = `SELECT * FROM products ${whereClause} ${orderBy} LIMIT ? OFFSET ?`;
    const products = await executeQuery(dataSql, [...params, limitNum, offset]);

    return res.status(200).json({
      success: true,
      products,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error('GetProducts Error:', error);
    return errorResponse(res, 'Failed to retrieve products', 500);
  }
}

export async function getProductById(req, res) {
  try {
    const { id } = req.params;
    const products = await executeQuery('SELECT * FROM products WHERE id = ?', [id]);

    if (products.length === 0) {
      return errorResponse(res, 'Product not found', 404);
    }

    return successResponse(res, 'Product details retrieved', {
      product: products[0],
    });
  } catch (error) {
    console.error('GetProductById Error:', error);
    return errorResponse(res, 'Failed to fetch product details', 500);
  }
}

export async function createProduct(req, res) {
  try {
    const {
      name,
      description,
      category_id,
      category_name,
      brand,
      price,
      discount_price,
      stock,
      product_image,
      rating = 5.0,
      status = 'active',
      specifications,
      images,
      variants,
    } = req.body;

    if (!name || !price || !category_name || !brand) {
      return errorResponse(res, 'Product name, category, brand, and price are required', 400);
    }

    const result = await executeQuery(
      `INSERT INTO products (name, description, category_id, category_name, brand, price, discount_price, stock, product_image, rating, status, specifications, images, variants)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        description || '',
        category_id || null,
        category_name,
        brand,
        Number(price),
        discount_price ? Number(discount_price) : null,
        parseInt(stock, 10) || 0,
        product_image || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80',
        Number(rating) || 5.0,
        status,
        serializeJsonColumn(specifications),
        serializeJsonColumn(images),
        serializeJsonColumn(variants),
      ]
    );

    const newProduct = (await executeQuery('SELECT * FROM products WHERE id = ?', [result.insertId]))[0];
    return successResponse(res, 'Product created successfully', { product: newProduct }, 201);
  } catch (error) {
    console.error('CreateProduct Error:', error);
    return errorResponse(res, 'Failed to create product', 500);
  }
}

export async function updateProduct(req, res) {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      category_id,
      category_name,
      brand,
      price,
      discount_price,
      stock,
      product_image,
      rating,
      status,
      specifications,
      images,
      variants,
    } = req.body;

    const existing = await executeQuery('SELECT * FROM products WHERE id = ?', [id]);
    if (existing.length === 0) {
      return errorResponse(res, 'Product not found', 404);
    }

    await executeQuery(
      `UPDATE products SET
         name = COALESCE(?, name),
         description = COALESCE(?, description),
         category_id = COALESCE(?, category_id),
         category_name = COALESCE(?, category_name),
         brand = COALESCE(?, brand),
         price = COALESCE(?, price),
         discount_price = CASE WHEN ? THEN ? ELSE discount_price END,
         stock = COALESCE(?, stock),
         product_image = COALESCE(?, product_image),
         rating = COALESCE(?, rating),
         status = COALESCE(?, status),
         specifications = COALESCE(?, specifications),
         images = COALESCE(?, images),
         variants = COALESCE(?, variants)
       WHERE id = ?`,
      [
        name,
        description,
        category_id,
        category_name,
        brand,
        price !== undefined ? Number(price) : null,
        // discount_price cannot use COALESCE: a discount must be CLEARABLE
        // (explicit null) without a partial update silently wiping it.
        // CASE: only touch the column when the client actually sent the field.
        discount_price !== undefined ? 1 : 0,
        discount_price !== undefined && discount_price !== null
          ? Number(discount_price)
          : null,
        stock !== undefined ? parseInt(stock, 10) : null,
        product_image,
        rating !== undefined ? Number(rating) : null,
        status,
        serializeJsonColumn(specifications),
        serializeJsonColumn(images),
        serializeJsonColumn(variants),
        id,
      ]
    );

    const updated = (await executeQuery('SELECT * FROM products WHERE id = ?', [id]))[0];
    return successResponse(res, 'Product updated successfully', { product: updated });
  } catch (error) {
    console.error('UpdateProduct Error:', error);
    return errorResponse(res, 'Failed to update product', 500);
  }
}

export async function deleteProduct(req, res) {
  try {
    const { id } = req.params;
    const existing = await executeQuery('SELECT * FROM products WHERE id = ?', [id]);
    if (existing.length === 0) {
      return errorResponse(res, 'Product not found', 404);
    }

    await executeQuery('DELETE FROM products WHERE id = ?', [id]);
    return successResponse(res, 'Product deleted successfully', { id });
  } catch (error) {
    console.error('DeleteProduct Error:', error);
    return errorResponse(res, 'Failed to delete product', 500);
  }
}

export async function getCategories(req, res) {
  try {
    const categories = await executeQuery('SELECT * FROM categories ORDER BY name ASC');
    return successResponse(res, 'Categories retrieved', { categories });
  } catch (error) {
    console.error('GetCategories Error:', error);
    return errorResponse(res, 'Failed to retrieve categories', 500);
  }
}

/**
 * GET /api/products/brands
 *
 * Distinct, live brands for the storefront's brand filter. Sourced from the
 * catalog itself so the list can never drift from the products on sale (the
 * frontend previously kept a hardcoded copy).
 */
export async function getBrands(req, res) {
  try {
    const rows = await executeQuery(
      `SELECT DISTINCT brand
         FROM products
        WHERE status = 'active'
          AND brand IS NOT NULL
          AND brand <> ''
        ORDER BY brand ASC`
    );

    const brands = rows.map((row) => row.brand);
    return successResponse(res, 'Brands retrieved', { brands });
  } catch (error) {
    console.error('GetBrands Error:', error);
    return errorResponse(res, 'Failed to retrieve brands', 500);
  }
}
