import { verifyToken } from '../utils/jwtHelper.js';
import { executeQuery } from '../config/db.js';
import { errorResponse } from '../utils/responseHelper.js';
import { normalizeRole } from '../utils/roleHelper.js';

// Routes that only establish WHO the caller is. They must never be
// blocked by the email-verification gate, otherwise a legitimate
// account can never hydrate its own session (which is what the
// frontend does on every page load via /api/auth/me).
const IDENTITY_ROUTES = [
  '/api/auth/me',
  '/api/plans/my-status',
];

/**
 * Authenticates the request from the `Authorization: Bearer <JWT>` header.
 *
 * The user row is ALWAYS re-read from the database, so `req.user.role`
 * is the live, authoritative role. Any `role` claim inside the JWT is
 * deliberately ignored - a forged or stale token can never escalate
 * privileges.
 */
export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.warn('[AdminAPI] authenticate 401 - missing/invalid Authorization header', {
        method: req.method,
        url: req.originalUrl,
      });

      return errorResponse(res, 'Authentication token missing or invalid format', 401);
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    if (!decoded || !decoded.id) {
      console.warn('[AdminAPI] authenticate 401 - invalid or expired token', {
        method: req.method,
        url: req.originalUrl,
      });

      return errorResponse(res, 'Token has expired or is invalid', 401);
    }

    const users = await executeQuery('SELECT * FROM users WHERE id = ?', [decoded.id]);
    if (!users || users.length === 0) {
      return errorResponse(res, 'User account no longer exists', 401);
    }

    const user = users[0];

    if (user.status !== 'active') {
      return errorResponse(res, `Account is ${user.status}. Please contact support.`, 403);
    }

    // =====================================================
    // REVOKED SESSION CHECK
    // A signed-out JWT stays cryptographically valid until it expires, so
    // logout records the token's `jti` in revoked_tokens. Rejecting it here is
    // what makes logout actually terminate the session rather than only
    // clearing the browser copy.
    // =====================================================
    if (decoded.jti) {
      const revoked = await executeQuery(
        'SELECT jti FROM revoked_tokens WHERE jti = ?',
        [decoded.jti]
      );

      if (revoked.length > 0) {
        console.warn('[Auth] authenticate 401 - session was revoked by logout', {
          userId: user.id,
          url: req.originalUrl,
        });

        return errorResponse(res, 'Session has been signed out. Please log in again.', 401);
      }
    }

    const isIdentityRoute = IDENTITY_ROUTES.some(
      (route) =>
        req.originalUrl === route ||
        req.originalUrl.startsWith(`${route}/`)
    );

    // Require email verification for protected features, but never for
    // the routes that bootstrap the session.
    if (!user.email_verified && !isIdentityRoute) {
      return errorResponse(res, 'Please verify your email address to access this feature.', 403);
    }

    // Expose the normalized role so downstream checks never have to
    // re-derive it (and never compare raw, un-normalized strings).
    req.user = {
      ...user,
      role: normalizeRole(user.role),
    };

    // Hand the verified token claims to the controller so /api/auth/logout can
    // revoke exactly this session.
    req.tokenClaims = {
      jti: decoded.jti || null,
      exp: decoded.exp || null,
    };

    next();
  } catch (error) {
    console.error('Auth Middleware Error:', error);
    return errorResponse(res, 'Authentication verification failed', 500);
  }
}
