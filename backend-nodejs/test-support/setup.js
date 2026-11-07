// Shared set-up for the integration tests.
// Safety: the tests only ever talk to a throwaway in-memory MongoDB. They never read MONGODB_URI
// from .env, so Rohit's real database and admin account are never touched.
import crypto from 'crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Set the environment BEFORE the app is imported (dotenv does not override values already set)
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/never-used';
process.env.RAZORPAY_KEY_ID = 'rzp_test_unit';
process.env.RAZORPAY_KEY_SECRET = 'test-razorpay-secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
process.env.ADMIN_EMAILS = 'boss@example.com';
process.env.LOG_TO_FILE = 'false';

// The app logs every request; keep the test report readable
for (const method of ['log', 'info', 'warn', 'error']) console[method] = () => {};

const { default: app } = await import('../app/main.js');
const { generateJWT } = await import('../app/middleware/auth.js');
const { setRazorpayClientFactory } = await import('../app/controllers/paymentController.js');
const { setGoogleVerifier } = await import('../app/controllers/authController.js');
const { default: User } = await import('../app/models/User.js');
const { default: Product } = await import('../app/models/Product.js');
const { default: Order } = await import('../app/models/Order.js');
const { default: Setting } = await import('../app/models/Setting.js');

export { User, Product, Order, Setting, setRazorpayClientFactory, setGoogleVerifier };

let mongod;
let server;
let baseUrl;
let phoneCounter = 0;

export const start = async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  // Belt and braces: refuse to run against anything that is not a local throwaway database
  if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/.test(uri)) throw new Error('Tests must use a local database');
  await mongoose.connect(uri, { dbName: 'test' });
  await Promise.all([User.init(), Product.init(), Order.init()]);

  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
};

export const stop = async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
};

export const clearData = async () => {
  await Promise.all([User.deleteMany({}), Product.deleteMany({}), Order.deleteMany({}), Setting.deleteMany({})]);
};

export const makeUser = async (role = 'customer') => {
  phoneCounter += 1;
  const user = await User.create({
    phoneNumber: `+1555555${String(1000 + phoneCounter)}`,
    email: `test${phoneCounter}@example.com`,
    googleId: `google-test-${phoneCounter}`,
    name: `TEST ${role} ${phoneCounter}`,
    role,
    isPhoneVerified: true
  });
  return { user, token: generateJWT(String(user._id)) };
};

let barcodeCounter = 0;
export const makeProduct = (fields = {}) => {
  barcodeCounter += 1;
  return Product.create({
    barcode: `99900000${String(barcodeCounter).padStart(4, '0')}`,
    name: `Test product ${barcodeCounter}`,
    price: 100,
    gstRate: 5,
    taxInclusive: true,
    ...fields
  });
};

// Small fetch wrapper: returns { status, body }
export const api = async (method, path, { token, body, headers = {}, rawBody } = {}) => {
  const res = await fetch(baseUrl + path, {
    method,
    headers: {
      ...(body !== undefined || rawBody !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: rawBody !== undefined ? rawBody : body !== undefined ? JSON.stringify(body) : undefined
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, body: json };
};

// What Razorpay's checkout hands the browser after a payment
export const paymentSignature = (razorpayOrderId, paymentId) =>
  crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${razorpayOrderId}|${paymentId}`).digest('hex');

export const webhookSignature = (rawBody) =>
  crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');

// Place a pending order for `token` and attach a fake Razorpay order id, like create-order does
export const placeOrder = async (token, items) => {
  const res = await api('POST', '/api/v1/orders', { token, body: { items } });
  if (res.status !== 201) throw new Error(`Could not place order: ${res.status} ${JSON.stringify(res.body)}`);
  const order = await Order.findById(res.body.data._id);
  order.razorpayOrderId = `order_${order.orderNumber}`;
  await order.save();
  return order;
};
