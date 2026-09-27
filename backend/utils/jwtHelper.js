import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_for_ecommerce_app_2026_xyz';
const JWT_EXPIRES_IN = '7d';

/**
 * Issues a JWT carrying a unique `jti` (token id).
 *
 * The `jti` is what makes logout actually revoke a session: /api/auth/logout
 * writes it into `revoked_tokens` and `authenticate` rejects any request whose
 * `jti` is listed there. Without it a stateless JWT stays valid for its full
 * 7-day lifetime even after the user signs out.
 *
 * `role` is included only so the client has something to read; the API always
 * re-reads the role from the database and never trusts this claim.
 */
export function generateToken(payload) {
  const jti = crypto.randomUUID();

  const body = { ...payload, jti };

  const token = jwt.sign(body, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

  return token;
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}
