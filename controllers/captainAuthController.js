// controllers/captainAuthController.js
const jwt = require('jsonwebtoken');
const Captain = require('../models/Captain');
const Vendor = require('../models/Vendor');

const JWT_SECRET = process.env.JWT_SECRET || 'your_fallback_secret_key';

// 1. Request OTP for Captain Login
exports.requestCaptainOtp = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone number is required.' });
    }

    const cleanPhone = String(phone).trim();

    // Check if captain exists
    const captain = await Captain.findOne({ phone: cleanPhone });
    if (!captain) {
      return res.status(404).json({
        success: false,
        message: 'No registered captain found with this phone number. Contact your vendor company.',
      });
    }

    // Verify captain status
    if (captain.status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        message: `Your captain account is ${captain.status}. Access denied.`,
      });
    }

    // Verify parent company status
    const parentCompany = await Vendor.findById(captain.vendor_id);
    if (!parentCompany || parentCompany.status === 'blocked') {
      return res.status(403).json({
        success: false,
        message: 'Your parent company account is inactive or suspended.',
      });
    }

    // Generate 4-digit OTP (for dev/testing fixed OTP 1234 or random)
    const generatedOtp = Math.floor(1000 + Math.random() * 9000).toString();
    const expiryTime = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes validity

    captain.otp = generatedOtp;
    captain.otp_expiry = expiryTime;
    await captain.save();

    // In production, integrate your SMS gateway here (e.g. Fast2SMS / Twilio)
    console.log(`[CAPTAIN LOGIN OTP] Phone: ${cleanPhone} | OTP: ${generatedOtp}`);

    return res.status(200).json({
      success: true,
      message: 'OTP sent successfully to registered phone number.',
      // For local testing convenience:
      ...(process.env.NODE_ENV !== 'production' && { dev_otp: generatedOtp }),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 2. Verify OTP & Issue Captain JWT
exports.verifyCaptainOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ success: false, message: 'Phone and OTP are required.' });
    }

    const cleanPhone = String(phone).trim();
    const cleanOtp = String(otp).trim();

    const captain = await Captain.findOne({ phone: cleanPhone }).populate('vendor_id', 'company_details services_offered kyc_status');
    if (!captain) {
      return res.status(404).json({ success: false, message: 'Captain account not found.' });
    }

    if (!captain.otp || !captain.otp_expiry) {
      return res.status(400).json({ success: false, message: 'No pending OTP request found. Please request a new OTP.' });
    }

    if (new Date() > new Date(captain.otp_expiry)) {
      captain.otp = null;
      captain.otp_expiry = null;
      await captain.save();
      return res.status(400).json({ success: false, message: 'OTP has expired. Please request a fresh one.' });
    }

    if (captain.otp !== cleanOtp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP. Please check and re-enter.' });
    }

    // Clear used OTP
    captain.otp = null;
    captain.otp_expiry = null;
    await captain.save();

    // Generate Token
    const token = jwt.sign(
      {
        userId: captain._id,
        role: 'captain',
        vendorId: captain.vendor_id._id,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(200).json({
      success: true,
      message: 'Captain logged in successfully.',
      token,
      captain: {
        id: captain._id,
        name: captain.name,
        phone: captain.phone,
        status: captain.status,
        company: {
          id: captain.vendor_id._id,
          name: captain.vendor_id.company_details?.company_name,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// controllers/captainAuthController.js

// 3. Resend OTP for Captain Login (with 60-second cooldown)
exports.resendCaptainOtp = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone number is required.' });
    }

    const cleanPhone = String(phone).trim();

    const captain = await Captain.findOne({ phone: cleanPhone });
    if (!captain) {
      return res.status(404).json({
        success: false,
        message: 'No registered captain found with this phone number.',
      });
    }

    if (captain.status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        message: `Your captain account is ${captain.status}. Access denied.`,
      });
    }

    // Cooldown check: prevent requesting again within 60 seconds of last generation
    // (Assuming a 5-minute expiry, at least 4 minutes must remain to be within cooldown)
    const now = new Date();
    if (captain.otp_expiry) {
      const msRemaining = new Date(captain.otp_expiry) - now;
      const totalLifetimeMs = 5 * 60 * 1000; // 300 seconds
      const secondsPassed = Math.floor((totalLifetimeMs - msRemaining) / 1000);

      const COOLDOWN_SECONDS = 60;
      if (secondsPassed >= 0 && secondsPassed < COOLDOWN_SECONDS) {
        return res.status(429).json({
          success: false,
          message: `Please wait ${COOLDOWN_SECONDS - secondsPassed} seconds before requesting a new OTP.`,
        });
      }
    }

    // Generate fresh 4-digit OTP
    const newOtp = Math.floor(1000 + Math.random() * 9000).toString();
    const expiryTime = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes validity

    captain.otp = newOtp;
    captain.otp_expiry = expiryTime;
    await captain.save();

    console.log(`[CAPTAIN RESEND OTP] Phone: ${cleanPhone} | OTP: ${newOtp}`);

    return res.status(200).json({
      success: true,
      message: 'A fresh OTP has been sent successfully.',
      ...(process.env.NODE_ENV !== 'production' && { dev_otp: newOtp }),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};