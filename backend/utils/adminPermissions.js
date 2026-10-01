// =====================================================
// GRANULAR ADMIN PERMISSIONS (database-aware layer)
//
// Reuses the existing permission names and role helpers from roleHelper.js and
// the existing executeQuery() abstraction from config/db.js. Nothing here opens
// a new connection and nothing here introduces a second naming system - this is
// only the persistence layer that backs the single permission check in
// middleware/adminMiddleware.js.
//
// Rules enforced by this module:
//   - super_admin : always every permission, never restricted by this table.
//   - admin       : the permissions stored in admin_permissions.
//   - customer    : never any admin permission.
// =====================================================

import { executeQuery } from '../config/db.js';

import {
  PERMISSIONS,
  normalizeRole,
  ROLE_ADMIN,
  ROLE_SUPER_ADMIN,
  permissionsForRole,
} from './roleHelper.js';

/** Every permission name defined by the existing matrix. */
export const ALL_PERMISSION_NAMES = Object.values(PERMISSIONS);

/**
 * Capabilities the matrix reserves for the Super Admin. They are refused on
 * write so an Admin account can never be granted a path to escalate itself.
 */
const SUPER_ADMIN_ONLY_PERMISSIONS = new Set([
  PERMISSIONS.MANAGE_ADMINS,
  PERMISSIONS.MANAGE_ROLES,
  PERMISSIONS.MANAGE_WEBSITE_SETTINGS,
  PERMISSIONS.VIEW_AUDIT_LOGS,
  PERMISSIONS.MANAGE_PAYMENT_CREDENTIALS,
]);

/** Permissions a Super Admin is allowed to grant to an Admin account. */
export const ASSIGNABLE_PERMISSIONS = ALL_PERMISSION_NAMES.filter(
  (permission) => !SUPER_ADMIN_ONLY_PERMISSIONS.has(permission)
);

/** True when the value is a permission name the matrix already defines. */
export function isKnownPermission(permission) {
  return ALL_PERMISSION_NAMES.includes(permission);
}

/** True when only a Super Admin may ever hold the permission. */
export function isSuperAdminOnlyPermission(permission) {
  return SUPER_ADMIN_ONLY_PERMISSIONS.has(permission);
}

/**
 * The permissions stored in admin_permissions for one account.
 * Always an array; never throws for a missing/blank id.
 */
export async function getAssignedPermissions(adminId) {
  if (adminId === undefined || adminId === null || String(adminId).trim() === '') {
    return [];
  }

  const rows = await executeQuery(
    'SELECT permission FROM admin_permissions WHERE admin_id = ?',
    [String(adminId)]
  );

  return (rows || [])
    .map((row) => String(row.permission || '').trim())
    .filter(Boolean);
}

/**
 * The permissions an account actually holds right now.
 *
 * super_admin -> every permission, always.
 * customer (or any unknown role) -> none.
 * admin       -> its stored grants. An account that has never been granted
 *                anything keeps the role default set, so permissions created
 *                before granular grants existed behave exactly as they did.
 */
export async function getEffectivePermissions(user) {
  const role = normalizeRole(user?.role);

  if (role === ROLE_SUPER_ADMIN) {
    return [...ALL_PERMISSION_NAMES];
  }

  if (role !== ROLE_ADMIN) {
    return [];
  }

  const assigned = await getAssignedPermissions(user?.id);

  return assigned.length > 0 ? assigned : permissionsForRole(ROLE_ADMIN);
}

/** True when the account holds the named permission. */
export async function hasEffectivePermission(user, permission) {
  const effective = await getEffectivePermissions(user);

  return effective.includes(permission);
}

/**
 * Replaces the stored grants of one Admin account.
 * Unknown and Super-Admin-only names are rejected by the caller before this
 * runs; the list is de-duplicated here so the UNIQUE(admin_id, permission)
 * constraint can never be violated.
 */
export async function replaceAdminPermissions(adminId, permissions) {
  const target = String(adminId);

  const unique = Array.from(
    new Set(
      (permissions || [])
        .map((permission) => String(permission || '').trim())
        .filter(Boolean)
    )
  );

  await executeQuery('DELETE FROM admin_permissions WHERE admin_id = ?', [target]);

  for (const permission of unique) {
    await executeQuery(
      'INSERT INTO admin_permissions (admin_id, permission) VALUES (?, ?)',
      [target, permission]
    );
  }

  return unique;
}

/** Removes every stored grant of one account (used when it stops being an admin). */
export async function clearAdminPermissions(adminId) {
  await executeQuery('DELETE FROM admin_permissions WHERE admin_id = ?', [
    String(adminId),
  ]);
}
