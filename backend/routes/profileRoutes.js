import express from 'express';
import {
  getProfile,
  updateProfile,
  uploadProfilePicture,
  changePassword,
  downloadProfile,
} from '../controllers/profileController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { upload } from '../middleware/uploadMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/', getProfile);
router.put('/', updateProfile);
router.post('/image', upload.single('image'), uploadProfilePicture);
router.put('/password', changePassword);
router.get('/download', downloadProfile);

export default router;
