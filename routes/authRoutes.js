const express = require('express');
const router = express.Router();
const {
  signUp,
  verifyRegistrationOtp,
  requestLoginOtp,
  verifyLoginOtp,
  resendOtp,
} = require('../controllers/authController');

router.post('/signup', signUp);
router.post('/verify-registration-otp', verifyRegistrationOtp);
router.post('/login/request-otp', requestLoginOtp);
router.post('/login/verify-otp', verifyLoginOtp);
router.post('/resend-otp', resendOtp);

module.exports = router;