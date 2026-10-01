import express from 'express';

import {
  getDashboardStats,
  getUsers,
  createAdmin,
  updateUserStatus,
  updateUserRole,
  getUserDetails,
  getAdminOrders,
  updateOrderStatus,
  getRazorpayConfigStatus,
  saveRazorpayConfig,
  testRazorpayConfig,
} from '../controllers/adminController.js';

import { authenticate } from '../middleware/authMiddleware.js';

import {
  authorizeAdmin,
  authorizeSuperAdmin,
  authorizePermission,
} from '../middleware/adminMiddleware.js';

import { PERMISSIONS } from '../utils/roleHelper.js';

// The report/payment readers are shared with the Super Admin console. The
// handlers only ever SELECT aggregate data, so letting Admins read them is
// safe; what stays Super-Admin-only is anything that MUTATES privileged state.
import { getReports, getPayments } from '../controllers/superAdminController.js';

const router = express.Router();

// ======================================================
// AUTHENTICATION + ADMIN AUTHORIZATION
// Chain: authenticate -> authorizeAdmin
// Allows: admin + super_admin (customer is rejected with 403)
// ======================================================
router.use(authenticate, authorizeAdmin);

// ======================================================
// Admin Dashboard
// ======================================================
router.get('/dashboard', getDashboardStats);

// ======================================================
// User Management
// ======================================================

// Get all users
router.get('/users', authorizePermission(PERMISSIONS.MANAGE_CUSTOMERS), getUsers);

// Create admin - SUPER ADMIN ONLY
// Chain: authenticate -> authorizeAdmin -> authorizeSuperAdmin
router.post(
  '/users/admin',
  authorizeSuperAdmin,
  createAdmin
);

// Get user details
router.get(
  '/users/:id',
  authorizePermission(PERMISSIONS.MANAGE_CUSTOMERS),
  getUserDetails
);

// Update user status - admin level, but the controller blocks
// admins from touching admin/super_admin accounts.
// Chain: authenticate -> authorizeAdmin -> authorizePermission(manage_customers)
router.patch(
  '/users/:id/status',
  authorizePermission(PERMISSIONS.MANAGE_CUSTOMERS),
  updateUserStatus
);

// Update user role - SUPER ADMIN ONLY.
// This is the ONLY endpoint that can change a role.
// Chain: authenticate -> authorizeAdmin -> authorizeSuperAdmin
router.patch(
  '/users/:id/role',
  authorizeSuperAdmin,
  updateUserRole
);

// ======================================================
// Order Management
// ======================================================

router.get(
  '/orders',
  authorizePermission(PERMISSIONS.MANAGE_ORDERS),
  getAdminOrders
);

router.patch(
  '/orders/:id/status',
  authorizePermission(PERMISSIONS.MANAGE_ORDERS),
  updateOrderStatus
);

// ======================================================
// Reports & Transactions
//
// Admins get read-only analytics and a read-only payment/transaction view.
// Both capabilities exist in the shared permission matrix, so a role change
// immediately reflects here.
// ======================================================

router.get('/reports', authorizePermission(PERMISSIONS.VIEW_REPORTS), getReports);
router.get('/payments', authorizePermission(PERMISSIONS.VIEW_PAYMENTS), getPayments);

// ======================================================
// Razorpay Payment Configuration
// Reading the status: admin level.
// WRITING gateway credentials / firing live test calls:
// SUPER ADMIN ONLY (privileged credential mutation).
// ======================================================

router.get(
  '/payments/razorpay',
  authorizePermission(PERMISSIONS.VIEW_PAYMENTS),
  getRazorpayConfigStatus
);

router.put(
  '/payments/razorpay',
  authorizeSuperAdmin,
  saveRazorpayConfig
);

router.post(
  '/payments/razorpay/test',
  authorizeSuperAdmin,
  testRazorpayConfig
);

// ==========================================
// IMPORTANT: DEFAULT EXPORT
// ==========================================
export default router;