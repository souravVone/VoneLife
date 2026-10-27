// routes/captainRoutes.js
const express = require('express');
const router = express.Router();

const {
  requestCaptainOtp,
  verifyCaptainOtp,
  resendCaptainOtp,
} = require('../controllers/captainAuthController');

const {
  getAvailableCaptainJobs,
  acceptCaptainJob,
  getMyActiveCaptainJob,
  markCaptainArrived,
  startCaptainService,
  completeCaptainService, cancelCaptainJob, getCaptainJobHistory
} = require('../controllers/captainJobController');

const { protect, authorize } = require('../middleware/authMiddleware');

// Public Authentication Endpoints
router.post('/auth/request-otp', requestCaptainOtp);
router.post('/auth/resend-otp', resendCaptainOtp);
router.post('/auth/verify-otp', verifyCaptainOtp);

// Protected Captain Job Lifecycle Endpoints
router.get('/jobs/available', protect, authorize('captain'), getAvailableCaptainJobs);
router.get('/jobs/active', protect, authorize('captain'), getMyActiveCaptainJob);
router.post('/jobs/:bookingId/accept', protect, authorize('captain'), acceptCaptainJob);
router.post('/jobs/:bookingId/arrive', protect, authorize('captain'), markCaptainArrived);
router.post('/jobs/:bookingId/start', protect, authorize('captain'), startCaptainService);
router.post('/jobs/:bookingId/complete', protect, authorize('captain'), completeCaptainService);
// routes/captainRoutes.js
router.post('/jobs/:bookingId/cancel', protect, authorize('captain'), cancelCaptainJob);
router.get('/jobs/history', protect, authorize('captain'), getCaptainJobHistory);

module.exports = router;