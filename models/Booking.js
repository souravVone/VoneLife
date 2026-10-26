const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
    {
        customer_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        services: {
            type: [
                {
                    category: { type: String, required: true, trim: true },
                    sub_category: { type: String, required: true, trim: true },
                    service_name: { type: String, required: true, trim: true },
                },
            ],
            validate: {
                validator: function (v) {
                    return Array.isArray(v) && v.length >= 1 && v.length <= 3;
                },
                message: 'A booking must have between 1 and 3 services.',
            },
            required: true,
        },
        customer_address: {
            address_line1: { type: String, required: true, trim: true },
            address_line2: { type: String, trim: true, default: '' },
            landmark: { type: String, trim: true, default: '' },
            state: { type: String, trim: true, default: '' },
            pincode: { type: String, required: true, trim: true },
            city: { type: String, required: true, trim: true },
        },
        booking_type: {
            type: String,
            enum: ['INSTANT', 'SCHEDULED'],
            default: 'INSTANT',
        },
        schedule: {
            booking_date_string: { type: String, required: true }, // Format: "YYYY-MM-DD"
            slot_id: { type: String, required: true },            // e.g. "SLOT_1"
            start_time: { type: String, required: true },         // "07:00"
            end_time: { type: String, required: true },           // "09:00"
            slot_label: { type: String, required: true },         // "07:00 AM - 09:00 AM"
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
        assigned_captain_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Captain',
            default: null,
            index: true,
        },
        accepted_by_role: {
            type: String,
            enum: ['INDIVIDUAL_VENDOR', 'CAPTAIN'],
            default: null,
        },
        assigned_at: {
            type: Date,
            default: null,
        },
        // Add/verify inside the Booking schema in models/Booking.js:
        completion_otp: {
            type: String,
            default: null,
        },
        pricing: {
            total_amount: {
                type: Number,
                required: true,
                default: 0,
            },
            payment_mode: {
                type: String,
                enum: ['ONLINE', 'COD', 'PAY_AFTER_SERVICE'],
                default: 'PAY_AFTER_SERVICE',
            },
            payment_status: {
                type: String,
                enum: ['PENDING', 'PAID', 'FAILED'],
                default: 'PENDING',
            },
        },

        // Add inside the Booking schema in models/Booking.js:
        live_tracking: {
            is_active: {
                type: Boolean,
                default: false,
            },
            current_lat: {
                type: Number,
                default: null,
            },
            current_lng: {
                type: Number,
                default: null,
            },
            heading: {
                type: Number,
                default: null, // Compass angle in degrees (0 - 360) for map marker orientation
            },
            last_updated_at: {
                type: Date,
                default: null,
            },
        },
        // Verification and Doorstep Timestamps
        start_otp: { type: String, default: null }, // Only visible to customer
        completion_otp: { type: String, default: null }, // Only visible to customer
        otp_generated_at: { type: Date, default: null },
        arrived_at: { type: Date, default: null },
        service_started_at: { type: Date, default: null },
        service_completed_at: { type: Date, default: null },

        // Cancellation Details
        cancellation: {
            cancelled_by: { type: String, enum: ['CUSTOMER', 'VENDOR', 'ADMIN'], default: null },
            reason: { type: String, default: '' },
            cancelled_at: { type: Date, default: null },
        },

        // Rating & Feedback
        review: {
            rating: { type: Number, min: 1, max: 5, default: null },
            comment: { type: String, default: '' },
            reviewed_at: { type: Date, default: null },
        },
    },
    { timestamps: true }
);

bookingSchema.index({ assigned_vendor_id: 1, 'schedule.booking_date_string': 1, status: 1 });
module.exports = mongoose.model('Booking', bookingSchema);