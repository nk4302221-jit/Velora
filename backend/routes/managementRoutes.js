import express from 'express';

import {
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getInventory,
  updateInventory,
  getCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  getOffers,
  createOffer,
  updateOffer,
  deleteOffer,
  getReviews,
  moderateReview,
  deleteReview,
  getReturnRequests,
  resolveReturnRequest,
} from '../controllers/managementController.js';

import { authenticate } from '../middleware/authMiddleware.js';
import { authorizeAdmin, authorizePermission } from '../middleware/adminMiddleware.js';
import { PERMISSIONS } from '../utils/roleHelper.js';

const router = express.Router();

// ======================================================
// STORE MANAGEMENT
//
// Chain: authenticate -> authorizeAdmin -> authorizePermission(<capability>)
//
// authorizeAdmin keeps customers out entirely; authorizePermission then
// enforces the exact capability from the backend permission matrix. Adding a
// route here without a permission guard is impossible by construction.
// ======================================================
router.use(authenticate, authorizeAdmin);

// --- Categories ----------------------------------------------------------
router.get('/categories', getAllCategories);
router.post('/categories', authorizePermission(PERMISSIONS.MANAGE_CATEGORIES), createCategory);
router.put('/categories/:id', authorizePermission(PERMISSIONS.MANAGE_CATEGORIES), updateCategory);
router.delete(
  '/categories/:id',
  authorizePermission(PERMISSIONS.MANAGE_CATEGORIES),
  deleteCategory
);

// --- Inventory -----------------------------------------------------------
router.get('/inventory', authorizePermission(PERMISSIONS.MANAGE_INVENTORY), getInventory);
router.patch(
  '/inventory/:id',
  authorizePermission(PERMISSIONS.MANAGE_INVENTORY),
  updateInventory
);

// --- Coupons -------------------------------------------------------------
router.get('/coupons', authorizePermission(PERMISSIONS.MANAGE_COUPONS), getCoupons);
router.post('/coupons', authorizePermission(PERMISSIONS.MANAGE_COUPONS), createCoupon);
router.put('/coupons/:id', authorizePermission(PERMISSIONS.MANAGE_COUPONS), updateCoupon);
router.delete('/coupons/:id', authorizePermission(PERMISSIONS.MANAGE_COUPONS), deleteCoupon);

// --- Offers --------------------------------------------------------------
router.get('/offers', authorizePermission(PERMISSIONS.MANAGE_OFFERS), getOffers);
router.post('/offers', authorizePermission(PERMISSIONS.MANAGE_OFFERS), createOffer);
router.put('/offers/:id', authorizePermission(PERMISSIONS.MANAGE_OFFERS), updateOffer);
router.delete('/offers/:id', authorizePermission(PERMISSIONS.MANAGE_OFFERS), deleteOffer);

// --- Reviews -------------------------------------------------------------
router.get('/reviews', authorizePermission(PERMISSIONS.MANAGE_REVIEWS), getReviews);
router.patch(
  '/reviews/:id',
  authorizePermission(PERMISSIONS.MANAGE_REVIEWS),
  moderateReview
);
router.delete(
  '/reviews/:id',
  authorizePermission(PERMISSIONS.MANAGE_REVIEWS),
  deleteReview
);

// --- Returns / Refunds ---------------------------------------------------
router.get('/returns', authorizePermission(PERMISSIONS.MANAGE_ORDERS), getReturnRequests);
router.patch(
  '/returns/:id',
  authorizePermission(PERMISSIONS.MANAGE_ORDERS),
  resolveReturnRequest
);

export default router;
