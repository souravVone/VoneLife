const jwt = require('jsonwebtoken');
const Customer = require('../models/Customer');
const Vendor = require('../models/Vendor');
const Admin = require('../models/Admin');
const Otp = require('../models/Otp');
const { generateOtp, hashOtp, verifyOtpHash, sendSms, TEST_NUMBERS } = require('../utils/otpHelper');

// Helper to locate user across collections
const findUserByPhoneAcrossAll = async (phone) => {
  const admin = await Admin.findOne({ phone });
  if (admin) return { user: admin, role: 'admin' };

  const vendor = await Vendor.findOne({ phone });
  if (vendor) return { user: vendor, role: 'vendor' };

  const customer = await Customer.findOne({ phone });
  if (customer) return { user: customer, role: 'customer' };

  return null;
};

// 1. Unified Sign-Up (Customer / Vendor)
exports.signUp = async (req, res) => {
  try {
    const { name, phone, email, role } = req.body;

    if (!name || !phone || !email || !role) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    if (!['customer', 'vendor'].includes(role.toLowerCase())) {
      return res.status(400).json({ success: false, message: 'Invalid role. Must be customer or vendor' });
    }

    // Check if phone or email exists in either table
    const existingCustomer = await Customer.findOne({ $or: [{ phone }, { email }] });
    const existingVendor = await Vendor.findOne({ $or: [{ phone }, { email }] });

    if (existingCustomer || existingVendor) {
      return res.status(400).json({ success: false, message: 'Phone number or email already registered' });
    }

    // Create user in respective table
    let newUser;
    if (role.toLowerCase() === 'vendor') {
      newUser = await Vendor.create({ name, phone, email, isPhoneVerified: false });
    } else {
      newUser = await Customer.create({ name, phone, email, isPhoneVerified: false });
    }

    // Generate & save OTP
    const rawOtp = TEST_NUMBERS[phone] || generateOtp();
    const otpHash = await hashOtp(rawOtp);

    await Otp.findOneAndUpdate(
      { phone },
      { otpHash, role: 'registration', createdAt: new Date() },
      { upsert: true, new: true }
    );

    await sendSms(phone, rawOtp);

    return res.status(201).json({
      success: true,
      message: 'Registration submitted. Please verify OTP sent to your phone.',
      phone: newUser.phone,
      role: role.toLowerCase(),
      // Send OTP in response only during development for easier testing
      ...(process.env.NODE_ENV === 'development' && { devOtp: rawOtp }),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 2. Verify Registration OTP
exports.verifyRegistrationOtp = async (req, res) => {
  try {
    const { phone, otp, role } = req.body;

    if (!phone || !otp || !role) {
      return res.status(400).json({ success: false, message: 'Phone, OTP, and Role are required' });
    }

    const otpRecord = await Otp.findOne({ phone, role: 'registration' });
    if (!otpRecord) {
      return res.status(400).json({ success: false, message: 'OTP expired or registration request not found' });
    }

    const isValid = await verifyOtpHash(otp, otpRecord.otpHash, phone);
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    // Clear OTP
    await Otp.deleteOne({ _id: otpRecord._id });

    // Mark verified in the correct table
    if (role.toLowerCase() === 'vendor') {
      await Vendor.findOneAndUpdate({ phone }, { isPhoneVerified: true });
    } else {
      await Customer.findOneAndUpdate({ phone }, { isPhoneVerified: true });
    }

    return res.status(200).json({
      success: true,
      message: 'Mobile number verified successfully. You can now login.',
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 3. Request Login OTP (Unified for Admin, Vendor, Customer)
exports.requestLoginOtp = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }

    const account = await findUserByPhoneAcrossAll(phone);
    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found. Please sign up first.' });
    }

    if (account.role !== 'admin' && !account.user.isPhoneVerified) {
      return res.status(403).json({ success: false, message: 'Phone number not verified. Complete registration first.' });
    }

    const rawOtp = TEST_NUMBERS[phone] || generateOtp();
    const otpHash = await hashOtp(rawOtp);

    await Otp.findOneAndUpdate(
      { phone },
      { otpHash, role: account.role, createdAt: new Date() },
      { upsert: true, new: true }
    );

    await sendSms(phone, rawOtp);

    return res.status(200).json({
      success: true,
      message: 'Login OTP sent successfully',
      phone,
      ...(process.env.NODE_ENV === 'development' && { devOtp: rawOtp }),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 4. Verify Login OTP & Authenticate
exports.verifyLoginOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ success: false, message: 'Phone and OTP are required' });
    }

    const account = await findUserByPhoneAcrossAll(phone);
    if (!account) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const otpRecord = await Otp.findOne({ phone, role: account.role });
    if (!otpRecord) {
      return res.status(400).json({ success: false, message: 'OTP expired or not requested' });
    }

    const isValid = await verifyOtpHash(otp, otpRecord.otpHash, phone);
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    await Otp.deleteOne({ _id: otpRecord._id });

    // Generate JWT Token with target table ID and determined Role
    const token = jwt.sign(
      { userId: account.user._id, role: account.role },
      process.env.JWT_SECRET || 'jwt_secret_key_123',
      { expiresIn: '30d' }
    );

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: account.user._id,
        name: account.user.name,
        phone: account.user.phone,
        email: account.user.email,
        role: account.role,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Add this inside controllers/authController.js

exports.resendOtp = async (req, res) => {
  try {
    const { phone, context } = req.body; // context: 'registration' or 'login'

    if (!phone || !context) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and context ("registration" or "login") are required',
      });
    }

    let role = 'registration';

    // 1. Handling Resend during Sign-Up / Registration
    if (context === 'registration') {
      // Check if user exists in vendor or customer table and is still unverified
      const customer = await Customer.findOne({ phone });
      const vendor = await Vendor.findOne({ phone });
      const targetUser = customer || vendor;

      if (!targetUser) {
        return res.status(404).json({
          success: false,
          message: 'No pending registration found for this phone number. Please sign up first.',
        });
      }

      if (targetUser.isPhoneVerified) {
        return res.status(400).json({
          success: false,
          message: 'Phone number is already verified. Please proceed to login.',
        });
      }

      role = 'registration';
    } 
    // 2. Handling Resend during Login (Admin / Vendor / Customer)
    else if (context === 'login') {
      const account = await findUserByPhoneAcrossAll(phone);

      if (!account) {
        return res.status(404).json({
          success: false,
          message: 'Account not found with this phone number.',
        });
      }

      if (account.role !== 'admin' && !account.user.isPhoneVerified) {
        return res.status(403).json({
          success: false,
          message: 'Phone number is not verified. Complete registration first.',
        });
      }

      role = account.role;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid context. Allowed values: "registration" or "login"',
      });
    }

    // Generate fresh OTP & reset the expiration clock
    const rawOtp = TEST_NUMBERS[phone] || generateOtp();
    const otpHash = await hashOtp(rawOtp);

    await Otp.findOneAndUpdate(
      { phone },
      { otpHash, role, createdAt: new Date() }, // new Date() resets the 5-minute TTL clock
      { upsert: true, new: true }
    );

    await sendSms(phone, rawOtp);

    return res.status(200).json({
      success: true,
      message: 'New OTP has been sent successfully.',
      phone,
      context,
      ...(process.env.NODE_ENV === 'development' && { devOtp: rawOtp }),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};