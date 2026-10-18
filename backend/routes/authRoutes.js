import express from 'express';
import { passport } from '../config/passport.js';
import {
  register,
  login,
  verifyEmail,
  getMe,
  resendVerification,
  forgotPassword,
  resetPassword,
  googleOAuthCallback,
  logout,
} from '../controllers/authController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { createRateLimiter } from '../middleware/rateLimiter.js';
import otpPinAuthRoutes from './otpPinAuthRoutes.js';

const router = express.Router();

function clientUrl() {
  return process.env.CLIENT_URL || 'http://localhost:5173';
}

// =====================================================
// RATE LIMITING FOR UNAUTHENTICATED AUTH ENDPOINTS
//
// Credential endpoints are the classic brute-force target. A per-IP cap keeps
// password guessing and OTP/email flooding impractical without adding a
// dependency or changing any response shape for legitimate users.
// =====================================================
const credentialLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  prefix: 'auth-cred',
  message: 'Too many attempts. Please wait a few minutes and try again.',
});

const recoveryLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  prefix: 'auth-recovery',
  message: 'Too many requests. Please wait a few minutes and try again.',
});

router.post('/register', credentialLimiter, register);

// The client sends a single `identifier` field that may hold an email address
// or a mobile number. Map it onto the `email` / `phone` fields the controller
// understands so the frontend does not have to guess which one it typed.
router.post('/login', credentialLimiter, (req, res, next) => {
  const { identifier, email, phone, password } = req.body || {};

  if (!email && !phone && identifier) {
    const value = String(identifier).trim();

    if (value.includes('@')) {
      req.body.email = value.toLowerCase();
    } else {
      req.body.phone = value;
    }
  }

  return login(req, res, next);
});
router.get('/verify-email/:token', verifyEmail);
router.post('/verify-email/:token', verifyEmail);
router.post('/verify-email', verifyEmail);
router.post('/resend-verification', recoveryLimiter, resendVerification);
router.post('/forgot-password', recoveryLimiter, forgotPassword);
router.post('/reset-password', recoveryLimiter, resetPassword);

// Google OAuth (server-side redirect flow through Vite proxy on port 5173)
router.get('/google', (req, res, next) => {
  if (!passport._strategies.google) {
    return res.redirect(`${clientUrl()}/login?error=google_not_configured`);
  }
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })(req, res, next);
});

router.get(
  '/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: `${clientUrl()}/login?error=google_auth_failed`,
  }),
  googleOAuthCallback
);

// Removed the previous POST /google and POST /facebook endpoints. They
// accepted client-supplied { provider, email, name } and minted a JWT for
// whatever identity was asserted, which is a full account-takeover vector
// (any caller could log in as any user by posting their email). The only
// social login path is the server-verified Google OAuth redirect flow above.

router.get('/me', authenticate, getMe);

// Logout is authenticated so the audit trail records a real principal instead
// of accepting anonymous writes. The client discards the JWT regardless of the
// response, so a failed call can never leave the user stuck in a session.
router.post('/logout', authenticate, logout);

// =====================================================
// OPTIONAL OTP / PIN SIGN-IN (added, not replaced)
// Mounted LAST so its /otp-pin/* paths sit after every existing route. Nothing
// above is touched: email+password, Google OAuth, email verification, resend,
// forgot/reset password, /me and /logout all behave exactly as they did.
// =====================================================
router.use('/otp-pin', otpPinAuthRoutes);

export default router;
