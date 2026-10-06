const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    customer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    service_details: {
      category: { type: String, required: true, trim: true },
      sub_category: { type: String, required: true, trim: true },
      service_name: { type: String, required: true, trim: true },
    },
    customer_address: {
      address_line1: { type: String, required: true, trim: true },
      address_line2: { type: String, trim: true, default: '' },
      landmark: { type: String, trim: true, default: '' },
      city: { type: String, trim: true, default: '' },
      state: { type: String, trim: true, default: '' },
      pincode: { type: String, required: true, trim: true },
    },
    status: {
      type: String,
      enum: ['BROADCASTED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
      default: 'BROADCASTED',
    },
    assigned_vendor_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      default: null,
    },
    assigned_at: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Booking', bookingSchema);