/**
 * scripts/seed.js
 * Run once to bootstrap your first admin account.
 *
 * Usage:
 *   node scripts/seed.js
 *   (or: npm run seed)
 *
 * It will:
 *   1. Connect to MongoDB (reads MONGO_URI from .env)
 *   2. Create the admin user if the email doesn't already exist
 *   3. Exit cleanly
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const User     = require('../models/User');

// ── Seed data — change these before running ──────────────────────────────────
const SEED_ADMIN = {
  name:     'System Administrator',
  email:    'admin@csit.edu.in',
  password: 'Admin@2024',        // Will be hashed by the User pre-save hook
  role:     'admin',
};

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const existing = await User.findOne({ email: SEED_ADMIN.email });
    if (existing) {
      console.log(`ℹ️  Admin already exists: ${existing.email}`);
      console.log('   No changes made.');
      return;
    }

    const user = await User.create(SEED_ADMIN);
    console.log('🎉 Admin user created successfully!');
    console.log(`   Name:  ${user.name}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Role:  ${user.role}`);
    console.log('\n⚠️  IMPORTANT: Change the default password after first login.');
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB.');
  }
}

seed();
