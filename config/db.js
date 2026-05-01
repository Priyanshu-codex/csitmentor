const mongoose = require('mongoose');

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 5000;

const connectDB = async (retries = MAX_RETRIES) => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error(`❌ MongoDB connection error: ${err.message}`);
    if (retries > 0) {
      console.log(`   Retrying in ${RETRY_DELAY_MS / 1000}s... (${retries} attempts left)`);
      setTimeout(() => {
        connectDB(retries - 1).catch((retryErr) => {
          console.error('   Retry failed:', retryErr.message);
        });
      }, RETRY_DELAY_MS);
    } else {
      console.error('   Max retries reached. Exiting.');
      process.exit(1);
    }
  }
};

module.exports = connectDB;
