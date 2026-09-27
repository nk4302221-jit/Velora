import { executeQuery } from '../config/db.js';
import { generateToken } from '../utils/jwtHelper.js';

/**
 * Handles Social Login for Google & Facebook with automatic account linking/merging.
 */
export async function handleSocialAuth({ provider, providerUserId, email, name, avatarUrl }) {
  if (!email || !provider || !providerUserId) {
    throw new Error('Email, provider, and provider user ID are required');
  }

  // 1. Check if user with this email already exists
  const existingUsers = await executeQuery('SELECT * FROM users WHERE email = ?', [email]);
  let user = existingUsers[0];

  if (user) {
    // Account exists! Merge social account if not already linked
    const existingSocial = await executeQuery(
      'SELECT * FROM social_accounts WHERE provider = ? AND provider_user_id = ?',
      [provider, providerUserId]
    );

    if (existingSocial.length === 0) {
      await executeQuery(
        'INSERT INTO social_accounts (user_id, provider, provider_user_id, email) VALUES (?, ?, ?, ?)',
        [user.id, provider, providerUserId, email]
      );
    }

    // Mark email as verified if logged in via verified OAuth provider
    if (!user.email_verified) {
      await executeQuery('UPDATE users SET email_verified = 1 WHERE id = ?', [user.id]);
      user.email_verified = 1;
    }

    // Optionally update avatar if not set
    if (!user.avatar_url && avatarUrl) {
      await executeQuery('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarUrl, user.id]);
      user.avatar_url = avatarUrl;
    }
  } else {
    // 2. New social user -> create account with email_verified = 1
    const insertResult = await executeQuery(
      `INSERT INTO users (full_name, email, password_hash, role, email_verified, avatar_url, status)
       VALUES (?, ?, NULL, 'customer', 1, ?, 'active')`,
      [name || email.split('@')[0], email, avatarUrl || null]
    );

    const userId = insertResult.insertId;

    // Link social account
    await executeQuery(
      'INSERT INTO social_accounts (user_id, provider, provider_user_id, email) VALUES (?, ?, ?, ?)',
      [userId, provider, providerUserId, email]
    );

    // Create cart & wishlist for user
    await executeQuery('INSERT INTO cart (user_id) VALUES (?)', [userId]);
    await executeQuery('INSERT INTO wishlist (user_id) VALUES (?)', [userId]);

    const createdUsers = await executeQuery('SELECT * FROM users WHERE id = ?', [userId]);
    user = createdUsers[0];
  }

  const token = generateToken({
    id: user.id,
    email: user.email,
    role: user.role,
  });

  return {
    token,
    user: {
      id: user.id,
      name: user.full_name,
      email: user.email,
      role: user.role,
      avatar_url: user.avatar_url,
      phone: user.phone,
      active_plan_id: user.active_plan_id,
      email_verified: Boolean(user.email_verified),
    },
  };
}
