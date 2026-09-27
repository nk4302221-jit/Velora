import express from 'express';
import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getCategories,
} from '../controllers/productController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { authorizeAdmin, authorizePermission } from '../middleware/adminMiddleware.js';
import { PERMISSIONS } from '../utils/roleHelper.js';

const router = express.Router();

router.get('/', getProducts);
router.get('/categories', getCategories);
router.get('/:id', getProductById);

// =====================================================
// Admin-only product management
//
// The permission guard is applied here as well as authorizeAdmin so the
// capability check always comes from the shared matrix in roleHelper.js rather
// than being implied by the route. A role that somehow lost MANAGE_PRODUCTS
// would be rejected here.
// =====================================================
const requireManageProducts = [
  authenticate,
  authorizeAdmin,
  authorizePermission(PERMISSIONS.MANAGE_PRODUCTS),
];

router.post('/', ...requireManageProducts, createProduct);
router.put('/:id', ...requireManageProducts, updateProduct);
router.delete('/:id', ...requireManageProducts, deleteProduct);

export default router;
