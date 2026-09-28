import express from 'express';
import {
  identifyAccount,
  sendLoginOtp,
  verifyLoginOtpCode,
  verifyLoginPin,
  setLoginPin,
  disableLoginPin,
  pinStatus,
} from '../controllers/otpPinAuthController.js';
import { authenticate } from '../middleware/authMiddleware.js';

// =====================================================
// OPTIONAL OTP / PIN SIGN-IN ROUTES
//
// Mounted by routes/authRoutes.js at /api/auth, so every path below is
// effectively /api/auth/otp-pin/*.
//
// This router is fully self-contained: it shares only the existing
// `authenticate` middleware and nothing else with the existing auth router, and
// every path here is new, so no existing endpoint's matching or behaviour is
// affected.
//
// The three endpoints that act on a PIN use the existing `authenticate`
// middleware, which re-reads the user from the database and re-checks
// email_verified - i.e. the same rules that already guard every other
// authenticated call.
// =====================================================

const router = express.Router();

// --- Step 1: does this identifier belong to an account, and may it use OTP/PIN? ---
router.post('/identify', identifyAccount);

// --- Step 2a: OTP (email or mobile) ---
router.post('/send-otp', sendLoginOtp);
router.post('/verify-otp', verifyLoginOtpCode);

// --- Step 2b: PIN (email or mobile) ---
router.post('/verify-pin', verifyLoginPin);

// --- PIN lifecycle (authenticated) ---
router.get('/pin', authenticate, pinStatus);
router.put('/pin', authenticate, setLoginPin);
router.delete('/pin', authenticate, disableLoginPin);

export default router;
