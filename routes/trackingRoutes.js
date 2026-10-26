// routes/trackingRoutes.js
const express = require('express');
const router = express.Router();
const { updateJobLocation, getJobTracking } = require('../controllers/trackingController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Provider pushes GPS location (Vendor or Captain)
router.patch('/jobs/:bookingId/location', protect, authorize('vendor', 'captain'), updateJobLocation);

// Customer fetches current location and destination
router.get('/jobs/:bookingId/tracking', protect, authorize('customer'), getJobTracking);

module.exports = router;