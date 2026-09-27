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
  getAuditLogs,
  getSettings,
  updateSettings,
  getReports,
  getPayments,
} from '../controllers/superAdminController.js';

import { authenticate } from '../middleware/authMiddleware.js';
import { authorizeSuperAdmin } from '../middleware/adminMiddleware.js';

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
