// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const Vendor = require('../models/Vendor');

exports.protect = (req, res, next) => {
  let token;
  const authHeader = req.headers.authorization;

  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else {
      token = authHeader.trim();
    }
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized, token missing' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'jwt_secret_key_123');
    req.user = decoded; // { userId, role }
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Token invalid or expired' });
  }
};

exports.authorize = (...roles) => {
  return async (req, res, next) => { // <--- Added async here
    try {
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: `Role (${req.user.role}) is not allowed to access this resource`,
        });
      }

      // Live account check for vendors
      if (req.user.role === 'vendor') {
        const vendor = await Vendor.findById(req.user.userId).select('status');
        if (vendor && vendor.status === 'blocked') {
          return res.status(403).json({
            success: false,
            message: 'Your vendor account has been suspended by administration. Please contact support.',
          });
        }
      }

      next();
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  };
};