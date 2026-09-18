import dotenv from 'dotenv';
import connectDB from '../app/database.js';
import app from '../app/main.js';

dotenv.config();

// Vercel serverless entry point.
// Connect to MongoDB without blocking cold start. Mongoose buffers
// model operations until the connection is established, so requests
// that arrive while connecting are handled once the DB is ready.
connectDB().catch((error) => {
  console.error('Database connection failed:', error.message);
});

export default app;