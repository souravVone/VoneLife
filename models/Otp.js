const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  phone: { type: String, required: true, index: true },
  otpHash: { type: String, required: true },
  role: { type: String, enum: ['customer', 'vendor', 'admin', 'registration'], required: true },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 300, // Expires automatically after 5 minutes
  }
});

module.exports = mongoose.model('Otp', otpSchema);