import mongoose from 'mongoose';
import dns from 'dns';
import { fixLegacyUserIndexes } from './utils/fixIndexes.js';

let connectionRetries = 0;
const MAX_RETRIES = 5;
const RETRY_DELAY = 5000; // 5 seconds

// On Vercel every warm instance keeps its own connections, so a smaller pool keeps the total under Atlas's limit
const onVercel = Boolean(process.env.VERCEL);
let indexesChecked = false;

const connectDB = async () => {
  // A warm serverless instance already has a connection: reuse it
  if (mongoose.connection.readyState === 1) return true;
  // A new attempt after an earlier failure starts its count again
  connectionRetries = 0;

  // Optional: use specific DNS servers for the MongoDB Atlas SRV lookup.
  // Fixes "querySrv ECONNREFUSED" when the local resolver (e.g. 127.0.0.1) refuses SRV queries.
  // Set DNS_SERVERS=8.8.8.8,1.1.1.1 in .env. Read here because dotenv loads after imports.
  if (process.env.DNS_SERVERS) {
    dns.setServers(process.env.DNS_SERVERS.split(',').map(server => server.trim()).filter(Boolean));
  }

  const DATABASE_URL = process.env.MONGODB_URI || "mongodb://localhost:27017/supermarket-checkout";
  
  // Ensure database name is specified in connection string
  const DB_NAME = process.env.MONGODB_DB_NAME || "supermarket-checkout";
  
  while (connectionRetries < MAX_RETRIES) {
    try {
      console.log(`🔄 Attempting MongoDB connection (attempt ${connectionRetries + 1}/${MAX_RETRIES})`);
      console.log(`🎯 Target Database: ${DB_NAME}`);
      
      await mongoose.connect(DATABASE_URL, {
        dbName: DB_NAME, // Explicitly set database name
        // A serverless request must not wait long: fail fast on Vercel so the shopper sees an error, not a hang
        serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS) || (onVercel ? 8000 : 30000),
        maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE) || (onVercel ? 5 : 50),
        minPoolSize: Number(process.env.MONGODB_MIN_POOL_SIZE) || (onVercel ? 0 : 5),
        maxIdleTimeMS: 30000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 10000,
        retryWrites: true,
        retryReads: true
      });
      
      console.log(`🌐 Host: ${mongoose.connection.host}`);
      console.log(`🧭 DB:   ${mongoose.connection.name}`);
      console.log('✅ MongoDB Connected Successfully');
      console.log(`📊 Database: ${mongoose.connection.name}`);
      connectionRetries = 0; // Reset on success

      // Repair old unique-phone indexes left by the OTP version (once per instance; never blocks start-up)
      if (!indexesChecked) {
        indexesChecked = true;
        try {
          const dropped = await fixLegacyUserIndexes();
          if (dropped.length) console.log(`Fixed old user indexes: ${dropped.join(', ')}`);
        } catch (indexError) {
          console.error('Could not check user indexes:', indexError.message);
        }
      }
      return true;
    } catch (error) {
      connectionRetries++;
      console.error(`❌ Database connection attempt ${connectionRetries} failed:`, error.message);
      
      if (connectionRetries >= MAX_RETRIES) {
        console.error('❌ Max connection retries reached. Database connection failed.');
        console.log('💡 Make sure MongoDB is running on your system');
        console.log('💡 Try: mongod --dbpath C:\\data\\db');
        throw error;
      }
      
      console.log(`⏳ Retrying in ${RETRY_DELAY / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
    }
  }
};

// Handle connection events
mongoose.connection.on('connected', () => {
  console.log('🔗 Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('🔌 Mongoose disconnected');
});

// Graceful shutdown
mongoose.connection.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('🔌 Mongoose connection closed through app termination');
  process.exit(0);
});

export default connectDB;
