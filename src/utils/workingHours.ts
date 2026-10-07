/**
 * Buffet Operating Hours Manager
 * Official Workdays: Sunday through Thursday (الأحد إلى الخميس)
 * Official Hours: 8:00 AM to 3:30 PM (8:00 - 15:30)
 * Official Weekend Holidays: Friday & Saturday (الجمعة والسبت عطلة رسمية)
 * Scheduled Live Enforcement Date: Thursday, October 1, 2026
 */

export const WORKING_HOURS_KEY = 'cafe_working_hours_enabled';
export const WORKING_HOURS_BYPASS_KEY = 'cafe_working_hours_bypass_until';
export const WORKING_HOURS_SCHEDULE_DATE = '2026-10-01'; // Thursday

export interface WorkingHoursStatus {
  isOpen: boolean;
  isEnforced: boolean;
  isWeekend: boolean;
  isBypassed: boolean;
  bypassRemainingMinutes: number;
  scheduledStartDate: string;
  currentHoursText: string;
  closingTimeText: string;
  openingTimeText: string;
}

/**
 * Checks if a temporary bypass for testing is currently active
 */
export function isWorkingHoursBypassed(): boolean {
  try {
    const bypassUntil = localStorage.getItem(WORKING_HOURS_BYPASS_KEY);
    if (bypassUntil) {
      const untilNum = Number(bypassUntil);
      if (!isNaN(untilNum) && untilNum > Date.now()) {
        return true;
      }
    }
  } catch {}
  return false;
}

/**
 * Sets temporary bypass for testing (default 2 hours)
 */
export function setWorkingHoursBypass(hours: number = 2): void {
  try {
    const expireTime = Date.now() + Math.max(0.5, hours) * 3600 * 1000;
    localStorage.setItem(WORKING_HOURS_BYPASS_KEY, String(expireTime));
  } catch {}
}

/**
 * Cancels the temporary bypass and restores normal working hours lock
 */
export function clearWorkingHoursBypass(): void {
  try {
    localStorage.removeItem(WORKING_HOURS_BYPASS_KEY);
  } catch {}
}

/**
 * Returns remaining minutes of the test bypass
 */
export function getBypassRemainingMinutes(): number {
  try {
    const bypassUntil = localStorage.getItem(WORKING_HOURS_BYPASS_KEY);
    if (bypassUntil) {
      const untilNum = Number(bypassUntil);
      if (!isNaN(untilNum) && untilNum > Date.now()) {
        return Math.ceil((untilNum - Date.now()) / (60 * 1000));
      }
    }
  } catch {}
  return 0;
}

// Clear any test bypass on load as testing is now concluded
try {
  localStorage.removeItem(WORKING_HOURS_BYPASS_KEY);
} catch {}

/**
 * Checks if a given date is Friday (5) or Saturday (6) - Official Weekend Holidays
 */
export function isWeekendHoliday(date: Date = new Date()): boolean {
  const day = date.getDay();
  // 5 = Friday (الجمعة), 6 = Saturday (السبت)
  return day === 5 || day === 6;
}

/**
 * Checks if the current time is within official operating hours:
 * - Friday & Saturday: Strictly CLOSED all day (عطلة رسمية)
 * - Sunday through Thursday: Open only from 8:00 AM to 3:30 PM
 */
export function isCurrentTimeWithinHours(): boolean {
  const now = new Date();

  // 1. Check Weekend Holiday (Friday & Saturday)
  if (isWeekendHoliday(now)) {
    return false;
  }

  // 2. Check Daily Hours (8:00 AM to 3:30 PM)
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const currentTotalMinutes = hours * 60 + minutes;

  const startMinutes = 8 * 60; // 08:00 AM
  const endMinutes = 15 * 60 + 30; // 03:30 PM (15:30)

  return currentTotalMinutes >= startMinutes && currentTotalMinutes <= endMinutes;
}

/**
 * Checks if the working hours lock should be enforced right now:
 * - If temporary test bypass is active: lock is completely bypassed for testing!
 * - If Admin manually toggled on/off in localStorage, respects that.
 * - Otherwise, automatically activates starting Thursday (2026-10-01).
 */
export function isWorkingHoursEnforced(): boolean {
  // If user requested temporary test bypass, do NOT lock!
  if (isWorkingHoursBypassed()) {
    return false;
  }

  try {
    const saved = localStorage.getItem(WORKING_HOURS_KEY);
    if (saved !== null) {
      return saved === 'true';
    }
  } catch {}

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return todayStr >= WORKING_HOURS_SCHEDULE_DATE;
}

/**
 * Sets manual override for working hours enforcement
 */
export function setWorkingHoursEnforced(enforced: boolean): void {
  try {
    localStorage.setItem(WORKING_HOURS_KEY, String(enforced));
  } catch {}
}

/**
 * Gets overall status for display in UI
 */
export function getWorkingHoursStatus(): WorkingHoursStatus {
  const now = new Date();
  const isBypassed = isWorkingHoursBypassed();
  const isEnforced = isWorkingHoursEnforced();
  const isWithin = isCurrentTimeWithinHours();
  const isWeekend = isWeekendHoliday(now);

  const isOpen = isBypassed || !isEnforced || isWithin;

  return {
    isOpen,
    isEnforced,
    isWeekend,
    isBypassed,
    bypassRemainingMinutes: getBypassRemainingMinutes(),
    scheduledStartDate: WORKING_HOURS_SCHEDULE_DATE,
    currentHoursText: 'من الأحد إلى الخميس: 8:00 ص حتى 3:30 م (الجمعة والسبت عطلة)',
    openingTimeText: '8:00 صباحاً',
    closingTimeText: '3:30 عصراً',
  };
}
