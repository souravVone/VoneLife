const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const path = require('path');
const vendorRoutes = require('./routes/vendorRoutes');

dotenv.config();
connectDB();

const app = express();

app.use(cors());
app.use(express.json());

const trackingRoutes = require('./routes/trackingRoutes');

// Mount under /api/tracking
app.use('/api/tracking', trackingRoutes);

const captainRoutes = require('./routes/captainRoutes');

app.use('/api/captain', captainRoutes);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/vendor', vendorRoutes);

// Serve uploads folder statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Multer & General Error Handling Middleware
app.use((err, req, res, next) => {
  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message || 'An error occurred during file upload',
    });
  }
  next();
});

app.get('/health', (req, res) => res.json({ status: 'Server is running healthy' }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

app.use('/api/customer', require('./routes/customerRoutes'));
app.use('/api/vendor', require('./routes/vendorRoutes'));
app.use('/api/common', require('./routes/commonRoutes'));

const adminRoutes = require('./routes/adminRoutes');
app.use('/api/admin', adminRoutes);

const uploadRoutes = require('./routes/uploadRoutes');
app.use('/api/upload', require('./routes/uploadRoutes'));