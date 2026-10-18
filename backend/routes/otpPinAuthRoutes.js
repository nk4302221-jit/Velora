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
import { createRateLimiter } from '../middleware/rateLimiter.js';

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

// Cap the anonymous step-up endpoints (identifier lookup, OTP dispatch and the
// OTP/PIN verification attempts) per IP. The PIN/OTP controllers already count
// attempts per account; this stops a caller from spraying many accounts.
const otpPinLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  prefix: 'otp-pin',
  message: 'Too many attempts. Please wait a few minutes and try again.',
});

// --- Step 1: does this identifier belong to an account, and may it use OTP/PIN? ---
router.post('/identify', otpPinLimiter, identifyAccount);

// --- Step 2a: OTP (email or mobile) ---
router.post('/send-otp', otpPinLimiter, sendLoginOtp);
router.post('/verify-otp', otpPinLimiter, verifyLoginOtpCode);

// --- Step 2b: PIN (email or mobile) ---
router.post('/verify-pin', otpPinLimiter, verifyLoginPin);

// --- PIN lifecycle (authenticated) ---
router.get('/pin', authenticate, pinStatus);
router.put('/pin', authenticate, setLoginPin);
router.delete('/pin', authenticate, disableLoginPin);

export default router;
