import { errorResponse } from '../utils/responseHelper.js';

import {
  normalizeRole,
  isAdminRole,
  isSuperAdminRole,
  permissionsForRole,
  PERMISSION_LABELS,
  ROLE_PERMISSIONS,
  ROLE_CUSTOMER,
  ROLE_ADMIN,
  ROLE_SUPER_ADMIN,
} from '../utils/roleHelper.js';

import { hasEffectivePermission } from '../utils/adminPermissions.js';

// ==========================================
// Admin Authorization
// Allows:
// - admin
// - super_admin
//
// NOTE: this is server-side enforcement. The frontend route guard
// is only a UX affordance and never a substitute for this.
// ==========================================
export function authorizeAdmin(req, res, next) {
  if (!req.user) {
    console.warn('[AdminAPI] authorizeAdmin denied - no req.user', {
      method: req.method,
      url: req.originalUrl,
    });

    return errorResponse(
      res,
      'Authentication required.',
      401
    );
  }

  const role = normalizeRole(req.user.role);

  console.log('[AdminAPI] authorizeAdmin', {
    method: req.method,
    url: req.originalUrl,
    userId: req.user.id,
    email: req.user.email,
    role,
  });

  if (!isAdminRole(role)) {
    console.warn('[AdminAPI] authorizeAdmin DENIED', {
      url: req.originalUrl,
      role,
      required: ['admin', 'super_admin'],
    });

    return errorResponse(
      res,
      'Access forbidden. Administrator privileges required.',
      403
    );
  }

  console.log('[AdminAPI] authorizeAdmin GRANTED', {
    url: req.originalUrl,
    role,
  });

  next();
}

// ==========================================
// Super Admin Authorization
// Allows ONLY:
// - super_admin
// ==========================================
export function authorizeSuperAdmin(req, res, next) {
  if (!req.user) {
    console.warn('[AdminAPI] authorizeSuperAdmin denied - no req.user', {
      method: req.method,
      url: req.originalUrl,
    });

    return errorResponse(
      res,
      'Authentication required.',
      401
    );
  }

  const role = normalizeRole(req.user.role);

  console.log('[AdminAPI] authorizeSuperAdmin', {
    method: req.method,
    url: req.originalUrl,
    userId: req.user.id,
    email: req.user.email,
    role,
  });

  if (!isSuperAdminRole(role)) {
    console.warn('[AdminAPI] authorizeSuperAdmin DENIED', {
      url: req.originalUrl,
      role,
      required: ['super_admin'],
    });

    return errorResponse(
      res,
      'Access forbidden. Super Administrator privileges required.',
      403
    );
  }

  console.log('[AdminAPI] authorizeSuperAdmin GRANTED', {
    url: req.originalUrl,
    role,
  });

  next();
}

// ==========================================
// PERMISSION AUTHORIZATION
//
// Grants access when the caller holds the named permission.
//   - super_admin : always, never restricted by admin_permissions
//   - admin       : exactly what admin_permissions grants for that account
//   - customer    : never
// A missing permission is rejected with 403. This is the single enforcement
// point used by every management route, so a route can never accidentally ship
// with only a UI guard behind it.
// ==========================================
export function authorizePermission(permission) {
  return async function permissionGuard(req, res, next) {
    if (!req.user) {
      console.warn(`[AdminAPI] authorizePermission(${permission}) denied - no req.user`, {
        method: req.method,
        url: req.originalUrl,
      });

      return errorResponse(res, 'Authentication required.', 401);
    }

    const role = normalizeRole(req.user.role);

    // Database-aware check (utils/adminPermissions.js): Super Admin always
    // passes, an Admin passes only for its stored grants, a customer never does.
    let granted = false;

    try {
      granted = await hasEffectivePermission(req.user, permission);
    } catch (error) {
      console.error('Permission check Error:', error);
      return errorResponse(res, 'Failed to verify permissions', 500);
    }

    if (!granted) {
      console.warn(`[AdminAPI] authorizePermission(${permission}) DENIED`, {
        method: req.method,
        url: req.originalUrl,
        userId: req.user.id,
        role,
        required: permission,
      });

      return errorResponse(
        res,
        `Access forbidden. The "${PERMISSION_LABELS[permission] || permission}" permission is required.`,
        403
      );
    }

    console.log(`[AdminAPI] authorizePermission(${permission}) GRANTED`, {
      url: req.originalUrl,
      role,
    });

    return next();
  };
}

/**
 * Blocks admins and super admins from customer-only surfaces.
 * The mirror image of authorizeAdmin: a staff account must not be able to act
 * as a shopper (e.g. place orders through the customer cart API).
 */
export function authorizeCustomer(req, res, next) {
  if (!req.user) {
    return errorResponse(res, 'Authentication required.', 401);
  }

  const role = normalizeRole(req.user.role);

  if (role !== ROLE_CUSTOMER) {
    console.warn('[API] authorizeCustomer DENIED - staff account used a customer-only route', {
      method: req.method,
      url: req.originalUrl,
      role,
    });

    return errorResponse(
      res,
      'This action is only available to customer accounts.',
      403
    );
  }

  return next();
}

/**
 * Roles & Permissions matrix (read-only view for the Super Admin console).
 * Exposes the authoritative backend matrix, never a client-side copy.
 */
export function getRolePermissionMatrix() {
  return {
    roles: [
      { role: ROLE_SUPER_ADMIN, permissions: permissionsForRole(ROLE_SUPER_ADMIN) },
      { role: ROLE_ADMIN, permissions: permissionsForRole(ROLE_ADMIN) },
      { role: ROLE_CUSTOMER, permissions: permissionsForRole(ROLE_CUSTOMER) },
    ],
    permissionLabels: PERMISSION_LABELS,
    matrix: ROLE_PERMISSIONS,
  };
}
