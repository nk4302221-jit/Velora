import express from 'express';
import {
  createOrder,
  createCheckoutSessionHandler,
  confirmOrderPayment,
  createRazorpayOrderHandler,
  verifyRazorpayPaymentHandler,
  getUserOrders,
  getOrderById,
} from '../controllers/orderController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/', getUserOrders);
router.post('/', createOrder);
router.get('/:id', getOrderById);
router.post('/create-checkout-session', createCheckoutSessionHandler);
router.post('/:id/confirm-payment', confirmOrderPayment);
router.post('/razorpay/create-order', createRazorpayOrderHandler);
router.post('/razorpay/verify-payment', verifyRazorpayPaymentHandler);

export default router;
