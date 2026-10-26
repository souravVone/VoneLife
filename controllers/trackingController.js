// controllers/trackingController.js
const Booking = require('../models/Booking');

// --- 1. Provider Updates GPS Location (Vendor or Captain) ---
exports.updateJobLocation = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { lat, lng, heading } = req.body;
    const { userId, role } = req.user;

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Coordinates (lat, lng) are required.',
      });
    }

    // Build authorization query: match booking by ID and assigned provider
    const query = {
      _id: bookingId,
      status: 'ASSIGNED', // Tracking is strictly active before arrival
    };

    if (role === 'captain') {
      query.assigned_captain_id = userId;
    } else if (role === 'vendor') {
      query.assigned_vendor_id = userId;
    } else {
      return res.status(403).json({ success: false, message: 'Unauthorized role for updating location.' });
    }

    // In-place document patch using $set (no history bloat)
    const updatedBooking = await Booking.findOneAndUpdate(
      query,
      {
        $set: {
          'live_tracking.is_active': true,
          'live_tracking.current_lat': Number(lat),
          'live_tracking.current_lng': Number(lng),
          'live_tracking.heading': heading !== undefined ? Number(heading) : null,
          'live_tracking.last_updated_at': new Date(),
        },
      },
      { new: true }
    ).select('live_tracking status');

    if (!updatedBooking) {
      return res.status(404).json({
        success: false,
        message: 'Active booking not found or you are not authorized to update its location.',
      });
    }

    return res.status(200).json({
      success: true,
      tracking: updatedBooking.live_tracking,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// --- 2. Customer Polls Live Tracking Data ---
exports.getJobTracking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const customerId = req.user.userId;

    const booking = await Booking.findOne({
      _id: bookingId,
      customer_id: customerId,
    })
      .select('status live_tracking customer_address assigned_vendor_id assigned_captain_id')
      .populate('assigned_captain_id', 'name phone')
      .populate('assigned_vendor_id', 'full_name phone company_details.company_name');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found.',
      });
    }

    // Determine assigned provider profile details for display
    let providerInfo = null;
    if (booking.assigned_captain_id) {
      providerInfo = {
        name: booking.assigned_captain_id.name,
        phone: booking.assigned_captain_id.phone,
        type: 'CAPTAIN',
        company: booking.assigned_vendor_id?.company_details?.company_name || null,
      };
    } else if (booking.assigned_vendor_id) {
      providerInfo = {
        name: booking.assigned_vendor_id.full_name,
        phone: booking.assigned_vendor_id.phone,
        type: 'INDIVIDUAL_VENDOR',
      };
    }

    return res.status(200).json({
      success: true,
      booking_status: booking.status,
      is_tracking_active: booking.status === 'ASSIGNED' && (booking.live_tracking?.is_active || false),
      provider: providerInfo,
      destination: {
        lat: booking.customer_address?.location?.lat,
        lng: booking.customer_address?.location?.lng,
        address: `${booking.customer_address?.address_line1}, ${booking.customer_address?.city}`,
      },
      current_location: {
        lat: booking.live_tracking?.current_lat || null,
        lng: booking.live_tracking?.current_lng || null,
        heading: booking.live_tracking?.heading || null,
        last_updated_at: booking.live_tracking?.last_updated_at || null,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};