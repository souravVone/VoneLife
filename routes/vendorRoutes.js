const express = require('express');
const router = express.Router();
const { submitKyc, getKycStatus, getAvailableJobs, acceptJob, } = require('../controllers/vendorController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { kycUploadFields } = require('../middleware/uploadMiddleware');

// Protect so only authenticated vendors can upload KYC
router.post('/kyc-onboarding', protect, authorize('vendor'), kycUploadFields, submitKyc);
router.get('/kyc-status', protect, authorize('vendor'), getKycStatus);

router.get('/jobs/available', protect, authorize('vendor'), getAvailableJobs);
router.post('/jobs/:bookingId/accept', protect, authorize('vendor'), acceptJob);

module.exports = router;