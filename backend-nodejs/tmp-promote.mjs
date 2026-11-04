import dotenv from 'dotenv'; import dns from 'dns'; import mongoose from 'mongoose'; import User from './app/models/User.js';
dotenv.config(); if (process.env.DNS_SERVERS) dns.setServers(process.env.DNS_SERVERS.split(',').map(s => s.trim()));
await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME || 'supermarket-checkout' });
const r = await User.updateOne({ phoneNumber: process.argv[2], name: /^TEST/ }, { $set: { role: process.argv[3] || 'admin' } });
console.log('promoted test account: ' + r.modifiedCount);
await mongoose.disconnect();
