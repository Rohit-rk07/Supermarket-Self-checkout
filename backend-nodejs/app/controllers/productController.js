import Product from '../models/Product.js';
import logger from '../utils/logger.js';

// Get product by barcode
export const getProductByBarcode = async (req, res, next) => {
  try {
    const { barcode } = req.params;
    
    logger.dbLog('FIND', 'products', { barcode });
    const product = await Product.findOne({ barcode, isActive: true }).lean();
    
    if (!product) {
      logger.warn('Product not found', { barcode });
      return res.status(404).json({ 
        success: false,
        error: 'Product not found',
        details: `No product found with barcode: ${barcode}`,
        timestamp: new Date().toISOString()
      });
    }
    
    logger.info('Product found', { barcode, productName: product.name });
    res.json({
      success: true,
      data: {
        name: product.name,
        price: product.price,
        barcode: product.barcode,
        category: product.category,
        stock: product.stock
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

// Create new product
export const createProduct = async (req, res, next) => {
  try {
    const { barcode, name, price, category, stock } = req.body;
    
    logger.dbLog('CREATE', 'products', { barcode, name });
    const product = new Product({ barcode, name, price, category, stock });
    await product.save();
    
    logger.info('Product created', { barcode, name });
    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: {
        barcode: product.barcode,
        name: product.name,
        price: product.price,
        category: product.category,
        stock: product.stock
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

// Get all products
export const getAllProducts = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    logger.dbLog('FIND_ALL', 'products', { page, limit });
    const activeProductsQuery = { isActive: true };
    const [products, total] = await Promise.all([
      Product.find(activeProductsQuery)
        .select('barcode name price category stock createdAt')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .lean(),
      Product.countDocuments(activeProductsQuery)
    ]);
    
    logger.info('Products retrieved', { count: products.length, total });
    res.json({
      success: true,
      data: {
        products,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

// Update product
export const updateProduct = async (req, res, next) => {
  try {
    const { barcode } = req.params;
    const updates = req.body;
    
    logger.dbLog('UPDATE', 'products', { barcode, updates });
    const product = await Product.findOneAndUpdate(
      { barcode },
      updates,
      { new: true, runValidators: true }
    );
    
    if (!product) {
      logger.warn('Product not found for update', { barcode });
      return res.status(404).json({
        success: false,
        error: 'Product not found',
        details: `No product found with barcode: ${barcode}`,
        timestamp: new Date().toISOString()
      });
    }
    
    logger.info('Product updated', { barcode, name: product.name });
    res.json({
      success: true,
      message: 'Product updated successfully',
      data: product,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

// Delete product
export const deleteProduct = async (req, res, next) => {
  try {
    const { barcode } = req.params;
    
    logger.dbLog('DELETE', 'products', { barcode });
    const product = await Product.findOneAndUpdate(
      { barcode },
      { isActive: false },
      { new: true }
    );
    
    if (!product) {
      logger.warn('Product not found for deletion', { barcode });
      return res.status(404).json({
        success: false,
        error: 'Product not found',
        details: `No product found with barcode: ${barcode}`,
        timestamp: new Date().toISOString()
      });
    }
    
    logger.info('Product soft deleted', { barcode, name: product.name });
    res.json({
      success: true,
      message: 'Product deleted successfully',
      data: product,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};
