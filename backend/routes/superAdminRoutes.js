import express from 'express';

import {
  getSuperAdminDashboard,
  listAdmins,
  getAdminDetails,
  updateAdmin,
  setAdminStatus,
  resetAdminPassword,
  deleteAdmin,
  getRoles,
  getAdminPermissions,
  updateAdminPermissions,
  getAuditLogs,
  getSettings,
  updateSettings,
  getReports,
  getPayments,
} from '../controllers/superAdminController.js';

import { authenticate } from '../middleware/authMiddleware.js';
import {
  authorizeSuperAdmin,
  authorizePermission,
} from '../middleware/adminMiddleware.js';
import { PERMISSIONS } from '../utils/roleHelper.js';

const router = express.Router();

// ======================================================
// SUPER ADMIN PORTAL
//
// Chain: authenticate -> authorizeSuperAdmin
// Every route below requires a verified, active SUPER_ADMIN account whose role
// is re-read from the database on each request. An `admin` or `customer`
// account receives 403 here regardless of what the frontend sends.
// ======================================================
router.use(authenticate, authorizeSuperAdmin);

router.get('/dashboard', getSuperAdminDashboard);

// --- Manage Admins -------------------------------------------------------
router.get('/admins', listAdmins);
router.get('/admins/:id', getAdminDetails);
router.patch('/admins/:id', updateAdmin);
router.patch('/admins/:id/status', setAdminStatus);
router.post('/admins/:id/reset-password', resetAdminPassword);
router.delete('/admins/:id', deleteAdmin);

// --- Roles & Permissions -------------------------------------------------
router.get('/roles', getRoles);

// --- Granular Admin permissions (Super Admin only) ----------------------
// Assign / remove the individual permissions of an `admin` account. The router
// chain above already requires a super_admin, and the extra manage_admins
// permission check keeps the capability named in the permission matrix.
router.get(
  '/admins/:id/permissions',
  authorizePermission(PERMISSIONS.MANAGE_ADMINS),
  getAdminPermissions
);
router.put(
  '/admins/:id/permissions',
  authorizePermission(PERMISSIONS.MANAGE_ADMINS),
  updateAdminPermissions
);

// --- Audit Logs ----------------------------------------------------------
router.get('/audit-logs', getAuditLogs);

// --- Website Settings ----------------------------------------------------
router.get('/settings', getSettings);
router.put('/settings', updateSettings);

// --- Reports & Analytics -------------------------------------------------
router.get('/reports', getReports);

// --- Payments ------------------------------------------------------------
router.get('/payments', getPayments);

export default router;
