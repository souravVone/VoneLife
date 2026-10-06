const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = 'uploads/kyc';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `${file.fieldname}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  // Check extension at the end of the filename
  const allowedExtensions = /\.(jpeg|jpg|png|pdf)$/i;
  const isExtValid = allowedExtensions.test(file.originalname.toLowerCase());

  if (isExtValid) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type for ${file.fieldname}. Only JPG, PNG, and PDF files are allowed!`), false);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file limit
  fileFilter,
});

const kycUploadFields = upload.fields([
  { name: 'aadhar_front', maxCount: 1 },
  { name: 'aadhar_back', maxCount: 1 },
  { name: 'voter_id', maxCount: 1 },
  { name: 'pan_card_photo', maxCount: 1 },
  { name: 'address_proof', maxCount: 1 },
  { name: 'statutory_annexures', maxCount: 1 },
]);

module.exports = { kycUploadFields };