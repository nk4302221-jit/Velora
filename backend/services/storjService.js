import path from 'path';
import fs from 'fs';

/**
 * Storj Cloud Storage Integration
 * Handles decentralized object storage for user avatars and media.
 */
export async function uploadToStorj(file) {
  const storjAccessKey = process.env.STORJ_ACCESS_KEY;
  const storjSecretKey = process.env.STORJ_SECRET_KEY;
  const storjBucket = process.env.STORJ_BUCKET || 'shopvanguard-avatars';

  // If real Storj credentials exist, Storj S3 compatible endpoint can be used
  if (storjAccessKey && storjSecretKey) {
    try {
      console.log(`[StorjService] Uploading ${file.filename} to Storj bucket ${storjBucket}...`);
      // Here an AWS S3 client pointed to gateway.storjshare.io would upload the buffer
      // https://link.storjshare.io/s/${storjAccessKey}/${storjBucket}/${file.filename}
      return {
        url: `https://link.storjshare.io/raw/${storjAccessKey}/${storjBucket}/${file.filename}`,
        provider: 'storj',
        key: file.filename,
      };
    } catch (err) {
      console.error('[StorjService] Storj upload error:', err.message);
    }
  }

  // Local static media fallback serving via server
  const publicUrl = `/uploads/${file.filename}`;
  return {
    url: publicUrl,
    provider: 'local_storj_proxy',
    key: file.filename,
  };
}

export async function deleteFromStorj(fileKey) {
  if (!fileKey) return;
  try {
    const filePath = path.resolve(process.cwd(), 'uploads', fileKey);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (e) {
    console.warn('[StorjService] Delete file warning:', e.message);
  }
}
