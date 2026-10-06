const mongoose = require('mongoose');

const serviceOfferedSchema = new mongoose.Schema({
  category: { type: String, required: true, trim: true },
  sub_category: { type: String, required: true, trim: true },
  service_name: { type: String, required: true, trim: true },
}, { _id: false });

const vendorSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  isPhoneVerified: { type: Boolean, default: false },
  status: { type: String, enum: ['active', 'blocked'], default: 'active' },

  // KYC Fields
  kyc_status: {
    type: String,
    enum: ['NOT_SUBMITTED', 'PENDING_VERIFICATION', 'APPROVED', 'REJECTED'],
    default: 'NOT_SUBMITTED',
  },
  kyc_remarks: {
    type: String,
    default: '',
    trim: true,
  },
  services_offered: [serviceOfferedSchema],

  kyc_details: {
    fullNameGovtId: { type: String, trim: true },
    aadharCardNumber: { type: String, trim: true },
    panCardNumber: { type: String, trim: true },
    gender: { type: String, enum: ['male', 'female', 'other'] },
    permanentAddress: { type: String, trim: true },
    pincode: { type: String, trim: true },
    documents: {
      aadharFront: { type: String }, // Path/URL
      aadharBack: { type: String },  // Path/URL
      voterId: { type: String },
      panCard: { type: String },
      addressProof: { type: String }, // Electricity or gas bill
      statutoryAnnexures: { type: String }, // Optional field
    },
    submittedAt: { type: Date },
  }
}, { timestamps: true });

module.exports = mongoose.model('Vendor', vendorSchema);