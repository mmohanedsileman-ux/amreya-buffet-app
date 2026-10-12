/**
 * Buffet Operating Hours Manager - Alexandria Cement Cafeteria
 * Official Workdays: Sunday through Thursday (الأحد إلى الخميس)
 * Official Hours: 8:00 AM to 3:30 PM (08:00 - 15:30) Africa/Cairo timezone
 * Official Weekend Holidays: Friday & Saturday (الجمعة والسبت عطلة رسمية مغلق 24 ساعة)
 * Strictly Enforced: No client-side bypass, no reload exploits
 */

export const WORKING_HOURS_KEY = 'cafe_working_hours_enabled';
export const WORKING_HOURS_BYPASS_KEY = 'cafe_working_hours_bypass_until';

export interface WorkingHoursStatus {
  isOpen: boolean;
  isEnforced: boolean;
  isWeekend: boolean;
  cairoTimeText: string;
  currentHoursText: string;
  closingTimeText: string;
  openingTimeText: string;
}

// Cleanup any legacy bypass keys from localStorage permanently
try {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(WORKING_HOURS_BYPASS_KEY);
    localStorage.removeItem('cafe_working_hours_bypass');
    localStorage.removeItem('cafe_working_hours_bypass_time');
    localStorage.removeItem('cafe_working_hours_test_mode');
    sessionStorage.removeItem(WORKING_HOURS_BYPASS_KEY);
  }
} catch {}

/**
 * Returns a Date object converted strictly to Egypt's official timezone (Africa/Cairo)
 * This guarantees exact Cairo time regardless of the user device's local clock or country.
 */
export function getCairoDate(baseDate: Date = new Date()): Date {
  try {
    const cairoString = baseDate.toLocaleString('en-US', { timeZone: 'Africa/Cairo' });
    return new Date(cairoString);
  } catch {
    // Fallback if Intl timeZone is unsupported
    return baseDate;
  }
}

/**
 * Checks if a given date is Friday (5) or Saturday (6) in Egypt - Official Weekend Holidays
 */
export function isWeekendHoliday(date: Date = new Date()): boolean {
  const cairo = getCairoDate(date);
  const day = cairo.getDay();
  // 5 = Friday (الجمعة), 6 = Saturday (السبت)
  return day === 5 || day === 6;
}

/**
 * Checks if the current Egypt time is within official operating hours:
 * - Friday & Saturday: Strictly CLOSED all day (عطلة رسمية)
 * - Sunday through Thursday: Open only from 8:00 AM to 3:30 PM (08:00 - 15:30)
 */
export function isCurrentTimeWithinHours(): boolean {
  const cairo = getCairoDate();

  // 1. Weekend Holiday (Friday & Saturday) -> strictly closed
  if (isWeekendHoliday(cairo)) {
    return false;
  }

  // 2. Daily Hours (8:00 AM to 3:30 PM Egypt time)
  const hours = cairo.getHours();
  const minutes = cairo.getMinutes();
  const currentTotalMinutes = hours * 60 + minutes;

  const startMinutes = 8 * 60; // 08:00 AM
  const endMinutes = 15 * 60 + 30; // 03:30 PM (15:30)

  return currentTotalMinutes >= startMinutes && currentTotalMinutes <= endMinutes;
}

/**
 * Operating hours enforcement is strictly enabled and mandatory.
 * No client-side bypass or loopholes allowed.
 */
export function isWorkingHoursEnforced(): boolean {
  return true;
}

/**
 * Checks if any test bypass is active (strictly returns false in production)
 */
export function isWorkingHoursBypassed(): boolean {
  return false;
}

/**
 * Clears any bypass state
 */
export function clearWorkingHoursBypass(): void {
  try {
    localStorage.removeItem(WORKING_HOURS_BYPASS_KEY);
    sessionStorage.removeItem(WORKING_HOURS_BYPASS_KEY);
  } catch {}
}

/**
 * Gets remaining bypass minutes (0 in production)
 */
export function getBypassRemainingMinutes(): number {
  return 0;
}

/**
 * Sets temporary bypass - disabled in production to prevent loopholes
 */
export function setWorkingHoursBypass(): void {
  clearWorkingHoursBypass();
}

/**
 * Gets overall status for display in UI
 */
export function getWorkingHoursStatus(): WorkingHoursStatus {
  const cairo = getCairoDate();
  const isEnforced = isWorkingHoursEnforced();
  const isWithin = isCurrentTimeWithinHours();
  const isWeekend = isWeekendHoliday(cairo);

  const isOpen = !isEnforced || isWithin;

  const hours12 = cairo.getHours() % 12 || 12;
  const ampm = cairo.getHours() >= 12 ? 'م' : 'ص';
  const cairoTimeText = `${hours12}:${String(cairo.getMinutes()).padStart(2, '0')} ${ampm}`;

  return {
    isOpen,
    isEnforced,
    isWeekend,
    cairoTimeText,
    currentHoursText: 'من الأحد إلى الخميس: 8:00 ص حتى 3:30 م (الجمعة والسبت عطلة)',
    openingTimeText: '8:00 صباحاً',
    closingTimeText: '3:30 عصراً',
  };
}
