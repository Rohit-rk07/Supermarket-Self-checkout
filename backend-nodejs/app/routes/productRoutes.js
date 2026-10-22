import express from 'express';
import { 
  createProduct, 
  getAllProducts, 
  updateProduct, 
  deleteProduct 
} from '../controllers/productController.js';
import { validateRequest, productSchema } from '../middleware/validation.js';
import { importProducts, lookupBarcode } from '../controllers/productController.js';
import { authenticateJWT, authorize } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticateJWT, authorize('admin', 'staff'), getAllProducts);
// Suggest a name and category for a barcode from a public database (admin only)
router.get('/lookup/:barcode', authenticateJWT, authorize('admin'), lookupBarcode);
// Bulk import from a CSV (the admin page parses the file and sends the rows)
router.post('/import', authenticateJWT, authorize('admin'), importProducts);
router.post('/', authenticateJWT, authorize('admin'), validateRequest(productSchema), createProduct);
router.put('/:barcode', authenticateJWT, authorize('admin'), validateRequest(productSchema), updateProduct);
router.delete('/:barcode', authenticateJWT, authorize('admin'), deleteProduct);

export default router;
