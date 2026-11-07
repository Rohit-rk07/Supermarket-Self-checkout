import express from 'express';
import { getProductByBarcode } from '../controllers/productController.js';

const router = express.Router();

// Open to visitors: anyone can scan to fill a basket. Signing in is needed only to pay (the order routes check it).
router.get('/:barcode', getProductByBarcode);

export default router;
