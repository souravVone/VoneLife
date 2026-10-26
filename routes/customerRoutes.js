const express = require('express');
const router = express.Router();
const { createBooking, getMyBookings, resendStartOtpByCustomer, cancelBookingByCustomer, submitBookingReview,getOperationalSlots, } = require('../controllers/customerController');
const { protect, authorize } = require('../middleware/authMiddleware');


router.post('/bookings/:bookingId/resend-start-otp', protect, authorize('customer'), resendStartOtpByCustomer);

router.post('/bookings', protect, authorize('customer'), createBooking);
router.get('/bookings', protect, authorize('customer'), getMyBookings);
router.patch('/bookings/:bookingId/cancel', protect, authorize('customer'), cancelBookingByCustomer);
router.post('/bookings/:bookingId/review', protect, authorize('customer'), submitBookingReview);

router.get('/slots', getOperationalSlots);

module.exports = router;