const express = require('express');
const router = express.Router();

// 1. Import all required controller functions directly
const {
    submitKyc,
    submitCompanyKyc,
    getKycStatus,
    getAvailableJobs,
    acceptJob,
    resendStartOtpByVendor,
    markArrived,
    dropAssignedJob,
    getMyActiveJob,
    getMyJobHistory,
    startService,
    toggleSubCategoryStatus,
    completeService,
    getCompanyCaptains,
    onboardAdditionalCaptain,
    removeCaptain,
    getCompanyActiveJobs, getCompanyCaptainsStatus, cancelVendorJob, getVendorJobHistory
} = require('../controllers/vendorController');

// 2. Consistent middleware imports (adjust path to 'middleware' or 'middlewares' to match your folder name)
const { protect, authorize } = require('../middleware/authMiddleware');
const { uploadIndividualDocs, uploadCaptainDocs, uploadCompanyDocs, kycUploadFields } = require('../middleware/uploadMiddleware');
// --- KYC & Onboarding Routes ---
// Individual Route
router.post('/kyc/individual', protect, authorize('vendor'), uploadIndividualDocs, submitKyc);

// Company Route (Now correctly mapped to submitCompanyKyc)
router.post('/kyc/company', protect, authorize('vendor'), uploadCompanyDocs, submitCompanyKyc);

// Backward-compatible onboarding route
router.post('/kyc-onboarding', protect, authorize('vendor'), kycUploadFields || uploadIndividualDocs, submitKyc);

// KYC Status Checks
router.get('/kyc/status', protect, authorize('vendor'), getKycStatus);
router.get('/kyc-status', protect, authorize('vendor'), getKycStatus);

// --- Job Discovery & Acceptance ---
router.get('/jobs/available', protect, authorize('vendor'), getAvailableJobs);
router.post('/jobs/:bookingId/accept', protect, authorize('vendor'), acceptJob);
router.post('/jobs/:bookingId/drop', protect, authorize('vendor'), dropAssignedJob);

// --- Step-by-Step Doorstep Execution ---
router.post('/jobs/:bookingId/mark-arrived', protect, authorize('vendor'), markArrived);
router.post('/jobs/:bookingId/resend-start-otp', protect, authorize('vendor'), resendStartOtpByVendor);
router.post('/jobs/:bookingId/start-service', protect, authorize('vendor'), startService);
router.post('/jobs/:bookingId/complete-service', protect, authorize('vendor'), completeService);

// --- Active Job & History ---
router.get('/jobs/active', protect, authorize('vendor'), getMyActiveJob);
router.get('/jobs/history', protect, authorize('vendor'), getMyJobHistory);

// --- Category Online/Offline Management ---
router.patch('/sub-categories/toggle-status', protect, authorize('vendor'), toggleSubCategoryStatus);

// --- Captain Fleet Management Routes ---
router.get('/captains', protect, authorize('vendor'), getCompanyCaptains);
router.post('/captains', protect, authorize('vendor'), uploadCaptainDocs, onboardAdditionalCaptain);
router.delete('/captains/:captainId', protect, authorize('vendor'), removeCaptain);

// Supervisor routes for parent vendor companies
router.get('/company/active-jobs', protect, authorize('vendor'), getCompanyActiveJobs);
router.get('/company/captains/status', protect, authorize('vendor'), getCompanyCaptainsStatus);
// routes/vendorRoutes.js
router.post('/jobs/:bookingId/cancel', protect, authorize('vendor'), cancelVendorJob);
router.get('/jobs/history', protect, authorize('vendor'), getVendorJobHistory);

module.exports = router;