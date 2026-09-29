import bcrypt from 'bcryptjs';

import {
  executeQuery,
  isSqlite,
} from '../config/db.js';

import {
  successResponse,
  errorResponse,
} from '../utils/responseHelper.js';

import {
  normalizeRole,
  isAdminRole,
  isSuperAdminRole,
  ROLE_ADMIN,
  ROLE_SUPER_ADMIN,
  ASSIGNABLE_ROLES,
} from '../utils/roleHelper.js';

import { recordAudit } from '../utils/auditLog.js';


// =====================================================
// GET DASHBOARD STATS
// =====================================================

export async function getDashboardStats(req, res) {
  try {
    const totalUsersResult = await executeQuery(
      'SELECT COUNT(*) as count FROM users'
    );

    const totalProductsResult = await executeQuery(
      'SELECT COUNT(*) as count FROM products'
    );

    const totalOrdersResult = await executeQuery(
      'SELECT COUNT(*) as count FROM orders'
    );

    const totalRevenueResult = await executeQuery(
      "SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE payment_status = 'paid'"
    );

    const activeMembershipsResult = await executeQuery(
      "SELECT COUNT(*) as count FROM subscriptions WHERE status = 'active' AND expiry_time > CURRENT_TIMESTAMP"
    );

    const expiredMembershipsResult = await executeQuery(
      "SELECT COUNT(*) as count FROM subscriptions WHERE status = 'expired' OR expiry_time <= CURRENT_TIMESTAMP"
    );

    // Recent orders
    const recentOrders = await executeQuery(
      `SELECT
        o.*,
        u.full_name as customer_name,
        u.email as customer_email
       FROM orders o
       JOIN users u ON u.id = o.user_id
       ORDER BY o.created_at DESC
       LIMIT 6`
    );

    // Category distribution
    const categoryStats = await executeQuery(
      `SELECT
        category_name,
        COUNT(*) as product_count,
        AVG(price) as avg_price
       FROM products
       GROUP BY category_name`
    );

    return successResponse(
      res,
      'Admin dashboard statistics',
      {
        stats: {
          totalUsers:
            Number(totalUsersResult[0]?.count || 0),

          totalProducts:
            Number(totalProductsResult[0]?.count || 0),

          totalOrders:
            Number(totalOrdersResult[0]?.count || 0),

          totalRevenue:
            Number(totalRevenueResult[0]?.total || 0),

          activeMemberships:
            Number(activeMembershipsResult[0]?.count || 0),

          expiredMemberships:
            Number(expiredMembershipsResult[0]?.count || 0),
        },

        recentOrders,
        categoryStats,
      }
    );
  } catch (error) {
    console.error(
      'GetDashboardStats Error:',
      error
    );

    return errorResponse(
      res,
      'Failed to fetch dashboard statistics',
      500
    );
  }
}


// =====================================================
// GET USERS
// =====================================================

export async function getUsers(req, res) {
  try {
    const {
      search,
      role,
      status,
      emailVerified,
      membership,
      page = 1,
      limit = 10,
    } = req.query;

    const pageNum = Math.max(
      1,
      parseInt(page, 10) || 1
    );

    const limitNum = Math.max(
      1,
      Math.min(
        100,
        parseInt(limit, 10) || 10
      )
    );

    const offset =
      (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    // Search by name, email, phone
    if (search && search.trim()) {
      const term =
        `%${search.trim()}%`;

      conditions.push(
        `(u.full_name LIKE ?
          OR u.email LIKE ?
          OR u.phone LIKE ?)`
      );

      params.push(
        term,
        term,
        term
      );
    }

    // Role filter
    if (
      role &&
      role !== 'all'
    ) {
      conditions.push(
        'u.role = ?'
      );

      params.push(role);
    }

    // Status filter
    if (
      status &&
      status !== 'all'
    ) {
      conditions.push(
        'u.status = ?'
      );

      params.push(status);
    }

    // Email verification filter
    if (
      emailVerified !== undefined &&
      emailVerified !== 'all'
    ) {
      conditions.push(
        'u.email_verified = ?'
      );

      params.push(
        emailVerified === 'true' ||
        emailVerified === '1'
          ? 1
          : 0
      );
    }

    // Membership filter
    if (
      membership &&
      membership !== 'all'
    ) {
      if (membership === 'none') {
        conditions.push(
          `(s.id IS NULL
            OR s.status != "active"
            OR s.expiry_time <= CURRENT_TIMESTAMP)`
        );
      } else {
        conditions.push(
          `p.slug = ?
           AND s.status = 'active'
           AND s.expiry_time > CURRENT_TIMESTAMP`
        );

        params.push(membership);
      }
    }

    const whereClause =
      conditions.length > 0
        ? `WHERE ${conditions.join(' AND ')}`
        : '';

    // Count
    const countSql = `
      SELECT COUNT(DISTINCT u.id) as total
      FROM users u
      LEFT JOIN subscriptions s
        ON s.user_id = u.id
        AND s.status = 'active'
      LEFT JOIN plans p
        ON p.id = s.plan_id
      ${whereClause}
    `;

    const countResult =
      await executeQuery(
        countSql,
        params
      );

    const total =
      Number(
        countResult[0]?.total || 0
      );

    const totalPages =
      Math.ceil(
        total / limitNum
      );

    // Users list
    const dataSql = `
      SELECT
        u.id,
        u.full_name as name,
        u.email,
        u.phone,
        u.role,
        u.status,
        u.email_verified,
        u.avatar_url,
        u.created_at,

        p.name as membership_plan,
        s.expiry_time as membership_expiry,
        s.status as membership_status,

        (
          SELECT COUNT(*)
          FROM orders
          WHERE user_id = u.id
        ) as order_count

      FROM users u

      LEFT JOIN subscriptions s
        ON s.user_id = u.id
        AND s.status = 'active'

      LEFT JOIN plans p
        ON p.id = s.plan_id

      ${whereClause}

      GROUP BY
        u.id,
        u.full_name,
        u.email,
        u.phone,
        u.role,
        u.status,
        u.email_verified,
        u.avatar_url,
        u.created_at,
        p.name,
        s.expiry_time,
        s.status

      ORDER BY u.created_at DESC

      LIMIT ? OFFSET ?
    `;

    const users =
      await executeQuery(
        dataSql,
        [
          ...params,
          limitNum,
          offset,
        ]
      );

    return res.status(200).json({
      success: true,

      users,

      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error(
      'Admin GetUsers Error:',
      error
    );

    return errorResponse(
      res,
      'Failed to fetch users',
      500
    );
  }
}


// =====================================================
// CREATE ADMIN
// ONLY SUPER ADMIN CAN CALL THIS ROUTE
// =====================================================

export async function createAdmin(req, res) {
  try {
    const {
      fullName,
      email,
      password,
      phone,
    } = req.body;

    // Required fields
    if (
      !fullName ||
      !email ||
      !password
    ) {
      return errorResponse(
        res,
        'Full name, email and password are required',
        400
      );
    }

    // Password validation
    if (password.length < 6) {
      return errorResponse(
        res,
        'Password must be at least 6 characters long',
        400
      );
    }

    const normalizedEmail =
      email
        .toLowerCase()
        .trim();

    // Check existing user
    const existingUser =
      await executeQuery(
        `SELECT id
         FROM users
         WHERE email = ?`,
        [normalizedEmail]
      );

    if (
      existingUser &&
      existingUser.length > 0
    ) {
      return errorResponse(
        res,
        'An account with this email address already exists',
        409
      );
    }

    // Hash password
    const salt =
      await bcrypt.genSalt(10);

    const passwordHash =
      await bcrypt.hash(
        password,
        salt
      );

    /*
      IMPORTANT:
      Never accept role from req.body.

      This endpoint ALWAYS creates:
      role = admin
    */

    const result =
      await executeQuery(
        `INSERT INTO users
        (
          full_name,
          email,
          password_hash,
          phone,
          role,
          email_verified,
          status
        )
        VALUES
        (?, ?, ?, ?, ?, 1, 'active')`,
        [
          fullName.trim(),
          normalizedEmail,
          passwordHash,
          phone
            ? phone.trim()
            : null,
          ROLE_ADMIN,
        ]
      );

    await recordAudit({
      req,
      action: 'admin.created',
      entityType: 'user',
      entityId: result.insertId,
      details: { email: normalizedEmail, role: ROLE_ADMIN },
    });

    return successResponse(
      res,
      'Admin created successfully',
      {
        user: {
          id: result.insertId,

          fullName:
            fullName.trim(),

          email:
            normalizedEmail,

          phone:
            phone
              ? phone.trim()
              : null,

          role: ROLE_ADMIN,

          status: 'active',
        },
      }
    );
  } catch (error) {
    console.error(
      'CreateAdmin Error:',
      error
    );

    return errorResponse(
      res,
      'Failed to create admin',
      500
    );
  }
}


// =====================================================
// UPDATE USER STATUS
// ROLE CANNOT BE CHANGED HERE - use updateUserRole
// (PATCH /api/admin/users/:id/role, Super Admin only).
// =====================================================

export async function updateUserStatus(
  req,
  res
) {
  try {
    const { id } =
      req.params;

    const { status } =
      req.body;

    // A role change MUST NOT be smuggled in through this endpoint.
    if (
      req.body &&
      Object.prototype.hasOwnProperty.call(
        req.body,
        'role'
      )
    ) {
      return errorResponse(
        res,
        'Role cannot be changed through this endpoint. Use PATCH /api/admin/users/:id/role (Super Admin only).',
        400
      );
    }

    const targetUserId =
      parseInt(id, 10);

    if (
      Number.isNaN(
        targetUserId
      )
    ) {
      return errorResponse(
        res,
        'Invalid user ID',
        400
      );
    }

    const validStatuses = [
      'active',
      'inactive',
      'blocked',
    ];

    if (
      status &&
      !validStatuses.includes(status)
    ) {
      return errorResponse(
        res,
        'Invalid user status',
        400
      );
    }

    // Find target user
    const users =
      await executeQuery(
        `SELECT
          id,
          role,
          status
         FROM users
         WHERE id = ?`,
        [targetUserId]
      );

    if (
      !users ||
      users.length === 0
    ) {
      return errorResponse(
        res,
        'User not found',
        404
      );
    }

    const targetUser =
      users[0];

    const targetRole =
      normalizeRole(targetUser.role);

    const actorRole =
      normalizeRole(req.user.role);

    console.log(
      '[AdminAPI] updateUserStatus',
      {
        actorId: req.user.id,
        actorRole,
        targetUserId,
        targetRole,
        status: status || null,
      }
    );

    // Prevent self deactivation
    if (
      targetUserId === req.user.id &&
      status &&
      status !== 'active'
    ) {
      return errorResponse(
        res,
        'You cannot deactivate or block your own account',
        400
      );
    }

    // Normal Admin cannot manage Admin/Super Admin accounts.
    // Uses the SAME normalization as the middleware so a role stored as
    // 'Admin' or 'Super_Admin' cannot slip past this guard.
    if (
      isAdminRole(targetRole) &&
      !isSuperAdminRole(actorRole)
    ) {
      return errorResponse(
        res,
        'Only Super Admin can manage admin accounts',
        403
      );
    }

    // Last Super Admin protection
    if (
      targetRole === ROLE_SUPER_ADMIN &&
      status &&
      status !== 'active'
    ) {
      const activeSuperAdmins =
        await executeQuery(
          `SELECT COUNT(*) AS count
           FROM users
           WHERE LOWER(TRIM(role)) = ?
           AND status = 'active'`,
          [ROLE_SUPER_ADMIN]
        );

      const count =
        Number(
          activeSuperAdmins[0]?.count || 0
        );

      if (count <= 1) {
        return errorResponse(
          res,
          'The last active Super Admin cannot be deactivated or blocked',
          400
        );
      }
    }

    // Update ONLY status
    await executeQuery(
      `UPDATE users
       SET
         status = COALESCE(?, status),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        status || null,
        targetUserId,
      ]
    );

    const updatedUserResult =
      await executeQuery(
        `SELECT
          id,
          full_name as name,
          email,
          phone,
          role,
          status,
          email_verified,
          avatar_url,
          created_at
         FROM users
         WHERE id = ?`,
        [targetUserId]
      );

    const updatedUser =
      updatedUserResult[0];

    await recordAudit({
      req,
      action: 'user.status_updated',
      entityType: 'user',
      entityId: targetUserId,
      details: {
        targetEmail: targetUser.email,
        targetRole,
        from: targetUser.status,
        to: status || targetUser.status,
      },
    });

    return successResponse(
      res,
      'User status updated successfully',
      {
        user: updatedUser,
      }
    );
  } catch (error) {
    console.error(
      'UpdateUserStatus Error:',
      error
    );

    return errorResponse(
      res,
      'Failed to update user',
      500
    );
  }
}


// =====================================================
// UPDATE USER ROLE
// SUPER ADMIN ONLY (enforced by authorizeSuperAdmin on the route).
//
// Rules:
// - role is NEVER taken from an unvalidated string
// - only 'customer' and 'admin' are assignable
// - 'super_admin' can never be granted or revoked through the API
// - a Super Admin cannot demote themselves
// - the last active Super Admin is protected
// =====================================================

export async function updateUserRole(
  req,
  res
) {
  try {
    const { id } = req.params;

    const { role } = req.body || {};

    const targetUserId =
      parseInt(id, 10);

    if (
      Number.isNaN(targetUserId)
    ) {
      return errorResponse(
        res,
        'Invalid user ID',
        400
      );
    }

    const nextRole =
      normalizeRole(role);

    if (
      !ASSIGNABLE_ROLES.includes(
        nextRole
      )
    ) {
      return errorResponse(
        res,
        `Invalid role. Allowed values: ${ASSIGNABLE_ROLES.join(', ')}`,
        400
      );
    }

    const users =
      await executeQuery(
        `SELECT id, role, status
         FROM users
         WHERE id = ?`,
        [targetUserId]
      );

    if (
      !users ||
      users.length === 0
    ) {
      return errorResponse(
        res,
        'User not found',
        404
      );
    }

    const targetUser = users[0];

    const targetRole =
      normalizeRole(targetUser.role);

    const actorRole =
      normalizeRole(
        req.user.role
      );

    console.log(
      '[AdminAPI] updateUserRole',
      {
        actorId: req.user.id,
        actorRole,
        targetUserId,
        targetRole,
        nextRole,
      }
    );

    // authorizeSuperAdmin already guarantees this, but never rely on a
    // single layer for a privilege escalation guard.
    if (
      !isSuperAdminRole(actorRole)
    ) {
      return errorResponse(
        res,
        'Access forbidden. Super Administrator privileges required.',
        403
      );
    }

    // super_admin is not assignable through the API.
    if (
      targetRole === ROLE_SUPER_ADMIN
    ) {
      return errorResponse(
        res,
        'The super_admin role cannot be modified through this endpoint',
        400
      );
    }

    // A Super Admin cannot remove their own privileges and
    // lock themselves out of the portal.
    if (
      targetUserId === req.user.id &&
      nextRole !== ROLE_ADMIN
    ) {
      return errorResponse(
        res,
        'You cannot remove your own Super Admin privileges',
        400
      );
    }

    await executeQuery(
      `UPDATE users
       SET role = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [nextRole, targetUserId]
    );

    await recordAudit({
      req,
      action: 'user.role_updated',
      entityType: 'user',
      entityId: targetUserId,
      details: { from: targetRole, to: nextRole },
    });

    const updatedUserResult =
      await executeQuery(
        `SELECT
          id,
          full_name as name,
          email,
          phone,
          role,
          status,
          email_verified,
          avatar_url,
          created_at
         FROM users
         WHERE id = ?`,
        [targetUserId]
      );

    return successResponse(
      res,
      `Role updated to ${nextRole}`,
      {
        user: updatedUserResult[0],
      }
    );
  } catch (error) {
    console.error(
      'UpdateUserRole Error:',
      error
    );

    return errorResponse(
      res,
      'Failed to update user role',
      500
    );
  }
}


// =====================================================
// GET USER DETAILS
// =====================================================

export async function getUserDetails(
  req,
  res
) {
  try {
    const { id } =
      req.params;

    const users =
      await executeQuery(
        `SELECT
           id,
           full_name,
           email,
           phone,
           role,
           status,
           email_verified,
           avatar_url,
           active_plan_id,
           created_at,
           updated_at
         FROM users
         WHERE id = ?`,
        [id]
      );

    if (
      users.length === 0
    ) {
      return errorResponse(
        res,
        'User not found',
        404
      );
    }

    const user =
      users[0];

    const orders =
      await executeQuery(
        `SELECT *
         FROM orders
         WHERE user_id = ?
         ORDER BY created_at DESC`,
        [id]
      );

    const subscriptions =
      await executeQuery(
        `SELECT
          s.*,
          p.name as plan_name
         FROM subscriptions s
         JOIN plans p
           ON p.id = s.plan_id
         WHERE s.user_id = ?
         ORDER BY s.created_at DESC`,
        [id]
      );

    const addresses =
      await executeQuery(
        `SELECT *
         FROM addresses
         WHERE user_id = ?`,
        [id]
      );

    return successResponse(
      res,
      'User details retrieved',
      {
        user,
        orders,
        subscriptions,
        addresses,
      }
    );
  } catch (error) {
    console.error(
      'GetUserDetails Error:',
      error
    );

    return errorResponse(
      res,
      'Failed to fetch user details',
      500
    );
  }
}


// =====================================================
// GET ADMIN ORDERS
// =====================================================

export async function getAdminOrders(
  req,
  res
) {
  try {
    const {
      search,
      status,
      paymentStatus,
      page = 1,
      limit = 10,
    } = req.query;

    const pageNum =
      Math.max(
        1,
        parseInt(page, 10) || 1
      );

    const limitNum =
      Math.max(
        1,
        Math.min(
          100,
          parseInt(limit, 10) || 10
        )
      );

    const offset =
      (pageNum - 1) *
      limitNum;

    const conditions = [];
    const params = [];

    // Search
    if (
      search &&
      search.trim()
    ) {
      const term =
        `%${search.trim()}%`;

      const idCast =
        isSqlite
          ? 'CAST(o.id AS TEXT)'
          : 'CAST(o.id AS CHAR)';

      conditions.push(
        `(u.full_name LIKE ?
          OR u.email LIKE ?
          OR ${idCast} LIKE ?)`
      );

      params.push(
        term,
        term,
        term
      );
    }

    // Order status
    if (
      status &&
      status !== 'all'
    ) {
      conditions.push(
        'o.order_status = ?'
      );

      params.push(status);
    }

    // Payment status
    if (
      paymentStatus &&
      paymentStatus !== 'all'
    ) {
      conditions.push(
        'o.payment_status = ?'
      );

      params.push(
        paymentStatus
      );
    }

    const whereClause =
      conditions.length > 0
        ? `WHERE ${conditions.join(' AND ')}`
        : '';

    // Count
    const countSql = `
      SELECT COUNT(*) as total
      FROM orders o
      JOIN users u
        ON u.id = o.user_id
      ${whereClause}
    `;

    const countResult =
      await executeQuery(
        countSql,
        params
      );

    const total =
      Number(
        countResult[0]?.total || 0
      );

    const totalPages =
      Math.ceil(
        total / limitNum
      );

    // Orders
    const ordersSql = `
      SELECT
        o.*,
        u.full_name as customer_name,
        u.email as customer_email,

        (
          SELECT COUNT(*)
          FROM order_items
          WHERE order_id = o.id
        ) as item_count

      FROM orders o

      JOIN users u
        ON u.id = o.user_id

      ${whereClause}

      ORDER BY o.created_at DESC

      LIMIT ? OFFSET ?
    `;

    const orders =
      await executeQuery(
        ordersSql,
        [
          ...params,
          limitNum,
          offset,
        ]
      );

    return res.status(200).json({
      success: true,

      orders,

      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error(
      'GetAdminOrders Error:',
      error
    );

    return errorResponse(
      res,
      'Failed to fetch admin orders',
      500
    );
  }
}


// =====================================================
// UPDATE ORDER STATUS
// =====================================================

export async function updateOrderStatus(
  req,
  res
) {
  try {
    const { id } =
      req.params;

    const {
      orderStatus,
      paymentStatus,
    } = req.body;

    const validOrderStatuses = [
      'pending',
      'confirmed',
      'processing',
      'shipped',
      'delivered',
      'cancelled',
    ];

    if (
      orderStatus &&
      !validOrderStatuses.includes(
        orderStatus
      )
    ) {
      return errorResponse(
        res,
        'Invalid order status',
        400
      );
    }

    const before =
      (
        await executeQuery(
          `SELECT order_status, payment_status
           FROM orders
           WHERE id = ?`,
          [id]
        )
      )[0];

    await executeQuery(
      `UPDATE orders
       SET
         order_status =
           COALESCE(
             ?,
             order_status
           ),

         payment_status =
           COALESCE(
             ?,
             payment_status
           ),

         updated_at =
           CURRENT_TIMESTAMP

       WHERE id = ?`,
      [
        orderStatus,
        paymentStatus,
        id,
      ]
    );

    await recordAudit({
      req,
      action: 'order.status_updated',
      entityType: 'order',
      entityId: id,
      details: {
        orderStatusFrom: before?.order_status ?? null,
        orderStatusTo: orderStatus || before?.order_status || null,
        paymentStatusFrom: before?.payment_status ?? null,
        paymentStatusTo: paymentStatus || before?.payment_status || null,
      },
    });

    const updated =
      (
        await executeQuery(
          `SELECT *
           FROM orders
           WHERE id = ?`,
          [id]
        )
      )[0];

    return successResponse(
      res,
      'Order status updated',
      {
        order: updated,
      }
    );
  } catch (error) {
    console.error(
      'UpdateOrderStatus Error:',
      error
    );

    return errorResponse(
      res,
      'Failed to update order status',
      500
    );
  }
}


// =====================================================
// GET RAZORPAY CONFIG STATUS
// =====================================================

export async function getRazorpayConfigStatus(
  req,
  res
) {
  try {
    const {
      getRazorpayPublicConfig,
    } = await import(
      '../services/paymentConfigService.js'
    );

    const config =
      await getRazorpayPublicConfig();

    return successResponse(
      res,
      'Razorpay configuration status retrieved',
      config
    );
  } catch (error) {
    console.error(
      'GetRazorpayConfigStatus Error:',
      error
    );

    return errorResponse(
      res,
      'Failed to load Razorpay configuration status',
      500
    );
  }
}


// =====================================================
// SAVE RAZORPAY CONFIG
// =====================================================

export async function saveRazorpayConfig(
  req,
  res
) {
  try {
    const {
      keyId,
      keySecret,
      environment,
    } = req.body;

    const {
      saveRazorpayConfig,
    } = await import(
      '../services/paymentConfigService.js'
    );

    const config =
      await saveRazorpayConfig({
        keyId,
        keySecret,
        environment,
      });

    return successResponse(
      res,
      'Razorpay configuration saved successfully. Credentials are stored server-side only and are never returned to the browser.',
      config
    );
  } catch (error) {
    console.error(
      'SaveRazorpayConfig Error:',
      error
    );

    return errorResponse(
      res,
      'Failed to save Razorpay configuration',
      500
    );
  }
}


// =====================================================
// TEST RAZORPAY CONFIG
// =====================================================

export async function testRazorpayConfig(
  req,
  res
) {
  try {
    const {
      testRazorpayConfig,
    } = await import(
      '../services/paymentConfigService.js'
    );

    const result =
      await testRazorpayConfig();

    return successResponse(
      res,
      'Razorpay configuration test completed',
      result
    );
  } catch (error) {
    console.error(
      'TestRazorpayConfig Error:',
      error
    );

    return errorResponse(
      res,
      'Razorpay configuration test failed',
      500
    );
  }
}