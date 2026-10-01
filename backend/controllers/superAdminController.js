import bcrypt from 'bcryptjs';

import { executeQuery } from '../config/db.js';
import { successResponse, errorResponse } from '../utils/responseHelper.js';
import { recordAudit } from '../utils/auditLog.js';
import { getRolePermissionMatrix } from '../middleware/adminMiddleware.js';
import { normalizeRole, ROLE_SUPER_ADMIN, ROLE_ADMIN } from '../utils/roleHelper.js';
import {
  ASSIGNABLE_PERMISSIONS,
  isKnownPermission,
  isSuperAdminOnlyPermission,
  getAssignedPermissions,
  getEffectivePermissions,
  replaceAdminPermissions,
} from '../utils/adminPermissions.js';

// Columns that are safe to return to a browser. password_hash is never in this
// list, so it cannot leak through any endpoint below.
const SAFE_USER_COLUMNS = `
  u.id,
  u.full_name,
  u.email,
  u.phone,
  u.role,
  u.status,
  u.email_verified,
  u.avatar_url,
  u.created_at
`;

// =====================================================
// MANAGE ADMINS  (Super Admin only)
// =====================================================

/**
 * GET /api/super-admin/admins
 * Lists every privileged account (admin + super_admin).
 */
export async function listAdmins(req, res) {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const conditions = ["u.role IN ('admin', 'super_admin')"];
    const params = [];

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push('(u.full_name LIKE ? OR u.email LIKE ?)');
      params.push(term, term);
    }

    if (status && status !== 'all') {
      conditions.push('u.status = ?');
      params.push(status);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await executeQuery(
      `SELECT COUNT(*) AS total FROM users u ${whereClause}`,
      params
    );
    const total = Number(countResult[0]?.total || 0);

    const admins = await executeQuery(
      `SELECT ${SAFE_USER_COLUMNS}
         FROM users u
         ${whereClause}
        ORDER BY u.created_at DESC
        LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    return res.status(200).json({
      success: true,
      admins,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('ListAdmins Error:', error);
    return errorResponse(res, 'Failed to fetch administrators', 500);
  }
}

/**
 * GET /api/super-admin/admins/:id
 */
export async function getAdminDetails(req, res) {
  try {
    const targetId = parseInt(req.params.id, 10);
    if (Number.isNaN(targetId)) {
      return errorResponse(res, 'Invalid user ID', 400);
    }

    const users = await executeQuery(
      `SELECT ${SAFE_USER_COLUMNS}
         FROM users u
        WHERE u.id = ? AND u.role IN ('admin', 'super_admin')`,
      [targetId]
    );

    if (users.length === 0) {
      return errorResponse(res, 'Administrator not found', 404);
    }

    const actions = await executeQuery(
      `SELECT action, entity_type, entity_id, details, created_at
         FROM audit_logs
        WHERE actor_id = ?
        ORDER BY created_at DESC
        LIMIT 20`,
      [targetId]
    );

    return successResponse(res, 'Administrator details retrieved', {
      admin: users[0],
      recentActivity: actions,
    });
  } catch (error) {
    console.error('GetAdminDetails Error:', error);
    return errorResponse(res, 'Failed to fetch administrator details', 500);
  }
}

/**
 * PATCH /api/super-admin/admins/:id
 * Edit an admin's name / email / phone. Role is intentionally NOT editable
 * here - role changes go through PATCH /api/admin/users/:id/role which carries
 * its own (stricter) guards.
 */
export async function updateAdmin(req, res) {
  try {
    const targetId = parseInt(req.params.id, 10);
    if (Number.isNaN(targetId)) {
      return errorResponse(res, 'Invalid user ID', 400);
    }

    const { fullName, email, phone } = req.body || {};

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'role')) {
      return errorResponse(
        res,
        'Role cannot be changed through this endpoint. Use PATCH /api/admin/users/:id/role.',
        400
      );
    }

    if (!fullName && !email && phone === undefined) {
      return errorResponse(res, 'No editable fields provided', 400);
    }

    if (fullName !== undefined && !String(fullName).trim()) {
      return errorResponse(res, 'Full name cannot be empty', 400);
    }

    const users = await executeQuery(
      "SELECT id, full_name, email, role, status FROM users WHERE id = ? AND role IN ('admin','super_admin')",
      [targetId]
    );

    if (users.length === 0) {
      return errorResponse(res, 'Administrator not found', 404);
    }

    const target = users[0];
    const updates = [];
    const params = [];

    if (fullName !== undefined) {
      updates.push('full_name = ?');
      params.push(String(fullName).trim());
    }

    if (email !== undefined) {
      const normalizedEmail = String(email).toLowerCase().trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!emailRegex.test(normalizedEmail)) {
        return errorResponse(res, 'Please provide a valid email address', 400);
      }

      const clash = await executeQuery('SELECT id FROM users WHERE email = ? AND id <> ?', [
        normalizedEmail,
        targetId,
      ]);
      if (clash.length > 0) {
        return errorResponse(res, 'An account with this email address already exists', 409);
      }

      updates.push('email = ?');
      params.push(normalizedEmail);
    }

    if (phone !== undefined) {
      updates.push('phone = ?');
      params.push(phone ? String(phone).trim() : null);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');

    await executeQuery(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, [
      ...params,
      targetId,
    ]);

    const updated = await executeQuery(
      `SELECT ${SAFE_USER_COLUMNS} FROM users u WHERE u.id = ?`,
      [targetId]
    );

    await recordAudit({
      req,
      action: 'admin.updated',
      entityType: 'user',
      entityId: targetId,
      details: { targetEmail: target.email, fields: Object.keys(req.body || {}) },
    });

    return successResponse(res, 'Administrator updated successfully', {
      admin: updated[0],
    });
  } catch (error) {
    console.error('UpdateAdmin Error:', error);
    return errorResponse(res, 'Failed to update administrator', 500);
  }
}

/**
 * PATCH /api/super-admin/admins/:id/status
 * Activate / deactivate an admin. The last active Super Admin is protected so
 * the platform can never be left without an owner.
 */
export async function setAdminStatus(req, res) {
  try {
    const targetId = parseInt(req.params.id, 10);
    if (Number.isNaN(targetId)) {
      return errorResponse(res, 'Invalid user ID', 400);
    }

    const { status } = req.body || {};

    if (!['active', 'inactive', 'blocked'].includes(status)) {
      return errorResponse(res, "Status must be one of: active, inactive, blocked", 400);
    }

    const users = await executeQuery(
      'SELECT id, email, role, status FROM users WHERE id = ?',
      [targetId]
    );

    if (users.length === 0) {
      return errorResponse(res, 'Administrator not found', 404);
    }

    const target = users[0];
    const targetRole = normalizeRole(target.role);

    if (targetRole !== ROLE_ADMIN && targetRole !== ROLE_SUPER_ADMIN) {
      return errorResponse(res, 'The target account is not an administrator', 400);
    }

    if (targetId === req.user.id && status !== 'active') {
      return errorResponse(res, 'You cannot deactivate your own account', 400);
    }

    if (targetRole === ROLE_SUPER_ADMIN && status !== 'active') {
      const activeSuperAdmins = await executeQuery(
        "SELECT COUNT(*) AS count FROM users WHERE LOWER(TRIM(role)) = ? AND status = 'active'",
        [ROLE_SUPER_ADMIN]
      );

      if (Number(activeSuperAdmins[0]?.count || 0) <= 1) {
        return errorResponse(
          res,
          'The last active Super Admin cannot be deactivated or blocked',
          400
        );
      }
    }

    await executeQuery(
      'UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, targetId]
    );

    const updated = await executeQuery(
      `SELECT ${SAFE_USER_COLUMNS} FROM users u WHERE u.id = ?`,
      [targetId]
    );

    await recordAudit({
      req,
      action: status === 'active' ? 'admin.activated' : 'admin.deactivated',
      entityType: 'user',
      entityId: targetId,
      details: { targetEmail: target.email, from: target.status, to: status },
    });

    return successResponse(res, `Administrator ${status === 'active' ? 'activated' : 'deactivated'}`, {
      admin: updated[0],
    });
  } catch (error) {
    console.error('SetAdminStatus Error:', error);
    return errorResponse(res, 'Failed to update administrator status', 500);
  }
}

/**
 * DELETE /api/super-admin/admins/:id
 * Removes an admin account. Refuses to delete the caller, refuses to delete a
 * SUPER_ADMIN, and refuses to remove the last remaining privileged account, so
 * the console can never be locked out. Enforced here, not in the UI.
 */
export async function deleteAdmin(req, res) {
  try {
    const targetId = parseInt(req.params.id, 10);

    if (Number.isNaN(targetId)) {
      return errorResponse(res, 'Invalid user ID', 400);
    }

    if (req.user?.id === targetId) {
      return errorResponse(res, 'You cannot delete your own account', 403);
    }

    const users = await executeQuery(
      "SELECT id, full_name, email, role, status FROM users WHERE id = ? AND role IN ('admin','super_admin')",
      [targetId]
    );

    if (users.length === 0) {
      return errorResponse(res, 'Administrator not found', 404);
    }

    const target = users[0];

    if (normalizeRole(target.role) === ROLE_SUPER_ADMIN) {
      return errorResponse(
        res,
        'Super Admin accounts cannot be deleted. Change the role instead.',
        403
      );
    }

    const privileged = await executeQuery(
      "SELECT COUNT(*) AS total FROM users WHERE role IN ('admin','super_admin')"
    );

    if (Number(privileged[0]?.total || 0) <= 1) {
      return errorResponse(
        res,
        'At least one privileged administrator account must remain',
        409
      );
    }

    // Reviews and audit history reference users; the schema cascades the
    // review rows and audit_logs keep the actor id nullable, so a delete here
    // removes only the account and its own review submissions.
    await executeQuery('DELETE FROM users WHERE id = ?', [targetId]);

    await recordAudit(req.user.id, 'DELETE_ADMIN', 'user', targetId, {
      deleted_email: target.email,
      deleted_full_name: target.full_name,
      deleted_role: target.role,
    });

    return successResponse(res, 'Administrator deleted successfully', {
      deletedId: targetId,
    });
  } catch (error) {
    console.error('DeleteAdmin Error:', error);
    return errorResponse(res, 'Failed to delete administrator', 500);
  }
}

/**
 * POST /api/super-admin/admins/:id/reset-password
 * Super Admin issues a temporary password for a staff account. The plaintext is
 * returned exactly once and is never stored or logged.
 */
export async function resetAdminPassword(req, res) {
  try {
    const targetId = parseInt(req.params.id, 10);
    if (Number.isNaN(targetId)) {
      return errorResponse(res, 'Invalid user ID', 400);
    }

    const { newPassword } = req.body || {};

    if (!newPassword || String(newPassword).length < 8) {
      return errorResponse(res, 'New password must be at least 8 characters long', 400);
    }

    const users = await executeQuery(
      'SELECT id, email, role FROM users WHERE id = ?',
      [targetId]
    );

    if (users.length === 0) {
      return errorResponse(res, 'Administrator not found', 404);
    }

    const target = users[0];
    const targetRole = normalizeRole(target.role);

    if (targetRole !== ROLE_ADMIN && targetRole !== ROLE_SUPER_ADMIN) {
      return errorResponse(res, 'The target account is not an administrator', 400);
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(String(newPassword), salt);

    await executeQuery('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
      passwordHash,
      targetId,
    ]);

    await recordAudit({
      req,
      action: 'admin.password_reset',
      entityType: 'user',
      entityId: targetId,
      details: { targetEmail: target.email },
    });

    return successResponse(res, 'Administrator password reset successfully', {
      adminId: targetId,
    });
  } catch (error) {
    console.error('ResetAdminPassword Error:', error);
    return errorResponse(res, 'Failed to reset administrator password', 500);
  }
}

// =====================================================
// ROLES & PERMISSIONS
// =====================================================

/**
 * GET /api/super-admin/roles
 * Returns the authoritative backend permission matrix.
 */
export async function getRoles(req, res) {
  try {
    const users = await executeQuery(
      "SELECT role, COUNT(*) AS count FROM users WHERE role IN ('admin','super_admin') GROUP BY role"
    );

    const counts = {};
    users.forEach((row) => {
      counts[normalizeRole(row.role)] = Number(row.count || 0);
    });

    return successResponse(res, 'Roles and permissions retrieved', {
      ...getRolePermissionMatrix(),
      accountCounts: {
        [ROLE_SUPER_ADMIN]: counts[ROLE_SUPER_ADMIN] || 0,
        [ROLE_ADMIN]: counts[ROLE_ADMIN] || 0,
      },
    });
  } catch (error) {
    console.error('GetRoles Error:', error);
    return errorResponse(res, 'Failed to retrieve roles', 500);
  }
}

/**
 * Resolves the target of a permission request. Only a non-Super-Admin `admin`
 * account can be granted permissions: a Super Admin always holds every
 * permission, and a customer has no administrative access to narrow.
 */
async function findPermissionTarget(targetId) {
  const rows = await executeQuery(
    "SELECT id, full_name, email, role, status FROM users WHERE id = ? AND role = 'admin'",
    [targetId]
  );

  return rows[0] || null;
}

/**
 * GET /api/super-admin/admins/:id/permissions
 * Super Admin only. Returns the permissions currently stored for one Admin
 * account, plus the effective set so the console can show what the account is
 * actually allowed to do.
 */
export async function getAdminPermissions(req, res) {
  try {
    const targetId = parseInt(req.params.id, 10);
    if (Number.isNaN(targetId)) {
      return errorResponse(res, 'Invalid user ID', 400);
    }

    const target = await findPermissionTarget(targetId);
    if (!target) {
      return errorResponse(res, 'Only admin accounts have assignable permissions', 404);
    }

    const assigned = await getAssignedPermissions(targetId);

    return successResponse(res, 'Admin permissions retrieved', {
      admin: target,
      // Explicitly stored grants. Empty means the account still uses the role
      // default set (see utils/adminPermissions.js).
      assigned,
      // What the account can actually do right now.
      effective: await getEffectivePermissions(target),
      assignablePermissions: ASSIGNABLE_PERMISSIONS,
    });
  } catch (error) {
    console.error('GetAdminPermissions Error:', error);
    return errorResponse(res, 'Failed to retrieve admin permissions', 500);
  }
}

/**
 * PUT /api/super-admin/admins/:id/permissions
 * Super Admin only. Replaces the stored grants of one Admin account. Unknown
 * names and Super-Admin-only names are rejected so the Admin role can never be
 * granted a path to escalate itself.
 */
export async function updateAdminPermissions(req, res) {
  try {
    const targetId = parseInt(req.params.id, 10);
    if (Number.isNaN(targetId)) {
      return errorResponse(res, 'Invalid user ID', 400);
    }

    const permissions = req.body?.permissions;

    if (!Array.isArray(permissions)) {
      return errorResponse(res, 'A permissions array is required', 400);
    }

    const requested = permissions
      .map((permission) => String(permission || '').trim().toLowerCase())
      .filter(Boolean);

    const unknown = requested.filter((permission) => !isKnownPermission(permission));
    if (unknown.length > 0) {
      return errorResponse(res, `Unknown permission: ${unknown[0]}`, 400);
    }

    const forbidden = requested.filter((permission) => isSuperAdminOnlyPermission(permission));
    if (forbidden.length > 0) {
      return errorResponse(
        res,
        `The "${forbidden[0]}" permission is reserved for the Super Admin role`,
        400
      );
    }

    const target = await findPermissionTarget(targetId);
    if (!target) {
      return errorResponse(res, 'Only admin accounts have assignable permissions', 404);
    }

    const saved = await replaceAdminPermissions(targetId, requested);

    await recordAudit({
      req,
      action: 'admin.permissions_updated',
      entityType: 'user',
      entityId: targetId,
      details: { targetEmail: target.email, permissions: saved },
    });

    return successResponse(res, 'Admin permissions updated', {
      admin: target,
      assigned: saved,
      effective: await getEffectivePermissions(target),
    });
  } catch (error) {
    console.error('UpdateAdminPermissions Error:', error);
    return errorResponse(res, 'Failed to update admin permissions', 500);
  }
}

// =====================================================
// AUDIT LOGS
// =====================================================

/**
 * GET /api/super-admin/audit-logs
 */
export async function getAuditLogs(req, res) {
  try {
    const { action, actorId, actorEmail, role, page = 1, limit = 25 } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(200, parseInt(limit, 10) || 25));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    if (action && action.trim()) {
      conditions.push('action LIKE ?');
      params.push(`%${action.trim()}%`);
    }

    if (actorId) {
      const parsedActor = parseInt(actorId, 10);
      if (!Number.isNaN(parsedActor)) {
        conditions.push('actor_id = ?');
        params.push(parsedActor);
      }
    }

    // Reviewers usually search by the person's email address.
    if (actorEmail && String(actorEmail).trim()) {
      conditions.push('actor_email LIKE ?');
      params.push(`%${String(actorEmail).trim().toLowerCase()}%`);
    }

    if (role && String(role).trim()) {
      conditions.push('actor_role = ?');
      params.push(normalizeRole(role));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await executeQuery(
      `SELECT COUNT(*) AS total FROM audit_logs ${whereClause}`,
      params
    );
    const total = Number(countResult[0]?.total || 0);

    const logs = await executeQuery(
      `SELECT id, actor_id, actor_email, actor_role, action, entity_type, entity_id, details, ip_address, created_at
         FROM audit_logs
         ${whereClause}
        ORDER BY created_at DESC, id DESC
        LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    return res.status(200).json({
      success: true,
      logs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('GetAuditLogs Error:', error);
    return errorResponse(res, 'Failed to fetch audit logs', 500);
  }
}

// =====================================================
// WEBSITE SETTINGS
// =====================================================

const SETTING_DEFAULTS = {
  site_name: 'Velora',
  site_tagline: 'Premium electronics, audio and lifestyle gear',
  support_email: 'support@velora.com',
  support_phone: '+1 (555) 900-0000',
  store_currency: 'INR',
  store_enabled: 'true',
  allow_registration: 'true',
  announcement_banner: '',
  maintenance_mode: 'false',
};

// Settings the Super Admin is allowed to change. An allow-list, so a crafted
// request can never write arbitrary rows into the settings table.
const EDITABLE_SETTINGS = new Set(Object.keys(SETTING_DEFAULTS));

export async function getSettings(req, res) {
  try {
    const rows = await executeQuery('SELECT setting_key, setting_value FROM website_settings');

    const stored = {};
    rows.forEach((row) => {
      stored[row.setting_key] = row.setting_value;
    });

    const settings = {};
    Object.keys(SETTING_DEFAULTS).forEach((key) => {
      settings[key] = stored[key] ?? SETTING_DEFAULTS[key];
    });

    return successResponse(res, 'Website settings retrieved', { settings });
  } catch (error) {
    console.error('GetSettings Error:', error);
    return errorResponse(res, 'Failed to fetch website settings', 500);
  }
}

export async function updateSettings(req, res) {
  try {
    const payload = req.body?.settings;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return errorResponse(res, 'A settings object is required', 400);
    }

    const entries = Object.entries(payload).filter(([key]) => EDITABLE_SETTINGS.has(key));

    if (entries.length === 0) {
      return errorResponse(
        res,
        `No editable settings provided. Editable keys: ${[...EDITABLE_SETTINGS].join(', ')}`,
        400
      );
    }

    for (const [key, value] of entries) {
      const stringValue = value === null || value === undefined ? '' : String(value).slice(0, 1000);

      const existing = await executeQuery(
        'SELECT id FROM website_settings WHERE setting_key = ?',
        [key]
      );

      if (existing.length > 0) {
        await executeQuery('UPDATE website_settings SET setting_value = ? WHERE setting_key = ?', [
          stringValue,
          key,
        ]);
      } else {
        await executeQuery(
          'INSERT INTO website_settings (setting_key, setting_value) VALUES (?, ?)',
          [key, stringValue]
        );
      }
    }

    await recordAudit({
      req,
      action: 'settings.updated',
      entityType: 'website_settings',
      entityId: null,
      details: { keys: entries.map(([key]) => key) },
    });

    return getSettings(req, res);
  } catch (error) {
    console.error('UpdateSettings Error:', error);
    return errorResponse(res, 'Failed to update website settings', 500);
  }
}

// =====================================================
// REPORTS & ANALYTICS
// =====================================================

const castNumber = (value) => Number(value || 0);

export async function getReports(req, res) {
  try {
    const revenueRow = await executeQuery(
      "SELECT COALESCE(SUM(total_amount), 0) AS revenue, COUNT(*) AS orders FROM orders WHERE payment_status = 'paid'"
    );

    const revenueByDay = await executeQuery(
      `SELECT DATE(created_at) AS day, COALESCE(SUM(total_amount), 0) AS revenue, COUNT(*) AS orders
         FROM orders
        WHERE payment_status = 'paid'
        GROUP BY DATE(created_at)
        ORDER BY day ASC
        LIMIT 30`
    );

    const revenueByCategory = await executeQuery(
      `SELECT p.category_name AS category,
              COALESCE(SUM(oi.quantity * oi.price), 0) AS revenue,
              COALESCE(SUM(oi.quantity), 0) AS units
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
        GROUP BY p.category_name
        ORDER BY revenue DESC`
    );

    const topProducts = await executeQuery(
      `SELECT oi.product_id, oi.product_name, oi.image_url,
              COALESCE(SUM(oi.quantity), 0) AS units_sold,
              COALESCE(SUM(oi.total), 0) AS revenue
         FROM order_items oi
        GROUP BY oi.product_id, oi.product_name, oi.image_url
        ORDER BY units_sold DESC
        LIMIT 10`
    );

    const customerStats = await executeQuery(
      `SELECT role, COUNT(*) AS count FROM users GROUP BY role`
    );

    const orderStatusBreakdown = await executeQuery(
      'SELECT order_status, COUNT(*) AS count FROM orders GROUP BY order_status'
    );

    const lowStock = await executeQuery(
      `SELECT id, name, brand, stock, status
         FROM products
        WHERE stock <= 10
        ORDER BY stock ASC
        LIMIT 10`
    );

    const byRole = {};
    customerStats.forEach((row) => {
      byRole[normalizeRole(row.role)] = castNumber(row.count);
    });

    return successResponse(res, 'Reports and analytics retrieved', {
      totals: {
        revenue: castNumber(revenueRow[0]?.revenue),
        paidOrders: castNumber(revenueRow[0]?.orders),
        customers: byRole.customer || 0,
        admins: byRole.admin || 0,
        superAdmins: byRole.super_admin || 0,
      },
      revenueByDay,
      revenueByCategory,
      topProducts,
      orderStatusBreakdown,
      lowStock,
    });
  } catch (error) {
    console.error('GetReports Error:', error);
    return errorResponse(res, 'Failed to generate reports', 500);
  }
}

/**
 * GET /api/super-admin/dashboard
 * Super Admin landing metrics: workforce overview on top of store health.
 */
export async function getSuperAdminDashboard(req, res) {
  try {
    const privilegeRow = await executeQuery(
      "SELECT role, COUNT(*) AS count FROM users WHERE role IN ('admin','super_admin') GROUP BY role"
    );

    const privilege = {};
    privilegeRow.forEach((row) => {
      privilege[normalizeRole(row.role)] = Number(row.count || 0);
    });

    const totals = await executeQuery(
      `SELECT
         (SELECT COUNT(*) FROM users) AS total_users,
         (SELECT COUNT(*) FROM products) AS total_products,
         (SELECT COUNT(*) FROM orders) AS total_orders,
         (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE payment_status = 'paid') AS revenue,
         (SELECT COUNT(*) FROM audit_logs) AS audit_events`
    );

    const recentAdmins = await executeQuery(
      `SELECT id, full_name, email, role, status, created_at
         FROM users
        WHERE role IN ('admin','super_admin')
        ORDER BY created_at DESC
        LIMIT 5`
    );

    const recentAudit = await executeQuery(
      `SELECT action, actor_email, actor_role, entity_type, entity_id, created_at
         FROM audit_logs
        ORDER BY created_at DESC, id DESC
        LIMIT 8`
    );

    const base = totals[0] || {};

    return successResponse(res, 'Super Admin dashboard statistics', {
      stats: {
        totalUsers: castNumber(base.total_users),
        totalProducts: castNumber(base.total_products),
        totalOrders: castNumber(base.total_orders),
        totalRevenue: castNumber(base.revenue),
        auditEvents: castNumber(base.audit_events),
        superAdmins: privilege.super_admin || 0,
        admins: privilege.admin || 0,
      },
      recentAdmins,
      recentAudit,
    });
  } catch (error) {
    console.error('GetSuperAdminDashboard Error:', error);
    return errorResponse(res, 'Failed to fetch dashboard statistics', 500);
  }
}

/**
 * GET /api/super-admin/payments
 * Super Admin transaction view. Reuses the payments table that Razorpay and
 * card flows already write to.
 */
export async function getPayments(req, res) {
  try {
    const { status, provider, page = 1, limit = 20 } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    if (status && status !== 'all') {
      conditions.push('p.status = ?');
      params.push(status);
    }

    if (provider && provider !== 'all') {
      conditions.push('p.provider = ?');
      params.push(provider);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await executeQuery(
      `SELECT COUNT(*) AS total FROM payments p ${whereClause}`,
      params
    );
    const total = Number(countResult[0]?.total || 0);

    const payments = await executeQuery(
      `SELECT p.id, p.order_id, p.user_id, p.amount, p.currency, p.provider,
              p.payment_intent_id, p.status, p.created_at,
              u.full_name AS customer_name, u.email AS customer_email,
              o.order_number, o.order_status, o.payment_status
         FROM payments p
         JOIN users u ON u.id = p.user_id
         LEFT JOIN orders o ON o.id = p.order_id
         ${whereClause}
        ORDER BY p.created_at DESC
        LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    return res.status(200).json({
      success: true,
      payments,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('GetPayments Error:', error);
    return errorResponse(res, 'Failed to fetch payments', 500);
  }
}
