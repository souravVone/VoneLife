const Booking = require('../models/Booking');

// Create a new service booking request
exports.createBooking = async (req, res) => {
  try {
    const customerId = req.user.userId;
    const { service_details, customer_address } = req.body;

    // 1. Validate service details
    if (
      !service_details ||
      !service_details.category ||
      !service_details.sub_category ||
      !service_details.service_name
    ) {
      return res.status(400).json({
        success: false,
        message: 'service_details must include category, sub_category, and service_name.',
      });
    }

    // 2. Validate address and postal code
    if (!customer_address || !customer_address.address_line1 || !customer_address.pincode) {
      return res.status(400).json({
        success: false,
        message: 'customer_address must include at least address_line1 and pincode.',
      });
    }

    const cleanPincode = String(customer_address.pincode).trim();
    if (!/^\d{6}$/.test(cleanPincode)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid customer pincode. Must be a 6-digit postal code.',
      });
    }

    // 3. Save booking with BROADCASTED status
    const booking = await Booking.create({
      customer_id: customerId,
      service_details: {
        category: service_details.category.trim(),
        sub_category: service_details.sub_category.trim(),
        service_name: service_details.service_name.trim(),
      },
      customer_address: {
        address_line1: customer_address.address_line1.trim(),
        address_line2: customer_address.address_line2 ? customer_address.address_line2.trim() : '',
        landmark: customer_address.landmark ? customer_address.landmark.trim() : '',
        city: customer_address.city ? customer_address.city.trim() : '',
        state: customer_address.state ? customer_address.state.trim() : '',
        pincode: cleanPincode,
      },
      status: 'BROADCASTED',
    });

    return res.status(201).json({
      success: true,
      message: 'Booking request placed and broadcasted to eligible service providers.',
      booking,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Get all bookings placed by this customer
exports.getMyBookings = async (req, res) => {
  try {
    const customerId = req.user.userId;

    const bookings = await Booking.find({ customer_id: customerId })
      .populate('assigned_vendor_id', 'name phone')
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