import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    const DATABASE_URL = process.env.MONGODB_URI || "mongodb://localhost:27017/supermarket-checkout";
    await mongoose.connect(DATABASE_URL, {
      serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS) || 10000,
      maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE) || 10,
      minPoolSize: Number(process.env.MONGODB_MIN_POOL_SIZE) || 0
    });
    console.log(`🌐 Host: ${mongoose.connection.host}`);
    console.log(`🧭 DB:   ${mongoose.connection.name}`);
    console.log('✅ MongoDB Connected Successfully');
    console.log(`📊 Database: ${mongoose.connection.name}`);
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.log('💡 Make sure MongoDB is running on your system');
    console.log('💡 Try: mongod --dbpath C:\\data\\db');
    throw error;
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

export default connectDB;
