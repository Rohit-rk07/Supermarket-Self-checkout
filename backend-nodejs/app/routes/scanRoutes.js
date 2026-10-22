import express from 'express';
import { getProductByBarcode } from '../controllers/productController.js';
import { authenticateJWT } from '../middleware/auth.js';

const router = express.Router();

router.get('/:barcode', authenticateJWT, getProductByBarcode);

export default router;
