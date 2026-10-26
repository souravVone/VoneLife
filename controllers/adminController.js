const Vendor = require('../models/Vendor');
const Booking = require('../models/Booking');

// Monitor All Bookings with Filter
exports.getAllPlatformBookings = async (req, res) => {
  try {
    const { status, city } = req.query;
    const filter = {};

    if (status) filter.status = status.toUpperCase();
    if (city) filter['customer_address.city'] = { $regex: new RegExp(`^${city}$`, 'i') };

    const bookings = await Booking.find(filter)
      .populate('customer_id', 'name phone')
      .populate('assigned_vendor_id', 'name phone kyc_details.city')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: bookings.length,
      bookings,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Toggle Vendor Block Status (Enhanced with reason & timestamp)
exports.toggleVendorBlockStatus = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { status, reason } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required ("active" or "blocked").',
      });
    }

    const cleanStatus = status.toLowerCase().trim();

    if (!['active', 'blocked'].includes(cleanStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be either "active" or "blocked".',
      });
    }

    const updatePayload = {
      status: cleanStatus,
      block_reason: cleanStatus === 'blocked' ? (reason ? reason.trim() : 'Blocked by administrator') : '',
      blocked_at: cleanStatus === 'blocked' ? new Date() : null,
    };

    const vendor = await Vendor.findByIdAndUpdate(vendorId, updatePayload, { new: true })
      .select('name phone status block_reason blocked_at kyc_status');

    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found.' });
    }

    return res.status(200).json({
      success: true,
      message: `Vendor account has been ${cleanStatus === 'blocked' ? 'blocked' : 'unblocked'} successfully.`,
      vendor,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

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
    const { entity_type } = req.query;

    const query = { kyc_status: 'PENDING_VERIFICATION' };
    if (entity_type) {
      query.entity_type = entity_type.toUpperCase();
    }

    const vendors = await Vendor.find(query).sort({ updatedAt: -1 });

    return res.status(200).json({
      success: true,
      count: vendors.length,
      vendors,
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