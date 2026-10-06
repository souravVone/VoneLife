const Vendor = require('../models/Vendor');


exports.getVendorsByKycStatus = async (req, res) => {
  try {
    const { status } = req.query; // e.g., ?status=APPROVED or ?status=REJECTED

    const filter = {};

    if (status) {
      const normalizedStatus = status.toUpperCase();
      const validStatuses = ['NOT_SUBMITTED', 'PENDING_VERIFICATION', 'APPROVED', 'REJECTED'];

      if (!validStatuses.includes(normalizedStatus)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status query. Allowed values: ${validStatuses.join(', ')}`,
        });
      }

      filter.kyc_status = normalizedStatus;
    }

    // Fetch matching vendors sorted with most recent first
    const vendors = await Vendor.find(filter)
      .select('-__v')
      .sort({ updatedAt: -1 });

    return res.status(200).json({
      success: true,
      count: vendors.length,
      vendors,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 1. Get Pending KYC Submissions
exports.getPendingKycList = async (req, res) => {
  try {
    const pendingVendors = await Vendor.find({ kyc_status: 'PENDING_VERIFICATION' })
      .select('-__v');

    return res.status(200).json({
      success: true,
      count: pendingVendors.length,
      vendors: pendingVendors,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 2. Review KYC (Approve or Reject via Request Body)
exports.reviewKyc = async (req, res) => {
  try {
    const { vendor_id, status, remarks } = req.body;

    if (!vendor_id || !status) {
      return res.status(400).json({
        success: false,
        message: 'vendor_id and status are required.',
      });
    }

    const normalizedStatus = status.toUpperCase();

    if (!['APPROVE', 'APPROVED', 'REJECTED'].includes(normalizedStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Status must be "APPROVE" or "REJECTED".',
      });
    }

    // Require remarks when rejecting
    if (normalizedStatus === 'REJECTED' && !remarks) {
      return res.status(400).json({
        success: false,
        message: 'Remarks are required when rejecting KYC.',
      });
    }

    const finalStatus = normalizedStatus === 'APPROVE' ? 'APPROVED' : 'REJECTED';

    const updatePayload = {
      kyc_status: finalStatus,
      kyc_remarks: finalStatus === 'REJECTED' ? remarks : '',
      ...(finalStatus === 'APPROVED' && { isPhoneVerified: true }),
    };

    const vendor = await Vendor.findByIdAndUpdate(vendor_id, updatePayload, { new: true });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found with the provided vendor_id.',
      });
    }

    return res.status(200).json({
      success: true,
      message: `KYC has been ${finalStatus.toLowerCase()} successfully.`,
      vendor: {
        id: vendor._id,
        name: vendor.name,
        phone: vendor.phone,
        kyc_status: vendor.kyc_status,
        remarks: vendor.kyc_remarks,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};