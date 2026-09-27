import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import {
  createPaymentOrder,
  verifyPayment,
  markPaymentFailed,
  getPaymentStatus,
} from '../controllers/paymentController.js';

const router = express.Router();

// All payment routes require an authenticated, email-verified user.
router.use(authenticate);

router.post('/create-order', createPaymentOrder);
router.post('/verify', verifyPayment);
router.post('/failure', markPaymentFailed);
router.get('/status/:orderId', getPaymentStatus);

export default router;