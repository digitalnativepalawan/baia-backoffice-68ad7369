export interface OperationalBookingDates {
  check_in: string;
  check_out: string;
}

export type OperationalUnitStatus = 'occupied' | 'to_clean' | 'ready';

export const getManilaDateKey = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

export const doesBookingCoverOperationalDay = (
  booking: OperationalBookingDates | null | undefined,
  today = getManilaDateKey(),
) => {
  if (!booking?.check_in || !booking?.check_out) return false;
  return booking.check_in <= today && booking.check_out >= today;
};

export const shouldTreatBookingAsOccupiedWithoutManualCheckIn = (
  booking: OperationalBookingDates | null | undefined,
  today = getManilaDateKey(),
) => {
  if (!booking?.check_in || !booking?.check_out) return false;
  return booking.check_in < today && booking.check_out >= today;
};
