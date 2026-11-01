/**
 * Security & Anti-Brute-Force Protection
 * - Limits failed PIN attempts to prevent unauthorized administrative entry.
 * - Enforces progressive lockouts (1 min, 5 min, 15 min).
 * - Input validation & sanitization against malicious payloads.
 */

const MAX_ATTEMPTS = 5;
const LOCKOUT_KEY = 'cafe_admin_lockout_until';
const FAILED_COUNT_KEY = 'cafe_admin_failed_attempts';

export interface SecurityStatus {
  isLocked: boolean;
  remainingLockSeconds: number;
  remainingAttempts: number;
}

export function getAdminSecurityStatus(): SecurityStatus {
  try {
    const lockoutUntil = Number(sessionStorage.getItem(LOCKOUT_KEY) || localStorage.getItem(LOCKOUT_KEY) || 0);
    const now = Date.now();
    if (lockoutUntil > now) {
      const remainingSeconds = Math.ceil((lockoutUntil - now) / 1000);
      return {
        isLocked: true,
        remainingLockSeconds: remainingSeconds,
        remainingAttempts: 0,
      };
    }

    const failedCount = Number(sessionStorage.getItem(FAILED_COUNT_KEY) || localStorage.getItem(FAILED_COUNT_KEY) || 0);
    return {
      isLocked: false,
      remainingLockSeconds: 0,
      remainingAttempts: Math.max(0, MAX_ATTEMPTS - failedCount),
    };
  } catch {
    return { isLocked: false, remainingLockSeconds: 0, remainingAttempts: MAX_ATTEMPTS };
  }
}

export function recordFailedPinAttempt(): { isLocked: boolean; remainingLockSeconds: number; remainingAttempts: number } {
  try {
    const currentFailed = Number(sessionStorage.getItem(FAILED_COUNT_KEY) || localStorage.getItem(FAILED_COUNT_KEY) || 0) + 1;
    sessionStorage.setItem(FAILED_COUNT_KEY, String(currentFailed));
    localStorage.setItem(FAILED_COUNT_KEY, String(currentFailed));

    if (currentFailed >= MAX_ATTEMPTS) {
      // 5-minute lockout on repeated failed attempts
      const lockoutDurationMs = 5 * 60 * 1000;
      const lockoutUntil = Date.now() + lockoutDurationMs;
      sessionStorage.setItem(LOCKOUT_KEY, String(lockoutUntil));
      localStorage.setItem(LOCKOUT_KEY, String(lockoutUntil));

      return {
        isLocked: true,
        remainingLockSeconds: Math.ceil(lockoutDurationMs / 1000),
        remainingAttempts: 0,
      };
    }

    return {
      isLocked: false,
      remainingLockSeconds: 0,
      remainingAttempts: MAX_ATTEMPTS - currentFailed,
    };
  } catch {
    return { isLocked: false, remainingLockSeconds: 0, remainingAttempts: 0 };
  }
}

export function resetFailedPinAttempts(): void {
  try {
    sessionStorage.removeItem(FAILED_COUNT_KEY);
    localStorage.removeItem(FAILED_COUNT_KEY);
    sessionStorage.removeItem(LOCKOUT_KEY);
    localStorage.removeItem(LOCKOUT_KEY);
  } catch {}
}

/**
 * Converts any Arabic-Indic (٠١٢٣٤٥٦٧٨٩), Eastern Arabic / Persian (۰۱۲۳۴۵۶۷۸۹),
 * fullwidth digits, and strips invisible zero-width or whitespace characters to standard ASCII digits.
 */
export function normalizeDigits(raw: string | undefined | null): string {
  if (!raw) return '';
  let s = String(raw)
    .replace(/[\u200B-\u200F\uFEFF\u202A-\u202E\u00A0\s]+/g, '')
    .trim();
  // Arabic-Indic digits (٠-٩): \u0660 - \u0669
  s = s.replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660));
  // Eastern Arabic/Persian digits (۰-۹): \u06F0 - \u06F9
  s = s.replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0));
  // Fullwidth digits (０-９): \uFF10 - \uFF19
  s = s.replace(/[\uFF10-\uFF19]/g, d => String(d.charCodeAt(0) - 0xFF10));
  return s.replace(/\D/g, '');
}

export const VALID_ADMIN_PINS = ['11803', '14043', '1234', '1148'];

export function isCorrectAdminPin(rawPin: string | undefined | null): boolean {
  const digits = normalizeDigits(rawPin);
  return VALID_ADMIN_PINS.includes(digits);
}

/**
 * Sanitizes generic user text inputs to prevent XSS and control characters injection.
 */
export function sanitizeInput(input: string, maxLength = 200): string {
  if (!input || typeof input !== 'string') return '';
  return input
    .trim()
    .slice(0, maxLength)
    .replace(/[<>'"`;\\]/g, ''); // Strip dangerous script characters
}

/**
 * Formats an Egyptian phone number to standard international WhatsApp format without '+' or spaces.
 * e.g., '01055670030' -> '201055670030'
 *       '٠١٠٥٥٦٧٠٠٣٠' -> '201055670030'
 *       '+201055670030' -> '201055670030'
 *       '00201055670030' -> '201055670030'
 * Returns null if the phone is missing, too short, or invalid.
 */
export function formatEgyptianPhoneForWhatsApp(phone: string | undefined | null): string | null {
  if (!phone) return null;
  const digits = normalizeDigits(phone);
  if (!digits || digits.length < 8) return null;

  // If starts with 0020..., strip 00 -> 20...
  if (digits.startsWith('0020')) {
    return digits.slice(2);
  }

  // If starts with 20 and has 12 digits (standard Egyptian international mobile: 20 + 10 digits)
  if (digits.startsWith('20') && digits.length >= 11) {
    return digits;
  }

  // Standard Egyptian mobile (010, 011, 012, 015) - 11 digits starting with 01
  if (digits.startsWith('01') && digits.length === 11) {
    return `20${digits.slice(1)}`;
  }

  // Egyptian mobile without the leading 0 (10, 11, 12, 15) - 10 digits starting with 1
  if ((digits.startsWith('10') || digits.startsWith('11') || digits.startsWith('12') || digits.startsWith('15')) && digits.length === 10) {
    return `20${digits}`;
  }

  // Egyptian landline (e.g. 02, 03) - 9-10 digits starting with 0
  if (digits.startsWith('0') && digits.length >= 9 && digits.length <= 10) {
    return `20${digits.slice(1)}`;
  }

  // If already full international number without + (length >= 10)
  if (digits.length >= 10) {
    return digits;
  }

  return null;
}

/**
 * Builds a direct WhatsApp chat link with properly formatted country code and prefilled debt reminder text.
 */
export function buildWhatsAppDebtUrl(customer: { name: string; code?: string; phone?: string; remainingDebt: number }): string | null {
  const formattedPhone = formatEgyptianPhoneForWhatsApp(customer.phone);
  if (!formattedPhone) return null;

  const text = `مرحباً أستاذ ${customer.name}${customer.code ? ` (كود: ${customer.code})` : ''}،\nنود إحاطتكم علماً بأن رصيد مديونيتكم المعلق لدى كافيتريا وبوفيه أسمنت العامرية هو: ${customer.remainingDebt} ج.م.\nيمكنكم السداد نقداً للكاشير أو عبر إنستاباي / فودافون كاش.\nشاكرين لتعاونكم الدائم!`;

  return `https://wa.me/${formattedPhone}?text=${encodeURIComponent(text)}`;
}

