// =====================================================
// ROLE NORMALIZATION HELPERS (backend, single source of truth)
// Mirrors src/utils/roles.js and is used by every authorization check.
// =====================================================

export const ROLE_CUSTOMER = 'customer';
export const ROLE_ADMIN = 'admin';
export const ROLE_SUPER_ADMIN = 'super_admin';

export const ADMIN_ROLES = [
  ROLE_ADMIN,
  ROLE_SUPER_ADMIN,
];

/**
 * Normalize a role coming from the database, a JWT claim or a request body.
 * Always returns a lowercase, trimmed string ('' when absent).
 */
export function normalizeRole(role) {
  return String(role ?? '')
    .trim()
    .toLowerCase();
}

export function isAdminRole(role) {
  return ADMIN_ROLES.includes(normalizeRole(role));
}

export function isSuperAdminRole(role) {
  return normalizeRole(role) === ROLE_SUPER_ADMIN;
}

export function isCustomerRole(role) {
  return normalizeRole(role) === ROLE_CUSTOMER;
}

/** Roles that a Super Admin is allowed to assign through the role API. */
export const ASSIGNABLE_ROLES = [
  ROLE_CUSTOMER,
  ROLE_ADMIN,
];

// =====================================================
// PERMISSION MATRIX (backend, authoritative)
// =====================================================
// Every privileged capability is named here so authorization decisions are made
// in exactly one place. Routes enforce these with authorizePermission(...);
// the frontend only mirrors the matrix for rendering affordances.

export const PERMISSIONS = {
  // --- Super Admin only -------------------------------------------------
  MANAGE_ADMINS: 'manage_admins',
  MANAGE_ROLES: 'manage_roles',
  MANAGE_WEBSITE_SETTINGS: 'manage_website_settings',
  VIEW_AUDIT_LOGS: 'view_audit_logs',
  MANAGE_PAYMENT_CREDENTIALS: 'manage_payment_credentials',

  // --- Admin + Super Admin ---------------------------------------------
  VIEW_REPORTS: 'view_reports',
  MANAGE_PRODUCTS: 'manage_products',
  MANAGE_CATEGORIES: 'manage_categories',
  MANAGE_INVENTORY: 'manage_inventory',
  MANAGE_ORDERS: 'manage_orders',
  MANAGE_CUSTOMERS: 'manage_customers',
  MANAGE_COUPONS: 'manage_coupons',
  MANAGE_OFFERS: 'manage_offers',
  MANAGE_REVIEWS: 'manage_reviews',
  VIEW_PAYMENTS: 'view_payments',
};

const ALL_PERMISSIONS = Object.values(PERMISSIONS);

const ADMIN_PERMISSIONS = [
  PERMISSIONS.VIEW_REPORTS,
  PERMISSIONS.MANAGE_PRODUCTS,
  PERMISSIONS.MANAGE_CATEGORIES,
  PERMISSIONS.MANAGE_INVENTORY,
  PERMISSIONS.MANAGE_ORDERS,
  PERMISSIONS.MANAGE_CUSTOMERS,
  PERMISSIONS.MANAGE_COUPONS,
  PERMISSIONS.MANAGE_OFFERS,
  PERMISSIONS.MANAGE_REVIEWS,
  PERMISSIONS.VIEW_PAYMENTS,
];

/** role -> permissions that role is allowed to exercise. */
export const ROLE_PERMISSIONS = {
  [ROLE_CUSTOMER]: [],
  [ROLE_ADMIN]: ADMIN_PERMISSIONS,
  [ROLE_SUPER_ADMIN]: ALL_PERMISSIONS,
};

/** Human readable labels for the Super Admin "Roles & Permissions" screen. */
export const PERMISSION_LABELS = {
  [PERMISSIONS.MANAGE_ADMINS]: 'Manage Admins',
  [PERMISSIONS.MANAGE_ROLES]: 'Manage Roles & Permissions',
  [PERMISSIONS.MANAGE_WEBSITE_SETTINGS]: 'Manage Website Settings',
  [PERMISSIONS.VIEW_AUDIT_LOGS]: 'View Audit Logs',
  [PERMISSIONS.MANAGE_PAYMENT_CREDENTIALS]: 'Manage Payment Credentials',
  [PERMISSIONS.VIEW_REPORTS]: 'View Reports & Analytics',
  [PERMISSIONS.MANAGE_PRODUCTS]: 'Manage Products',
  [PERMISSIONS.MANAGE_CATEGORIES]: 'Manage Categories',
  [PERMISSIONS.MANAGE_INVENTORY]: 'Manage Inventory',
  [PERMISSIONS.MANAGE_ORDERS]: 'Manage Orders',
  [PERMISSIONS.MANAGE_CUSTOMERS]: 'Manage Customers',
  [PERMISSIONS.MANAGE_COUPONS]: 'Manage Coupons',
  [PERMISSIONS.MANAGE_OFFERS]: 'Manage Offers',
  [PERMISSIONS.MANAGE_REVIEWS]: 'Manage Reviews',
  [PERMISSIONS.VIEW_PAYMENTS]: 'View Payments & Transactions',
};

/**
 * True when the given role holds the named permission.
 * Unknown roles (including '' for anonymous) never hold any permission.
 */
export function hasPermission(role, permission) {
  const granted = ROLE_PERMISSIONS[normalizeRole(role)];
  return Array.isArray(granted) && granted.includes(permission);
}

/** The full permission list a role holds - used by the roles screen and tests. */
export function permissionsForRole(role) {
  return [...(ROLE_PERMISSIONS[normalizeRole(role)] || [])];
}
