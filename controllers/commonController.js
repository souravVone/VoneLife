// controllers/commonController.js
const https = require('https');

// Simple in-memory cache so repeated lookups don't hit external networks
const pincodeCache = new Map();

exports.lookupPincode = async (req, res) => {
  try {
    const { pincode } = req.params;
    const cleanPincode = String(pincode).trim();

    if (!/^\d{6}$/.test(cleanPincode)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid pincode format. Please provide a valid 6-digit PIN code.',
      });
    }

    // Check memory cache first
    if (pincodeCache.has(cleanPincode)) {
      return res.status(200).json({
        success: true,
        source: 'cache',
        data: pincodeCache.get(cleanPincode),
      });
    }

    // Fetch from India Post Public Directory API
    const url = `https://api.postalpincode.in/pincode/${cleanPincode}`;

    https.get(url, (apiRes) => {
      let data = '';

      apiRes.on('data', (chunk) => {
        data += chunk;
      });

      apiRes.on('end', () => {
        try {
          const parsed = JSON.parse(data);

          if (!parsed || parsed[0]?.Status !== 'Success' || !parsed[0]?.PostOffice?.length) {
            return res.status(404).json({
              success: false,
              message: 'PIN code not found or invalid.',
            });
          }

          const office = parsed[0].PostOffice[0];
          // Division or District represents the City / Administrative hub
          const city = office.Division && office.Division !== 'NA' ? office.Division : office.District;
          const district = office.District;
          const state = office.State;

          const locationData = {
            pincode: cleanPincode,
            city: city.trim(),
            district: district.trim(),
            state: state.trim(),
          };

          // Store in cache
          pincodeCache.set(cleanPincode, locationData);

          return res.status(200).json({
            success: true,
            source: 'network',
            data: locationData,
          });
        } catch (err) {
          return res.status(500).json({
            success: false,
            message: 'Failed to parse postal API response.',
          });
        }
      });
    }).on('error', (err) => {
      return res.status(502).json({
        success: false,
        message: `Postal service unreachable: ${err.message}`,
      });
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};