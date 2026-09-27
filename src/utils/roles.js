// =====================================================
// ROLE NORMALIZATION HELPERS (single source of truth)
// Mirrors backend/middleware/adminMiddleware.js exactly.
// =====================================================

export const ROLE_CUSTOMER = 'customer';
export const ROLE_ADMIN = 'admin';
export const ROLE_SUPER_ADMIN = 'super_admin';

/**
 * Normalize any role value coming from the API / JWT / DB.
 * Always returns a lowercase, trimmed string ('' when absent).
 */
export const normalizeRole = (role) =>
  String(role ?? '')
    .trim()
    .toLowerCase();

/** Roles allowed into the /admin portal and /api/admin/* endpoints. */
export const ADMIN_ROLES = [ROLE_ADMIN, ROLE_SUPER_ADMIN];

/** True when the role may access the admin portal. */
export const isAdminRole = (role) =>
  ADMIN_ROLES.includes(normalizeRole(role));

/** True only for super_admin. */
export const isSuperAdminRole = (role) =>
  normalizeRole(role) === ROLE_SUPER_ADMIN;

export const isCustomerRole = (role) =>
  normalizeRole(role) === ROLE_CUSTOMER;

/** Human readable label for a role badge. */
export const roleLabel = (role) => {
  switch (normalizeRole(role)) {
    case ROLE_SUPER_ADMIN:
      return 'Super Admin';
    case ROLE_ADMIN:
      return 'Admin';
    case ROLE_CUSTOMER:
      return 'Customer';
    default:
      return 'Unknown';
  }
};

// =====================================================
// ROLE-BASED REDIRECT MAP
// Exactly one landing page per role, as required by the auth spec.
// =====================================================

export const ROLE_HOME_PATH = {
  [ROLE_SUPER_ADMIN]: '/super-admin/dashboard',
  [ROLE_ADMIN]: '/admin/dashboard',
  [ROLE_CUSTOMER]: '/customer/dashboard',
};

/** The landing path for a role, or null when the role is unknown/untrusted. */
export const roleHomePath = (role) => ROLE_HOME_PATH[normalizeRole(role)] || null;

/**
 * Where a user who is already signed in should be sent.
 * Used by /login, /register and the root path so a signed-in admin is never
 * dropped onto the storefront.
 */
export const resolvePostAuthPath = (role, requestedPath) => {
  const home = roleHomePath(role);

  if (!home) return null;

  // Only honour an in-app redirect that matches the user's own role prefix.
  // Without this check a customer could be bounced to /admin/dashboard via
  // ?redirect=, which would render an access-denied page instead of their
  // real home.
  if (requestedPath && typeof requestedPath === 'string' && requestedPath.startsWith('/')) {
    const prefix = home.split('/').slice(0, 2).join('/');
    if (requestedPath === prefix || requestedPath.startsWith(`${prefix}/`)) {
      return requestedPath;
    }
  }

  return home;
};

// Mirrors backend/utils/roleHelper.js. Used only to decide which navigation
// entries to render - the API re-checks every one of these server-side.
export const PERMISSIONS = {
  MANAGE_ADMINS: 'manage_admins',
  MANAGE_ROLES: 'manage_roles',
  MANAGE_WEBSITE_SETTINGS: 'manage_website_settings',
  VIEW_AUDIT_LOGS: 'view_audit_logs',
  MANAGE_PAYMENT_CREDENTIALS: 'manage_payment_credentials',
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

export const ROLE_PERMISSIONS = {
  [ROLE_CUSTOMER]: [],
  [ROLE_ADMIN]: ADMIN_PERMISSIONS,
  [ROLE_SUPER_ADMIN]: Object.values(PERMISSIONS),
};

/** UX-only mirror of the backend permission check. Never a security boundary. */
export const hasPermission = (role, permission) =>
  (ROLE_PERMISSIONS[normalizeRole(role)] || []).includes(permission);
