import { Order, Customer, MenuItem, ProductCategory } from '../types';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import { INITIAL_CUSTOMERS } from '../data/initialData';

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

/**
 * Fetch wrapper with timeout protection to prevent hanging requests on unstable connections
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const DEFAULT_SPREADSHEET_ID = '1oudlw-7BB4fDDH09Hp-FJWHDzp8ms16NKf7Z_1KS4y8';
export const DEFAULT_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbyL2B7HxSxaox7qpl4tEX5FIFKK3Xqr6uAFCMER5ZvPv2trUQYFtxrgf_V8Du0pVLBw4A/exec';
export const DEFAULT_WEBHOOK_URL_KEY = 'cafe_sheets_webhook_url';
export const ORDERS_SHEET_NAME = 'سجل_الطلبات';
export const ORDERS_SHEET_ALT = 'سجل الطلبات';
export const DEBTS_SHEET_NAME = 'المديونيات';
export const DEBTS_SHEET_GID = '544270127';
export const DEBTS_SHEET_ALTS = [
  'المديونيات',
  'المديونيات_والمعلقات',
  'لوحة_المديونيات',
  'جدول_المديونيات',
];
export const CUSTOMERS_SHEET_NAME = 'أرصدة ومديونيات العملاء';
export const ACCOUNTS_SHEET_NAME = 'العملاء_والحسابات';
export const ACCOUNTS_SHEET_ALTS = [
  'العملاء_والحسابات',
  'العملاء والحسابات',
  'أرصدة ومديونيات العملاء',
  'أرصدة_ومديونيات_العملاء',
  'بيانات العملاء',
  'بيانات_العملاء',
];
export const EMPLOYEES_SHEET_NAME = 'بينات الموظفين';
export const EMPLOYEES_SHEET_ALTS = [
  'بينات الموظفين',
  'بيانات الموظفين',
  'بينات_الموظفين',
  'بيانات_الموظفين',
  'الموظفين',
  'Employees',
];
export const MENU_SHEET_NAME = 'قائمة_الأصناف';
export const MENU_SHEET_ALTS = [
  'قائمة_الأصناف',
  'قائمة الأصناف',
  'قائمة_الاصناف',
  'قائمة الاصناف',
  'المنيو',
  'الأصناف',
  'الاصناف',
  'Menu',
  'Items',
];

/**
 * Extracts ONLY the pure employee name without ID code or department suffix
 * e.g. "مهند سليمان - 11803 (الشئون الإدارية)" -> "مهند سليمان"
 * e.g. "محمد عباس صبري عبداللطيف - 12168" -> "محمد عباس صبري عبداللطيف"
 */
export function extractCleanEmployeeName(rawName?: string | null): string {
  if (!rawName) return 'عميل نقدي سريع';
  let name = String(rawName).trim();
  // 1. Remove department in parentheses: e.g. "(الشئون الإدارية)", "(قسم الصيانة)"
  name = name.replace(/\s*\([^)]*\)/g, '').trim();
  // 2. Remove trailing code: e.g. " - 11803", " - CUST-1025", " - 12168"
  name = name.replace(/\s*[-–—]\s*[A-Za-z0-9_\-\u0660-\u0669]+\s*$/g, '').trim();
  // 3. Remove leading code if any: e.g. "11803 - مهند سليمان"
  name = name.replace(/^[A-Za-z0-9_\-\u0660-\u0669]+\s*[-–—]\s*/g, '').trim();
  return name || String(rawName).trim();
}

/**
 * Normalizes an Arabic string for exact or near-exact comparison:
 * - strips tashkeel (diacritics)
 * - unifies alefs: أ, إ, آ -> ا
 * - unifies yaa: ى -> ي
 * - unifies taa marbuta: ة -> ه
 * - strips extra spaces and punctuation
 */
export function normalizeArabicName(name?: string | null): string {
  if (!name) return '';
  return name
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '') // remove tashkeel
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\u0600-\u06FFa-zA-Z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts clean numerical employee code (e.g. "12168" from "محمد عباس صبري عبداللطيف - 12168" or "1911" or "1009")
 */
export function extractEmployeeDigits(val?: string | null): string | null {
  if (!val) return null;
  const matchSuffix = String(val).match(/[-–—]\s*(\d{2,6})\s*$/);
  if (matchSuffix) return matchSuffix[1];
  const match = String(val).match(/\b\d{3,6}\b/);
  return match ? match[0] : null;
}

/**
 * Resolves the authoritative employee badge code for a customer
 */
export function getCustomerBadgeCode(c?: Customer | null): string | null {
  if (!c) return null;
  const strCode = String(c.code ?? '').trim();
  if (strCode && strCode !== 'GUEST' && !strCode.startsWith('CUST-')) {
    const d = strCode.replace(/\D/g, '');
    if (d.length >= 1) return d;
  }
  const strName = String(c.name ?? '').trim();
  if (strName) {
    const matchSuffix = strName.match(/[-–—]\s*(\d{1,6})\s*$/);
    if (matchSuffix) return matchSuffix[1];
    const matchAny = strName.match(/\b\d{1,6}\b/);
    if (matchAny) return matchAny[0];
  }
  return null;
}

/**
 * Strictly deduplicates customer/employee records to prevent ANY duplicate rows:
 * Matches by:
 * 1. Employee numerical code (e.g. 12168)
 * 2. Standard CUST-ID (e.g. CUST-1003)
 * 3. Normalized Arabic employee name
 * 4. Phone number if available
 * Merges duplicate records while keeping the most complete and accurate data.
 */
/**
 * Strictly deduplicates customer/employee records to prevent collisions:
 * Matches ONLY by:
 * 1. Exact employee numerical code (e.g. 12168, 13088, 1911)
 * 2. Exact full Arabic name (at least 6 characters) when code is absent
 * NEVER merges by generic CUST-ID, phone, or partial name!
 */
export function deduplicateCustomers(customers: Customer[]): Customer[] {
  const result: Customer[] = [];
  const seenCodes = new Set<string>();
  const seenFullNames = new Set<string>();
  const assignedIds = new Set<string>();

  for (const c of customers) {
    if (!c.name || !c.name.trim()) continue;

    const rawCode = (c.code || '').trim();
    const digitsInCode = extractEmployeeDigits(rawCode) || extractEmployeeDigits(c.name);
    const cleanName = extractCleanEmployeeName(c.name);
    const normName = normalizeArabicName(cleanName);

    const hasSeenCode = Boolean(digitsInCode && seenCodes.has(digitsInCode));
    const hasSeenName = Boolean(!digitsInCode && normName && normName.length >= 6 && seenFullNames.has(normName));

    if (hasSeenCode || hasSeenName) {
      // Find the existing item to merge into
      const existingIdx = result.findIndex(existing => {
        const exDigits = extractEmployeeDigits(existing.code) || extractEmployeeDigits(existing.name);
        const exNormName = normalizeArabicName(extractCleanEmployeeName(existing.name));

        if (digitsInCode && exDigits) {
          return exDigits === digitsInCode;
        }
        return normName && normName.length >= 6 && exNormName === normName;
      });

      if (existingIdx !== -1) {
        const ex = result[existingIdx];
        // Merge without losing data, preserve primary name
        const strExCode = String(ex.code ?? '').trim();
        const strCCode = String(c.code ?? '').trim();
        const safeCode = (strExCode && strExCode !== 'GUEST' && !strExCode.startsWith('CUST-') ? strExCode : strCCode) || strExCode;
        result[existingIdx] = {
          ...ex,
          department: (ex.department && ex.department !== '-' ? ex.department : c.department) || ex.department,
          phone: (ex.phone && ex.phone !== '-' ? ex.phone : c.phone) || ex.phone,
          code: safeCode,
          name: ex.name || c.name,
          category: ex.category || c.category || 'موظف',
          totalOrders: Math.max(ex.totalOrders || 0, c.totalOrders || 0),
          totalPaid: Math.max(ex.totalPaid || 0, c.totalPaid || 0),
          remainingDebt: c.remainingDebt !== undefined ? c.remainingDebt : (ex.remainingDebt || 0),
          status: (c.remainingDebt !== undefined ? (c.remainingDebt > 0 ? 'مدين' : 'مسدد بالكامل') : (ex.status || c.status)),
          creditLimit: Math.max(ex.creditLimit || 500, c.creditLimit || 500),
        };
      }
      continue;
    }

    if (digitsInCode) seenCodes.add(digitsInCode);
    if (normName && normName.length >= 6) seenFullNames.add(normName);

    // Ensure unique ID for every customer
    let uniqueId = c.id;
    if (!uniqueId || assignedIds.has(uniqueId)) {
      uniqueId = digitsInCode ? `CUST-${digitsInCode}` : `CUST-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    }
    assignedIds.add(uniqueId);

    result.push({ ...c, id: uniqueId });
  }

  return result;
}

/**
 * Merges fresh customers from Google Sheet into local customer state.
 * The Google Sheet is the AUTHORITATIVE single source of truth for employee names, codes,
 * departments, and phones. Any stale local device cache is automatically updated to match the sheet.
 */
export function mergeCustomersFromSheet(localCustomers: Customer[], sheetCustomers: Customer[]): Customer[] {
  if (!sheetCustomers || sheetCustomers.length === 0) return localCustomers;

  const sheetByDigits = new Map<string, Customer>();
  const sheetById = new Map<string, Customer>();

  for (const sc of sheetCustomers) {
    const scDigits = extractEmployeeDigits(sc.code) || extractEmployeeDigits(sc.name);
    if (scDigits) sheetByDigits.set(scDigits, sc);
    if (sc.id) sheetById.set(sc.id, sc);
  }

  // Update existing local customers with authoritative sheet data
  const updatedLocal = localCustomers.map(lc => {
    const lcDigits = extractEmployeeDigits(lc.code) || extractEmployeeDigits(lc.name);
    // STRICT: Only match by unique employee numerical badge code! NEVER by generic internal ID!
    const match = lcDigits ? sheetByDigits.get(lcDigits) : null;
    if (match) {
      return {
        ...lc,
        id: match.id || lc.id,
        code: match.code || lc.code,
        name: match.name, // Sheet name ALWAYS takes precedence!
        department: match.department || lc.department,
        phone: match.phone || lc.phone,
        totalOrders: match.totalOrders !== undefined ? match.totalOrders : lc.totalOrders,
        totalPaid: match.totalPaid !== undefined ? match.totalPaid : lc.totalPaid,
        remainingDebt: match.remainingDebt !== undefined ? match.remainingDebt : lc.remainingDebt,
        status: (match.remainingDebt !== undefined ? (match.remainingDebt > 0 ? 'مدين' : 'مسدد بالكامل') : lc.status),
      };
    }
    return lc;
  });

  // Append any sheet customers not yet in local list
  const seenIds = new Set(updatedLocal.map(c => c.id));
  const seenDigits = new Set(
    updatedLocal.map(c => extractEmployeeDigits(c.code) || extractEmployeeDigits(c.name)).filter(Boolean) as string[]
  );

  for (const sc of sheetCustomers) {
    const scDigits = extractEmployeeDigits(sc.code) || extractEmployeeDigits(sc.name);
    if (!seenIds.has(sc.id) && (!scDigits || !seenDigits.has(scDigits))) {
      updatedLocal.push(sc);
      seenIds.add(sc.id);
      if (scDigits) seenDigits.add(scDigits);
    }
  }

  return deduplicateCustomers(updatedLocal);
}

/**
 * Calculates the next sequential customer ID (e.g. CUST-1025)
 * matching the table structure in the user's Google Sheet 'العملاء_والحسابات'
 */
export function getNextCustomerCode(customers: Customer[]): string {
  let maxNum = 14050; // Baseline matching latest rows in the sheet
  for (const c of customers) {
    const matchId = c.id?.match(/CUST-(\d+)/);
    if (matchId) {
      const num = parseInt(matchId[1], 10);
      if (num >= 1000 && num < 90000 && num > maxNum) {
        maxNum = num;
      }
    }
    const matchCode = c.code?.match(/CUST-(\d+)/);
    if (matchCode) {
      const num = parseInt(matchCode[1], 10);
      if (num >= 1000 && num < 90000 && num > maxNum) {
        maxNum = num;
      }
    }
  }

  try {
    const lastAllocated = localStorage.getItem('cafe_last_allocated_cust_num');
    if (lastAllocated) {
      const lastNum = parseInt(lastAllocated, 10);
      if (!isNaN(lastNum) && lastNum >= maxNum) {
        maxNum = lastNum;
      }
    }
    const nextNum = maxNum + 1;
    localStorage.setItem('cafe_last_allocated_cust_num', String(nextNum));
    return `CUST-${nextNum}`;
  } catch {}

  return `CUST-${maxNum + 1}`;
}

/**
 * Formats a customer to match EXACTLY the 7 columns of the sheet "العملاء_والحسابات":
 * Column A: كود العميل (e.g. CUST-1025)
 * Column B: اسم العميل / الموظف (e.g. محمد عباس صبري عبداللطيف - 12168)
 * Column C: الفئة (e.g. موظف أو ضيوف وإدارة أو عميل خارجي)
 * Column D: إجمالي الطلبات (ج.م) (e.g. 0)
 * Column E: إجمالي المسدد (ج.م) (e.g. 0)
 * Column F: المتبقي (المديونية) (e.g. 0)
 * Column G: حالة الحساب (e.g. خالص أو مدين)
 */
export function formatCustomerToAccountsRow(
  customer: Customer,
  sequentialCustId?: string
): (string | number)[] {
  // Column A: كود العميل (e.g. CUST-1025)
  const strCustId = String(customer.id ?? '').trim();
  const strCustomerCode = String(customer.code ?? '').trim();
  let custCode = strCustId;
  if (!custCode || !custCode.match(/^CUST-\d{4,5}$/) || custCode.includes('GUEST')) {
    custCode = sequentialCustId || (strCustomerCode.startsWith('CUST-') ? strCustomerCode : `CUST-${strCustomerCode}`);
  }

  // Column B: اسم العميل / الموظف (e.g. محمد عباس صبري عبداللطيف - 12168)
  let fullName = String(customer.name ?? '').trim();
  if (
    strCustomerCode &&
    !fullName.includes(strCustomerCode) &&
    customer.category !== 'عميل خارجي' &&
    !strCustomerCode.startsWith('CUST-')
  ) {
    fullName = `${fullName} - ${strCustomerCode}`;
  }

  // Column C: الفئة
  const category = customer.category || 'موظف';

  // Column D: إجمالي الطلبات (ج.م)
  const totalOrders = customer.totalOrders || 0;

  // Column E: إجمالي المسدد (ج.م)
  const totalPaid = customer.totalPaid || 0;

  // Column F: المتبقي (المديونية)
  const remainingDebt = customer.remainingDebt || 0;

  // Column G: حالة الحساب (خالص أو مدين)
  const accountStatus = remainingDebt > 0 ? 'مدين' : 'خالص';

  // Column H: القسم (Department)
  const department = customer.department?.trim() || '-';

  // Column I: رقم الهاتف (Phone)
  const phone = customer.phone?.trim() || '-';

  // Column J: كود الموظف الداخلي
  const empCode = (strCustomerCode && strCustomerCode !== 'GUEST' && !strCustomerCode.startsWith('CUST-'))
    ? strCustomerCode
    : (strCustId.startsWith('CUST-') ? strCustId.replace('CUST-', '') : '-');

  return [
    custCode,
    fullName,
    category,
    totalOrders,
    totalPaid,
    remainingDebt,
    accountStatus,
    department,
    phone,
    empCode,
  ];
}

export function getStoredWebhookUrl(): string {
  try {
    const saved = localStorage.getItem(DEFAULT_WEBHOOK_URL_KEY);
    if (saved && saved.trim() && saved.includes('AKfycbyL2B7HxSxaox7qpl4tEX5FIFKK3Xqr6uAFCMER5ZvPv2trUQYFtxrgf_V8Du0pVLBw4A')) {
      return saved.trim();
    }
    // Force reset to the latest verified webhook
    localStorage.setItem(DEFAULT_WEBHOOK_URL_KEY, DEFAULT_WEBHOOK_URL);
  } catch {}
  return DEFAULT_WEBHOOK_URL;
}

export function setStoredWebhookUrl(url: string) {
  try {
    localStorage.setItem(DEFAULT_WEBHOOK_URL_KEY, url.trim());
  } catch {}
}

/**
 * Formats an order to match EXACTLY the 8 columns of the user's Google Sheet "سجل_الطلبات":
 * Column A: رقم الطلب (e.g. ORD-1021 or #833)
 * Column B: التاريخ والوقت (e.g. 2026-09-22 18:38)
 * Column C: اسم العميل (e.g. محمد عباس صبري عبداللطيف - 12168)
 * Column D: تفاصيل الطلب (e.g. فلافل × 2، مكس جبن × 1)
 * Column E: الإجمالي (ج.م) (e.g. 50)
 * Column F: طريقة الدفع (e.g. أجل (حساب موظف) أو نقدي)
 * Column G: حالة السداد (e.g. مسدد فوراً أو معلق (على الحساب))
 * Column H: ملاحظات (e.g. طلب كاشير أو ملاحظات العميل)
 */
export function formatOrderToSheetRow(order: Order, customer?: Customer | null): (string | number)[] {
  // Column A: رقم الطلب
  const orderId = order.id?.startsWith('ORD-') ? order.id : `ORD-${order.orderNumber}`;

  // Column B: التاريخ والوقت (matches "2026-09-20 11:30")
  const d = new Date(order.createdAt || Date.now());
  const dateStr = !isNaN(d.getTime())
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    : formatDateTime(order.createdAt);

  // 1. Resolve authoritative customer object
  let resolvedCust = customer || null;
  const digitsFromOrder = extractEmployeeDigits(order.customerId) || extractEmployeeDigits(order.customerName);
  
  if (!resolvedCust || resolvedCust.category !== 'موظف') {
    // Check initial registered employees list
    if (order.customerId) {
      resolvedCust = INITIAL_CUSTOMERS.find(c => c.id === order.customerId || c.code === order.customerId) || resolvedCust;
    }
    if (!resolvedCust && digitsFromOrder) {
      resolvedCust = INITIAL_CUSTOMERS.find(c => {
        const cDigits = extractEmployeeDigits(c.code) || extractEmployeeDigits(c.name);
        return cDigits === digitsFromOrder;
      }) || resolvedCust;
    }
    // Check localStorage cached customers
    if (!resolvedCust && typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('cafe_customers_data');
        if (raw) {
          const cached = JSON.parse(raw);
          if (Array.isArray(cached)) {
            resolvedCust = cached.find((c: Customer) => {
              if (order.customerId && (c.id === order.customerId || c.code === order.customerId)) return true;
              const cDigits = extractEmployeeDigits(c.code) || extractEmployeeDigits(c.name);
              return digitsFromOrder && cDigits === digitsFromOrder;
            }) || resolvedCust;
          }
        }
      } catch {}
    }
  }

  // Guard: Determine if customer is a registered employee
  const isRegisteredEmployee = Boolean(
    resolvedCust && 
    (resolvedCust.category === 'موظف' || digitsFromOrder)
  );

  // Check if this is a hospitality order (Account 1000 or guests)
  const isExplicitAdminHospitality = 
    order.customerId === 'CUST-1000' || 
    order.customerId === 'CUST-GUESTS' || 
    order.customerName === 'ضيافة إدارة' || 
    order.customerName?.includes('ضيوف') ||
    Boolean(order.discount && order.discount > 0 && order.totalAmount === 0) ||
    Boolean(resolvedCust && (resolvedCust.code === '1000' || resolvedCust.category === 'ضيوف وإدارة'));

  // Column C: اسم العميل (اسم الموظف الحقيقي شاملاً الكود دائماً)
  let customerName = 'عميل نقدي خارجي';
  if (isExplicitAdminHospitality) {
    customerName = 'ضيوف - 1000';
  } else if (isRegisteredEmployee && resolvedCust) {
    customerName = resolvedCust.name.trim();
  } else {
    customerName = (order.customerName || resolvedCust?.name || 'عميل نقدي خارجي').trim();
    if (customerName === 'ضيوف' || customerName === 'ضيافة') {
      customerName = (resolvedCust?.name && !resolvedCust.name.includes('ضيوف')) ? resolvedCust.name : 'عميل نقدي خارجي';
    }
  }

  const empCode = resolvedCust?.code || digitsFromOrder;
  if (empCode && !customerName.includes(empCode) && !customerName.includes('عميل نقدي') && !isExplicitAdminHospitality) {
    customerName = `${customerName} - ${empCode}`;
  }

  // Column D: تفاصيل الطلب (الأصناف والكميات باللغة العربية الواضحة)
  const itemsDetails = order.items
    .map(it => {
      const opts = [it.size, it.sugar].filter(Boolean).join(' - ');
      return `${it.name}${opts ? ` (${opts})` : ''} × ${it.quantity}`;
    })
    .join('، ');

  // Column E: الإجمالي (ج.م) - إجمالي الطلب الفعلي المحسوب بدقة
  const totalAmount = order.totalAmount;

  // Column F: طريقة الدفع
  let paymentMethod = 'نقدي';
  if (isExplicitAdminHospitality) {
    paymentMethod = 'ضيافة (مجاني)';
  } else if (order.paymentMethod === 'debt_account') {
    paymentMethod = 'أجل (حساب موظف)';
  } else if (order.paymentMethod === 'instapay') {
    paymentMethod = 'انستاباي';
  } else if (order.paymentMethod === 'vodafone_cash') {
    paymentMethod = 'فودافون كاش';
  }

  // Column G: حالة السداد
  let paymentStatus = 'مسدد فوراً';
  if (isExplicitAdminHospitality) {
    paymentStatus = 'مسدد فوراً';
  } else if (order.remainingAmount > 0 && order.paidAmount === 0) {
    paymentStatus = 'معلق (على الحساب)';
  } else if (order.remainingAmount > 0 && order.paidAmount > 0) {
    paymentStatus = `سداد جزئي (متبقي ${order.remainingAmount} ج.م)`;
  } else {
    paymentStatus = 'مسدد فوراً';
  }

  // Column H: ملاحظات
  const notes = order.notes && order.notes.trim() && order.notes !== '-'
    ? order.notes.trim()
    : (isExplicitAdminHospitality ? 'طلب ضيافة معتمد' : '');

  return [
    orderId,        // A: رقم الطلب
    dateStr,        // B: التاريخ والوقت
    customerName,   // C: اسم العميل
    itemsDetails,   // D: تفاصيل الطلب
    totalAmount,    // E: الإجمالي (ج.م)
    paymentMethod,  // F: طريقة الدفع
    paymentStatus,  // G: حالة السداد
    notes,          // H: ملاحظات
  ];
}

export const SYNCED_ORDERS_CACHE_KEY = 'cafe_synced_orders_ids_v2';

/**
 * Gets set of already synced order IDs to prevent duplicate transmission
 */
export function getSyncedOrderIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SYNCED_ORDERS_CACHE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

/**
 * Marks an order ID as synced
 */
export function markOrderAsSynced(orderId: string) {
  try {
    const ids = getSyncedOrderIds();
    ids.add(orderId);
    // Keep last 1000 IDs to avoid storage bloat
    const array = Array.from(ids).slice(-1000);
    localStorage.setItem(SYNCED_ORDERS_CACHE_KEY, JSON.stringify(array));
  } catch (e) {
    console.warn('Failed to mark order as synced:', e);
  }
}

let cachedTargetOrdersSheetName: string | null = null;

export const APPS_SCRIPT_TEMPLATE = `// كود المزامنة التلقائية الفورية لشيت بوفية اسمنت العامرية
// الصق هذا الكود في Google Sheets -> Extensions (الإضافات) -> Apps Script
function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    var data = {};
    if (e && e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
      } catch (err) {
        data = e.parameter || {};
      }
    } else if (e && e.parameter) {
      data = e.parameter;
    }

    var isCustomerSync = data.type === 'new_customer' || data.type === 'customers' || 
                         data.action === 'append_customer' || 
                         (data.sheetName && data.sheetName.indexOf('عملاء') !== -1) ||
                         (data.sheetName && data.sheetName.indexOf('أرصدة') !== -1);

    // 1. إذا كانت البيانات لعميل/موظف جديد: تُسجل في شيت أرصدة ومديونيات العملاء فقط
    if (isCustomerSync) {
      var custSheet = ss.getSheetByName("أرصدة ومديونيات العملاء") 
                   || ss.getSheetByName("العملاء_والحسابات") 
                   || ss.getSheetByName("العملاء والحسابات");
      if (!custSheet) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "شيت العملاء غير موجود" }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      var custRow = data.row || (data.values && data.values[0]);
      if (!custRow || !Array.isArray(custRow)) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "بيانات العميل غير صالحة" }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      // منع تكرار نفس الموظف إذا كان كوده أو اسمه مسجلاً مسبقاً
      var newCustId = String(custRow[0] || '').trim();
      var newCustName = String(custRow[1] || '').trim();
      var newEmpCode = String(custRow[9] || '').trim();
      var existingData = custSheet.getDataRange().getValues();
      for (var ex = 1; ex < existingData.length; ex++) {
        var exId = String(existingData[ex][0] || '').trim();
        var exName = String(existingData[ex][1] || '').trim();
        var exCode = String(existingData[ex][9] || '').trim();
        if ((newCustId && exId === newCustId) || 
            (newEmpCode && exCode === newEmpCode) || 
            (newEmpCode && exName.indexOf(newEmpCode) !== -1)) {
          return ContentService.createTextOutput(JSON.stringify({ status: "already_exists", row: ex + 1 }))
            .setMimeType(ContentService.MimeType.JSON);
        }
      }

      var colACust = custSheet.getRange("A1:A").getValues();
      var nextCustRow = 2;
      for (var c = 1; c < colACust.length; c++) {
        var val = colACust[c][0];
        if (val === null || val === undefined || String(val).trim() === "") {
          nextCustRow = c + 1;
          break;
        }
      }

      custSheet.getRange(nextCustRow, 1, 1, custRow.length).setValues([custRow]);
      return ContentService.createTextOutput(JSON.stringify({ status: "success", type: "customer", row: nextCustRow }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 2. إذا كانت البيانات لطلب جديد (Order): تُسجل في سجل_الطلبات
    var sheet = ss.getSheetByName("سجل_الطلبات") 
             || ss.getSheetByName("سجل الطلبات") 
             || ss.getSheets()[0];

    var row = data.row;
    if (!row && data.orderId) {
      row = [
        data.orderId,
        data.date || new Date().toLocaleString('ar-EG'),
        data.customerName || 'عميل نقدي',
        data.items || '',
        data.total || 0,
        data.paymentMethod || 'نقدي',
        data.paymentStatus || 'مسدد فوراً',
        data.notes || ''
      ];
    }

    if (!row || !Array.isArray(row)) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "بيانات غير صالحة" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // فحص العمود A فقط لمعرفة أول صف فارغ تماماً وتجنب مربعات الاختيار في العمود I
    var colA = sheet.getRange("A1:A").getValues();
    var nextRow = 2;
    for (var i = 1; i < colA.length; i++) {
      var cellVal = colA[i][0];
      if (cellVal === null || cellVal === undefined || String(cellVal).trim() === "") {
        nextRow = i + 1;
        break;
      }
    }

    // منع تكرار رقم الطلب إذا كان مضافاً مسبقاً
    var orderCode = String(row[0]).trim();
    for (var j = 0; j < colA.length; j++) {
      if (colA[j][0] && String(colA[j][0]).trim() === orderCode) {
        return ContentService.createTextOutput(JSON.stringify({ status: "already_exists", row: j + 1 }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    // فحص ذكي لآخر 5 صفوف لمنع تكرار نفس الطلب لنفس العميل لو ضغط مرتين في نفس اللحظة
    var custName = String(row[2] || '').trim();
    var itemDetails = String(row[3] || '').trim();
    if (nextRow > 2 && custName !== '') {
      var checkStart = Math.max(2, nextRow - 5);
      var recentData = sheet.getRange(checkStart, 1, nextRow - checkStart, 4).getValues();
      for (var r = recentData.length - 1; r >= 0; r--) {
        var prevCust = String(recentData[r][2] || '').trim();
        var prevItems = String(recentData[r][3] || '').trim();
        if (prevCust === custName && prevItems === itemDetails) {
          return ContentService.createTextOutput(JSON.stringify({ status: "already_exists_duplicate", row: checkStart + r }))
            .setMimeType(ContentService.MimeType.JSON);
        }
      }
    }

    // كتابة الطلب في الأعمدة من A إلى H (أول 8 أعمدة)
    var orderCols = row.slice(0, 8);
    sheet.getRange(nextRow, 1, 1, orderCols.length).setValues([orderCols]);

    // إذا كان الطلب مسدداً فوراً (كاش/انستاباي/فودافون كاش):
    // نضع علامة صح [✓] تلقائياً في مربع الاختيار بالعمود J (تم السداد) حتى لا يُلوّن الصف بلون المديونية
    var isPaid = String(row[6] || '').indexOf('مسدد') !== -1 || Number(row[4] || 0) === 0;
    try {
      sheet.getRange(nextRow, 10).setValue(isPaid);
    } catch (errCheck) {}

    return ContentService.createTextOutput(JSON.stringify({ status: "success", type: "order", row: nextRow }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var menuSheet = ss.getSheetByName("قائمة_الأصناف") 
                 || ss.getSheetByName("قائمة الأصناف") 
                 || ss.getSheetByName("المنيو");
    var items = [];
    if (menuSheet) {
      var data = menuSheet.getDataRange().getValues();
      var startRow = 1;
      if (data.length > 0 && (String(data[0][0]).includes("كود") || String(data[0][2]).includes("اسم"))) {
        startRow = 1;
      }
      for (var i = startRow; i < data.length; i++) {
        var row = data[i];
        var code = String(row[0] || '').trim();
        var categoryName = String(row[1] || '').trim();
        var name = String(row[2] || '').trim();
        var price = parseFloat(String(row[3] || '0').replace(/[^0-9.]/g, '')) || 0;
        var status = String(row[4] || '').trim();
        if (name && name !== 'اسم الصنف') {
          items.push({
            id: code ? 'item-' + code.toLowerCase().replace(/[^a-z0-9_-]/g, '') : ('item-sheet-' + (i + 1)),
            code: code,
            categoryName: categoryName,
            name: name,
            price: price,
            available: status !== 'غير متاح' && status !== 'لا' && status !== 'غير متوفر'
          });
        }
      }
    }

    // 2. قراءة حالة السداد من سجل_الطلبات وفحص العمود J (تم السداد)
    var ordersSheet = ss.getSheetByName("سجل_الطلبات") || ss.getSheetByName("سجل الطلبات");
    var paidOrderIds = [];
    var customerDebts = {};
    if (ordersSheet) {
      var lastRow = ordersSheet.getLastRow();
      if (lastRow >= 2) {
        var ordersData = ordersSheet.getRange(2, 1, lastRow - 1, 10).getValues();
        for (var k = 0; k < ordersData.length; k++) {
          var oId = String(ordersData[k][0] || '').trim();
          var cName = String(ordersData[k][2] || '').trim();
          var amt = parseFloat(ordersData[k][4]) || 0;
          var pMethod = String(ordersData[k][5] || '').trim();
          var pStatus = String(ordersData[k][6] || '').trim();
          var isPaidColJ = ordersData[k][9]; // العمود J (رقم 10): تم السداد
          
          var isPaid = isPaidColJ === true || String(isPaidColJ).toLowerCase() === 'true' || pStatus.indexOf('مسدد') !== -1;
          
          if (oId && isPaid) {
            paidOrderIds.push(oId);
          }
          if (cName && (pMethod.indexOf('آجل') !== -1 || pStatus.indexOf('معلق') !== -1)) {
            if (customerDebts[cName] === undefined) customerDebts[cName] = 0;
            if (!isPaid) {
              customerDebts[cName] += amt;
            }
          }
        }
      }
    }

    // 2.5 قراءة ورقة المديونيات المباشرة
    var debtsSheet = ss.getSheetByName("المديونيات") || ss.getSheetByName("المديونيات_والمعلقات");
    if (debtsSheet) {
      var dLast = debtsSheet.getLastRow();
      if (dLast >= 10) {
        var dData = debtsSheet.getRange(10, 2, dLast - 9, 3).getValues(); // العمود B: الاسم، العمود C: إجمالي المديونية
        for (var di = 0; di < dData.length; di++) {
          var debtorName = String(dData[di][0] || '').trim();
          var debtorDebt = parseFloat(String(dData[di][1] || '0').replace(/[^0-9.]/g, '')) || 0;
          if (debtorName && debtorName !== 'اسم العميل') {
            customerDebts[debtorName] = debtorDebt;
          }
        }
      }
    }

    // 3. قراءة العملاء والموظفين من "أرصدة ومديونيات العملاء"
    var custSheet = ss.getSheetByName("أرصدة ومديونيات العملاء") 
                 || ss.getSheetByName("العملاء_والحسابات") 
                 || ss.getSheetByName("العملاء والحسابات");
    var customersList = [];
    if (custSheet) {
      var lastCustRow = custSheet.getLastRow();
      if (lastCustRow >= 2) {
        var custData = custSheet.getRange(2, 1, lastCustRow - 1, 10).getValues();
        for (var c = 0; c < custData.length; c++) {
          var rowC = custData[c];
          var custId = String(rowC[0] || '').trim();
          var custName = String(rowC[1] || '').trim();
          var category = String(rowC[2] || 'موظف').trim();
          var totalOrders = parseFloat(rowC[3]) || 0;
          var totalPaid = parseFloat(rowC[4]) || 0;
          var remainingDebt = parseFloat(rowC[5]) || 0;
          var status = String(rowC[6] || (remainingDebt > 0 ? 'مدين' : 'خالص')).trim();
          var dept = String(rowC[7] || '').trim();
          var phone = String(rowC[8] || '').trim();
          var empCode = String(rowC[9] || '').trim();

          if (!empCode && custName) {
            var mCode = custName.match(/(\d{4,5})/);
            if (mCode) empCode = mCode[1];
          }

          if (custName && custName !== 'اسم العميل / الموظف') {
            customersList.push({
              id: custId || ('CUST-' + (c + 1)),
              name: custName,
              code: empCode || custId,
              category: category || 'موظف',
              totalOrders: totalOrders,
              totalPaid: totalPaid,
              remainingDebt: remainingDebt,
              status: status,
              department: dept,
              phone: phone,
              creditLimit: 500
            });
          }
        }
      }
    }

    return ContentService.createTextOutput(JSON.stringify({ 
      status: "online", 
      message: "نظام بوفية اسمنت العامرية متصل وجاهز بنجاح",
      menuItems: items,
      paidOrderIds: paidOrderIds,
      customerDebts: customerDebts,
      customers: customersList
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ 
      status: "online", 
      message: "نظام ربط بوفية اسمنت العامرية يعمل بنجاح",
      error: err.toString() 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}`;

/**
 * Sends order directly via Google Apps Script Webhook without requiring user sign-in
 */
export async function appendOrderViaWebhook(
  order: Order,
  customer?: Customer | null,
  webhookUrl: string = getStoredWebhookUrl(),
  targetSpreadsheetId?: string
): Promise<boolean> {
  if (!webhookUrl || !webhookUrl.startsWith('https://script.google.com/')) return false;
  const orderCode = order.id?.startsWith('ORD-') ? order.id : `ORD-${order.orderNumber}`;
  const synced = getSyncedOrderIds();
  if (synced.has(order.id) || synced.has(String(order.orderNumber)) || synced.has(orderCode)) {
    return true; // Already synced, avoid duplication
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const row = formatOrderToSheetRow(order, customer);
    const sheetId = targetSpreadsheetId || localStorage.getItem('cafe_spreadsheet_id') || DEFAULT_SPREADSHEET_ID;

    // Using text/plain mode: no-cors for Google Apps Script Web App
    await fetch(webhookUrl, {
      method: 'POST',
      mode: 'no-cors',
      keepalive: true,
      signal: controller.signal,
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        type: 'order',
        sheetName: ORDERS_SHEET_NAME,
        targetSheet: ORDERS_SHEET_NAME,
        sheet: ORDERS_SHEET_NAME,
        tabName: ORDERS_SHEET_NAME,
        row,
        orderId: orderCode,
        customerName: String(row[2]),
        items: order.items.map(it => `${it.name} × ${it.quantity}`).join('، '),
        total: row[4],
        paymentMethod: row[5],
        paymentStatus: row[6],
        notes: row[7] || '',
        spreadsheetId: sheetId,
      }),
    });

    markOrderAsSynced(order.id);
    markOrderAsSynced(String(order.orderNumber));
    markOrderAsSynced(orderCode);
    return true;
  } catch (err) {
    console.warn('Webhook transmission notice:', err);
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

export interface DebtSyncResult {
  success: boolean;
  paidOrderIds: string[];
  customerDebts: Record<string, number>;
  menuItems?: MenuItem[];
  customers?: Customer[];
}

/**
 * Reads live order payment statuses and customer debt totals directly from Google Sheet via Webhook
 * Checks Column J (تم السداد) to automatically clear debts when cashier checks the box.
 */
export async function fetchDebtSyncFromWebhook(
  webhookUrl: string = getStoredWebhookUrl()
): Promise<DebtSyncResult> {
  // 1. Try local server-side proxy first (eliminates all browser CORS and iframe issues)
  try {
    const proxyRes = await fetchWithTimeout(`/api/sync_debt?t=${Date.now()}`, {}, 12000);
    if (proxyRes.ok) {
      const data = await proxyRes.json();
      if (data && (data.status === 'online' || Array.isArray(data.paidOrderIds))) {
        return {
          success: true,
          paidOrderIds: Array.isArray(data.paidOrderIds) ? data.paidOrderIds : [],
          customerDebts: data.customerDebts || {},
          menuItems: Array.isArray(data.menuItems) ? data.menuItems : undefined,
          customers: Array.isArray(data.customers) ? data.customers : undefined,
        };
      }
    }
  } catch (err) {
    // Proxy may not be reachable in some static environments, fall through to direct webhook
  }

  if (!webhookUrl || !webhookUrl.startsWith('https://script.google.com/')) {
    return { success: false, paidOrderIds: [], customerDebts: {} };
  }

  // 2. Direct Webhook call
  try {
    const fetchUrl = `${webhookUrl}${webhookUrl.includes('?') ? '&' : '?'}action=sync_debt&t=${Date.now()}`;
    const response = await fetchWithTimeout(fetchUrl, {}, 8000);
    if (response.ok) {
      const data = await response.json();
      if (data && (data.status === 'online' || Array.isArray(data.paidOrderIds))) {
        return {
          success: true,
          paidOrderIds: Array.isArray(data.paidOrderIds) ? data.paidOrderIds : [],
          customerDebts: data.customerDebts || {},
          menuItems: Array.isArray(data.menuItems) ? data.menuItems : undefined,
          customers: Array.isArray(data.customers) ? data.customers : undefined,
        };
      }
    }
  } catch (err) {
    console.warn('fetchDebtSyncFromWebhook direct error:', err);
  }

  // Fallback: Try reading directly from Google Sheet CSV export (gid=1042414676: سجل_الطلبات)
  try {
    const spreadsheetId = localStorage.getItem('cafe_spreadsheet_id') || DEFAULT_SPREADSHEET_ID;
    const gvizUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&gid=1042414676`;
    const res = await fetchWithTimeout(gvizUrl, {}, 6000);
    if (res.ok) {
      const csv = await res.text();
      if (csv && !csv.includes('<!DOCTYPE') && !csv.includes('<html')) {
        const rows = parseCSVToRows(csv);
        const paidOrderIds: string[] = [];
        const customerDebts: Record<string, number> = {};

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const oId = String(row[0] || '').trim();
          const cName = String(row[2] || '').trim();
          const amt = parseArabicNumber(row[4]);
          const pMethod = String(row[5] || '').trim();
          const pStatus = String(row[6] || '').trim();
          const isPaidColJ = String(row[9] || '').trim().toLowerCase();

          const isPaid = isPaidColJ === 'true' || isPaidColJ === 'نعم' || isPaidColJ === '1' || pStatus.includes('مسدد');

          if (oId && isPaid) {
            paidOrderIds.push(oId);
          }
          if (cName && (pMethod.includes('آجل') || pStatus.includes('معلق'))) {
            if (customerDebts[cName] === undefined) customerDebts[cName] = 0;
            if (!isPaid) {
              customerDebts[cName] += amt;
            }
          }
        }

        if (paidOrderIds.length > 0 || Object.keys(customerDebts).length > 0) {
          return {
            success: true,
            paidOrderIds,
            customerDebts,
          };
        }
      }
    }
  } catch {}

  return { success: false, paidOrderIds: [], customerDebts: {} };
}

/**
 * Sync customer balances and debts to the "العملاء_والحسابات" tab via Webhook
 */
export async function syncCustomersViaWebhook(
  customers: Customer[],
  webhookUrl: string = getStoredWebhookUrl()
): Promise<boolean> {
  if (!webhookUrl) return false;
  try {
    const unique = deduplicateCustomers(customers);
    const rows = unique.map(c => formatCustomerToAccountsRow(c));

    await fetch(webhookUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        type: 'customers',
        sheetName: ACCOUNTS_SHEET_NAME,
        targetSheet: ACCOUNTS_SHEET_NAME,
        sheet: ACCOUNTS_SHEET_NAME,
        tabName: ACCOUNTS_SHEET_NAME,
        altSheetNames: ACCOUNTS_SHEET_ALTS,
        rows,
        spreadsheetId: DEFAULT_SPREADSHEET_ID,
      }),
    });

    return true;
  } catch (err) {
    console.warn('Webhook customer sync notice:', err);
    return false;
  }
}

// Deduplication tracker to prevent duplicate customer appends in the same session
const sentNewCustomerKeys = new Set<string>();

/**
 * Appends a single newly registered employee / customer to Google Sheets "العملاء_والحسابات" via Webhook
 */
export async function appendNewCustomerViaWebhook(
  customer: Customer,
  webhookUrl: string = getStoredWebhookUrl(),
  nextSequentialId?: string
): Promise<boolean> {
  if (!webhookUrl) return false;
  const dedupeKey = `${customer.code || ''}_${customer.name || ''}_${customer.id || ''}`.trim().toLowerCase();
  if (sentNewCustomerKeys.has(dedupeKey)) {
    return true; // Already sent recently, avoid duplicate append
  }
  sentNewCustomerKeys.add(dedupeKey);

  try {
    const row = formatCustomerToAccountsRow(customer, nextSequentialId);

    await fetch(webhookUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        type: 'new_customer',
        action: 'append_customer',
        sheetName: ACCOUNTS_SHEET_NAME,
        targetSheet: ACCOUNTS_SHEET_NAME,
        sheet: ACCOUNTS_SHEET_NAME,
        tabName: ACCOUNTS_SHEET_NAME,
        altSheetNames: ACCOUNTS_SHEET_ALTS,
        row,
        values: [row],
        data: row,
        customer,
        department: customer.department || '',
        spreadsheetId: DEFAULT_SPREADSHEET_ID,
      }),
    });

    return true;
  } catch (err) {
    console.warn('appendNewCustomerViaWebhook error:', err);
    return false;
  }
}

/**
 * Appends a new customer to Google Sheets "العملاء_والحسابات" using OAuth Google Sheets API v4
 */
export async function appendCustomerToGoogleSheet(
  accessToken: string,
  spreadsheetId: string,
  customer: Customer,
  nextSequentialId?: string
): Promise<boolean> {
  const row = formatCustomerToAccountsRow(customer, nextSequentialId);
  const rawCode = (customer.code || '').trim();
  const digits = extractEmployeeDigits(rawCode) || extractEmployeeDigits(customer.name);
  const normName = normalizeArabicName(extractCleanEmployeeName(customer.name));

  const candidateSheets = ACCOUNTS_SHEET_ALTS;
  for (const sheetName of candidateSheets) {
    try {
      // 1. In-sheet deduplication check: read existing rows to prevent duplicate row creation
      const checkUrl = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(`'${sheetName}'!A2:B`)}`;
      const checkResp = await fetchWithTimeout(checkUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }, 4000).catch(() => null);

      if (checkResp && checkResp.ok) {
        const checkData = await checkResp.json();
        if (checkData.values && Array.isArray(checkData.values)) {
          const existingRowIdx = checkData.values.findIndex((r: any[]) => {
            if (!r || !r[1]) return false;
            const existingName = String(r[1]).trim();
            const exDigits = extractEmployeeDigits(existingName) || extractEmployeeDigits(String(r[0]));
            const exNorm = normalizeArabicName(extractCleanEmployeeName(existingName));
            return (
              (digits && exDigits === digits) ||
              (normName && normName.length >= 3 && exNorm === normName)
            );
          });

          // If record already exists in the sheet, update it in-place instead of creating a duplicate!
          if (existingRowIdx !== -1) {
            const sheetRowNumber = existingRowIdx + 2; // +2 for 1-based indexing and header row
            const updateUrl = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(`'${sheetName}'!A${sheetRowNumber}:J${sheetRowNumber}`)}?valueInputOption=USER_ENTERED`;
            const updateResp = await fetchWithTimeout(updateUrl, {
              method: 'PUT',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ values: [row] }),
            }, 5000);
            return updateResp.ok;
          }
        }
      }

      // 2. If it's a completely new customer, append to the end of sheet
      const url = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(`'${sheetName}'!A:J`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: [row] }),
      });
      if (response.ok) return true;
    } catch {}
  }
  return false;
}

/**
 * Formats a customer/employee to match EXACTLY the 3 columns of "بينات الموظفين" in Google Sheet:
 * Column A: الاسم و الكود (e.g. "مهند سليمان - 11803")
 * Column B: القسم (e.g. "الشئون الإدارية")
 * Column C: رقم الهاتف (e.g. "01012345678" or "-")
 */
export function formatCustomerToEmployeesRow(customer: Customer): (string | number)[] {
  const cleanName = extractCleanEmployeeName(customer.name);
  const code = (customer.code || '').trim();
  const nameAndCode = code && !cleanName.includes(code)
    ? `${cleanName} - ${code}`
    : (customer.name.trim() || 'موظف مسجل');

  const department = (customer.department || '').trim();
  const phone = (customer.phone || '').trim() || '-';

  return [
    nameAndCode, // A: الاسم و الكود
    department,  // B: القسم
    phone,       // C: رقم الهاتف
  ];
}

/**
 * Appends a newly registered employee to Google Sheets "بينات الموظفين" via Webhook
 */
export async function appendEmployeeViaWebhook(
  customer: Customer,
  webhookUrl: string = getStoredWebhookUrl()
): Promise<boolean> {
  if (!webhookUrl) return false;
  try {
    const row = formatCustomerToEmployeesRow(customer);

    await fetch(webhookUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        type: 'new_employee',
        action: 'append_employee',
        sheetName: EMPLOYEES_SHEET_NAME,
        targetSheet: EMPLOYEES_SHEET_NAME,
        sheet: EMPLOYEES_SHEET_NAME,
        tabName: EMPLOYEES_SHEET_NAME,
        altSheetNames: EMPLOYEES_SHEET_ALTS,
        row,
        values: [row],
        data: row,
        nameAndCode: row[0],
        department: row[1],
        phone: row[2],
        customer,
        spreadsheetId: DEFAULT_SPREADSHEET_ID,
      }),
    });

    return true;
  } catch (err) {
    console.warn('appendEmployeeViaWebhook error:', err);
    return false;
  }
}

/**
 * Appends a new employee to Google Sheets "بينات الموظفين" using OAuth Google Sheets API v4
 */
export async function appendEmployeeToGoogleSheet(
  accessToken: string,
  spreadsheetId: string,
  customer: Customer
): Promise<boolean> {
  const row = formatCustomerToEmployeesRow(customer);
  const nameAndCode = String(row[0]).trim();

  // Try candidate sheet names (بينات الموظفين / بيانات الموظفين)
  for (const sheetName of EMPLOYEES_SHEET_ALTS) {
    try {
      // 1. Check existing rows in Column A to prevent duplicates
      const checkUrl = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(`'${sheetName}'!A2:A`)}`;
      const checkResp = await fetchWithTimeout(checkUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }, 5000);
      if (checkResp.ok) {
        const checkData = await checkResp.json();
        if (checkData.values && Array.isArray(checkData.values)) {
          const exists = checkData.values.some((r: any[]) => r && String(r[0]).trim() === nameAndCode);
          if (exists) {
            return true; // Already exists, avoid duplicate row!
          }
        }
      }

      // 2. Append row to Column A:C
      const appendUrl = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(`'${sheetName}'!A:C`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
      const response = await fetchWithTimeout(appendUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: [row] }),
      }, 6000);

      if (response.ok) return true;
    } catch {}
  }
  return false;
}

/**
 * Generates TSV (Tab-Separated Values) format for 'بينات الموظفين' for instant copy & paste into Google Sheets
 */
export function generateEmployeesTsv(customers: Customer[]): string {
  const header = ['الاسم و الكود', 'القسم', 'رقم الهاتف'].join('\t');
  const unique = deduplicateCustomers(customers);
  const rows = unique
    .filter(c => c.name && c.name.trim() !== 'عميل نقدي سريع' && c.code !== 'GUEST')
    .map(c => formatCustomerToEmployeesRow(c).join('\t'));
  return [header, ...rows].join('\n');
}

/**
 * Generates TSV format for 'العملاء_والحسابات' for instant copy & paste into Google Sheets
 */
export function generateAccountsTsv(customers: Customer[]): string {
  const header = [
    'كود العميل', 
    'اسم العميل / الموظف', 
    'الفئة', 
    'إجمالي الطلبات (ج.م)', 
    'إجمالي المسدد (ج.م)', 
    'المتبقي (المديونية)', 
    'حالة الحساب',
    'القسم',
    'رقم الهاتف',
    'كود الموظف'
  ].join('\t');
  const unique = deduplicateCustomers(customers);
  const rows = unique.map(c => formatCustomerToAccountsRow(c).join('\t'));
  return [header, ...rows].join('\n');
}

/**
 * Sends all registered employees to Webhook for batch insertion in 'بينات الموظفين'
 */
export async function syncAllEmployeesViaWebhook(
  customers: Customer[],
  webhookUrl: string = getStoredWebhookUrl()
): Promise<boolean> {
  if (!webhookUrl) return false;
  try {
    const employees = deduplicateCustomers(customers).filter(
      c => c.name && c.name.trim() !== 'عميل نقدي سريع' && c.code !== 'GUEST'
    );
    const rows = employees.map(emp => formatCustomerToEmployeesRow(emp));
    await fetch(webhookUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        type: 'sync_all_employees',
        action: 'sync_all_employees',
        sheetName: EMPLOYEES_SHEET_NAME,
        targetSheet: EMPLOYEES_SHEET_NAME,
        sheet: EMPLOYEES_SHEET_NAME,
        tabName: EMPLOYEES_SHEET_NAME,
        altSheetNames: EMPLOYEES_SHEET_ALTS,
        rows,
        values: rows,
        spreadsheetId: DEFAULT_SPREADSHEET_ID,
      }),
    });
    return true;
  } catch (err) {
    console.warn('syncAllEmployeesViaWebhook notice:', err);
    return false;
  }
}

export interface SyncEmployeesResult {
  appended: number;
  total: number;
  alreadyPresent: number;
  sheetName: string;
}

/**
 * Syncs all registered employees to "بينات الموظفين" with smart deduplication against existing sheet records
 */
export async function syncAllEmployeesToEmployeesSheet(
  accessToken: string,
  spreadsheetId: string,
  customers: Customer[]
): Promise<SyncEmployeesResult> {
  const employees = deduplicateCustomers(customers).filter(c => c.name && c.name.trim() !== 'عميل نقدي سريع' && c.code !== 'GUEST');
  if (employees.length === 0) {
    return { appended: 0, total: 0, alreadyPresent: 0, sheetName: EMPLOYEES_SHEET_NAME };
  }

  // Ensure sheet and headers exist
  await ensureSpreadsheetTabsAndHeaders(accessToken, spreadsheetId).catch(() => {});

  // 1. Fetch existing names in Column A of 'بينات الموظفين'
  const existingNames = new Set<string>();
  let targetSheetName = EMPLOYEES_SHEET_NAME;

  for (const sName of EMPLOYEES_SHEET_ALTS) {
    try {
      const url = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(`'${sName}'!A2:A`)}`;
      const resp = await fetchWithTimeout(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }, 5000);
      if (resp.ok) {
        targetSheetName = sName;
        const data = await resp.json();
        if (data.values && Array.isArray(data.values)) {
          for (const row of data.values) {
            if (row && row[0]) {
              const val = String(row[0]).trim();
              if (val) existingNames.add(val);
            }
          }
        }
        break;
      }
    } catch {}
  }

  // 2. Filter employees that are not already in the sheet (multi-attribute deduplication)
  const existingList = Array.from(existingNames);
  const missingRows = employees
    .map(emp => ({ row: formatCustomerToEmployeesRow(emp), emp }))
    .filter(({ row, emp }) => {
      const nameAndCode = String(row[0]).trim();
      const d = extractEmployeeDigits(emp.code) || extractEmployeeDigits(emp.name);
      const norm = normalizeArabicName(extractCleanEmployeeName(emp.name));

      const isExactMatch = existingNames.has(nameAndCode);
      const isDigitMatch = Boolean(d && existingList.some(n => extractEmployeeDigits(n) === d));
      const isNameMatch = Boolean(norm && norm.length >= 3 && existingList.some(n => normalizeArabicName(extractCleanEmployeeName(n)) === norm));

      return !isExactMatch && !isDigitMatch && !isNameMatch;
    })
    .map(({ row }) => row);

  const alreadyPresent = employees.length - missingRows.length;

  if (missingRows.length === 0) {
    return { appended: 0, total: employees.length, alreadyPresent, sheetName: targetSheetName };
  }

  // 3. Append missing rows
  const appendUrl = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(`'${targetSheetName}'!A:C`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const response = await fetchWithTimeout(appendUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: missingRows }),
  }, 10000);

  if (response.ok) {
    return { appended: missingRows.length, total: employees.length, alreadyPresent, sheetName: targetSheetName };
  }

  return { appended: 0, total: employees.length, alreadyPresent, sheetName: targetSheetName };
}

/**
 * Force replaces all rows in 'بينات الموظفين' with the current full list of registered employees
 */
export async function forceOverwriteEmployeesSheet(
  accessToken: string,
  spreadsheetId: string,
  customers: Customer[]
): Promise<number> {
  const employees = customers.filter(c => c.name && c.name.trim() !== 'عميل نقدي سريع' && c.code !== 'GUEST');
  if (employees.length === 0) return 0;

  await ensureSpreadsheetTabsAndHeaders(accessToken, spreadsheetId).catch(() => {});
  const rows = employees.map(emp => formatCustomerToEmployeesRow(emp));
  const targetSheetName = EMPLOYEES_SHEET_NAME;

  // Clear existing data rows (A2:C1000)
  try {
    await fetchWithTimeout(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(`'${targetSheetName}'!A2:C`)}:clear`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      },
      5000
    );
  } catch {}

  // Write all rows starting at A2
  const url = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(`'${targetSheetName}'!A2:C${rows.length + 1}`)}?valueInputOption=USER_ENTERED`;
  const resp = await fetchWithTimeout(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: rows }),
  }, 10000);

  return resp.ok ? rows.length : 0;
}

export interface GoogleSpreadsheetInfo {
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
}

/**
 * Creates a brand new Google Spreadsheet for the cafe cashier orders & customer debts
 */
export async function createCafeOrdersSpreadsheet(
  accessToken: string,
  title = `طلبات البوفيه والكاشير - ${new Date().toLocaleDateString('ar-EG')}`
): Promise<GoogleSpreadsheetInfo> {
  const requestBody = {
    properties: {
      title,
      locale: 'ar_EG',
      autoRecalc: 'ON_CHANGE'
    },
    sheets: [
      {
        properties: {
          title: ORDERS_SHEET_NAME,
          gridProperties: {
            frozenRowCount: 1,
          },
        },
        data: [
          {
            startRow: 0,
            startColumn: 0,
            rowData: [
              {
                values: [
                  { userEnteredValue: { stringValue: 'رقم الطلب' } },
                  { userEnteredValue: { stringValue: 'تاريخ ووقت الطلب' } },
                  { userEnteredValue: { stringValue: 'اسم العميل / الموظف' } },
                  { userEnteredValue: { stringValue: 'كود العميل' } },
                  { userEnteredValue: { stringValue: 'طلبات البوفيه (الأصناف والكميات)' } },
                  { userEnteredValue: { stringValue: 'إجمالي الفاتورة (ج.م)' } },
                  { userEnteredValue: { stringValue: 'طريقة الدفع' } },
                  { userEnteredValue: { stringValue: 'المدفوع (ج.م)' } },
                  { userEnteredValue: { stringValue: 'المتبقي على الحساب (ج.م)' } },
                  { userEnteredValue: { stringValue: 'ملاحظات' } },
                  { userEnteredValue: { stringValue: 'الكاشير' } },
                ],
              },
            ],
          },
        ],
      },
      {
        properties: {
          title: 'أرصدة ومديونيات العملاء',
          gridProperties: {
            frozenRowCount: 1,
          },
        },
        data: [
          {
            startRow: 0,
            startColumn: 0,
            rowData: [
              {
                values: [
                  { userEnteredValue: { stringValue: 'كود العميل' } },
                  { userEnteredValue: { stringValue: 'اسم العميل' } },
                  { userEnteredValue: { stringValue: 'الفئة' } },
                  { userEnteredValue: { stringValue: 'رقم الهاتف' } },
                  { userEnteredValue: { stringValue: 'إجمالي الطلبات (ج.م)' } },
                  { userEnteredValue: { stringValue: 'إجمالي المسدد (ج.م)' } },
                  { userEnteredValue: { stringValue: 'المديونية المتبقية (ج.م)' } },
                  { userEnteredValue: { stringValue: 'الحد الائتماني (ج.م)' } },
                  { userEnteredValue: { stringValue: 'حالة الحساب' } },
                  { userEnteredValue: { stringValue: 'آخر حركة' } },
                ],
              },
            ],
          },
        ],
      },
      {
        properties: {
          title: MENU_SHEET_NAME,
          gridProperties: {
            frozenRowCount: 1,
          },
        },
        data: [
          {
            startRow: 0,
            startColumn: 0,
            rowData: [
              {
                values: [
                  { userEnteredValue: { stringValue: 'اسم الصنف' } },
                  { userEnteredValue: { stringValue: 'السعر (ج.م)' } },
                  { userEnteredValue: { stringValue: 'الفئة' } },
                  { userEnteredValue: { stringValue: 'الوصف' } },
                  { userEnteredValue: { stringValue: 'متوفر' } },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const response = await fetchWithTimeout(SHEETS_API_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || 'فشل إنشاء جدول بيانات Google Sheet جديد.');
  }

  const data = await response.json();
  return {
    spreadsheetId: data.spreadsheetId,
    spreadsheetUrl: data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`,
    title: data.properties?.title || title,
  };
}

/**
 * Reads existing Order IDs and finds the EXACT first empty row in Column A of the orders sheet.
 * This completely bypasses checkboxes/formatting in other columns that confuse standard :append.
 */
export async function getNextEmptyRowInOrdersSheet(
  accessToken: string,
  spreadsheetId: string
): Promise<{ nextRow: number; existingIds: Set<string>; targetSheetName: string }> {
  const existingIds = new Set<string>();
  const candidateNames = cachedTargetOrdersSheetName
    ? [cachedTargetOrdersSheetName, ORDERS_SHEET_NAME, ORDERS_SHEET_ALT, 'طلبات البوفيه الحية']
    : [ORDERS_SHEET_NAME, ORDERS_SHEET_ALT, 'طلبات البوفيه الحية', 'الطلبات الحية للكاشير', 'Sheet1', 'ورقة1'];

  for (const sName of candidateNames) {
    try {
      const formattedRange = `'${sName}'!A1:A`;
      const url = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(formattedRange)}`;
      const response = await fetchWithTimeout(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }, 6000);
      if (response.ok) {
        cachedTargetOrdersSheetName = sName;
        const data = await response.json();
        const rows = data.values || [];
        let lastFilledIndex = 1; // Row 1 is header

        for (let i = 0; i < rows.length; i++) {
          const val = rows[i] && rows[i][0] ? String(rows[i][0]).trim() : '';
          if (val) {
            lastFilledIndex = i + 1; // 1-based index in spreadsheet
            if (i > 0) {
              existingIds.add(val);
            }
          }
        }
        return { nextRow: lastFilledIndex + 1, existingIds, targetSheetName: sName };
      }
    } catch {
      // Continue to next sheet name fallback
    }
  }
  return { nextRow: 2, existingIds, targetSheetName: ORDERS_SHEET_NAME };
}

/**
 * Reads existing Order IDs from Column A of the orders sheet to guarantee zero duplicates
 */
export async function getExistingOrderIdsFromSheet(
  accessToken: string,
  spreadsheetId: string
): Promise<Set<string>> {
  const { existingIds } = await getNextEmptyRowInOrdersSheet(accessToken, spreadsheetId).catch(() => ({
    existingIds: new Set<string>()
  }));
  return existingIds;
}

/**
 * Appends a newly placed order to the Google Sheet live (high speed & zero duplicate guarantee).
 * Directly writes to the first empty row in Column A to prevent jumping past checkboxes in Column I!
 */
export async function appendOrderToGoogleSheet(
  accessToken: string,
  spreadsheetId: string,
  order: Order,
  customer?: Customer | null
): Promise<boolean> {
  const orderCode = order.id?.startsWith('ORD-') ? order.id : `ORD-${order.orderNumber}`;
  const row = formatOrderToSheetRow(order, customer);

  // 1. Find exact next empty row in Column A
  try {
    const { nextRow, existingIds, targetSheetName } = await getNextEmptyRowInOrdersSheet(accessToken, spreadsheetId);
    
    // If order is already in the sheet (e.g. from previous push), treat as succeeded
    if (existingIds.has(order.id) || existingIds.has(String(order.orderNumber)) || existingIds.has(orderCode)) {
      markOrderAsSynced(order.id);
      markOrderAsSynced(String(order.orderNumber));
      markOrderAsSynced(orderCode);
      return true;
    }

    // 2. Direct PUT to exact row (e.g. A278:H278) - preserves column I checkboxes!
    const putRange = `'${targetSheetName}'!A${nextRow}:H${nextRow}`;
    const putUrl = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(putRange)}?valueInputOption=USER_ENTERED`;
    const putResponse = await fetchWithTimeout(putUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [row] }),
    }, 7000);

    if (putResponse.ok) {
      markOrderAsSynced(order.id);
      markOrderAsSynced(String(order.orderNumber));
      markOrderAsSynced(orderCode);
      return true;
    }
  } catch (err) {
    console.warn('Direct PUT to exact row failed, falling back to :append:', err);
  }

  // 3. Fallback to standard :append if PUT or range inspection encountered an issue
  const values = [row];
  const sheetNames = cachedTargetOrdersSheetName
    ? [cachedTargetOrdersSheetName, ORDERS_SHEET_NAME, ORDERS_SHEET_ALT, 'طلبات البوفيه الحية', 'Sheet1']
    : [ORDERS_SHEET_NAME, ORDERS_SHEET_ALT, 'طلبات البوفيه الحية', 'الطلبات الحية للكاشير', 'Sheet1', 'ورقة1'];

  let appendSuccess = false;

  for (const sheetName of sheetNames) {
    try {
      const formattedRange = `'${sheetName}'!A:H`;
      const url = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(formattedRange)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values }),
      }, 6000);

      if (response.ok) {
        cachedTargetOrdersSheetName = sheetName;
        appendSuccess = true;
        markOrderAsSynced(order.id);
        markOrderAsSynced(String(order.orderNumber));
        markOrderAsSynced(orderCode);
        break;
      }
    } catch {
      // try next sheet name
    }
  }

  // If append failed, ensure the tabs exist and retry once
  if (!appendSuccess) {
    try {
      await ensureSpreadsheetTabsAndHeaders(accessToken, spreadsheetId);
      const targetTab = cachedTargetOrdersSheetName || ORDERS_SHEET_NAME;
      const formattedRange = `'${targetTab}'!A:H`;
      const url = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(formattedRange)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
      const retryResp = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values }),
      }, 6000);
      if (retryResp.ok) {
        cachedTargetOrdersSheetName = targetTab;
        appendSuccess = true;
        markOrderAsSynced(order.id);
        markOrderAsSynced(String(order.orderNumber));
        markOrderAsSynced(orderCode);
      }
    } catch {
      // Ignore retry error
    }
  }

  return appendSuccess;
}

/**
 * Bulk sync past orders to the Google Sheet with smart deduplication against existing sheet records.
 * Directly writes missing orders to exact empty row index via PUT!
 */
export async function bulkSyncOrdersToGoogleSheet(
  accessToken: string,
  spreadsheetId: string,
  orders: Order[],
  customers: Customer[]
): Promise<number> {
  if (orders.length === 0) return 0;

  // 1. Fetch existing order IDs and the next empty row index in Column A
  const { nextRow, existingIds, targetSheetName } = await getNextEmptyRowInOrdersSheet(accessToken, spreadsheetId).catch(() => ({
    nextRow: 2,
    existingIds: new Set<string>(),
    targetSheetName: ORDERS_SHEET_NAME,
  }));

  // 2. Filter out orders that already exist in sheet (ground truth)
  const missingOrders = orders.filter(order => {
    const id = order.id;
    const orderNum = `ORD-${order.orderNumber}`;
    const numOnly = String(order.orderNumber);
    if (existingIds.has(id) || existingIds.has(orderNum) || existingIds.has(numOnly)) {
      markOrderAsSynced(id);
      markOrderAsSynced(numOnly);
      markOrderAsSynced(orderNum);
      return false;
    }
    return true;
  });

  if (missingOrders.length === 0) {
    return 0;
  }

  const customerMap = new Map(customers.map(c => [c.id, c]));
  const values = missingOrders.map(order => {
    const cust = order.customerId ? customerMap.get(order.customerId) : null;
    return formatOrderToSheetRow(order, cust);
  });

  // 3. Direct consecutive PUT starting at exact nextRow (e.g. A278:H280)
  const endRow = nextRow + values.length - 1;
  const putRange = `'${targetSheetName}'!A${nextRow}:H${endRow}`;
  const putUrl = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(putRange)}?valueInputOption=USER_ENTERED`;

  try {
    const putResponse = await fetchWithTimeout(putUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values }),
    }, 10000);

    if (putResponse.ok) {
      for (const order of missingOrders) {
        const orderCode = order.id?.startsWith('ORD-') ? order.id : `ORD-${order.orderNumber}`;
        markOrderAsSynced(order.id);
        markOrderAsSynced(String(order.orderNumber));
        markOrderAsSynced(orderCode);
      }
      return missingOrders.length;
    }
  } catch (err) {
    console.warn('Direct bulk PUT failed, falling back to :append:', err);
  }

  // Fallback to :append if PUT was rejected
  let appendOk = false;
  const sheetNames = cachedTargetOrdersSheetName
    ? [cachedTargetOrdersSheetName, ORDERS_SHEET_NAME, ORDERS_SHEET_ALT, 'طلبات البوفيه الحية']
    : [ORDERS_SHEET_NAME, ORDERS_SHEET_ALT, 'طلبات البوفيه الحية', 'الطلبات الحية للكاشير', 'Sheet1', 'ورقة1'];

  for (const sName of sheetNames) {
    try {
      const formattedRange = `'${sName}'!A2:H`;
      const url = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(formattedRange)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values }),
      }, 10000);
      if (response.ok) {
        cachedTargetOrdersSheetName = sName;
        appendOk = true;
        for (const order of missingOrders) {
          const orderCode = order.id?.startsWith('ORD-') ? order.id : `ORD-${order.orderNumber}`;
          markOrderAsSynced(order.id);
          markOrderAsSynced(String(order.orderNumber));
          markOrderAsSynced(orderCode);
        }
        break;
      }
    } catch {
      // Continue to next sheet name fallback
    }
  }

  if (!appendOk) {
    try {
      await ensureSpreadsheetTabsAndHeaders(accessToken, spreadsheetId);
      const targetTab = cachedTargetOrdersSheetName || ORDERS_SHEET_NAME;
      const formattedRange = `'${targetTab}'!A2:H`;
      const url = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(formattedRange)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
      const retryResp = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values }),
      }, 10000);
      if (retryResp.ok) {
        cachedTargetOrdersSheetName = targetTab;
        appendOk = true;
        for (const order of missingOrders) {
          const orderCode = order.id?.startsWith('ORD-') ? order.id : `ORD-${order.orderNumber}`;
          markOrderAsSynced(order.id);
          markOrderAsSynced(String(order.orderNumber));
          markOrderAsSynced(orderCode);
        }
      }
    } catch {}
  }

  if (!appendOk) {
    throw new Error('تعذر إدراج الطلبات في شيت Google. تأكد من صلاحيات الشيت.');
  }

  return missingOrders.length;
}

/**
 * Sync customer balances and debts to the "العملاء_والحسابات" tab
 */
export async function syncCustomersToGoogleSheet(
  accessToken: string,
  spreadsheetId: string,
  customers: Customer[]
): Promise<boolean> {
  const extraHeaders = ['القسم', 'رقم الهاتف', 'كود الموظف'];

  for (const sheetName of ACCOUNTS_SHEET_ALTS) {
    try {
      // 1. Fetch existing rows from the sheet first so manual entries are NEVER lost or erased!
      let sheetCustomers: Customer[] = [];
      try {
        const getUrl = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(`'${sheetName}'!A1:J500`)}`;
        const getRes = await fetchWithTimeout(getUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }, 5000);
        if (getRes.ok) {
          const getData = await getRes.json();
          if (getData.values && getData.values.length > 1) {
            sheetCustomers = parseCustomersFromRows(getData.values, 'accounts');
          }
        }
      } catch (e) {
        console.warn('Notice: Could not fetch existing sheet rows prior to sync:', e);
      }

      // Merge: preserve every customer entered manually in the sheet
      const mergedCustomers = deduplicateCustomers([...sheetCustomers, ...customers]);
      const values = mergedCustomers.map(c => formatCustomerToAccountsRow(c));

      // Ensure H1:J1 headers exist
      fetchWithTimeout(
        `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(`'${sheetName}'!H1:J1`)}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ values: [extraHeaders] }),
        },
        3000
      ).catch(() => {});

      const formattedRange = `'${sheetName}'!A2:J${values.length + 1}`;
      const url = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(formattedRange)}?valueInputOption=USER_ENTERED`;

      const response = await fetchWithTimeout(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values }),
      });

      if (response.ok) {
        return true;
      }
    } catch {
      // Continue to next sheet name
    }
  }

  return false;
}

/**
 * Ensure the required sheets ("طلبات البوفيه الحية" & "أرصدة ومديونيات العملاء") and headers exist in target spreadsheet
 */
export async function ensureSpreadsheetTabsAndHeaders(
  accessToken: string,
  spreadsheetId: string
): Promise<{ success: boolean; sheetNames: string[] }> {
  try {
    const verified = await verifyGoogleSheet(accessToken, spreadsheetId);
    const existing = new Set(verified.sheetNames);

    const requests: any[] = [];
    if (!existing.has(ORDERS_SHEET_NAME) && !existing.has('طلبات البوفيه الحية')) {
      requests.push({
        addSheet: {
          properties: {
            title: ORDERS_SHEET_NAME,
            gridProperties: { frozenRowCount: 1 },
          },
        },
      });
    }
    if (!existing.has(CUSTOMERS_SHEET_NAME)) {
      requests.push({
        addSheet: {
          properties: {
            title: CUSTOMERS_SHEET_NAME,
            gridProperties: { frozenRowCount: 1 },
          },
        },
      });
    }
    const hasMenuTab = MENU_SHEET_ALTS.some(name => existing.has(name));
    if (!hasMenuTab) {
      requests.push({
        addSheet: {
          properties: {
            title: MENU_SHEET_NAME,
            gridProperties: { frozenRowCount: 1 },
          },
        },
      });
    }
    const hasEmployeesTab = EMPLOYEES_SHEET_ALTS.some(name => existing.has(name));
    if (!hasEmployeesTab) {
      requests.push({
        addSheet: {
          properties: {
            title: EMPLOYEES_SHEET_NAME,
            gridProperties: { frozenRowCount: 1 },
          },
        },
      });
    }

    if (requests.length > 0) {
      await fetchWithTimeout(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests }),
      }).catch(console.warn);
    }

    // Set headers for orders sheet (try سجل الطلبات, fallback to طلبات البوفيه الحية)
    const targetOrdersSheet = existing.has(ORDERS_SHEET_NAME) || !existing.has('طلبات البوفيه الحية') 
      ? ORDERS_SHEET_NAME 
      : 'طلبات البوفيه الحية';

    const ordersHeaders = [
      'رقم الطلب',
      'التاريخ والوقت',
      'اسم العميل',
      'تفاصيل الطلب',
      'الإجمالي (ج.م)',
      'طريقة الدفع',
      'حالة السداد',
      'ملاحظات',
    ];
    await fetchWithTimeout(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(`'${targetOrdersSheet}'!A1:H1`)}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: [ordersHeaders] }),
      }
    ).catch(() => {});

    // Set headers for debts sheet
    const customersHeaders = [
      'كود العميل',
      'اسم العميل',
      'الفئة',
      'رقم الهاتف',
      'إجمالي الطلبات (ج.م)',
      'إجمالي المسدد (ج.م)',
      'المديونية المتبقية (ج.م)',
      'الحد الائتماني (ج.م)',
      'حالة الحساب',
      'آخر حركة',
    ];
    await fetchWithTimeout(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(`'${CUSTOMERS_SHEET_NAME}'!A1:J1`)}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: [customersHeaders] }),
      }
    ).catch(() => {});

    // Set headers for menu items sheet if new
    if (!hasMenuTab) {
      const menuHeaders = ['اسم الصنف', 'السعر (ج.م)', 'الفئة', 'الوصف', 'متوفر'];
      await fetchWithTimeout(
        `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(`'${MENU_SHEET_NAME}'!A1:E1`)}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ values: [menuHeaders] }),
        }
      ).catch(() => {});
    }

    // Set headers for employees sheet if new
    if (!hasEmployeesTab) {
      const employeesHeaders = ['الاسم و الكود', 'القسم', 'رقم الهاتف'];
      await fetchWithTimeout(
        `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(`'${EMPLOYEES_SHEET_NAME}'!A1:C1`)}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ values: [employeesHeaders] }),
        }
      ).catch(() => {});
    }

    return { 
      success: true, 
      sheetNames: Array.from(new Set([...verified.sheetNames, ORDERS_SHEET_NAME, CUSTOMERS_SHEET_NAME, MENU_SHEET_NAME, EMPLOYEES_SHEET_NAME])) 
    };
  } catch (err) {
    console.warn('ensureSpreadsheetTabsAndHeaders notice:', err);
    return { success: false, sheetNames: [] };
  }
}

/**
 * Verify spreadsheet accessibility
 */
export async function verifyGoogleSheet(
  accessToken: string,
  spreadsheetId: string
): Promise<{ title: string; sheetNames: string[] }> {
  const url = `${SHEETS_API_BASE}/${spreadsheetId}?fields=properties.title,sheets.properties.title`;
  const response = await fetchWithTimeout(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('لا يمكن الوصول إلى هذا الشيت. تأكد من أن المعرف صحيح ولديك صلاحية الوصول إليه.');
  }

  const data = await response.json();
  const sheetNames = (data.sheets || []).map((s: any) => s.properties?.title || '');
  return {
    title: data.properties?.title || 'Google Sheet',
    sheetNames,
  };
}

/**
 * Parses numbers with support for Arabic digits (١-٩) and stripping currency symbols
 */
export function parseArabicNumber(val: any): number {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const str = String(val)
    .replace(/[٠١٢٣٤٥٦٧٨٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
    .replace(/[^\d.-]/g, '');
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

/**
 * Classifies an item into one of the standard categories based on category name and item title
 */
export function classifyCategory(catRaw: string, itemName: string): ProductCategory {
  const combined = `${catRaw || ''} ${itemName || ''}`.toLowerCase();
  if (
    combined.includes('ساخن') ||
    combined.includes('قهوة') ||
    combined.includes('شاى') ||
    combined.includes('شاي') ||
    combined.includes('نسكافيه') ||
    combined.includes('اسبريسو') ||
    combined.includes('كابتشينو') ||
    combined.includes('ينسون') ||
    combined.includes('نعناع') ||
    combined.includes('كركديه') ||
    combined.includes('hot')
  ) {
    return 'hot_drinks';
  }
  if (
    combined.includes('بارد') ||
    combined.includes('عصير') ||
    combined.includes('كانز') ||
    combined.includes('مياه') ||
    combined.includes('مايه') ||
    combined.includes('ساقع') ||
    combined.includes('بيبسي') ||
    combined.includes('كولا') ||
    combined.includes('cold') ||
    combined.includes('ايس')
  ) {
    return 'cold_drinks';
  }
  if (
    combined.includes('ساندوتش') ||
    combined.includes('سندوتش') ||
    combined.includes('طعام') ||
    combined.includes('اكل') ||
    combined.includes('فطار') ||
    combined.includes('بيض') ||
    combined.includes('فلافل') ||
    combined.includes('جبن') ||
    combined.includes('تركي') ||
    combined.includes('رومي') ||
    combined.includes('لانشون') ||
    combined.includes('برجر') ||
    combined.includes('كفته') ||
    combined.includes('شاورما') ||
    combined.includes('سوسيس') ||
    combined.includes('food')
  ) {
    return 'food';
  }
  if (
    combined.includes('شيبس') ||
    combined.includes('مولتو') ||
    combined.includes('حلو') ||
    combined.includes('شوكولات') ||
    combined.includes('كيك') ||
    combined.includes('بسكويت') ||
    combined.includes('تسالي') ||
    combined.includes('dessert') ||
    combined.includes('سناك')
  ) {
    return 'desserts';
  }
  if (combined.includes('بطاطس') || combined.includes('طبق') || combined.includes('وجبة') || combined.includes('خاص')) {
    return 'special';
  }
  return 'food';
}

/**
 * Parses rows returned from Google Sheets into MenuItem array
 */
export function parseMenuItemsFromRows(rows: (string | number)[][]): MenuItem[] {
  if (!rows || rows.length === 0) return [];

  const headerRow = (rows[0] || []).map(c => String(c || '').trim().toLowerCase());
  let codeIdx = -1;
  let nameIdx = -1;
  let priceIdx = -1;
  let categoryIdx = -1;
  let descIdx = -1;
  let availableIdx = -1;

  for (let i = 0; i < headerRow.length; i++) {
    const col = headerRow[i];
    // 1. Code column: كود الصنف, code, رمز, id
    if (col.includes('كود') || col.includes('code') || col.includes('رمز') || col.includes('barcode')) {
      if (codeIdx === -1) codeIdx = i;
    }
    // 2. Name column: اسم الصنف, اسم, name, or (صنف without كود)
    else if (
      col.includes('اسم') || 
      col.includes('name') || 
      col.includes('المنتج') || 
      (col.includes('صنف') && !col.includes('كود'))
    ) {
      if (nameIdx === -1) nameIdx = i;
    }
    // 3. Price column: سعر البيع, سعر, price, ج.م, جنيه
    else if (
      col.includes('سعر') || 
      col.includes('price') || 
      col.includes('ج.م') || 
      col.includes('جنيه') || 
      col.includes('بيع') ||
      col.includes('تكلفة')
    ) {
      if (priceIdx === -1) priceIdx = i;
    }
    // 4. Category column: القسم, فئة, تصنيف, نوع, category
    else if (
      col.includes('قسم') || 
      col.includes('فئة') || 
      col.includes('تصنيف') || 
      col.includes('نوع') || 
      col.includes('category')
    ) {
      if (categoryIdx === -1) categoryIdx = i;
    }
    // 5. Description column: وصف, تفاصيل, ملاحظات
    else if (col.includes('وصف') || col.includes('تفاصيل') || col.includes('ملاحظات') || col.includes('desc')) {
      if (descIdx === -1) descIdx = i;
    }
    // 6. Availability column: حالة التوفر, متاح, متوفر, حالة
    else if (
      col.includes('توفر') || 
      col.includes('متاح') || 
      col.includes('متوفر') || 
      col.includes('حالة') || 
      col.includes('avail')
    ) {
      if (availableIdx === -1) availableIdx = i;
    }
  }

  // Exact fallback for standard layout [كود الصنف, القسم, اسم الصنف, سعر البيع, حالة التوفر]
  if (codeIdx === 0 && nameIdx === -1 && headerRow.length >= 3) {
    nameIdx = 2; // Column C: اسم الصنف
  }
  if (codeIdx === 0 && categoryIdx === -1 && headerRow.length >= 2) {
    categoryIdx = 1; // Column B: القسم
  }
  if (codeIdx === 0 && priceIdx === -1 && headerRow.length >= 4) {
    priceIdx = 3; // Column D: سعر البيع
  }
  if (codeIdx === 0 && availableIdx === -1 && headerRow.length >= 5) {
    availableIdx = 4; // Column E: حالة التوفر
  }

  let startIndex = 1;
  if (nameIdx === -1 && priceIdx === -1) {
    const isFirstRowHeader = isNaN(parseArabicNumber(rows[0][1])) && isNaN(parseArabicNumber(rows[0][0]));
    nameIdx = 0;
    priceIdx = 1;
    categoryIdx = 2;
    descIdx = 3;
    availableIdx = 4;
    startIndex = isFirstRowHeader ? 1 : 0;
  } else {
    if (nameIdx === -1) nameIdx = 0;
    if (priceIdx === -1) priceIdx = nameIdx === 0 ? 1 : 0;
  }

  const items: MenuItem[] = [];
  for (let r = startIndex; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    const rawCode = codeIdx >= 0 && row[codeIdx] !== undefined ? String(row[codeIdx]).trim() : '';
    const rawName = String(row[nameIdx] || '').trim();
    if (!rawName || rawName === 'اسم الصنف' || rawName === 'الصنف' || rawName === 'Name') continue;

    const rawPrice = row[priceIdx];
    const price = parseArabicNumber(rawPrice);
    if (price < 0 || isNaN(price)) continue;

    const rawCategory = categoryIdx >= 0 && row[categoryIdx] !== undefined ? String(row[categoryIdx]).trim() : '';
    const category = classifyCategory(rawCategory, rawName);
    const description = descIdx >= 0 && row[descIdx] ? String(row[descIdx]).trim() : `طازج وسريع من بوفيه الكافيه`;
    
    let available = true;
    if (availableIdx >= 0 && row[availableIdx] !== undefined) {
      const avVal = String(row[availableIdx]).trim().toLowerCase();
      if (avVal === 'لا' || avVal === 'غير متاح' || avVal === 'غير متوفر' || avVal === 'false' || avVal === '0') {
        available = false;
      }
    }

    const isDrink = category === 'hot_drinks' || category === 'cold_drinks';
    const itemId = rawCode 
      ? `item-${rawCode.toLowerCase().replace(/[^a-z0-9_-]/g, '')}`
      : `item-sheet-${r + 1}-${encodeURIComponent(rawName.slice(0, 12))}`;

    items.push({
      id: itemId,
      code: rawCode || undefined,
      name: rawName,
      price: price,
      category: category,
      description: description,
      popular: items.length < 5,
      available: available,
      allowSugarOptions: isDrink && (category === 'hot_drinks' || rawName.includes('شاي') || rawName.includes('قهوة')),
      allowSizeOptions: isDrink || category === 'special',
    });
  }

  return items;
}

export function parseCSVToRows(csvText: string): string[][] {
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const rows: string[][] = [];
  for (const line of lines) {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' || char === '“' || char === '”') {
        inQuotes = !inQuotes;
      } else if ((char === ',' || char === '\t' || char === ';') && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    rows.push(cells);
  }
  return rows;
}

/**
 * Parses raw CSV or TSV string into MenuItem array
 */
export function parseCSVToMenuItems(csvText: string): MenuItem[] {
  const rows = parseCSVToRows(csvText);
  return parseMenuItemsFromRows(rows);
}

/**
 * Fetches menu items directly from Google Sheet ('قائمة_الأصناف')
 */
export async function fetchMenuItemsFromGoogleSheet(
  accessToken: string | null,
  spreadsheetId: string
): Promise<{ success: boolean; items: MenuItem[]; sourceSheet?: string; message?: string }> {
  if (!spreadsheetId) {
    return { success: false, items: [], message: 'معرف الشيت غير محدد' };
  }

  // 0. Try Google Apps Script Webhook (Autonomous, zero login required)
  const webhookUrl = getStoredWebhookUrl();
  if (webhookUrl && webhookUrl.startsWith('https://script.google.com/')) {
    try {
      const webhookFetchUrl = `${webhookUrl}${webhookUrl.includes('?') ? '&' : '?'}action=get_menu`;
      const response = await fetchWithTimeout(webhookFetchUrl, {}, 6000);
      if (response.ok) {
        const json = await response.json().catch(() => null);
        if (json && Array.isArray(json.menuItems) && json.menuItems.length > 0) {
          const wheelExclusiveNames = ['شاى حليب', 'قهوة', 'نسكافية', 'قهوة حليب', 'ينسون'];
          const items: MenuItem[] = json.menuItems.map((raw: any, idx: number) => {
            const rawName = String(raw.name || '').trim();
            const rawCat = String(raw.categoryName || raw.category || '');
            const cat = classifyCategory(rawCat, rawName);
            const isDrink = cat === 'hot_drinks' || cat === 'cold_drinks';
            return {
              id: raw.id || `item-sheet-${idx + 1}`,
              code: raw.code || undefined,
              name: rawName,
              price: Number(raw.price) || 0,
              category: cat,
              description: raw.description || 'طازج وسريع من بوفيه الكافيه',
              popular: idx < 5,
              available: raw.available !== false,
              allowSugarOptions: isDrink && (cat === 'hot_drinks' || rawName.includes('شاي') || rawName.includes('قهوة')),
              allowSizeOptions: isDrink || cat === 'special',
            };
          }).filter((it: MenuItem) => !wheelExclusiveNames.includes(it.name));

          if (items.length > 0) {
            return {
              success: true,
              items,
              sourceSheet: 'قائمة_الأصناف (عبر تطبيق الويب)',
              message: `تم جلب وتحديث ${items.length} صنف مباشرة من شيت جوجل`
            };
          }
        }
      }
    } catch {}
  }

  // 1. Try Google Sheets API v4 if accessToken is available
  if (accessToken) {
    for (const sheetName of MENU_SHEET_ALTS) {
      try {
        const range = `'${sheetName}'!A1:Z300`;
        const url = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`;
        const response = await fetchWithTimeout(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }, 8000);

        if (response.ok) {
          const data = await response.json();
          if (data.values && data.values.length > 0) {
            const items = parseMenuItemsFromRows(data.values);
            if (items.length > 0) {
              return {
                success: true,
                items,
                sourceSheet: sheetName,
                message: `تم سحب ${items.length} صنف بنجاح من ورقة "${sheetName}"`
              };
            }
          }
        }
      } catch {
        // Continue to next alternative
      }
    }
  }

  // 2. Try Google Sheets gviz CSV export (works if spreadsheet has view link sharing enabled)
  for (const sheetName of MENU_SHEET_ALTS) {
    try {
      const gvizUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
      const response = await fetchWithTimeout(gvizUrl, {}, 8000);
      if (response.ok) {
        const csvText = await response.text();
        if (csvText && !csvText.includes('<!DOCTYPE') && !csvText.includes('<html')) {
          const items = parseCSVToMenuItems(csvText);
          if (items.length > 0) {
            return {
              success: true,
              items,
              sourceSheet: sheetName,
              message: `تم جلب ${items.length} صنف من ورقة "${sheetName}" عبر التصدير المباشر`
            };
          }
        }
      }
    } catch {}
  }

  // 3. Try standard CSV export URL
  for (const sheetName of MENU_SHEET_ALTS) {
    try {
      const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&sheet=${encodeURIComponent(sheetName)}`;
      const response = await fetchWithTimeout(exportUrl, {}, 8000);
      if (response.ok) {
        const csvText = await response.text();
        if (csvText && !csvText.includes('<!DOCTYPE') && !csvText.includes('<html')) {
          const items = parseCSVToMenuItems(csvText);
          if (items.length > 0) {
            return {
              success: true,
              items,
              sourceSheet: sheetName,
              message: `تم جلب ${items.length} صنف من ورقة "${sheetName}"`
            };
          }
        }
      }
    } catch {}
  }

  return {
    success: false,
    items: [],
    message: 'لم يتم العثور على ورقة "قائمة_الأصناف" أو تعذر قراءة البيانات منها. تأكد من وجود الورقة ومشاركة الشيت أو تسجيل الدخول بحساب Google.',
  };
}

/**
 * Pushes/syncs current menu items to the Google Sheet 'قائمة_الأصناف'
 */
export async function syncMenuItemsToGoogleSheet(
  accessToken: string,
  spreadsheetId: string,
  items: MenuItem[]
): Promise<boolean> {
  try {
    await ensureSpreadsheetTabsAndHeaders(accessToken, spreadsheetId);

    const headers = ['اسم الصنف', 'السعر (ج.م)', 'الفئة', 'الوصف', 'متوفر'];
    const rows = items.map(it => [
      it.name,
      it.price,
      it.category === 'food'
        ? 'سندوتشات'
        : it.category === 'hot_drinks'
        ? 'مشروبات ساخنة'
        : it.category === 'cold_drinks'
        ? 'مشروبات باردة'
        : it.category === 'desserts'
        ? 'شيبسي ومولتو'
        : 'أطباق خاصة',
      it.description || '',
      it.available ? 'نعم' : 'لا',
    ]);

    const values = [headers, ...rows];
    const range = `'${MENU_SHEET_NAME}'!A1:E${values.length}`;
    const url = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;

    const response = await fetchWithTimeout(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values }),
    });

    return response.ok;
  } catch (err) {
    console.warn('syncMenuItemsToGoogleSheet error:', err);
    return false;
  }
}

export interface ProtocolAuditReport {
  timestamp: string;
  storageIntegrity: {
    status: 'pass' | 'fail';
    localOrdersCount: number;
    localCustomersCount: number;
  };
  networkConnectivity: {
    status: 'pass' | 'fail';
    online: boolean;
    apiLatencyMs: number | null;
  };
  authentication: {
    status: 'pass' | 'warn' | 'fail';
    hasToken: boolean;
  };
  spreadsheetStatus: {
    status: 'pass' | 'warn' | 'fail';
    spreadsheetId: string | null;
    title: string | null;
    sheetTabsFound: string[];
    canWrite: boolean;
    error?: string;
  };
  protocolOverall: 'OPTIMAL' | 'DEGRADED' | 'OFFLINE';
}

/**
 * Deep audit check for the entire data transmission protocol
 */
export async function runProtocolAudit(
  accessToken: string | null,
  spreadsheetId: string | null
): Promise<ProtocolAuditReport> {
  const timestamp = new Date().toISOString();

  // 1. Storage Integrity
  let ordersCount = 0;
  let customersCount = 0;
  let storagePass = true;
  try {
    const rawOrders = localStorage.getItem('cafe_orders_data_v2');
    const rawCustomers = localStorage.getItem('cafe_customers_data');
    if (rawOrders) ordersCount = JSON.parse(rawOrders).length;
    if (rawCustomers) customersCount = JSON.parse(rawCustomers).length;
  } catch {
    storagePass = false;
  }

  // 2. Network Connectivity & Latency to Google Sheets endpoint
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
  let apiLatencyMs: number | null = null;
  let networkPass = online;

  if (online) {
    const t0 = performance.now();
    try {
      // Ping sheets API base with HEAD or GET (expect 401 Unauthorized or 200, which confirms reachability)
      await fetch('https://sheets.googleapis.com/$discovery/rest?version=v4', {
        method: 'GET',
        cache: 'no-store',
      });
      apiLatencyMs = Math.round(performance.now() - t0);
    } catch {
      networkPass = false;
    }
  }

  // 3. Auth Token Status
  const hasToken = !!accessToken;
  const authStatus = hasToken ? 'pass' : 'warn';

  // 4. Spreadsheet accessibility and schema check
  let sheetStatus: 'pass' | 'warn' | 'fail' = 'warn';
  let sheetTitle: string | null = null;
  let sheetTabs: string[] = [];
  let canWrite = false;
  let sheetError: string | undefined;

  if (spreadsheetId && accessToken) {
    try {
      const verified = await verifyGoogleSheet(accessToken, spreadsheetId);
      sheetTitle = verified.title;
      sheetTabs = verified.sheetNames;
      sheetStatus = 'pass';
      canWrite = true;
    } catch (e: any) {
      sheetStatus = 'fail';
      sheetError = e?.message || 'تعذر التحقق من الشيت';
    }
  } else if (!spreadsheetId) {
    sheetError = 'لم يتم تعيين معرف جدول جوجل بعد (سيتم إنشاؤه تلقائياً في الخلفية)';
  }

  let overall: 'OPTIMAL' | 'DEGRADED' | 'OFFLINE' = 'OPTIMAL';
  if (!online || !networkPass) {
    overall = 'OFFLINE';
  } else if (!hasToken || sheetStatus !== 'pass') {
    overall = 'DEGRADED';
  }

  return {
    timestamp,
    storageIntegrity: {
      status: storagePass ? 'pass' : 'fail',
      localOrdersCount: ordersCount,
      localCustomersCount: customersCount,
    },
    networkConnectivity: {
      status: networkPass ? 'pass' : 'fail',
      online,
      apiLatencyMs,
    },
    authentication: {
      status: authStatus,
      hasToken,
    },
    spreadsheetStatus: {
      status: sheetStatus,
      spreadsheetId,
      title: sheetTitle,
      sheetTabsFound: sheetTabs,
      canWrite,
      error: sheetError,
    },
    protocolOverall: overall,
  };
}

/**
 * Parses employee and account rows from Google Sheets into Customer objects
 */
export function parseCustomersFromRows(rows: (string | number)[][], source: 'employees' | 'accounts'): Customer[] {
  if (!rows || rows.length <= 1) return [];

  const results: Customer[] = [];
  // Skip header row
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    if (source === 'employees') {
      const nameAndCode = String(row[0] || '').trim();
      const department = String(row[1] || '').trim();
      const phone = String(row[2] || '').trim();
      if (!nameAndCode || nameAndCode === 'الاسم و الكود') continue;

      const digits = extractEmployeeDigits(nameAndCode);
      const code = digits || `EMP-${i}`;
      results.push({
        id: `CUST-SHEET-${digits || i}`,
        code: code,
        name: nameAndCode,
        category: 'موظف',
        department: department !== '-' ? department : undefined,
        phone: phone !== '-' ? phone : undefined,
        totalOrders: 0,
        totalPaid: 0,
        remainingDebt: 0,
        creditLimit: 500,
        status: 'مسدد بالكامل',
        notes: `مستورد من ورقة بينات الموظفين (كود ${code})`,
        lastActivity: new Date().toISOString(),
      });
    } else {
      // Accounts sheet (A: كود العميل, B: الاسم, C: الفئة, D: طلبات, E: مسدد, F: متبقي, G: حالة, H: قسم, I: هاتف, J: كود موظف)
      const custCode = String(row[0] || '').trim();
      const name = String(row[1] || '').trim();
      const category = String(row[2] || 'موظف').trim();
      const totalOrders = parseFloat(String(row[3] || '0').replace(/[^0-9.-]/g, '')) || 0;
      const totalPaid = parseFloat(String(row[4] || '0').replace(/[^0-9.-]/g, '')) || 0;
      const remainingDebt = parseFloat(String(row[5] || '0').replace(/[^0-9.-]/g, '')) || 0;
      const department = String(row[7] || '').trim();
      const phone = String(row[8] || '').trim();
      const empCode = String(row[9] || '').trim();

      if (!name || name === 'اسم العميل' || name === 'الاسم و الكود') continue;

      const digits = empCode || extractEmployeeDigits(name) || extractEmployeeDigits(custCode);
      const code = digits || custCode || `CUST-${1000 + i}`;

      results.push({
        id: `CUST-ACC-${digits || custCode || i}`,
        code: code,
        name: name,
        category: (category as any) || 'موظف',
        department: department !== '-' ? department : undefined,
        phone: phone !== '-' ? phone : undefined,
        totalOrders,
        totalPaid,
        remainingDebt,
        creditLimit: 500,
        status: remainingDebt > 0 ? 'مدين' : 'مسدد بالكامل',
        notes: `مستورد من ورقة الحسابات (${code})`,
        lastActivity: new Date().toISOString(),
      });
    }
  }

  return deduplicateCustomers(results);
}

/**
 * Fetches all registered employees and accounts from the Google Sheet
 * Works via Google Sheets API (if logged in) or via gviz/export CSV (if view access is enabled on sheet)
 */
export async function fetchEmployeesAndCustomersFromGoogleSheet(
  accessToken: string | null,
  spreadsheetId: string
): Promise<{ success: boolean; customers: Customer[]; message?: string }> {
  if (!spreadsheetId) {
    return { success: false, customers: [], message: 'معرف الشيت غير محدد' };
  }

  const allFetched: Customer[] = [];

  // 1. If accessToken is present, use Google Sheets API v4
  if (accessToken) {
    // A. Check Accounts Sheet
    for (const sheetName of ACCOUNTS_SHEET_ALTS) {
      try {
        const range = `'${sheetName}'!A1:J300`;
        const url = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`;
        const res = await fetchWithTimeout(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }, 8000);
        if (res.ok) {
          const data = await res.json();
          if (data.values && data.values.length > 1) {
            const parsed = parseCustomersFromRows(data.values, 'accounts');
            allFetched.push(...parsed);
            break;
          }
        }
      } catch {}
    }

    // B. Check Employees Sheet
    for (const sheetName of EMPLOYEES_SHEET_ALTS) {
      try {
        const range = `'${sheetName}'!A1:C300`;
        const url = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`;
        const res = await fetchWithTimeout(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }, 8000);
        if (res.ok) {
          const data = await res.json();
          if (data.values && data.values.length > 1) {
            const parsed = parseCustomersFromRows(data.values, 'employees');
            allFetched.push(...parsed);
            break;
          }
        }
      } catch {}
    }
  }

  // 2. Try gviz CSV export (for non-authenticated devices like employee mobile phones)
  if (allFetched.length === 0) {
    // Try accounts sheet alternatives
    for (const sheetName of ACCOUNTS_SHEET_ALTS) {
      try {
        const gvizUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
        const res = await fetchWithTimeout(gvizUrl, {}, 6000);
        if (res.ok) {
          const csvText = await res.text();
          if (csvText && !csvText.includes('<!DOCTYPE') && !csvText.includes('<html')) {
            const rows = parseCSVToRows(csvText);
            const parsed = parseCustomersFromRows(rows, 'accounts');
            allFetched.push(...parsed);
            break;
          }
        }
      } catch {}
    }

    // Try employees sheet alternatives
    for (const sheetName of EMPLOYEES_SHEET_ALTS) {
      try {
        const gvizUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
        const res = await fetchWithTimeout(gvizUrl, {}, 6000);
        if (res.ok) {
          const csvText = await res.text();
          if (csvText && !csvText.includes('<!DOCTYPE') && !csvText.includes('<html')) {
            const rows = parseCSVToRows(csvText);
            const parsed = parseCustomersFromRows(rows, 'employees');
            allFetched.push(...parsed);
            break;
          }
        }
      } catch {}
    }
  }

  const finalDeduplicated = deduplicateCustomers(allFetched);
  if (finalDeduplicated.length > 0) {
    return {
      success: true,
      customers: finalDeduplicated,
      message: `تم سحب ${finalDeduplicated.length} عميل وموظف من الشيت بنجاح`
    };
  }

  return {
    success: false,
    customers: [],
    message: 'لم يتم العثور على موظفين أو تعذر الاتصال بالشيت'
  };
}
