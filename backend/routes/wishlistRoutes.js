import express from 'express';
import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  moveToCart,
} from '../controllers/wishlistController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/', getWishlist);
router.post('/', addToWishlist);
router.delete('/:productId', removeFromWishlist);
router.post('/:productId/move-to-cart', moveToCart);

export default router;
