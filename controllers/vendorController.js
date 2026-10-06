const Vendor = require('../models/Vendor');
const Booking = require('../models/Booking');

exports.getAvailableJobs = async (req, res) => {
  try {
    const vendorId = req.user.userId;

    // Fetch vendor verification and offerings
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found.' });
    }

    if (vendor.kyc_status !== 'APPROVED') {
      return res.status(403).json({
        success: false,
        message: 'Your KYC must be approved before you can view available jobs.',
      });
    }

    const vendorPincode = vendor.kyc_details?.pincode;
    if (!vendorPincode) {
      return res.status(400).json({
        success: false,
        message: 'Vendor pincode not registered in KYC records.',
      });
    }

    // Extract all service names this vendor offers
    const vendorOfferedServices = vendor.services_offered.map((item) => item.service_name);

    // Query: Must be BROADCASTED, customer pincode != vendor pincode, and match offered service
    const availableJobs = await Booking.find({
      status: 'BROADCASTED',
      'customer_address.pincode': { $ne: vendorPincode },
      'service_details.service_name': { $in: vendorOfferedServices },
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: availableJobs.length,
      jobs: availableJobs,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 2. Accept Job (Atomic First-Come-First-Served)
exports.acceptJob = async (req, res) => {
  try {
    const vendorId = req.user.userId;
    const { bookingId } = req.params;

    const vendor = await Vendor.findById(vendorId);
    if (!vendor || vendor.kyc_status !== 'APPROVED') {
      return res.status(403).json({
        success: false,
        message: 'Only approved vendors can accept jobs.',
      });
    }

    // Atomic update: only updates if status is STILL 'BROADCASTED'
    const assignedBooking = await Booking.findOneAndUpdate(
      {
        _id: bookingId,
        status: 'BROADCASTED',
        'customer_address.pincode': { $ne: vendor.kyc_details.pincode }, // Safety check against same pincode
      },
      {
        status: 'ASSIGNED',
        assigned_vendor_id: vendorId,
        assigned_at: new Date(),
      },
      { new: true }
    );

    if (!assignedBooking) {
      return res.status(409).json({
        success: false,
        message: 'This job has already been claimed by another vendor or is no longer available.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Job accepted and assigned to you successfully.',
      booking: assignedBooking,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.submitKyc = async (req, res) => {
    try {
        const vendorId = req.user.userId; // Decoded from JWT auth middleware

        const {
            full_name,
            aadhar_card_number,
            pan_card,
            gender,
            permanent_address,
            pincode,
            services_offered,
        } = req.body;

        // Validate textual fields
        if (!full_name || !aadhar_card_number || !pan_card || !gender || !permanent_address) {
            return res.status(400).json({
                success: false,
                message: 'All personal KYC details (Full Name, Aadhar, PAN, Gender, Address) are required.',
            });
        }

        if (!/^\d{6}$/.test(pincode.trim())) {
            return res.status(400).json({
                success: false,
                message: 'Invalid pincode. Please provide a valid 6-digit postal code.',
            });
        }

        // 2. Parse & validate services_offered
        if (!services_offered) {
            return res.status(400).json({
                success: false,
                message: 'Please provide at least one service offered.',
            });
        }

        let parsedServices = [];
        try {
            parsedServices = typeof services_offered === 'string'
                ? JSON.parse(services_offered)
                : services_offered;
        } catch {
            return res.status(400).json({
                success: false,
                message: 'Invalid JSON format for services_offered.',
            });
        }

        if (!Array.isArray(parsedServices) || parsedServices.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'services_offered must be a non-empty array of services.',
            });
        }

        // Validate structure of each service item
        for (const item of parsedServices) {
            if (!item.category || !item.sub_category || !item.service_name) {
                return res.status(400).json({
                    success: false,
                    message: 'Each service must contain category, sub_category, and service_name.',
                });
            }
        }

        // Validate mandatory file uploads
        const files = req.files || {};
        if (!files.aadhar_front || !files.aadhar_back || !files.voter_id || !files.pan_card_photo || !files.address_proof) {
            return res.status(400).json({
                success: false,
                message: 'Mandatory documents missing: Aadhar Front/Back, Voter ID, PAN Card, and Address Proof are required.',
            });
        }

        const documents = {
            aadharFront: files.aadhar_front[0].path.replace(/\\/g, '/'),
            aadharBack: files.aadhar_back[0].path.replace(/\\/g, '/'),
            voterId: files.voter_id[0].path.replace(/\\/g, '/'),
            panCard: files.pan_card_photo[0].path.replace(/\\/g, '/'),
            addressProof: files.address_proof[0].path.replace(/\\/g, '/'),
            statutoryAnnexures: files.statutory_annexures ? files.statutory_annexures[0].path.replace(/\\/g, '/') : null,
        };

        // Update Vendor Record
        const updatedVendor = await Vendor.findByIdAndUpdate(
            vendorId,
            {
                kyc_status: 'PENDING_VERIFICATION',
                services_offered: parsedServices,
                kyc_details: {
                    fullNameGovtId: full_name,
                    aadharCardNumber: aadhar_card_number,
                    panCardNumber: pan_card,
                    gender: gender.toLowerCase(),
                    permanentAddress: permanent_address,
                    pincode: pincode.trim(),
                    documents,
                    submittedAt: new Date(),
                },
            },
            { new: true }
        );

        if (!updatedVendor) {
            return res.status(404).json({ success: false, message: 'Vendor record not found.' });
        }

        return res.status(200).json({
            success: true,
            message: 'KYC submitted successfully. Documents are under review.',
            kyc_status: updatedVendor.kyc_status,
            services_count: updatedVendor.services_offered.length,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.getKycStatus = async (req, res) => {
    try {
        const vendor = await Vendor.findById(req.user.userId).select('kyc_status kyc_rejection_reason kyc_details');
        if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found.' });

        return res.status(200).json({
            success: true,
            kyc_status: vendor.kyc_status,
            remarks: vendor.kyc_remarks,
            submittedDetails: vendor.kyc_details,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};