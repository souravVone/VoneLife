const express = require('express');
const router = express.Router();
const { memoryUpload } = require('../middleware/uploadMiddleware'); // <-- destructure memoryUpload
const { uploadSingleFile } = require('../controllers/uploadController');
const { protect } = require('../middleware/authMiddleware');

// Unified upload route: expects 'file' in form-data
router.post('/file', protect, memoryUpload.single('file'), uploadSingleFile); // <-- use memoryUpload.single('file')

module.exports = router;