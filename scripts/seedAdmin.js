const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Admin = require('../models/Admin');

dotenv.config();

const seedAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected for Admin onboarding...');

    const adminData = {
      name: 'Super Admin',
      phone: '7777777777', // Change to your desired manual admin phone number
      email: 'admin@app.com',
      role: 'admin',
    };

    // Upsert: Updates if exists, creates if not
    const admin = await Admin.findOneAndUpdate(
      { phone: adminData.phone },
      adminData,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log('✅ Admin onboarded successfully:');
    console.log({
      id: admin._id,
      name: admin.name,
      phone: admin.phone,
      email: admin.email,
      role: admin.role,
    });

    process.exit(0);
  } catch (error) {
    console.error(`❌ Error onboarding admin: ${error.message}`);
    process.exit(1);
  }
};

seedAdmin();