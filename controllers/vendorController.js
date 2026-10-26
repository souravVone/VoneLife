// controllers/vendorController.js
const Vendor = require('../models/Vendor');
const Booking = require('../models/Booking');
const { calculateDistanceInMeters } = require('../utils/distance');
const Captain = require('../models/Captain');

// --- 1. Get All Active Jobs Claimed by Company Captains ---
exports.getCompanyActiveJobs = async (req, res) => {
    try {
        const companyVendorId = req.user.userId;

        // Find all bookings assigned to this parent company currently in transit or execution
        const activeJobs = await Booking.find({
            assigned_vendor_id: companyVendorId,
            accepted_by_role: 'CAPTAIN',
            status: { $in: ['ASSIGNED', 'ARRIVED', 'IN_PROGRESS'] },
        })
            .populate('assigned_captain_id', 'name phone')
            .populate('customer_id', 'name phone')
            .sort({ updatedAt: -1 });

        const formattedJobs = activeJobs.map((job) => ({
            booking_id: job._id,
            status: job.status,
            services: job.services,
            schedule: job.schedule,
            customer: {
                name: job.customer_id?.name || 'Customer',
                phone: job.customer_id?.phone || null,
                address: `${job.customer_address?.address_line1}, ${job.customer_address?.city}`,
            },
            captain: {
                id: job.assigned_captain_id?._id,
                name: job.assigned_captain_id?.name,
                phone: job.assigned_captain_id?.phone,
            },
            live_location: {
                is_tracking_active: job.live_tracking?.is_active || false,
                lat: job.live_tracking?.current_lat || null,
                lng: job.live_tracking?.current_lng || null,
                last_updated_at: job.live_tracking?.last_updated_at || null,
            },
            timestamps: {
                assigned_at: job.assigned_at,
                arrived_at: job.arrived_at,
                service_started_at: job.service_started_at,
            },
        }));

        return res.status(200).json({
            success: true,
            count: formattedJobs.length,
            active_jobs: formattedJobs,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// --- 2. Captain Fleet Roster with Live Availability Status ---
exports.getCompanyCaptainsStatus = async (req, res) => {
    try {
        const companyVendorId = req.user.userId;

        // 1. Fetch all active captains belonging to this company
        const captains = await Captain.find({
            vendor_id: companyVendorId,
            status: 'ACTIVE',
        }).select('name phone id_details status createdAt');

        // 2. Fetch all current ongoing jobs for this company
        const activeJobs = await Booking.find({
            assigned_vendor_id: companyVendorId,
            accepted_by_role: 'CAPTAIN',
            status: { $in: ['ASSIGNED', 'ARRIVED', 'IN_PROGRESS'] },
        }).select('assigned_captain_id status services schedule customer_address');

        // Build a lookup map of captainId -> current job
        const captainJobMap = {};
        activeJobs.forEach((job) => {
            if (job.assigned_captain_id) {
                captainJobMap[job.assigned_captain_id.toString()] = job;
            }
        });

        // 3. Map captains with real-time operational status
        const fleetOverview = captains.map((captain) => {
            const activeJob = captainJobMap[captain._id.toString()];

            return {
                captain_id: captain._id,
                name: captain.name,
                phone: captain.phone,
                operational_status: activeJob ? 'ON_JOB' : 'AVAILABLE',
                current_job: activeJob
                    ? {
                        booking_id: activeJob._id,
                        service_status: activeJob.status,
                        service_name: activeJob.services?.[0]?.sub_category || 'Service',
                        customer_city: activeJob.customer_address?.city,
                        scheduled_date: activeJob.schedule?.booking_date_string,
                    }
                    : null,
            };
        });

        return res.status(200).json({
            success: true,
            total_captains: captains.length,
            busy_captains: Object.keys(captainJobMap).length,
            available_captains: captains.length - Object.keys(captainJobMap).length,
            fleet: fleetOverview,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// --- Helper: Resolve Location for INDIVIDUAL vs. COMPANY ---
const getVendorLocation = (vendor) => {
    if (vendor.entity_type === 'COMPANY' && vendor.company_details?.address) {
        return {
            city: vendor.company_details.address.city,
            pincode: vendor.company_details.address.pincode,
        };
    }
    return {
        city: vendor.kyc_details?.city,
        pincode: vendor.kyc_details?.pincode,
    };
};

// --- Sub-Category Online/Offline Toggle ---
exports.toggleSubCategoryStatus = async (req, res) => {
    try {
        const vendorId = req.user.userId;
        const { sub_category, is_active } = req.body;

        if (!sub_category || typeof is_active !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: 'Please provide sub_category (string) and is_active (boolean: true/false).',
            });
        }

        const vendor = await Vendor.findById(vendorId);
        if (!vendor) {
            return res.status(404).json({ success: false, message: 'Vendor not found.' });
        }

        const targetSubCat = sub_category.trim().toLowerCase();
        let updatedCount = 0;

        vendor.services_offered = vendor.services_offered.map((item) => {
            if (item.sub_category.trim().toLowerCase() === targetSubCat) {
                item.is_active = is_active;
                updatedCount++;
            }
            return item;
        });

        if (updatedCount === 0) {
            return res.status(404).json({
                success: false,
                message: `Sub-category "${sub_category}" not found in your offered services.`,
            });
        }

        await vendor.save();

        return res.status(200).json({
            success: true,
            message: `Sub-category "${sub_category}" is now ${is_active ? 'ONLINE' : 'OFFLINE'}.`,
            services_offered: vendor.services_offered,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// --- Job Discovery (Date-Lock, Active Sub-Categories & Entity Location Enforced) ---
exports.getAvailableJobs = async (req, res) => {
    try {
        const vendorId = req.user.userId;

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

        if (vendor.status === 'blocked') {
            return res.status(403).json({
                success: false,
                message: 'Your account is suspended. Please contact administrator.',
            });
        }

        // Resolves city and pincode dynamically for INDIVIDUAL or COMPANY
        const { city: vendorCity, pincode: vendorPincode } = getVendorLocation(vendor);

        if (!vendorPincode || !vendorCity) {
            return res.status(400).json({
                success: false,
                message: 'Vendor location (pincode and city) not configured in KYC.',
            });
        }

        // 1. Gather active sub-categories
        const activeSubCategories = [
            ...new Set(
                vendor.services_offered
                    .filter((item) => item.is_active === true)
                    .map((item) => item.sub_category)
            ),
        ];

        if (activeSubCategories.length === 0) {
            return res.status(200).json({
                success: true,
                count: 0,
                jobs: [],
                message: 'All your sub-categories are currently OFFLINE. Turn them ONLINE to receive jobs.',
            });
        }

        // 2. Identify all dates where vendor currently has an unfinished job
        const activeJobs = await Booking.find({
            assigned_vendor_id: vendorId,
            status: { $in: ['ASSIGNED', 'ARRIVED', 'IN_PROGRESS'] },
        }).select('schedule.booking_date_string');

        const busyDates = activeJobs.map((j) => j.schedule?.booking_date_string).filter(Boolean);

        // 3. Query broadcasted jobs matching location and offered services
        const availableJobs = await Booking.find({
            status: 'BROADCASTED',
            'customer_address.city': { $regex: new RegExp(`^${vendorCity}$`, 'i') },
            'customer_address.pincode': { $ne: vendorPincode },
            'services.sub_category': { $in: activeSubCategories },
            'schedule.booking_date_string': { $nin: busyDates },
        }).select('-pricing -start_otp -completion_otp')
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

// --- Accept Job (Atomic Check for Single Active Order Per Date) ---
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

        if (vendor.status === 'blocked') {
            return res.status(403).json({
                success: false,
                message: 'Your account is suspended. Please contact administrator.',
            });
        }

        // 1. Fetch the target booking
        const targetBooking = await Booking.findById(bookingId);
        if (!targetBooking || targetBooking.status !== 'BROADCASTED') {
            return res.status(409).json({
                success: false,
                message: 'This job is no longer available or has already been accepted.',
            });
        }

        const targetDate = targetBooking.schedule?.booking_date_string;

        // 2. Verify vendor does not already hold an active job on that date
        if (targetDate) {
            const hasActiveJobOnDate = await Booking.findOne({
                assigned_vendor_id: vendorId,
                status: { $in: ['ASSIGNED', 'ARRIVED', 'IN_PROGRESS'] },
                'schedule.booking_date_string': targetDate,
            });

            if (hasActiveJobOnDate) {
                return res.status(409).json({
                    success: false,
                    message: `You already have an active job scheduled on ${targetDate}. Complete that job before accepting another for the same day.`,
                });
            }
        }

        // 3. Verify sub-category availability
        const activeSubCategories = vendor.services_offered
            .filter((item) => item.is_active === true)
            .map((item) => item.sub_category);

        const { city: vendorCity, pincode: vendorPincode } = getVendorLocation(vendor);

        // 4. Atomic assignment
        const assignedBooking = await Booking.findOneAndUpdate(
            {
                _id: bookingId,
                status: 'BROADCASTED',
                'customer_address.city': { $regex: new RegExp(`^${vendorCity}$`, 'i') },
                'customer_address.pincode': { $ne: vendorPincode },
                'services.sub_category': { $in: activeSubCategories },
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
                message: 'Could not accept job. It may have been claimed by another vendor or your sub-category is inactive.',
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

// --- Drop Assigned Job ---
exports.dropAssignedJob = async (req, res) => {
    try {
        const vendorId = req.user.userId;
        const { bookingId } = req.params;

        const booking = await Booking.findOne({ _id: bookingId, assigned_vendor_id: vendorId });
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Assigned booking not found.' });
        }

        if (booking.status !== 'ASSIGNED') {
            return res.status(400).json({
                success: false,
                message: `Job cannot be dropped after reaching the location or starting (Status: ${booking.status}).`,
            });
        }

        booking.status = 'BROADCASTED';
        booking.assigned_vendor_id = null;
        booking.assigned_at = null;
        booking.start_otp = null;
        await booking.save();

        return res.status(200).json({
            success: true,
            message: 'Job dropped. It has been re-broadcasted for other service partners.',
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// --- Active Job & History Views ---
exports.getMyActiveJob = async (req, res) => {
    try {
        const vendorId = req.user.userId;

        const activeJob = await Booking.findOne({
            assigned_vendor_id: vendorId,
            accepted_by_role: 'INDIVIDUAL_VENDOR',
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

exports.getMyJobHistory = async (req, res) => {
    try {
        const vendorId = req.user.userId;

        const history = await Booking.find({
            assigned_vendor_id: vendorId,
            status: { $in: ['COMPLETED', 'CANCELLED'] },
        })
            .sort({ updatedAt: -1 })
            .select('-start_otp');

        return res.status(200).json({
            success: true,
            count: history.length,
            history,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// --- Doorstep Execution Flow ---
exports.markArrived = async (req, res) => {
    try {
        const vendorId = req.user.userId;
        const { bookingId } = req.params;
        const { vendor_lat, vendor_lng } = req.body;

        if (vendor_lat === undefined || vendor_lng === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Current GPS coordinates (vendor_lat, vendor_lng) are required.',
            });
        }

        const booking = await Booking.findOne({ _id: bookingId, assigned_vendor_id: vendorId });
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Assigned booking not found.' });
        }

        if (booking.status !== 'ASSIGNED') {
            return res.status(400).json({
                success: false,
                message: `Cannot mark arrival. Current status is ${booking.status}.`,
            });
        }

        const customerLat = booking.customer_address.location.lat;
        const customerLng = booking.customer_address.location.lng;
        const distance = calculateDistanceInMeters(customerLat, customerLng, vendor_lat, vendor_lng);
        const ALLOWED_RADIUS_METERS = 150;

        if (distance > ALLOWED_RADIUS_METERS) {
            return res.status(400).json({
                success: false,
                message: `You are too far from the customer's doorstep (${Math.round(distance)} meters away). Please reach the address first.`,
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

exports.resendStartOtpByVendor = async (req, res) => {
    try {
        const vendorId = req.user.userId;
        const { bookingId } = req.params;

        const booking = await Booking.findOne({ _id: bookingId, assigned_vendor_id: vendorId });
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Assigned booking not found.' });
        }

        if (booking.status !== 'ARRIVED') {
            return res.status(400).json({
                success: false,
                message: `Cannot resend OTP. Booking status is ${booking.status}. OTP can only be resent when vendor has arrived.`,
            });
        }

        const now = new Date();
        if (booking.otp_generated_at) {
            const secondsPassed = Math.floor((now - new Date(booking.otp_generated_at)) / 1000);
            if (secondsPassed < 60) {
                return res.status(429).json({
                    success: false,
                    message: `Please wait ${60 - secondsPassed} seconds before requesting a new OTP.`,
                });
            }
        }

        const newOtp = Math.floor(1000 + Math.random() * 9000).toString();
        booking.start_otp = newOtp;
        booking.otp_generated_at = now;
        await booking.save();

        return res.status(200).json({
            success: true,
            message: 'A fresh start OTP has been generated and sent to the customer.',
            status: booking.status,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.startService = async (req, res) => {
    try {
        const vendorId = req.user.userId;
        const { bookingId } = req.params;
        const { otp } = req.body;

        if (!otp) {
            return res.status(400).json({ success: false, message: 'Start OTP is required.' });
        }

        const booking = await Booking.findOne({
            _id: bookingId,
            assigned_vendor_id: vendorId,
        });

        if (!booking) {
            return res.status(404).json({ success: false, message: 'Assigned booking not found.' });
        }

        if (booking.status !== 'ARRIVED') {
            return res.status(400).json({
                success: false,
                message: `Cannot start service. Booking is currently ${booking.status}.`,
            });
        }

        if (booking.start_otp !== String(otp).trim()) {
            return res.status(400).json({ success: false, message: 'Invalid Start OTP entered.' });
        }

        const generatedCompletionOtp = Math.floor(1000 + Math.random() * 9000).toString();

        booking.status = 'IN_PROGRESS';
        booking.service_started_at = new Date();
        booking.start_otp = null;
        booking.completion_otp = generatedCompletionOtp;

        await booking.save();

        return res.status(200).json({
            success: true,
            message: 'Start OTP verified. Service is now in progress.',
            status: booking.status,
            service_started_at: booking.service_started_at,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.completeService = async (req, res) => {
    try {
        const vendorId = req.user.userId;
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
            assigned_vendor_id: vendorId,
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

        booking.status = 'COMPLETED';
        booking.service_completed_at = new Date();
        booking.completion_otp = null;
        await booking.save();

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

// --- KYC & Onboarding: Track A (Individual) ---
exports.submitKyc = async (req, res) => {
    try {
        const vendorId = req.user.userId;
        const {
            full_name,
            aadhar_card_number,
            pan_card,
            gender,
            permanent_address,
            pincode,
            city,
            services_offered,
        } = req.body;

        if (!full_name || !aadhar_card_number || !pan_card || !gender || !permanent_address) {
            return res.status(400).json({
                success: false,
                message: 'All personal KYC details (Full Name, Aadhar, PAN, Gender, Address) are required.',
            });
        }

        if (!pincode || !/^\d{6}$/.test(pincode.trim())) {
            return res.status(400).json({
                success: false,
                message: 'Invalid pincode. Please provide a valid 6-digit postal code.',
            });
        }

        if (!services_offered) {
            return res.status(400).json({
                success: false,
                message: 'Please provide at least one service offered.',
            });
        }

        let parsedServices = [];
        try {
            parsedServices = typeof services_offered === 'string' ? JSON.parse(services_offered) : services_offered;
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

        for (const item of parsedServices) {
            if (!item.category || !item.sub_category || !item.service_name) {
                return res.status(400).json({
                    success: false,
                    message: 'Each service must contain category, sub_category, and service_name.',
                });
            }
            if (item.is_active === undefined) {
                item.is_active = true;
            }
        }

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

        const updatedVendor = await Vendor.findByIdAndUpdate(
            vendorId,
            {
                entity_type: 'INDIVIDUAL',
                kyc_status: 'PENDING_VERIFICATION',
                services_offered: parsedServices,
                kyc_details: {
                    fullNameGovtId: full_name,
                    aadharCardNumber: aadhar_card_number,
                    panCardNumber: pan_card,
                    gender: gender.toLowerCase(),
                    permanentAddress: permanent_address,
                    pincode: pincode.trim(),
                    city: String(city).trim(),
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
            entity_type: updatedVendor.entity_type,
            kyc_status: updatedVendor.kyc_status,
            services_count: updatedVendor.services_offered.length,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// --- KYC & Onboarding: Track B (Company / Agency) ---
exports.submitCompanyKyc = async (req, res) => {
    try {
        const vendorId = req.user.userId;
        const {
            company_name,
            business_type,
            company_pan,
            gstin,
            udyam_registration,
            trade_license_number,
            // Representative info
            rep_name,
            rep_designation,
            rep_phone,
            rep_email,
            // Address info
            address_line1,
            address_line2,
            city,
            state,
            pincode,
            // Bank info
            account_holder_name,
            bank_name,
            branch_name,
            account_number,
            ifsc_code,
            // Services offered
            services_offered,
            // Captain / Pilot Details
            captain_name,
            captain_phone,
            captain_aadhar_number,
            captain_pan_number,
        } = req.body;

        // --- 1. Validate Company Legal & Signatory Details ---
        if (!company_name || !business_type || !company_pan) {
            return res.status(400).json({
                success: false,
                message: 'company_name, business_type, and company_pan are required.',
            });
        }

        const validBusinessTypes = ['PROPRIETORSHIP', 'PARTNERSHIP', 'LLP', 'PVT_LTD', 'OTHER'];
        if (!validBusinessTypes.includes(business_type.toUpperCase())) {
            return res.status(400).json({
                success: false,
                message: `Invalid business_type. Must be one of: ${validBusinessTypes.join(', ')}`,
            });
        }

        if (!rep_name || !rep_phone) {
            return res.status(400).json({
                success: false,
                message: 'Authorized representative name and phone are required.',
            });
        }

        // --- 2. Validate Address Details ---
        if (!address_line1 || !city || !pincode) {
            return res.status(400).json({
                success: false,
                message: 'Corporate address line1, city, and pincode are required.',
            });
        }

        const cleanPincode = String(pincode).trim();
        if (!/^\d{6}$/.test(cleanPincode)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid pincode. Must be a 6-digit postal code.',
            });
        }

        // --- 3. Validate Bank Details ---
        if (!account_holder_name || !bank_name || !account_number || !ifsc_code) {
            return res.status(400).json({
                success: false,
                message: 'Bank details (account_holder_name, bank_name, account_number, ifsc_code) are required.',
            });
        }

        // --- 4. Validate First Captain Text Info ---
        if (!captain_name || !captain_phone || !captain_aadhar_number || !captain_pan_number) {
            return res.status(400).json({
                success: false,
                message: 'Primary captain details (captain_name, captain_phone, captain_aadhar_number, captain_pan_number) are required.',
            });
        }

        const cleanCaptainPhone = String(captain_phone).trim();

        // Check if captain phone is already registered to a different vendor
        const existingCaptain = await Captain.findOne({ phone: cleanCaptainPhone });
        if (existingCaptain && String(existingCaptain.vendor_id) !== String(vendorId)) {
            return res.status(409).json({
                success: false,
                message: `A captain with phone number ${cleanCaptainPhone} is already registered under another provider.`,
            });
        }

        // --- 5. Validate Uploaded Documents ---
        const files = req.files || {};

        // Mandatory Company Documents
        if (
            !files.incorporation_proof ||
            !files.company_pan_file ||
            !files.business_address_proof ||
            !files.authorization_letter ||
            !files.cancelled_cheque
        ) {
            return res.status(400).json({
                success: false,
                message:
                    'Mandatory company documents missing: incorporation_proof, company_pan_file, business_address_proof, authorization_letter, and cancelled_cheque are required.',
            });
        }

        // Mandatory Captain Documents
        if (!files.captain_aadhar_card || !files.captain_pan_card || !files.captain_selfie) {
            return res.status(400).json({
                success: false,
                message:
                    'Mandatory captain documents missing: captain_aadhar_card, captain_pan_card, and captain_selfie are required.',
            });
        }

        // --- 6. Parse Services Offered ---
        if (!services_offered) {
            return res.status(400).json({
                success: false,
                message: 'Please provide at least one service offered.',
            });
        }

        let parsedServices = [];
        try {
            parsedServices = typeof services_offered === 'string' ? JSON.parse(services_offered) : services_offered;
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

        for (const item of parsedServices) {
            if (!item.category || !item.sub_category || !item.service_name) {
                return res.status(400).json({
                    success: false,
                    message: 'Each service must contain category, sub_category, and service_name.',
                });
            }
            if (item.is_active === undefined) {
                item.is_active = true;
            }
        }

        // --- 7. Construct Document Path Maps ---
        const companyDocuments = {
            incorporation_proof: files.incorporation_proof[0].path.replace(/\\/g, '/'),
            company_pan_file: files.company_pan_file[0].path.replace(/\\/g, '/'),
            business_address_proof: files.business_address_proof[0].path.replace(/\\/g, '/'),
            authorization_letter: files.authorization_letter[0].path.replace(/\\/g, '/'),
            gst_certificate: files.gst_certificate ? files.gst_certificate[0].path.replace(/\\/g, '/') : null,
            msme_certificate: files.msme_certificate ? files.msme_certificate[0].path.replace(/\\/g, '/') : null,
            trade_license_file: files.trade_license_file ? files.trade_license_file[0].path.replace(/\\/g, '/') : null,
        };

        const bankDetails = {
            account_holder_name: String(account_holder_name).trim(),
            bank_name: String(bank_name).trim(),
            branch_name: branch_name ? String(branch_name).trim() : '',
            account_number: String(account_number).trim(),
            ifsc_code: String(ifsc_code).trim().toUpperCase(),
            cancelled_cheque_file: files.cancelled_cheque[0].path.replace(/\\/g, '/'),
        };

        // --- 8. Update Company Vendor Record ---
        const updatedVendor = await Vendor.findByIdAndUpdate(
            vendorId,
            {
                entity_type: 'COMPANY',
                kyc_status: 'PENDING_VERIFICATION',
                services_offered: parsedServices,
                company_details: {
                    company_name: String(company_name).trim(),
                    business_type: business_type.toUpperCase(),
                    company_pan: String(company_pan).trim().toUpperCase(),
                    gstin: gstin ? String(gstin).trim().toUpperCase() : '',
                    udyam_registration: udyam_registration ? String(udyam_registration).trim() : '',
                    trade_license_number: trade_license_number ? String(trade_license_number).trim() : '',
                    representative: {
                        name: String(rep_name).trim(),
                        designation: rep_designation ? String(rep_designation).trim() : '',
                        phone: String(rep_phone).trim(),
                        email: rep_email ? String(rep_email).trim() : '',
                    },
                    address: {
                        address_line1: String(address_line1).trim(),
                        address_line2: address_line2 ? String(address_line2).trim() : '',
                        city: String(city).trim(),
                        state: state ? String(state).trim() : '',
                        pincode: cleanPincode,
                    },
                    documents: companyDocuments,
                    submittedAt: new Date(),
                },
                bank_details: bankDetails,
            },
            { new: true }
        );

        if (!updatedVendor) {
            return res.status(404).json({ success: false, message: 'Vendor record not found.' });
        }

        // --- 9. Upsert Auto-Approved Captain Record ---
        const primaryCaptain = await Captain.findOneAndUpdate(
            { phone: cleanCaptainPhone },
            {
                vendor_id: updatedVendor._id,
                name: String(captain_name).trim(),
                phone: cleanCaptainPhone,
                id_details: {
                    aadhar_number: String(captain_aadhar_number).trim(),
                    pan_number: String(captain_pan_number).trim().toUpperCase(),
                },
                documents: {
                    aadhar_card_file: files.captain_aadhar_card[0].path.replace(/\\/g, '/'),
                    pan_card_file: files.captain_pan_card[0].path.replace(/\\/g, '/'),
                    selfie_file: files.captain_selfie[0].path.replace(/\\/g, '/'),
                },
                status: 'ACTIVE',
            },
            { new: true, upsert: true }
        );

        return res.status(200).json({
            success: true,
            message: 'Company KYC submitted and primary captain onboarded successfully.',
            entity_type: updatedVendor.entity_type,
            kyc_status: updatedVendor.kyc_status,
            services_count: updatedVendor.services_offered.length,
            primary_captain: {
                id: primaryCaptain._id,
                name: primaryCaptain.name,
                phone: primaryCaptain.phone,
                status: primaryCaptain.status,
            },
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// --- View KYC Status (Works for Both INDIVIDUAL and COMPANY) ---
exports.getKycStatus = async (req, res) => {
    try {
        const vendor = await Vendor.findById(req.user.userId).select(
            'entity_type kyc_status kyc_remarks kyc_details company_details bank_details'
        );
        if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found.' });

        const responseData = {
            success: true,
            entity_type: vendor.entity_type || 'INDIVIDUAL',
            kyc_status: vendor.kyc_status,
            remarks: vendor.kyc_remarks || '',
        };

        if (vendor.entity_type === 'COMPANY') {
            responseData.submittedDetails = {
                company_details: vendor.company_details,
                bank_details: vendor.bank_details,
            };
        } else {
            responseData.submittedDetails = vendor.kyc_details;
        }

        return res.status(200).json(responseData);
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// --- Fleet Management: List All Company Captains ---
exports.getCompanyCaptains = async (req, res) => {
    try {
        const vendorId = req.user.userId;

        // Verify company vendor status
        const vendor = await Vendor.findById(vendorId);
        if (!vendor || vendor.entity_type !== 'COMPANY') {
            return res.status(403).json({
                success: false,
                message: 'Only registered company vendors can view captain fleets.',
            });
        }

        // Retrieve active and suspended captains (excluding permanently removed ones)
        const captains = await Captain.find({
            vendor_id: vendorId,
            status: { $ne: 'REMOVED' },
        })
            .select('-__v')
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: captains.length,
            captains,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// --- Fleet Management: Onboard Additional Captain ---
exports.onboardAdditionalCaptain = async (req, res) => {
    try {
        const vendorId = req.user.userId;

        const vendor = await Vendor.findById(vendorId);
        if (!vendor || vendor.entity_type !== 'COMPANY') {
            return res.status(403).json({
                success: false,
                message: 'Only registered company vendors can onboard captains.',
            });
        }

        if (vendor.kyc_status !== 'APPROVED') {
            return res.status(403).json({
                success: false,
                message: 'Your company KYC must be APPROVED before onboarding additional captains.',
            });
        }

        const {
            captain_name,
            captain_phone,
            captain_aadhar_number,
            captain_pan_number,
        } = req.body;

        if (!captain_name || !captain_phone || !captain_aadhar_number || !captain_pan_number) {
            return res.status(400).json({
                success: false,
                message: 'All captain details (captain_name, captain_phone, captain_aadhar_number, captain_pan_number) are required.',
            });
        }

        const cleanCaptainPhone = String(captain_phone).trim();

        // Check if phone number is already registered across any vendor
        const existingCaptain = await Captain.findOne({ phone: cleanCaptainPhone });
        if (existingCaptain) {
            return res.status(409).json({
                success: false,
                message: `A captain with phone number ${cleanCaptainPhone} is already registered in the system.`,
            });
        }

        const files = req.files || {};
        if (!files.captain_aadhar_card || !files.captain_pan_card || !files.captain_selfie) {
            return res.status(400).json({
                success: false,
                message: 'Mandatory captain documents missing: captain_aadhar_card, captain_pan_card, and captain_selfie are required.',
            });
        }

        const newCaptain = await Captain.create({
            vendor_id: vendorId,
            name: String(captain_name).trim(),
            phone: cleanCaptainPhone,
            id_details: {
                aadhar_number: String(captain_aadhar_number).trim(),
                pan_number: String(captain_pan_number).trim().toUpperCase(),
            },
            documents: {
                aadhar_card_file: files.captain_aadhar_card[0].path.replace(/\\/g, '/'),
                pan_card_file: files.captain_pan_card[0].path.replace(/\\/g, '/'),
                selfie_file: files.captain_selfie[0].path.replace(/\\/g, '/'),
            },
            status: 'ACTIVE', // Auto-approved directly on submission
        });

        return res.status(201).json({
            success: true,
            message: 'New captain onboarded and activated successfully.',
            captain: newCaptain,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// --- Fleet Management: Remove / Deactivate Captain ---
exports.removeCaptain = async (req, res) => {
    try {
        const vendorId = req.user.userId;
        const { captainId } = req.params;

        // Check that captain belongs to this company
        const captain = await Captain.findOne({ _id: captainId, vendor_id: vendorId });
        if (!captain) {
            return res.status(404).json({
                success: false,
                message: 'Captain record not found in your fleet.',
            });
        }

        // Guard: Prevent removal if captain has an ongoing job
        const ongoingJob = await Booking.findOne({
            assigned_vendor_id: vendorId,
            status: { $in: ['ASSIGNED', 'ARRIVED', 'IN_PROGRESS'] },
            // If booking schema includes assigned_captain_id:
            ...(Booking.schema.paths.assigned_captain_id ? { assigned_captain_id: captainId } : {}),
        });

        if (ongoingJob) {
            return res.status(400).json({
                success: false,
                message: 'Cannot remove captain while they have an active or in-progress booking assigned.',
            });
        }

        captain.status = 'REMOVED';
        await captain.save();

        return res.status(200).json({
            success: true,
            message: `Captain ${captain.name} has been removed from your company fleet.`,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};