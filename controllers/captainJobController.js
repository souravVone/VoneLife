// controllers/captainJobController.js
const Booking = require('../models/Booking');
const Captain = require('../models/Captain');
const Vendor = require('../models/Vendor');
const { calculateDistanceInMeters } = require('../utils/distance');


exports.getCaptainJobHistory = async (req, res) => {
  try {
    const captainId = req.user.userId;

    const history = await Booking.find({
      assigned_captain_id: captainId,
      status: { $in: ['COMPLETED', 'CANCELLED'] },
    })
      .select('-start_otp -completion_otp')
      .populate('customer_id', 'name phone')
      .sort({ updatedAt: -1 });

    const totalCompleted = history.filter((j) => j.status === 'COMPLETED').length;
    const totalCancelled = history.filter((j) => j.status === 'CANCELLED').length;

    return res.status(200).json({
      success: true,
      count: history.length,
      metrics: {
        total_completed: totalCompleted,
        total_cancelled: totalCancelled,
      },
      jobs: history,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.cancelCaptainJob = async (req, res) => {
  try {
    const captainId = req.user.userId;
    const { bookingId } = req.params;
    const { reason } = req.body;

    const booking = await Booking.findOne({
      _id: bookingId,
      assigned_captain_id: captainId,
    });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Assigned job not found for this captain.' });
    }

    if (['IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel job in ${booking.status} status. Contact company dispatcher.`,
      });
    }

    // Re-release to company dispatch queue so parent company vendor can reassign another captain
    booking.assigned_captain_id = null;
    booking.status = 'ASSIGNED'; // Remains assigned to the parent company, needs new captain
    booking.start_otp = null;

    if (!booking.rejected_by_captains) booking.rejected_by_captains = [];
    booking.rejected_by_captains.push(captainId);

    await booking.save();

    return res.status(200).json({
      success: true,
      message: 'Job unassigned from captain and returned to company fleet pool.',
      status: booking.status,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// --- 1. Captain Job Discovery Feed ---
exports.getAvailableCaptainJobs = async (req, res) => {
  try {
    const captainId = req.user.userId;

    // Load captain and parent company details
    const captain = await Captain.findById(captainId);
    if (!captain || captain.status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        message: 'Active captain account required to view available jobs.',
      });
    }

    const company = await Vendor.findById(captain.vendor_id);
    if (!company || company.kyc_status !== 'APPROVED' || company.status === 'blocked') {
      return res.status(403).json({
        success: false,
        message: 'Parent company account must be active and approved to receive jobs.',
      });
    }

    const companyCity = company.company_details?.address?.city;
    const companyPincode = company.company_details?.address?.pincode;

    if (!companyCity) {
      return res.status(400).json({
        success: false,
        message: 'Parent company operating city is not configured.',
      });
    }

    // Extract company's active sub-categories
    const activeSubCategories = [
      ...new Set(
        (company.services_offered || [])
          .filter((item) => item.is_active === true)
          .map((item) => item.sub_category)
      ),
    ];

    if (activeSubCategories.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        jobs: [],
        message: 'Parent company has no active sub-categories online.',
      });
    }

    // Check dates where this specific captain already has an ongoing job
    const busyJobs = await Booking.find({
      assigned_captain_id: captainId,
      status: { $in: ['ASSIGNED', 'ARRIVED', 'IN_PROGRESS'] },
    }).select('schedule.booking_date_string');

    const busyDates = busyJobs.map((j) => j.schedule?.booking_date_string).filter(Boolean);

    // Query broadcast pool
// Query broadcast pool (masking pricing and OTP fields from the captain)
    const availableJobs = await Booking.find({
      status: 'BROADCASTED',
      'customer_address.city': { $regex: new RegExp(`^${companyCity}$`, 'i') },
      'customer_address.pincode': { $ne: companyPincode },
      'services.sub_category': { $in: activeSubCategories },
      'schedule.booking_date_string': { $nin: busyDates },
    })
      .select('-pricing -start_otp -completion_otp')
      .sort({ 'schedule.booking_date_string': 1, createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: availableJobs.length,
      locked_dates: busyDates,
      jobs: availableJobs,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// --- 2. Claim / Accept Job ---
exports.acceptCaptainJob = async (req, res) => {
  try {
    const captainId = req.user.userId;
    const { bookingId } = req.params;

    const captain = await Captain.findById(captainId);
    if (!captain || captain.status !== 'ACTIVE') {
      return res.status(403).json({ success: false, message: 'Active captain account required.' });
    }

    const company = await Vendor.findById(captain.vendor_id);
    if (!company || company.kyc_status !== 'APPROVED' || company.status === 'blocked') {
      return res.status(403).json({ success: false, message: 'Parent company is not eligible to accept jobs.' });
    }

    const targetBooking = await Booking.findById(bookingId);
    if (!targetBooking || targetBooking.status !== 'BROADCASTED') {
      return res.status(409).json({
        success: false,
        message: 'This job is no longer available or has already been accepted.',
      });
    }

    const targetDate = targetBooking.schedule?.booking_date_string;

    // Enforce 1 active job per day rule for this captain
    if (targetDate) {
      const existingJobOnDate = await Booking.findOne({
        assigned_captain_id: captainId,
        status: { $in: ['ASSIGNED', 'ARRIVED', 'IN_PROGRESS'] },
        'schedule.booking_date_string': targetDate,
      });

      if (existingJobOnDate) {
        return res.status(409).json({
          success: false,
          message: `You already have an active job scheduled on ${targetDate}. Complete it before claiming another.`,
        });
      }
    }

    const companyCity = company.company_details?.address?.city;
    const companyPincode = company.company_details?.address?.pincode;
    const activeSubCategories = (company.services_offered || [])
      .filter((item) => item.is_active === true)
      .map((item) => item.sub_category);

    // Atomic claim
    const assignedBooking = await Booking.findOneAndUpdate(
      {
        _id: bookingId,
        status: 'BROADCASTED',
        'customer_address.city': { $regex: new RegExp(`^${companyCity}$`, 'i') },
        'customer_address.pincode': { $ne: companyPincode },
        'services.sub_category': { $in: activeSubCategories },
      },
      {
        status: 'ASSIGNED',
        assigned_vendor_id: company._id,
        assigned_captain_id: captainId,
        accepted_by_role: 'CAPTAIN',
        assigned_at: new Date(),
      },
      { new: true }
    );

    if (!assignedBooking) {
      return res.status(409).json({
        success: false,
        message: 'Could not claim job. It may have just been claimed by another technician.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Job accepted and added to your schedule.',
      booking: assignedBooking,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// --- 3. View Current Active Job ---
exports.getMyActiveCaptainJob = async (req, res) => {
  try {
    const captainId = req.user.userId;

    const activeJob = await Booking.findOne({
      assigned_captain_id: captainId,
      status: { $in: ['ASSIGNED', 'ARRIVED', 'IN_PROGRESS'] },
    }).select('-pricing -start_otp -completion_otp')
    .populate('customer_id', 'name phone');

    return res.status(200).json({
      success: true,
      job: activeJob || null,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// --- 4. Mark Arrival at Doorstep ---
exports.markCaptainArrived = async (req, res) => {
  try {
    const captainId = req.user.userId;
    const { bookingId } = req.params;
    const { captain_lat, captain_lng } = req.body;

    if (captain_lat === undefined || captain_lng === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Current GPS coordinates (captain_lat, captain_lng) are required.',
      });
    }

    const booking = await Booking.findOne({ _id: bookingId, assigned_captain_id: captainId });
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Assigned booking not found.' });
    }

    if (booking.status !== 'ASSIGNED') {
      return res.status(400).json({
        success: false,
        message: `Cannot mark arrival. Current status is ${booking.status}.`,
      });
    }

    const customerLat = booking.customer_address?.location?.lat;
    const customerLng = booking.customer_address?.location?.lng;
    const distance = calculateDistanceInMeters(customerLat, customerLng, captain_lat, captain_lng);

    if (distance > 150) {
      return res.status(400).json({
        success: false,
        message: `You are too far from the customer's doorstep (${Math.round(distance)} meters away). Reach the location first.`,
      });
    }

    const generatedOtp = Math.floor(1000 + Math.random() * 9000).toString();

    booking.status = 'ARRIVED';
    booking.live_tracking.is_active = false;
    booking.otp_generated_at = new Date();
    booking.arrived_at = new Date();
    booking.start_otp = generatedOtp;
    await booking.save();

    return res.status(200).json({
      success: true,
      message: 'Arrival confirmed at location. Please collect the 4-digit start OTP from the customer.',
      status: booking.status,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// --- 5. Start Service with Customer OTP ---
exports.startCaptainService = async (req, res) => {
  try {
    const captainId = req.user.userId;
    const { bookingId } = req.params;
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({ success: false, message: 'Start OTP is required.' });
    }

    const booking = await Booking.findOne({ _id: bookingId, assigned_captain_id: captainId });
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Assigned booking not found.' });
    }

    // Verify Start OTP
    if (booking.start_otp !== String(otp).trim()) {
      return res.status(400).json({ success: false, message: 'Invalid Start OTP entered.' });
    }

    // Generate 4-digit Completion OTP for customer handshake
    const generatedCompletionOtp = Math.floor(1000 + Math.random() * 9000).toString();

    if (booking.status !== 'ARRIVED') {
      return res.status(400).json({
        success: false,
        message: `Service cannot be started. Booking status is ${booking.status}.`,
      });
    }

    if (booking.start_otp !== String(otp).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP. Please ask the customer for the correct 4-digit code.',
      });
    }

    booking.status = 'IN_PROGRESS';
    booking.service_started_at = new Date();
    booking.start_otp = null;
    booking.completion_otp = generatedCompletionOtp;
    await booking.save();

    return res.status(200).json({
      success: true,
      message: 'OTP verified. Service has officially started.',
      status: booking.status,
      started_at: booking.service_started_at,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// --- 6. Complete Service ---
exports.completeCaptainService = async (req, res) => {
  try {
    const captainId = req.user.userId;
    const { bookingId } = req.params;
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({
        success: false,
        message: 'Completion OTP from the customer is required to finish the service.',
      });
    }

    const booking = await Booking.findOne({
      _id: bookingId,
      assigned_captain_id: captainId,
    });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Assigned booking not found.' });
    }

    if (booking.status !== 'IN_PROGRESS') {
      return res.status(400).json({
        success: false,
        message: `Cannot complete service. Current booking status is ${booking.status}.`,
      });
    }

    // Handshake check
    if (booking.completion_otp !== String(otp).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid completion OTP. Please verify the code with the customer.',
      });
    }

    // Complete the booking
    booking.status = 'COMPLETED';
    booking.service_completed_at = new Date();
    booking.completion_otp = null;
    await booking.save();

    // Determine cash collection instructions
    const isPaid = booking.pricing?.payment_status === 'PAID';
    const actionRequired = isPaid ? 'DO_NOT_COLLECT_CASH' : 'COLLECT_CASH_FROM_CUSTOMER';

    return res.status(200).json({
      success: true,
      message: 'Service completed and handshake verified successfully.',
      status: booking.status,
      completed_at: booking.service_completed_at,
      bill_details: {
        total_amount: booking.pricing?.total_amount || 0,
        payment_mode: booking.pricing?.payment_mode || 'PAY_AFTER_SERVICE',
        payment_status: booking.pricing?.payment_status || 'PENDING',
        action_required: actionRequired,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};