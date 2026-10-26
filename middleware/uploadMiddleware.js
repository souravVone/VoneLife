// middlewares/uploadMiddleware.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = 'uploads/general';

    // Route Captain files to their dedicated folder
    if (['captain_aadhar_card', 'captain_pan_card', 'captain_selfie'].includes(file.fieldname)) {
      folder = 'uploads/captains';
    } 
    // Route Corporate entity files
    else if (
      file.fieldname.startsWith('company_') ||
      [
        'incorporation_proof',
        'business_address_proof',
        'authorization_letter',
        'gst_certificate',
        'msme_certificate',
        'trade_license_file',
        'cancelled_cheque',
      ].includes(file.fieldname)
    ) {
      folder = 'uploads/company_kyc';
    } 
    // Route Individual contractor files
    else {
      folder = 'uploads/individual_kyc';
    }

    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
    }
    cb(null, folder);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedExts = ['.jpg', '.jpeg', '.png', '.pdf'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${ext}. Only JPG, PNG, and PDF are allowed.`));
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
  fileFilter,
});

// Individual KYC Uploads
const uploadIndividualDocs = upload.fields([
  { name: 'aadhar_front', maxCount: 1 },
  { name: 'aadhar_back', maxCount: 1 },
  { name: 'voter_id', maxCount: 1 },
  { name: 'pan_card_photo', maxCount: 1 },
  { name: 'address_proof', maxCount: 1 },
  { name: 'statutory_annexures', maxCount: 1 },
]);

// Company KYC Uploads (Now includes primary captain registration files)
const uploadCompanyDocs = upload.fields([
  // Company Documents
  { name: 'incorporation_proof', maxCount: 1 },    // Required
  { name: 'company_pan_file', maxCount: 1 },       // Required
  { name: 'business_address_proof', maxCount: 1 }, // Required
  { name: 'authorization_letter', maxCount: 1 },  // Required
  { name: 'cancelled_cheque', maxCount: 1 },       // Required
  { name: 'gst_certificate', maxCount: 1 },       // Optional
  { name: 'msme_certificate', maxCount: 1 },      // Optional
  { name: 'trade_license_file', maxCount: 1 },     // Optional

  // First Captain Documents (Auto-approved during company KYC)
  { name: 'captain_aadhar_card', maxCount: 1 },    // Required
  { name: 'captain_pan_card', maxCount: 1 },       // Required
  { name: 'captain_selfie', maxCount: 1 },         // Required
]);

// Standalone Captain Document Upload
const uploadCaptainDocs = upload.fields([
  { name: 'captain_aadhar_card', maxCount: 1 },
  { name: 'captain_pan_card', maxCount: 1 },
  { name: 'captain_selfie', maxCount: 1 },
]);
module.exports = {
  uploadIndividualDocs,
  uploadCompanyDocs,
  uploadCaptainDocs,
  kycUploadFields: uploadIndividualDocs,
};