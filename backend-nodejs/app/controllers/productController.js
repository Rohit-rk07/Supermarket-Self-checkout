import Product from '../models/Product.js';
import { taxFor } from '../utils/pricing.js';
import { productSchema } from '../middleware/validation.js';
import logger from '../utils/logger.js';
import { recordAudit } from '../utils/audit.js';

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

    // Stock only matters for products the shop tracks; those cannot be scanned once they run out
    if (product.trackStock === true && (product.stock ?? 0) <= 0) {
      return res.status(409).json({
        success: false,
        error: `${product.name} is out of stock`,
        details: `${product.name} (${barcode}) has no stock left`,
        timestamp: new Date().toISOString()
      });
    }
    res.json({
      success: true,
      data: {
        name: product.name,
        price: product.price,
        barcode: product.barcode,
        gstRate: taxFor(product).rate,
        taxInclusive: taxFor(product).inclusive,
        trackStock: product.trackStock === true,
        category: product.category
        // The stock count is not sent: scanning is open to visitors, and only the shop should see how much is left
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
    const { barcode, name, price, category, stock, gstRate, taxInclusive, trackStock } = req.body;
    
    logger.dbLog('CREATE', 'products', { barcode, name });
    const existing = await Product.findOne({ barcode });
    if (existing && existing.isActive) {
      return res.status(409).json({
        success: false,
        error: 'Product already exists',
        details: `A product with barcode ${barcode} already exists`,
        timestamp: new Date().toISOString()
      });
    }

    // A previously deleted product with this barcode is brought back with the new details
    const details = { name, price, isActive: true };
    if (category !== undefined) details.category = category;
    if (stock !== undefined) details.stock = stock;
    // New products default to a tax-inclusive 5% price (usual for packaged food); admins set the right rate
    details.gstRate = gstRate !== undefined ? gstRate : 5;
    details.taxInclusive = taxInclusive !== undefined ? taxInclusive : true;
    details.trackStock = trackStock === true;
    const product = existing || new Product({ barcode });
    product.set(details);
    await product.save();
    
    logger.info('Product created', { barcode, name });
    await recordAudit(req, 'product.create', `Added ${name} (${barcode}) at ${price}`, { type: 'product', id: barcode });
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
    // lowStock=true lists tracked products that are nearly out
    if (req.query.lowStock === 'true') {
      activeProductsQuery.trackStock = true;
      activeProductsQuery.stock = { $lte: LOW_STOCK_LEVEL };
    }
    const [products, total] = await Promise.all([
      Product.find(activeProductsQuery)
        .select('barcode name price category stock trackStock gstRate taxInclusive createdAt')
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
    const before = await Product.findOne({ barcode }).select('price gstRate trackStock').lean();
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
    const changes = [];
    if (before && updates.price !== undefined && before.price !== product.price) changes.push(`price ${before.price} to ${product.price}`);
    if (before && updates.gstRate !== undefined && before.gstRate !== product.gstRate) changes.push(`GST ${before.gstRate ?? 'old default'} to ${product.gstRate}%`);
    await recordAudit(req, changes.length ? 'product.price' : 'product.update',
      `Edited ${product.name} (${barcode})${changes.length ? `: ${changes.join(', ')}` : ''}`, { type: 'product', id: barcode });
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

// Import many products at once (CSV upload from the admin page).
// Every row is validated like a single product. Valid rows are added or updated by barcode;
// invalid rows are skipped and reported back, so one bad row never blocks the rest.
const MAX_IMPORT_ROWS = 500;

// Tracked products at or below this many units show up in the low-stock list
const LOW_STOCK_LEVEL = 5;

// A new product from a file that has no tax columns gets the same defaults as the Add form
const insertDefaults = (details) => {
  const defaults = {};
  if (details.gstRate === undefined) defaults.gstRate = 5;
  if (details.taxInclusive === undefined) defaults.taxInclusive = true;
  return Object.keys(defaults).length > 0 ? { $setOnInsert: defaults } : {};
};

export const importProducts = async (req, res, next) => {
  try {
    const rows = req.body?.products;

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Send a non-empty products array' });
    }
    if (rows.length > MAX_IMPORT_ROWS) {
      return res.status(400).json({ success: false, message: `Import at most ${MAX_IMPORT_ROWS} products at a time` });
    }

    const errors = [];
    const valid = [];
    const seen = new Set();

    rows.forEach((row, index) => {
      const rowNumber = index + 2; // spreadsheet row number: the header is row 1
      const { error, value } = productSchema.validate(row, { stripUnknown: true });

      if (error) {
        errors.push({ row: rowNumber, barcode: row?.barcode, message: error.details[0].message });
        return;
      }
      if (seen.has(value.barcode)) {
        errors.push({ row: rowNumber, barcode: value.barcode, message: 'Duplicate barcode in this file' });
        return;
      }

      seen.add(value.barcode);
      valid.push(value);
    });

    let created = 0;
    let updated = 0;

    if (valid.length > 0) {
      logger.dbLog('IMPORT', 'products', { count: valid.length });
      const result = await Product.bulkWrite(
        valid.map(({ barcode, ...details }) => ({
          updateOne: {
            filter: { barcode },
            update: { $set: { ...details, isActive: true }, ...insertDefaults(details) },
            upsert: true
          }
        }))
      );
      created = result.upsertedCount;
      updated = result.matchedCount;
    }

    logger.info('Products imported', { created, updated, failed: errors.length });
    await recordAudit(req, 'product.import', `Imported products: ${created} added, ${updated} updated, ${errors.length} skipped`, { type: 'product' });
    res.json({
      success: true,
      message: `${created} added, ${updated} updated, ${errors.length} skipped`,
      data: { created, updated, failed: errors.length, errors },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

// Suggest a name and category for a barcode from Open Food Facts (a free public food-product database).
// It never has the store's price, so the admin still enters that. Only the barcode leaves our server.
export const lookupBarcode = async (req, res, next) => {
  try {
    const { barcode } = req.params;

    if (!/^\d{8,14}$/.test(barcode)) {
      return res.status(400).json({ success: false, message: 'Enter the 8 to 14 digit barcode' });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    let response;

    try {
      response = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,brands,categories_tags`,
        { signal: controller.signal, headers: { 'User-Agent': 'SmartCheckout/1.0 (self-checkout demo)' } }
      );
    } catch (fetchError) {
      logger.warn('Barcode lookup unreachable', { barcode, error: fetchError.message });
      return res.status(502).json({ success: false, message: 'The public product database is not reachable right now' });
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 500) {
      return res.status(502).json({ success: false, message: 'The public product database is not reachable right now' });
    }

    const body = response.ok || response.status === 404 ? await response.json().catch(() => null) : null;
    const found = body && body.status === 1 && body.product && body.product.product_name;

    if (!found) {
      return res.status(404).json({ success: false, message: 'Not found in the public product database. Enter the details by hand.' });
    }

    // categories_tags run from general to specific (for example en:chocolate-spreads); use the most specific
    const lastTag = (body.product.categories_tags || []).slice(-1)[0] || '';
    const category = lastTag.replace(/^[a-z]{2}:/, '').replace(/-/g, ' ').trim();

    res.json({
      success: true,
      data: {
        name: String(body.product.product_name).trim().slice(0, 100),
        brand: (body.product.brands || '').split(',')[0].trim(),
        category: category ? category.charAt(0).toUpperCase() + category.slice(1, 50) : ''
      },
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
    await recordAudit(req, 'product.delete', `Deleted ${product.name} (${barcode})`, { type: 'product', id: barcode });
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
