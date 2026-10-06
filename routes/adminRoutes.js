const express = require('express');
const router = express.Router();
const { getPendingKycList, reviewKyc, getVendorsByKycStatus, } = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.get('/kyc/pending', protect, authorize('admin'), getPendingKycList);
router.post('/kyc/review', protect, authorize('admin'), reviewKyc);
router.get('/vendors', protect, authorize('admin'), getVendorsByKycStatus);

module.exports = router;