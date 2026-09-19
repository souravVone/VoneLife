const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  isPhoneVerified: { type: Boolean, default: false },
  status: { type: String, enum: ['active', 'pending_approval', 'blocked'], default: 'active' },
  businessName: { type: String, default: '' },
  businessAddress: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Vendor', vendorSchema);