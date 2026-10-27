// middlewares/uploadMiddleware.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

/* ======================================================
   1. LOCAL DISK STORAGE (For existing local KYC handlers)
====================================================== */
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

const diskFileFilter = (req, file, cb) => {
  const allowedExts = ['.jpg', '.jpeg', '.png', '.pdf'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${ext}. Only JPG, PNG, and PDF are allowed.`));
  }
};

const diskUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
  fileFilter: diskFileFilter,
});

// Existing local disk upload groupings
const uploadIndividualDocs = diskUpload.fields([
  { name: 'aadhar_front', maxCount: 1 },
  { name: 'aadhar_back', maxCount: 1 },
  { name: 'voter_id', maxCount: 1 },
  { name: 'pan_card_photo', maxCount: 1 },
  { name: 'address_proof', maxCount: 1 },
  { name: 'statutory_annexures', maxCount: 1 },
]);

const uploadCompanyDocs = diskUpload.fields([
  { name: 'incorporation_proof', maxCount: 1 },
  { name: 'company_pan_file', maxCount: 1 },
  { name: 'business_address_proof', maxCount: 1 },
  { name: 'authorization_letter', maxCount: 1 },
  { name: 'cancelled_cheque', maxCount: 1 },
  { name: 'gst_certificate', maxCount: 1 },
  { name: 'msme_certificate', maxCount: 1 },
  { name: 'trade_license_file', maxCount: 1 },
  { name: 'captain_aadhar_card', maxCount: 1 },
  { name: 'captain_pan_card', maxCount: 1 },
  { name: 'captain_selfie', maxCount: 1 },
]);

const uploadCaptainDocs = diskUpload.fields([
  { name: 'captain_aadhar_card', maxCount: 1 },
  { name: 'captain_pan_card', maxCount: 1 },
  { name: 'captain_selfie', maxCount: 1 },
]);


/* ======================================================
   2. MEMORY STORAGE (Dedicated for Cloudinary Streaming)
====================================================== */
const memoryStorage = multer.memoryStorage();

const memoryFileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file format. Only JPEG, PNG, WEBP images and PDF files are allowed.'), false);
  }
};

const memoryUpload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: memoryFileFilter,
});


/* ======================================================
   3. EXPORTS
====================================================== */
module.exports = {
  // Existing local disk uploaders
  uploadIndividualDocs,
  uploadCompanyDocs,
  uploadCaptainDocs,
  kycUploadFields: uploadIndividualDocs,

  // New Cloudinary memory uploader
  memoryUpload,
};