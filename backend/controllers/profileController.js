import { executeQuery } from '../config/db.js';
import bcrypt from 'bcryptjs';
import { successResponse, errorResponse } from '../utils/responseHelper.js';
import { uploadToStorj, deleteFromStorj } from '../services/storjService.js';

export async function getProfile(req, res) {
  try {
    const userId = req.user.id;

    // Get user details
    const users = await executeQuery('SELECT * FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      return errorResponse(res, 'User not found', 404);
    }
    const user = users[0];

    // Get active membership details
    const subs = await executeQuery(
      `SELECT s.*, p.name as plan_name, p.duration_hours
       FROM subscriptions s
       JOIN plans p ON p.id = s.plan_id
       WHERE s.user_id = ? AND s.status = 'active'
       ORDER BY s.created_at DESC LIMIT 1`,
      [userId]
    );
    const membership = subs.length > 0 ? subs[0] : null;

    // Get default address
    const addresses = await executeQuery(
      'SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC LIMIT 1',
      [userId]
    );
    const address = addresses.length > 0 ? addresses[0] : null;

    // Order statistics
    const statsResult = await executeQuery(
      `SELECT COUNT(*) as total_orders, 
              COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN total_amount ELSE 0 END), 0) as total_spent,
              COALESCE(SUM(CASE WHEN order_status = 'delivered' THEN 1 ELSE 0 END), 0) as delivered_orders,
              COALESCE(SUM(CASE WHEN order_status = 'pending' OR order_status = 'processing' THEN 1 ELSE 0 END), 0) as pending_orders
       FROM orders WHERE user_id = ?`,
      [userId]
    );
    const stats = statsResult[0];

    return successResponse(res, 'Profile retrieved', {
      user: {
        id: user.id,
        name: user.full_name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        avatar_url: user.avatar_url,
        email_verified: Boolean(user.email_verified),
        status: user.status,
        created_at: user.created_at,
      },
      membership,
      address,
      orderStats: stats,
    });
  } catch (error) {
    console.error('GetProfile Error:', error);
    return errorResponse(res, 'Failed to fetch user profile', 500);
  }
}

export async function updateProfile(req, res) {
  try {
    const userId = req.user.id;
    const { name, phone } = req.body;

    if (!name || !name.trim()) {
      return errorResponse(res, 'Full name cannot be blank', 400);
    }

    await executeQuery(
      'UPDATE users SET full_name = ?, phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name.trim(), phone ? phone.trim() : null, userId]
    );

    const updated = (await executeQuery('SELECT * FROM users WHERE id = ?', [userId]))[0];

    return successResponse(res, 'Profile updated successfully', {
      user: {
        id: updated.id,
        name: updated.full_name,
        email: updated.email,
        phone: updated.phone,
        role: updated.role,
        avatar_url: updated.avatar_url,
      },
    });
  } catch (error) {
    console.error('UpdateProfile Error:', error);
    return errorResponse(res, 'Failed to update profile', 500);
  }
}

export async function uploadProfilePicture(req, res) {
  try {
    const userId = req.user.id;

    if (!req.file) {
      return errorResponse(res, 'No image file uploaded or file format invalid', 400);
    }

    // Upload to Storj decentralized cloud storage (with local static proxy fallback)
    const storjResult = await uploadToStorj(req.file);

    // Get old avatar to cleanup if needed
    const users = await executeQuery('SELECT avatar_url FROM users WHERE id = ?', [userId]);
    const oldAvatar = users[0]?.avatar_url;

    // Update avatar URL in MySQL database
    await executeQuery(
      'UPDATE users SET avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [storjResult.url, userId]
    );

    return successResponse(res, 'Profile picture uploaded successfully to Storj cloud storage', {
      avatarUrl: storjResult.url,
      provider: storjResult.provider,
    });
  } catch (error) {
    console.error('UploadProfilePicture Error:', error);
    return errorResponse(res, 'Failed to upload profile picture', 500);
  }
}

export async function changePassword(req, res) {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return errorResponse(res, 'Current and new password are required', 400);
    }

    if (newPassword.length < 6) {
      return errorResponse(res, 'New password must be at least 6 characters long', 400);
    }

    const users = await executeQuery('SELECT password_hash FROM users WHERE id = ?', [userId]);
    const user = users[0];
    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    // Social-only accounts have no password set; require an OAuth re-login instead.
    if (!user.password_hash) {
      return errorResponse(res, 'This account was created with social login and has no password. Please sign in with Google or Facebook.', 400);
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      return errorResponse(res, 'Current password is incorrect', 400);
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);
    await executeQuery(
      'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [passwordHash, userId]
    );

    return successResponse(res, 'Password changed successfully');
  } catch (error) {
    console.error('ChangePassword Error:', error);
    return errorResponse(res, 'Failed to change password', 500);
  }
}

export async function downloadProfile(req, res) {
  try {
    const userId = req.user.id;

    const users = await executeQuery('SELECT * FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      return errorResponse(res, 'User not found', 404);
    }
    const user = users[0];

    const addresses = await executeQuery('SELECT * FROM addresses WHERE user_id = ?', [userId]);
    const subs = await executeQuery(
      `SELECT s.*, p.name as plan_name, p.price, p.duration_hours
       FROM subscriptions s
       JOIN plans p ON p.id = s.plan_id
       WHERE s.user_id = ?`,
      [userId]
    );
    const orders = await executeQuery('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC', [userId]);

    const profileData = {
      export_title: 'Velora User Profile & Data Record',
      exported_at: new Date().toISOString(),
      account_summary: {
        id: user.id,
        name: user.full_name,
        email: user.email,
        phone: user.phone || 'N/A',
        role: user.role,
        account_status: user.status,
        email_verified: Boolean(user.email_verified),
        account_created_at: user.created_at,
        avatar_url: user.avatar_url || 'None',
      },
      membership_info: subs.length > 0 ? subs[0] : 'No active membership',
      delivery_addresses: addresses,
      order_history: orders,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="shopvanguard-profile-${user.id}.json"`);
    return res.status(200).send(JSON.stringify(profileData, null, 2));
  } catch (error) {
    console.error('DownloadProfile Error:', error);
    return errorResponse(res, 'Failed to download profile', 500);
  }
}
