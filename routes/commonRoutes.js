// routes/customerRoutes.js
const express = require('express');
const router = express.Router();
const { getCustomerBookingDetails } = require('../controllers/customerController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Get single booking details (Protected for Customer)
router.get('/bookings/:bookingId', protect, authorize('customer'), getCustomerBookingDetails);

module.exports = router;