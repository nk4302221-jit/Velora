import express from 'express';

import {
  getCustomerDashboard,
  trackOrder,
  cancelOrder,
  requestReturn,
  getMyReturns,
  getPaymentHistory,
  submitReview,
  getMyReviews,
  getReviewableProducts,
} from '../controllers/customerController.js';

import { authenticate } from '../middleware/authMiddleware.js';
import { authorizeCustomer } from '../middleware/adminMiddleware.js';

const router = express.Router();

// ======================================================
// CUSTOMER SELF-SERVICE
//
// Chain: authenticate -> authorizeCustomer
// Staff accounts are rejected with 403 so an admin can never act as a shopper
// through these routes. Every handler further scopes by req.user.id.
// ======================================================
router.use(authenticate, authorizeCustomer);

router.get('/dashboard', getCustomerDashboard);

router.get('/orders/:id/tracking', trackOrder);
router.post('/orders/:id/cancel', cancelOrder);
router.post('/orders/:id/return', requestReturn);
router.get('/returns', getMyReturns);
router.get('/payments', getPaymentHistory);

router.post('/reviews', submitReview);
router.get('/reviews', getMyReviews);
router.get('/reviews/reviewable', getReviewableProducts);

export default router;
