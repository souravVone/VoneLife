const mongoose = require('mongoose');

const serviceOfferedSchema = new mongoose.Schema({
  category: { type: String, required: true, trim: true },
  sub_category: { type: String, required: true, trim: true },
  service_name: { type: String, required: true, trim: true },
  is_active: { type: Boolean, default: true },
}, { _id: false });

const vendorSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  isPhoneVerified: { type: Boolean, default: false },
  status: { type: String, enum: ['active', 'blocked'], default: 'active' },

  block_reason: {
    type: String,
    default: '',
  },
  blocked_at: {
    type: Date,
    default: null,
  },

  // Inside models/Vendor.js - add to vendorSchema:
  ratings_summary: {
    average_rating: { type: Number, default: 0 },
    total_reviews: { type: Number, default: 0 },
  },

  // Discriminator flag
  entity_type: {
    type: String,
    enum: ['INDIVIDUAL', 'COMPANY'],
    default: 'INDIVIDUAL',
  },

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
    city: { type: String, trim: true },
    documents: {
      aadharFront: { type: String }, // Path/URL
      aadharBack: { type: String },  // Path/URL
      voterId: { type: String },
      panCard: { type: String },
      addressProof: { type: String }, // Electricity or gas bill
      statutoryAnnexures: { type: String }, // Optional field
    },
    submittedAt: { type: Date },
  },
  // Track B: Corporate / Agency Vendor
  company_details: {
    company_name: { type: String, trim: true },
    business_type: {
      type: String,
      enum: ['PROPRIETORSHIP', 'PARTNERSHIP', 'LLP', 'PVT_LTD', 'OTHER'],
    },
    company_pan: { type: String, trim: true },
    gstin: { type: String, trim: true, default: '' },
    udyam_registration: { type: String, trim: true, default: '' },
    trade_license_number: { type: String, trim: true, default: '' },

    representative: {
      name: { type: String, trim: true },
      designation: { type: String, trim: true },
      phone: { type: String, trim: true },
      email: { type: String, trim: true },
    },

    address: {
      address_line1: { type: String, trim: true },
      address_line2: { type: String, trim: true, default: '' },
      city: { type: String, trim: true },
      state: { type: String, trim: true, default: '' },
      pincode: { type: String, trim: true },
    },

    documents: {
      incorporation_proof: { type: String },
      company_pan_file: { type: String },
      business_address_proof: { type: String },
      authorization_letter: { type: String },
      gst_certificate: { type: String, default: null },
      msme_certificate: { type: String, default: null },
      trade_license_file: { type: String, default: null },
    },
    submittedAt: { type: Date },
  },
  // Corporate Bank Account Details
  bank_details: {
    account_holder_name: { type: String, trim: true },
    bank_name: { type: String, trim: true },
    branch_name: { type: String, trim: true },
    account_number: { type: String, trim: true },
    ifsc_code: { type: String, trim: true },
    cancelled_cheque_file: { type: String },
  },
}, { timestamps: true });

module.exports = mongoose.model('Vendor', vendorSchema);