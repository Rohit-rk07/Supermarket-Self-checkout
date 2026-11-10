import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from '../app/database.js';
import app from '../app/main.js';

dotenv.config();

// Vercel serverless entry point.
// Every request first makes sure this instance has a database connection. A warm instance already
// has one (so this costs nothing); a fresh one connects once, and requests that arrive meanwhile wait for it.
// If the connection fails, the next request tries again instead of staying broken.
let connecting = null;
const ensureDatabase = () => {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  if (!connecting) {
    connecting = connectDB().finally(() => {
      connecting = null;
    });
  }
  return connecting;
};

export default async function handler(req, res) {
  try {
    await ensureDatabase();
  } catch (error) {
    console.error('Database connection failed:', error.message);
    return res.status(503).json({ success: false, message: 'The shop is waking up. Please try again in a moment.' });
  }
  return app(req, res);
}
