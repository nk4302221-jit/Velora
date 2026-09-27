import express from 'express';
import { passport } from '../config/passport.js';
import {
  register,
  login,
  verifyEmail,
  socialLogin,
  getMe,
  resendVerification,
  forgotPassword,
  resetPassword,
  googleOAuthCallback,
  logout,
} from '../controllers/authController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

function clientUrl() {
  return process.env.CLIENT_URL || 'http://localhost:5173';
}

router.post('/register', register);

// The client sends a single `identifier` field that may hold an email address
// or a mobile number. Map it onto the `email` / `phone` fields the controller
// understands so the frontend does not have to guess which one it typed.
router.post('/login', (req, res, next) => {
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
router.post('/resend-verification', resendVerification);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

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

// Backward-compatible endpoints kept for the existing social-login implementations.
router.post('/google', socialLogin);
router.post('/facebook', socialLogin);
router.get('/me', authenticate, getMe);

// Logout is authenticated so the audit trail records a real principal instead
// of accepting anonymous writes. The client discards the JWT regardless of the
// response, so a failed call can never leave the user stuck in a session.
router.post('/logout', authenticate, logout);

export default router;
