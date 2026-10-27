// controllers/uploadController.js
const cloudinary = require('../config/cloudinaryConfig');
const streamifier = require('streamifier');

// Helper to pipe RAM buffer to Cloudinary
const uploadBufferToCloudinary = (fileBuffer, folderName, isPdf) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `vonelife/${folderName}`,
        resource_type: isPdf ? 'raw' : 'image',
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    streamifier.createReadStream(fileBuffer).pipe(uploadStream);
  });
};

exports.uploadSingleFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please select a file to upload.' });
    }

    // Dynamic folder grouping: 'kyc', 'profiles', 'proofs', etc.
    const folder = req.query.folder || 'general';
    const isPdf = req.file.mimetype === 'application/pdf';

    const result = await uploadBufferToCloudinary(req.file.buffer, folder, isPdf);

    return res.status(200).json({
      success: true,
      message: 'File uploaded successfully.',
      file: {
        url: result.secure_url,
        public_id: result.public_id,
        format: result.format || (isPdf ? 'pdf' : 'unknown'),
        size_bytes: result.bytes,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};