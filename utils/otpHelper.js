const bcrypt = require('bcryptjs');

// Test phone numbers mapping for development
const TEST_NUMBERS = {
  '9999999999': '123456',
  '8888888888': '123456',
  '7777777777': '123456',
};

const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const hashOtp = async (otp) => {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(otp, salt);
};

const verifyOtpHash = async (enteredOtp, hashedOtp, phone) => {
  // Bypass check for pre-defined test numbers
  if (TEST_NUMBERS[phone] && enteredOtp === TEST_NUMBERS[phone]) {
    return true;
  }
  return await bcrypt.compare(enteredOtp, hashedOtp);
};

const sendSms = async (phone, otp) => {
  if (TEST_NUMBERS[phone]) {
    console.log(`[TEST MODE] Mock SMS for ${phone} - OTP is: ${TEST_NUMBERS[phone]}`);
    return;
  }

  if (process.env.NODE_ENV === 'development') {
    console.log(`[DEV MODE] SMS to ${phone} -> OTP: ${otp}`);
    return;
  }

  // Production SMS Gateway logic here (Fast2SMS / Twilio / MSG91)
};

module.exports = {
  TEST_NUMBERS,
  generateOtp,
  hashOtp,
  verifyOtpHash,
  sendSms,
};