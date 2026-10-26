// models/Captain.js
const mongoose = require('mongoose');

const captainSchema = new mongoose.Schema(
  {
    vendor_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    id_details: {
      aadhar_number: {
        type: String,
        required: true,
        trim: true,
      },
      pan_number: {
        type: String,
        required: true,
        trim: true,
      },
    },
    documents: {
      aadhar_card_file: {
        type: String,
        required: true,
      },
      pan_card_file: {
        type: String,
        required: true,
      },
      selfie_file: {
        type: String,
        required: true,
      },
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'SUSPENDED', 'REMOVED'],
      default: 'ACTIVE',
    },
    otp: {
      type: String,
      default: null,
    },
    otp_expiry: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Captain', captainSchema);