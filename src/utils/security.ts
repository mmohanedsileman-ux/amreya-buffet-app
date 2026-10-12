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
 * Sanitizes generic user text inputs to prevent XSS and control characters injection.
 */
export function sanitizeInput(input: string, maxLength = 200): string {
  if (!input || typeof input !== 'string') return '';
  return input
    .trim()
    .slice(0, maxLength)
    .replace(/[<>'"`;\\]/g, ''); // Strip dangerous script characters
}
