import express from 'express';
import {
  getPlans,
  subscribePlan,
  confirmSubscriptionPayment,
  createRazorpayPlanOrder,
  verifyRazorpayPlanPayment,
  getMyMembership,
} from '../controllers/planController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', getPlans);
router.get('/my-status', authenticate, getMyMembership);
router.post('/:planId/subscribe', authenticate, subscribePlan);
router.post('/confirm-payment', authenticate, confirmSubscriptionPayment);
router.post('/:planId/razorpay/create-order', authenticate, createRazorpayPlanOrder);
router.post('/razorpay/verify-payment', authenticate, verifyRazorpayPlanPayment);

export default router;
