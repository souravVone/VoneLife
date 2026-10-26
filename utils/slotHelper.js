// utils/slotHelper.js
const ALLOWED_SLOTS = [
  { slot_id: 'SLOT_1', start: '07:00', end: '09:00', label: '07:00 AM - 09:00 AM' },
  { slot_id: 'SLOT_2', start: '09:00', end: '11:00', label: '09:00 AM - 11:00 AM' },
  { slot_id: 'SLOT_3', start: '11:00', end: '13:00', label: '11:00 AM - 01:00 PM' },
  { slot_id: 'SLOT_4', start: '13:00', end: '15:00', label: '01:00 PM - 03:00 PM' },
  { slot_id: 'SLOT_5', start: '15:00', end: '17:00', label: '03:00 PM - 05:00 PM' },
  { slot_id: 'SLOT_6', start: '17:00', end: '19:00', label: '05:00 PM - 07:00 PM' },
  { slot_id: 'SLOT_7', start: '19:00', end: '21:00', label: '07:00 PM - 09:00 PM' },
];

// Returns YYYY-MM-DD in IST
const getLocalDateString = (date = new Date()) => {
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(date.getTime() + istOffset);
  return istDate.toISOString().split('T')[0];
};

// Validates whether requested date is between Today and Today + 3 days
const isDateWithinMaxDays = (dateString, maxDays = 7) => {
  const todayStr = getLocalDateString();
  const today = new Date(todayStr);
  const target = new Date(dateString);

  const diffTime = target.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays >= 0 && diffDays <= maxDays;
};

// Matches slot by start time or slot_id
const findSlot = (slotIdentifier) => {
  return ALLOWED_SLOTS.find(
    (s) => s.slot_id === slotIdentifier || s.start === slotIdentifier || s.label === slotIdentifier
  );
};

module.exports = {
  ALLOWED_SLOTS,
  getLocalDateString,
  isDateWithinMaxDays,
  findSlot,
};