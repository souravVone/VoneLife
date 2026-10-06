const express = require('express');
const router = express.Router();
const { createBooking, getMyBookings } = require('../controllers/customerController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.post('/bookings', protect, authorize('customer'), createBooking);
router.get('/bookings', protect, authorize('customer'), getMyBookings);

module.exports = router;