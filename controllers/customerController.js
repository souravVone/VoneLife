// controllers/customerController.js
const Booking = require('../models/Booking');
const Vendor = require('../models/Vendor');
const { ALLOWED_SLOTS, getLocalDateString, isDateWithinMaxDays, findSlot } = require('../utils/slotHelper');

// Fetch customer booking details with dynamic provider info and protected OTP reveal
exports.getCustomerBookingDetails = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const customerId = req.user.userId;

        const booking = await Booking.findOne({
            _id: bookingId,
            customer_id: customerId,
        })
            .populate('assigned_captain_id', 'name phone documents.selfie_file status')
            .populate('assigned_vendor_id', 'full_name phone company_details profile_picture');

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found.',
            });
        }

        // 1. Normalize provider details so the frontend gets a uniform structure
        let assignedProvider = null;
        if (booking.assigned_captain_id) {
            assignedProvider = {
                type: 'CAPTAIN',
                name: booking.assigned_captain_id.name,
                phone: booking.assigned_captain_id.phone,
                profile_image: booking.assigned_captain_id.documents?.selfie_file || null,
                company_name: booking.assigned_vendor_id?.company_details?.company_name || null,
                company_phone: booking.assigned_vendor_id?.phone || null,
            };
        } else if (booking.assigned_vendor_id) {
            assignedProvider = {
                type: 'INDIVIDUAL_VENDOR',
                name: booking.assigned_vendor_id.full_name,
                phone: booking.assigned_vendor_id.phone,
                profile_image: booking.assigned_vendor_id.profile_picture || null,
                company_name: null,
            };
        }

        // 2. Strict OTP reveal guard: only accessible if status is 'ARRIVED'
        const shouldRevealOtp = booking.status === 'ARRIVED';
        const shouldRevealCompletionOtp = booking.status === 'IN_PROGRESS'

        return res.status(200).json({
            success: true,
            booking: {
                id: booking._id,
                status: booking.status,
                services: booking.services,
                schedule: booking.schedule,
                customer_address: booking.customer_address,
                assigned_provider: assignedProvider,
                // The start OTP is null unless the provider is confirmed at the doorstep
                start_otp: shouldRevealOtp ? booking.start_otp : null,
                completion_otp: shouldRevealCompletionOtp ? booking.completion_otp : null,
                live_tracking: {
                    is_active: booking.status === 'ASSIGNED' && (booking.live_tracking?.is_active || false),
                    current_lat: booking.live_tracking?.current_lat || null,
                    current_lng: booking.live_tracking?.current_lng || null,
                    heading: booking.live_tracking?.heading || null,
                },
                timestamps: {
                    created_at: booking.createdAt,
                    assigned_at: booking.assigned_at,
                    arrived_at: booking.arrived_at,
                    service_started_at: booking.service_started_at,
                    service_completed_at: booking.service_completed_at,
                },
            },
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// 1. Get Operational Slots & Advance Rules
exports.getOperationalSlots = async (req, res) => {
    return res.status(200).json({
        success: true,
        operating_hours: '07:00 AM to 09:00 PM',
        max_advance_days: 3,
        slots: ALLOWED_SLOTS,
    });
};

// 2. Create a New Service Booking Request (Instant or Scheduled)
exports.createBooking = async (req, res) => {
    try {
        const customerId = req.user.userId;
        const {
            services,
            service_details,
            customer_address,
            booking_type = 'INSTANT',
            booking_date, // "YYYY-MM-DD" (Required if SCHEDULED)
            slot_id,      // e.g. "SLOT_2" (Required if SCHEDULED)
        } = req.body;

        // A. Validate Service Details
        let requestedServices = services;
        if (!requestedServices && service_details) {
            requestedServices = [service_details];
        }

        if (!Array.isArray(requestedServices) || requestedServices.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please provide at least 1 service to book.',
            });
        }

        if (requestedServices.length > 3) {
            return res.status(400).json({
                success: false,
                message: 'You can book a maximum of 3 services in a single order.',
            });
        }

        const cleanServices = [];
        for (const item of requestedServices) {
            if (!item.category || !item.sub_category || !item.service_name) {
                return res.status(400).json({
                    success: false,
                    message: 'Each service must include category, sub_category, and service_name.',
                });
            }
            cleanServices.push({
                category: String(item.category).trim(),
                sub_category: String(item.sub_category).trim(),
                service_name: String(item.service_name).trim(),
            });
        }

        // B. Validate Address & Coordinates
        if (!customer_address || !customer_address.address_line1 || !customer_address.pincode || !customer_address.city) {
            return res.status(400).json({
                success: false,
                message: 'customer_address must include address_line1, city, and pincode.',
            });
        }

        if (
            customer_address.location?.lat === undefined ||
            customer_address.location?.lng === undefined
        ) {
            return res.status(400).json({
                success: false,
                message: 'customer_address.location with lat and lng coordinates is required.',
            });
        }

        const cleanPincode = String(customer_address.pincode).trim();
        if (!/^\d{6}$/.test(cleanPincode)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid customer pincode. Must be a 6-digit postal code.',
            });
        }

        // C. Validate and Construct Schedule Data
        let scheduleData = {};
        const normalizedType = booking_type.toUpperCase();

        if (normalizedType === 'SCHEDULED') {
            if (!booking_date || !slot_id) {
                return res.status(400).json({
                    success: false,
                    message: 'booking_date (YYYY-MM-DD) and slot_id are required for scheduled bookings.',
                });
            }

            if (!isDateWithinMaxDays(booking_date, 3)) {
                return res.status(400).json({
                    success: false,
                    message: 'Bookings can only be scheduled between today and up to 3 days in advance.',
                });
            }

            const selectedSlot = findSlot(slot_id);
            if (!selectedSlot) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid slot_id. Must be one of the standard 2-hour slots from 7 AM to 9 PM.',
                });
            }

            scheduleData = {
                booking_date_string: booking_date.trim(),
                slot_id: selectedSlot.slot_id,
                start_time: selectedSlot.start,
                end_time: selectedSlot.end,
                slot_label: selectedSlot.label,
            };
        } else {
            // INSTANT booking defaults to today's local date
            const todayStr = getLocalDateString();
            scheduleData = {
                booking_date_string: todayStr,
                slot_id: 'INSTANT_NOW',
                start_time: 'NOW',
                end_time: 'NOW',
                slot_label: 'Immediate Execution',
            };
        }

        // D. Save Booking with BROADCASTED Status
        const booking = await Booking.create({
            customer_id: customerId,
            services: cleanServices,
            customer_address: {
                address_line1: customer_address.address_line1.trim(),
                address_line2: customer_address.address_line2 ? customer_address.address_line2.trim() : '',
                landmark: customer_address.landmark ? customer_address.landmark.trim() : '',
                city: customer_address.city ? customer_address.city.trim() : '',
                state: customer_address.state ? customer_address.state.trim() : '',
                pincode: cleanPincode,
                location: {
                    lat: Number(customer_address.location.lat),
                    lng: Number(customer_address.location.lng),
                },
            },
            booking_type: normalizedType,
            schedule: scheduleData,
            status: 'BROADCASTED',
        });

        return res.status(201).json({
            success: true,
            message: 'Booking request placed and broadcasted to eligible service providers.',
            booking,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// 3. Cancel Booking
exports.cancelBookingByCustomer = async (req, res) => {
    try {
        const customerId = req.user.userId;
        const { bookingId } = req.params;
        const { reason } = req.body;

        const booking = await Booking.findOne({ _id: bookingId, customer_id: customerId });
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found.' });
        }

        if (['IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(booking.status)) {
            return res.status(400).json({
                success: false,
                message: `Booking cannot be cancelled when status is ${booking.status}.`,
            });
        }

        booking.status = 'CANCELLED';
        booking.cancellation = {
            cancelled_by: 'CUSTOMER',
            reason: reason || 'Cancelled by customer',
            cancelled_at: new Date(),
        };
        booking.start_otp = null;
        await booking.save();

        return res.status(200).json({
            success: true,
            message: 'Booking cancelled successfully.',
            booking,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// 4. Rate & Review Completed Service
exports.submitBookingReview = async (req, res) => {
    try {
        const customerId = req.user.userId;
        const { bookingId } = req.params;
        const { rating, comment } = req.body;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5.' });
        }

        const booking = await Booking.findOne({ _id: bookingId, customer_id: customerId });
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found.' });
        }

        if (booking.status !== 'COMPLETED') {
            return res.status(400).json({
                success: false,
                message: 'Only completed bookings can be reviewed.',
            });
        }

        if (booking.review?.rating) {
            return res.status(400).json({ success: false, message: 'You have already reviewed this booking.' });
        }

        booking.review = {
            rating: Number(rating),
            comment: comment ? comment.trim() : '',
            reviewed_at: new Date(),
        };
        await booking.save();

        // Recompute Vendor Average Rating
        const vendor = await Vendor.findById(booking.assigned_vendor_id);
        if (vendor) {
            const prevTotal = vendor.ratings_summary?.total_reviews || 0;
            const prevAvg = vendor.ratings_summary?.average_rating || 0;
            const newTotal = prevTotal + 1;
            const newAvg = Number(((prevAvg * prevTotal + Number(rating)) / newTotal).toFixed(1));

            vendor.ratings_summary = {
                average_rating: newAvg,
                total_reviews: newTotal,
            };
            await vendor.save();
        }

        return res.status(200).json({
            success: true,
            message: 'Thank you! Your review has been submitted.',
            review: booking.review,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// 5. Get All Bookings Placed by This Customer
exports.getMyBookings = async (req, res) => {
    try {
        const customerId = req.user.userId;

        const bookings = await Booking.find({ customer_id: customerId })
            .populate('assigned_vendor_id', 'name phone')
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: bookings.length,
            bookings,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// 6. Resend Start OTP by Customer
exports.resendStartOtpByCustomer = async (req, res) => {
    try {
        const customerId = req.user.userId;
        const { bookingId } = req.params;

        const booking = await Booking.findOne({ _id: bookingId, customer_id: customerId });

        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found.' });
        }

        if (booking.status !== 'ARRIVED') {
            return res.status(400).json({
                success: false,
                message: `Cannot resend OTP. Service partner has not marked arrival yet (Status: ${booking.status}).`,
            });
        }

        const now = new Date();
        if (booking.otp_generated_at) {
            const secondsPassed = Math.floor((now - new Date(booking.otp_generated_at)) / 1000);
            if (secondsPassed < 60) {
                return res.status(429).json({
                    success: false,
                    message: `Please wait ${60 - secondsPassed} seconds before requesting a new OTP.`,
                });
            }
        }

        const newOtp = Math.floor(1000 + Math.random() * 9000).toString();

        booking.start_otp = newOtp;
        booking.otp_generated_at = now;
        await booking.save();

        return res.status(200).json({
            success: true,
            message: 'New start OTP generated successfully.',
            start_otp: newOtp,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};