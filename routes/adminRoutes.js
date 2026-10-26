const express = require('express');
const router = express.Router();
const { getPendingKycList, reviewKyc, getVendorsByKycStatus, getAllPlatformBookings, toggleVendorBlockStatus, } = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.get('/kyc/pending', protect, authorize('admin'), getPendingKycList);
router.post('/kyc/review', protect, authorize('admin'), reviewKyc);
router.get('/vendors', protect, authorize('admin'), getVendorsByKycStatus);
router.get('/bookings', protect, authorize('admin'), getAllPlatformBookings);
router.patch('/vendors/:vendorId/status', protect, authorize('admin'), toggleVendorBlockStatus);

module.exports = router;