import { executeQuery } from '../config/db.js';
import { successResponse, errorResponse } from '../utils/responseHelper.js';

export async function getAddresses(req, res) {
  try {
    const userId = req.user.id;
    const addresses = await executeQuery(
      'SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC',
      [userId]
    );

    return successResponse(res, 'Addresses retrieved', { addresses });
  } catch (error) {
    console.error('GetAddresses Error:', error);
    return errorResponse(res, 'Failed to fetch addresses', 500);
  }
}

export async function addAddress(req, res) {
  try {
    const userId = req.user.id;
    const {
      fullName,
      phone,
      addressLine1,
      addressLine2,
      city,
      state,
      country = 'United States',
      postalCode,
      latitude,
      longitude,
      isDefault = false,
    } = req.body;

    if (!fullName || !phone || !addressLine1 || !city || !state || !postalCode) {
      return errorResponse(res, 'Please provide all required address fields', 400);
    }

    // If marked default, unset existing default addresses for this user
    if (isDefault) {
      await executeQuery('UPDATE addresses SET is_default = 0 WHERE user_id = ?', [userId]);
    }

    const insertResult = await executeQuery(
      `INSERT INTO addresses 
       (user_id, full_name, phone, address_line1, address_line2, city, state, country, postal_code, latitude, longitude, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        fullName.trim(),
        phone.trim(),
        addressLine1.trim(),
        addressLine2 ? addressLine2.trim() : null,
        city.trim(),
        state.trim(),
        country.trim(),
        postalCode.trim(),
        latitude ? Number(latitude) : null,
        longitude ? Number(longitude) : null,
        isDefault ? 1 : 0,
      ]
    );

    const newAddress = (await executeQuery('SELECT * FROM addresses WHERE id = ?', [insertResult.insertId]))[0];
    return successResponse(res, 'Delivery address added successfully', { address: newAddress }, 201);
  } catch (error) {
    console.error('AddAddress Error:', error);
    return errorResponse(res, 'Failed to add address', 500);
  }
}

export async function updateAddress(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const {
      fullName,
      phone,
      addressLine1,
      addressLine2,
      city,
      state,
      country,
      postalCode,
      latitude,
      longitude,
      isDefault,
    } = req.body;

    const existing = await executeQuery('SELECT * FROM addresses WHERE id = ? AND user_id = ?', [id, userId]);
    if (existing.length === 0) {
      return errorResponse(res, 'Address not found or permission denied', 404);
    }

    if (isDefault) {
      await executeQuery('UPDATE addresses SET is_default = 0 WHERE user_id = ?', [userId]);
    }

    await executeQuery(
      `UPDATE addresses SET
         full_name = COALESCE(?, full_name),
         phone = COALESCE(?, phone),
         address_line1 = COALESCE(?, address_line1),
         address_line2 = ?,
         city = COALESCE(?, city),
         state = COALESCE(?, state),
         country = COALESCE(?, country),
         postal_code = COALESCE(?, postal_code),
         latitude = ?,
         longitude = ?,
         is_default = COALESCE(?, is_default),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
      [
        fullName,
        phone,
        addressLine1,
        addressLine2 !== undefined ? addressLine2 : null,
        city,
        state,
        country,
        postalCode,
        latitude !== undefined ? Number(latitude) : null,
        longitude !== undefined ? Number(longitude) : null,
        isDefault !== undefined ? (isDefault ? 1 : 0) : null,
        id,
        userId,
      ]
    );

    const updated = (await executeQuery('SELECT * FROM addresses WHERE id = ?', [id]))[0];
    return successResponse(res, 'Address updated successfully', { address: updated });
  } catch (error) {
    console.error('UpdateAddress Error:', error);
    return errorResponse(res, 'Failed to update address', 500);
  }
}

export async function deleteAddress(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const existing = await executeQuery('SELECT * FROM addresses WHERE id = ? AND user_id = ?', [id, userId]);
    if (existing.length === 0) {
      return errorResponse(res, 'Address not found', 404);
    }

    await executeQuery('DELETE FROM addresses WHERE id = ? AND user_id = ?', [id, userId]);
    return successResponse(res, 'Address deleted successfully', { id });
  } catch (error) {
    console.error('DeleteAddress Error:', error);
    return errorResponse(res, 'Failed to delete address', 500);
  }
}

export async function setDefaultAddress(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const existing = await executeQuery('SELECT * FROM addresses WHERE id = ? AND user_id = ?', [id, userId]);
    if (existing.length === 0) {
      return errorResponse(res, 'Address not found', 404);
    }

    await executeQuery('UPDATE addresses SET is_default = 0 WHERE user_id = ?', [userId]);
    await executeQuery('UPDATE addresses SET is_default = 1 WHERE id = ? AND user_id = ?', [id, userId]);

    return successResponse(res, 'Default delivery address updated');
  } catch (error) {
    console.error('SetDefaultAddress Error:', error);
    return errorResponse(res, 'Failed to set default address', 500);
  }
}
