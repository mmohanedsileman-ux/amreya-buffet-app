/**
 * Centralized Google Sheets & Apps Script Configuration + API Contract
 *
 * Phase 2 Separation:
 * - Reads optional VITE_GOOGLE_SHEET_ID / VITE_APPS_SCRIPT_WEBHOOK_URL overrides from Vite env
 * - Falls back to verified production defaults so zero-downtime deployment works out of the box
 * - Defines the stable API contract between the Frontend (src/) and Serverless Proxy (/api/*)
 */

const FALLBACK_SPREADSHEET_ID = '1oudlw-7BB4fDDH09Hp-FJWHDzp8ms16NKf7Z_1KS4y8';
const FALLBACK_WEBHOOK_URL =
  'https://script.google.com/macros/s/AKfycbyL2B7HxSxaox7qpl4tEX5FIFKK3Xqr6uAFCMER5ZvPv2trUQYFtxrgf_V8Du0pVLBw4A/exec';

/**
 * Strictly validates that a webhook URL belongs to Google Apps Script Web Apps
 * (prevents arbitrary external redirects or malformed endpoints).
 */
export function isValidAppsScriptWebhookUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'script.google.com' &&
      parsed.pathname.startsWith('/macros/s/')
    );
  } catch {
    return false;
  }
}

const envSheetId =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_SHEET_ID
    ? String(import.meta.env.VITE_GOOGLE_SHEET_ID).trim()
    : '';

const envWebhookUrl =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_APPS_SCRIPT_WEBHOOK_URL
    ? String(import.meta.env.VITE_APPS_SCRIPT_WEBHOOK_URL).trim()
    : '';

export const SHEET_CONFIG = {
  spreadsheetId: envSheetId || FALLBACK_SPREADSHEET_ID,
  webhookUrl: isValidAppsScriptWebhookUrl(envWebhookUrl) ? envWebhookUrl : FALLBACK_WEBHOOK_URL,
  apiEndpoints: {
    submitOrder: '/api/submit_order',
    syncDebt: '/api/sync_debt',
    health: '/api/health',
  },
  contractVersion: '2.0',
} as const;

export interface SubmitOrderRequest {
  type: 'order';
  sheetName: string;
  targetSheet?: string;
  sheet?: string;
  tabName?: string;
  row: (string | number)[];
  orderId: string;
  customerName: string;
  items: string;
  total: number | string;
  paymentMethod: string;
  paymentStatus: string;
  notes?: string;
  spreadsheetId?: string;
  isRetry?: boolean;
}

export interface SubmitOrderResponse {
  success: boolean;
  verified?: boolean;
  orderNumber?: string;
  row?: number;
  message?: string;
  error?: string;
  sheetResult?: unknown;
}
