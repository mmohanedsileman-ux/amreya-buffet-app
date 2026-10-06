import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Header } from './components/Header';
import { CafeMenu } from './components/CafeMenu';
import { CartDrawer } from './components/CartDrawer';
import { DebtsDashboard } from './components/DebtsDashboard';
import { OrdersHistory } from './components/OrdersHistory';
import { ReceiptModal } from './components/ReceiptModal';
import { PaymentModal } from './components/PaymentModal';
import { CustomerModal } from './components/CustomerModal';
import { CustomerStatementModal } from './components/CustomerStatementModal';
import { SheetSyncModal } from './components/SheetSyncModal';
import { LuckyWheelModal } from './components/LuckyWheelModal';
import { CustomerLoginView } from './components/CustomerLoginView';
import { WelcomeOrderPortal } from './components/WelcomeOrderPortal';
import { CustomerPortalView } from './components/CustomerPortalView';
import { CustomerSettleModal } from './components/CustomerSettleModal';
import { ClosedHoursNotice } from './components/ClosedHoursNotice';
import { isWorkingHoursEnforced, isCurrentTimeWithinHours } from './utils/workingHours';
import { 
  Customer, 
  MenuItem, 
  CartItem, 
  Order, 
  PaymentTransaction,
  PaymentMethod
} from './types';
import { 
  INITIAL_CUSTOMERS, 
  INITIAL_MENU_ITEMS, 
  INITIAL_ORDERS, 
  INITIAL_TRANSACTIONS 
} from './data/initialData';
import { calculateSheetKPIs, formatCurrency } from './utils/formatters';
import { ShoppingCart } from 'lucide-react';
import { 
  initAuth, 
  googleSignIn, 
  logoutGoogle, 
  getAccessToken 
} from './services/googleAuth';
import { 
  createCafeOrdersSpreadsheet, 
  appendOrderToGoogleSheet, 
  bulkSyncOrdersToGoogleSheet, 
  syncCustomersToGoogleSheet, 
  syncAllEmployeesToEmployeesSheet,
  forceOverwriteEmployeesSheet,
  syncAllEmployeesViaWebhook,
  syncCustomersViaWebhook,
  generateEmployeesTsv,
  generateAccountsTsv,
  verifyGoogleSheet,
  DEFAULT_SPREADSHEET_ID,
  ensureSpreadsheetTabsAndHeaders,
  fetchMenuItemsFromGoogleSheet,
  syncMenuItemsToGoogleSheet,
  fetchEmployeesAndCustomersFromGoogleSheet,
  fetchDebtSyncFromWebhook,
  extractCleanEmployeeName,
  extractEmployeeDigits,
  normalizeArabicName,
  getStoredWebhookUrl,
  MENU_SHEET_NAME,
  EMPLOYEES_SHEET_NAME,
  ACCOUNTS_SHEET_NAME,
  deduplicateCustomers,
  mergeCustomersFromSheet,
  appendNewCustomerViaWebhook,
  DebtSyncResult
} from './services/googleSheets';
import { 
  initBackgroundSyncQueueWorker, 
  enqueueOrderForSync, 
  enqueueCustomersDebtSync,
  enqueueNewCustomerSync,
  enqueueNewEmployeeSync,
  flushSyncQueue,
  sendOrderDirectlyToGoogleSheets,
  purgeStuckOldOrdersFromQueue,
  clearOutboxQueue
} from './services/syncQueue';

// One-time automatic refresh of debts data for updated debts sheet
const OFFICIAL_LAUNCH_KEY = 'amreyah_buffet_launch_v2_debts';
if (typeof window !== 'undefined' && localStorage.getItem(OFFICIAL_LAUNCH_KEY) !== 'ready') {
  try {
    localStorage.removeItem('cafe_orders_data');
    localStorage.removeItem('cafe_orders_data_v2');
    localStorage.removeItem('cafe_txns_data');
    localStorage.removeItem('cafe_customers_data');
    localStorage.setItem(OFFICIAL_LAUNCH_KEY, 'ready');
  } catch {}
}

export default function App() {
  // Load persisted data and ALWAYS merge with INITIAL_CUSTOMERS (so mobile browsers never get stuck with old cache)
  const [customers, setCustomers] = useState<Customer[]>(() => {
    const saved = localStorage.getItem('cafe_customers_data');
    let parsed: Customer[] = [];
    if (saved) {
      try {
        const loaded = JSON.parse(saved);
        if (Array.isArray(loaded)) parsed = loaded;
      } catch {}
    }
    const merged = deduplicateCustomers([...INITIAL_CUSTOMERS, ...parsed]);

    // Retrieve saved orders to reconcile demo mock balances
    let currentOrders: Order[] = INITIAL_ORDERS;
    try {
      const ordersStr = localStorage.getItem('cafe_orders_data_v2');
      if (ordersStr) {
        const loadedOrders = JSON.parse(ordersStr);
        if (Array.isArray(loadedOrders)) currentOrders = loadedOrders;
      }
    } catch {}

    // Clean legacy mock seed data and reconcile with actual real orders in currentOrders
    const cleaned: Customer[] = merged.map(c => {
      const myOrders = currentOrders.filter(o => o.customerId === c.id || (c.code && o.customerName?.includes(c.code)));
      if (myOrders.length > 0) {
        const realOrdersTotal = myOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
        const realPaidTotal = myOrders.reduce((sum, o) => sum + (o.paidAmount || 0), 0);
        const realDebt = myOrders.reduce((sum, o) => sum + (o.remainingAmount || 0), 0);
        const finalStatus: 'مسدد بالكامل' | 'مدين' = realDebt === 0 ? 'مسدد بالكامل' : 'مدين';
        return {
          ...c,
          totalOrders: Math.max(c.totalOrders, realOrdersTotal),
          totalPaid: Math.max(c.totalPaid, realPaidTotal),
          remainingDebt: realDebt,
          status: finalStatus,
        };
      }
      return c;
    });

    try {
      localStorage.setItem('cafe_customers_data', JSON.stringify(cleaned));
    } catch {}
    return cleaned;
  });

  const [orders, setOrders] = useState<Order[]>(() => {
    const saved = localStorage.getItem('cafe_orders_data_v2');
    return saved ? JSON.parse(saved) : INITIAL_ORDERS;
  });

  const [menuItems, setMenuItems] = useState<MenuItem[]>(() => {
    // Menu strictly contains only official buffet items.
    // Hot drinks (شاي حليب، قهوة، نسكافيه، قهوة حليب، ينسون) are strictly exclusive to the Lucky Wheel only.
    const saved = localStorage.getItem('cafe_menu_data_v6');
    let baseList = INITIAL_MENU_ITEMS;
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const wheelExclusiveNames = ['شاى حليب', 'قهوة', 'نسكافية', 'قهوة حليب', 'ينسون'];
          const existingNames = new Set(parsed.map(p => p.name.trim()));
          const missing = INITIAL_MENU_ITEMS.filter(it => !existingNames.has(it.name.trim()) && !wheelExclusiveNames.includes(it.name.trim()));
          baseList = [...parsed.filter(p => !wheelExclusiveNames.includes(p.name)), ...missing];
        }
      } catch {}
    }
    // Clean old outdated storage versions
    localStorage.removeItem('cafe_menu_data_v5');
    localStorage.removeItem('cafe_menu_data_v4');
    localStorage.removeItem('cafe_menu_data_v3');
    localStorage.removeItem('cafe_menu_data_v2');
    localStorage.removeItem('cafe_menu_data_v1');
    localStorage.setItem('cafe_menu_data_v6', JSON.stringify(baseList));
    return baseList;
  });

  const [transactions, setTransactions] = useState<PaymentTransaction[]>(() => {
    const saved = localStorage.getItem('cafe_txns_data');
    return saved ? JSON.parse(saved) : INITIAL_TRANSACTIONS;
  });

  // Active Customer Session (Customer-first Portal)
  const [activeCustomerId, setActiveCustomerId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('cafe_active_customer_id') || sessionStorage.getItem('cafe_active_customer_id') || null;
    } catch {
      return null;
    }
  });

  const [isAdminMode, setIsAdminMode] = useState<boolean>(false);
  const [isCustomerSettleOpen, setIsCustomerSettleOpen] = useState(false);

  // Computed Active Customer (matched strictly by exact ID or employee badge code)
  const activeCustomer = useMemo(() => {
    if (!activeCustomerId) return null;
    const strActiveId = String(activeCustomerId).trim();
    const matcher = (c: Customer) => {
      if (!c) return false;
      const strCId = String(c.id ?? '').trim();
      const strCCode = String(c.code ?? '').trim();

      if (strCId && strCId === strActiveId) return true;
      if (strCCode && (strCCode === strActiveId || `CUST-${strCCode}` === strActiveId)) return true;
      const cDigits = extractEmployeeDigits(strCCode) || extractEmployeeDigits(c.name);
      const activeDigits = extractEmployeeDigits(strActiveId);
      if (cDigits && activeDigits) {
        if (cDigits === activeDigits) return true;
        const strippedC = cDigits.replace(/^0+/, '') || '0';
        const strippedActive = activeDigits.replace(/^0+/, '') || '0';
        if (strippedC === strippedActive) return true;
      }
      return false;
    };

    return customers.find(matcher) || INITIAL_CUSTOMERS.find(matcher) || null;
  }, [customers, activeCustomerId]);

  // Only employees who log in with their code get access to the Fortune Wheel
  const isEmployee = useMemo(() => {
    return activeCustomer?.category === 'موظف';
  }, [activeCustomer]);

  // UI Navigation & Cart State
  const [activeTab, setActiveTab] = useState<'menu' | 'debts' | 'orders'>('menu');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentTargetCustomer, setPaymentTargetCustomer] = useState<Customer | null>(null);
  const [isAddCustomerModalOpen, setIsAddCustomerModalOpen] = useState(false);
  const [statementCustomer, setStatementCustomer] = useState<Customer | null>(null);
  const [isSheetSyncModalOpen, setIsSheetSyncModalOpen] = useState(false);
  const [isLuckyWheelOpen, setIsLuckyWheelOpen] = useState(false);

  // Google Sheets Integration State
  const [googleUser, setGoogleUser] = useState<any>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [activeSpreadsheetId, setActiveSpreadsheetId] = useState<string | null>(() => {
    return localStorage.getItem('cafe_spreadsheet_id') || DEFAULT_SPREADSHEET_ID;
  });
  const [activeSpreadsheetTitle, setActiveSpreadsheetTitle] = useState<string | null>(() => {
    return localStorage.getItem('cafe_spreadsheet_title') || 'شيت بوفيه وكاشير الإدارة (الرسمي)';
  });
  const [isAutoSyncEnabled, setIsAutoSyncEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('cafe_auto_sync_enabled');
    return saved !== null ? saved === 'true' : true;
  });

  // Google Auth Listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setGoogleUser(user);
        setGoogleAccessToken(token);
      },
      () => {
        setGoogleUser(null);
        setGoogleAccessToken(null);
      }
    );
    // Silent token check on boot
    getAccessToken().then(token => {
      if (token) {
        setGoogleAccessToken(token);
      }
    }).catch(() => {});

    // Clean any stuck previous orders from outbox
    clearOutboxQueue();
    purgeStuckOldOrdersFromQueue();

    // Initialize background sync queue worker for online event
    const stopQueueWorker = initBackgroundSyncQueueWorker();

    return () => {
      unsubscribe();
      if (stopQueueWorker) stopQueueWorker();
    };
  }, []);

  // Save spreadsheet id & title
  useEffect(() => {
    if (activeSpreadsheetId) {
      localStorage.setItem('cafe_spreadsheet_id', activeSpreadsheetId);
    } else {
      localStorage.removeItem('cafe_spreadsheet_id');
    }
  }, [activeSpreadsheetId]);

  useEffect(() => {
    if (activeSpreadsheetTitle) {
      localStorage.setItem('cafe_spreadsheet_title', activeSpreadsheetTitle);
    } else {
      localStorage.removeItem('cafe_spreadsheet_title');
    }
  }, [activeSpreadsheetTitle]);

  useEffect(() => {
    localStorage.setItem('cafe_auto_sync_enabled', String(isAutoSyncEnabled));
  }, [isAutoSyncEnabled]);

  const isPreparingSheetRef = useRef(false);
  const registeredEmployeesRef = useRef<Set<string>>(new Set());
  const recentOrdersRef = useRef<{ orderId: string; customerKey: string; itemsKey: string; timestamp: number }[]>([]);

  // Automated background sync for Google Sheets (runs on load, every 15s, and on window focus)
  useEffect(() => {
    let isCancelled = false;

    const runAutomatedSync = async () => {
      if (isCancelled || isPreparingSheetRef.current) return;
      const token = googleAccessToken || await getAccessToken();
      const sheetId = activeSpreadsheetId || DEFAULT_SPREADSHEET_ID;
      if (!token || !sheetId) return;

      isPreparingSheetRef.current = true;
      try {
        if (!googleAccessToken) {
          setGoogleAccessToken(token);
        }
        await ensureSpreadsheetTabsAndHeaders(token, sheetId).catch(() => {});
        if (orders.length > 0) {
          await bulkSyncOrdersToGoogleSheet(token, sheetId, orders, customers).catch(console.warn);
        }
      } catch (err) {
        console.warn('Background auto-sync notice:', err);
      } finally {
        isPreparingSheetRef.current = false;
      }
    };

    // Run immediately
    runAutomatedSync();

    // Run every 15 seconds
    const interval = setInterval(runAutomatedSync, 15000);

    // Run on tab focus
    const onFocus = () => runAutomatedSync();
    window.addEventListener('focus', onFocus);

    return () => {
      isCancelled = true;
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [googleAccessToken, activeSpreadsheetId, orders, customers]);

  const [isGoogleConnecting, setIsGoogleConnecting] = useState(false);

  // Menu items background sync state
  const [isMenuSyncing, setIsMenuSyncing] = useState<boolean>(false);
  const [lastMenuSyncTime, setLastMenuSyncTime] = useState<string | null>(() => {
    return localStorage.getItem('cafe_last_menu_sync_time') || null;
  });

  const handleSyncMenuFromSheet = useCallback(async (): Promise<boolean> => {
    const spreadsheetId = activeSpreadsheetId || DEFAULT_SPREADSHEET_ID;
    if (!spreadsheetId) return false;

    setIsMenuSyncing(true);
    try {
      const res = await fetchMenuItemsFromGoogleSheet(googleAccessToken, spreadsheetId);
      if (res.success && res.items.length > 0) {
        setMenuItems(res.items);
        localStorage.setItem('cafe_menu_data_v6', JSON.stringify(res.items));
        const nowStr = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        setLastMenuSyncTime(nowStr);
        localStorage.setItem('cafe_last_menu_sync_time', nowStr);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      setIsMenuSyncing(false);
    }
  }, [activeSpreadsheetId, googleAccessToken]);

  // Automated background polling for menu updates from Google Sheets (runs on load and every 60s)
  useEffect(() => {
    handleSyncMenuFromSheet().catch(() => {});
    const interval = setInterval(() => {
      handleSyncMenuFromSheet().catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, [handleSyncMenuFromSheet]);

  // Synchronize payment checkmarks from Google Sheet (Column J: تم السداد)
  const handleSyncPaidOrdersAndDebts = useCallback(async (): Promise<boolean> => {
    const webhookUrl = getStoredWebhookUrl();
    if (!webhookUrl) return false;

    try {
      const res = await fetchDebtSyncFromWebhook(webhookUrl);
      if (res.success) {
        // 1. Mark paid orders in state
        const zeroDebtCustomerNames = new Set<string>();
        for (const [key, debtVal] of Object.entries(res.customerDebts)) {
          if (debtVal === 0) {
            zeroDebtCustomerNames.add(normalizeArabicName(extractCleanEmployeeName(key)));
          }
        }

        const paidSet = new Set(res.paidOrderIds.map(id => id.trim().toLowerCase()));

        // 1. Mark paid orders in state synchronously
        let currentOrdersList: Order[] = orders;
        try {
          const raw = localStorage.getItem('cafe_orders_data_v2');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) currentOrdersList = parsed;
          }
        } catch {}

        let hasOrderChanges = false;
        const nextOrders = currentOrdersList.map(order => {
          const oId = (order.id || '').toLowerCase();
          const oNum = `ord-${order.orderNumber}`.toLowerCase();
          const numOnly = String(order.orderNumber).replace(/\D/g, '');

          // An order is paid ONLY if its order ID has a checkmark [✓] in Column J in Google Sheets
          const isOrderPaid = paidSet.has(oId) || paidSet.has(oNum) || (numOnly && paidSet.has(`ord-${numOnly}`));

          if (isOrderPaid && order.remainingAmount > 0) {
            hasOrderChanges = true;
            return {
              ...order,
              paidAmount: order.totalAmount,
              remainingAmount: 0,
            };
          } else if (!isOrderPaid && order.remainingAmount === 0 && order.totalAmount > 0) {
            // If Column J is NOT checked in Google Sheets, it is UNPAID / DEBT!
            hasOrderChanges = true;
            return {
              ...order,
              paidAmount: 0,
              remainingAmount: order.totalAmount,
              paymentMethod: 'debt_account' as PaymentMethod,
            };
          }
          return order;
        });

        if (hasOrderChanges) {
          setOrders(nextOrders);
          try {
            localStorage.setItem('cafe_orders_data_v2', JSON.stringify(nextOrders));
          } catch {}
        }

        // 2. Update customer list & remaining debt based on Google Sheet & updated orders
        setCustomers(prevCustomers => {
          let baseList = [...prevCustomers];
          if (res.customers && res.customers.length > 0) {
            baseList = mergeCustomersFromSheet(prevCustomers, res.customers);
          }

          // Auto-include any debtors from res.customerDebts that might be missing in local state
          for (const [key, debtVal] of Object.entries(res.customerDebts)) {
            if (Number(debtVal) > 0) {
              const cleanKey = extractCleanEmployeeName(key);
              const normKey = normalizeArabicName(cleanKey);
              const exists = baseList.some(c => {
                const cNorm = normalizeArabicName(extractCleanEmployeeName(c.name));
                return cNorm === normKey || (c.code && key.includes(c.code)) || (cNorm.length > 3 && normKey.length > 3 && (cNorm.includes(normKey) || normKey.includes(cNorm)));
              });
              if (!exists && cleanKey) {
                const autoCust: Customer = {
                  id: `CUST-AUTO-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 100)}`,
                  code: key.replace(/\D/g, '') || String(Math.floor(10000 + Math.random() * 90000)),
                  name: cleanKey,
                  category: 'موظف',
                  totalOrders: Number(debtVal),
                  totalPaid: 0,
                  remainingDebt: Number(debtVal),
                  status: 'مدين',
                  creditLimit: 500,
                };
                baseList.push(autoCust);
              }
            }
          }

          let hasCustomerChanges = baseList.length !== prevCustomers.length;
          const nextCustomers = baseList.map(cust => {
            const cleanCustName = extractCleanEmployeeName(cust.name);
            const normCustName = normalizeArabicName(cleanCustName);
            const custCode = cust.code ? String(cust.code).trim() : '';

            // Priority 1: Match debt from res.customerDebts (Calculated directly from سجل_الطلبات)
            let matchedDebtFromKey: number | null = null;
            const custDigits = extractEmployeeDigits(cust.code) || extractEmployeeDigits(cust.name);

            for (const [key, debtVal] of Object.entries(res.customerDebts)) {
              const keyDigits = extractEmployeeDigits(key);

              // 1. If both records have employee codes, compare strictly by employee code!
              if (custDigits && keyDigits) {
                const strippedCust = custDigits.replace(/^0+/, '') || '0';
                const strippedKey = keyDigits.replace(/^0+/, '') || '0';
                if (custDigits === keyDigits || strippedCust === strippedKey) {
                  matchedDebtFromKey = Number(debtVal) || 0;
                  break;
                }
                // Different codes = different employees, skip!
                continue;
              }

              // 2. If code is absent, match only by exact full normalized name (>= 8 chars)
              const cleanKey = extractCleanEmployeeName(key);
              const normKey = normalizeArabicName(cleanKey);
              if (normKey && normCustName && normKey.length >= 8 && normKey === normCustName) {
                matchedDebtFromKey = Number(debtVal) || 0;
                break;
              }
            }

            // Sheet match from customers tab (strictly by code)
            const sheetMatch = res.customers?.find(sc => {
              const scDigits = extractEmployeeDigits(sc.code) || extractEmployeeDigits(sc.name);
              if (custDigits && scDigits) {
                const strippedCust = custDigits.replace(/^0+/, '') || '0';
                const strippedSc = scDigits.replace(/^0+/, '') || '0';
                return custDigits === scDigits || strippedCust === strippedSc;
              }
              return (normCustName && normalizeArabicName(extractCleanEmployeeName(sc.name)) === normCustName);
            });

            // Local orders belonging to this customer
            const myOrders = nextOrders.filter((o: Order) => {
              if (o.customerId === cust.id) return true;
              if (custCode && o.customerName?.includes(custCode)) return true;
              const oDigits = extractEmployeeDigits(o.customerName);
              if (custDigits && oDigits) {
                const strippedCust = custDigits.replace(/^0+/, '') || '0';
                const strippedO = oDigits.replace(/^0+/, '') || '0';
                return custDigits === oDigits || strippedCust === strippedO;
              }
              return (normCustName && normalizeArabicName(extractCleanEmployeeName(o.customerName)) === normCustName);
            });
            const liveOrdersRemainingDebt = myOrders.reduce((sum: number, o: Order) => sum + (o.remainingAmount || 0), 0);

            // Determine authoritative debt:
            let newDebt = cust.remainingDebt;

            if (sheetMatch && sheetMatch.remainingDebt !== undefined) {
              // Direct from ورقة «أرصدة ومديونيات العملاء»:
              newDebt = Number(sheetMatch.remainingDebt) || 0;
            } else if (matchedDebtFromKey !== null) {
              // Direct from سجل_الطلبات:
              newDebt = matchedDebtFromKey;
            } else if (zeroDebtCustomerNames.has(normCustName)) {
              newDebt = 0;
            } else if (myOrders.length > 0) {
              newDebt = liveOrdersRemainingDebt;
            }

            let baseTotalOrders = sheetMatch?.totalOrders !== undefined ? sheetMatch.totalOrders : cust.totalOrders;
            let baseTotalPaid = sheetMatch?.totalPaid !== undefined ? sheetMatch.totalPaid : cust.totalPaid;

            if (newDebt > 0) {
              baseTotalOrders = Math.max(cust.totalOrders, newDebt + (cust.totalPaid || 0));
              baseTotalPaid = Math.max(0, baseTotalOrders - newDebt);

              // If customer has debt from sheet but no local pending order exists, create a virtual invoice card
              if (myOrders.filter(o => o.remainingAmount > 0).length === 0) {
                const syntheticDebtOrder: Order = {
                  id: `ORD-DEBT-${cust.code || cust.id}-${Date.now().toString().slice(-4)}`,
                  orderNumber: Math.floor(1000 + Math.random() * 9000),
                  createdAt: new Date().toISOString(),
                  items: [{
                    name: 'مسحوبات مسجلة في شيت الحسابات (سجل_الطلبات)',
                    price: newDebt,
                    quantity: 1,
                    total: newDebt,
                  }],
                  subtotal: newDebt,
                  discount: 0,
                  totalAmount: newDebt,
                  paidAmount: 0,
                  remainingAmount: newDebt,
                  paymentMethod: 'debt_account' as PaymentMethod,
                  customerId: cust.id,
                  customerName: cust.name,
                  cashierName: 'كاشير الكافتيريا',
                };
                nextOrders.push(syntheticDebtOrder);
                hasOrderChanges = true;
              }
            } else if (newDebt === 0) {
              baseTotalPaid = Math.max(baseTotalPaid, baseTotalOrders);
              // Clear any pending orders for settled customers
              if (liveOrdersRemainingDebt > 0) {
                myOrders.forEach(o => {
                  if (o.remainingAmount > 0) {
                    o.remainingAmount = 0;
                    o.paidAmount = o.totalAmount;
                    hasOrderChanges = true;
                  }
                });
              }
            }

            const newStatus: 'مدين' | 'مسدد بالكامل' = newDebt > 0 ? 'مدين' : 'مسدد بالكامل';

            if (cust.remainingDebt !== newDebt || cust.totalPaid !== baseTotalPaid || cust.totalOrders !== baseTotalOrders || cust.status !== newStatus) {
              hasCustomerChanges = true;
              return {
                ...cust,
                totalOrders: baseTotalOrders,
                remainingDebt: newDebt,
                totalPaid: baseTotalPaid,
                status: newStatus,
              };
            }
            return cust;
          });

          if (hasOrderChanges) {
            setOrders([...nextOrders]);
            try {
              localStorage.setItem('cafe_orders_data_v2', JSON.stringify(nextOrders));
            } catch {}
          }

          if (hasCustomerChanges) {
            try {
              localStorage.setItem('cafe_customers_data', JSON.stringify(nextCustomers));
            } catch {}
          }
          return nextCustomers;
        });

        // 3. Update menu items if returned
        if (res.menuItems && res.menuItems.length > 0) {
          setMenuItems(prev => {
            const existingNames = new Set(prev.map(p => p.name.trim()));
            const newOnes = res.menuItems!.filter(m => !existingNames.has(m.name.trim()));
            if (newOnes.length > 0) {
              const merged = [...prev, ...newOnes];
              try {
                localStorage.setItem('cafe_menu_data_v6', JSON.stringify(merged));
              } catch {}
              return merged;
            }
            return prev;
          });
        }

        // 4. Update and merge customers from Google Sheet (Google Sheet is authoritative)
        if (res.customers && res.customers.length > 0) {
          setCustomers(prev => {
            const merged = mergeCustomersFromSheet(prev, res.customers!);
            try {
              localStorage.setItem('cafe_customers_data', JSON.stringify(merged));
            } catch {}
            return merged;
          });
        }

        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  // Automated live polling for payment checkmarks (Column J: تم السداد) with instant tab focus sync
  useEffect(() => {
    handleSyncPaidOrdersAndDebts().catch(() => {});
    const interval = setInterval(() => {
      handleSyncPaidOrdersAndDebts().catch(() => {});
    }, 3500);

    const onRecheck = () => {
      handleSyncPaidOrdersAndDebts().catch(() => {});
    };
    window.addEventListener('focus', onRecheck);
    document.addEventListener('visibilitychange', onRecheck);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onRecheck);
      document.removeEventListener('visibilitychange', onRecheck);
    };
  }, [handleSyncPaidOrdersAndDebts]);

  // Synchronize registered employees & accounts from Google Sheet
  const handleSyncEmployeesFromSheet = useCallback(async (): Promise<boolean> => {
    const spreadsheetId = activeSpreadsheetId || DEFAULT_SPREADSHEET_ID;
    if (!spreadsheetId) return false;

    try {
      const res = await fetchEmployeesAndCustomersFromGoogleSheet(googleAccessToken, spreadsheetId);
      if (res.success && res.customers.length > 0) {
        setCustomers(prev => {
          const merged = mergeCustomersFromSheet(prev, res.customers);
          localStorage.setItem('cafe_customers_data', JSON.stringify(merged));
          return merged;
        });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [activeSpreadsheetId, googleAccessToken]);

  // Verify an entered employee code against the Google Sheet cloud
  const handleVerifyEmployeeCloud = useCallback(async (cleanCode: string): Promise<Customer | null> => {
    const inputDigits = cleanCode.replace(/\D/g, '');

    // 1. Fast webhook sync first (works instantly without requiring OAuth token!)
    try {
      const webhookPromise = fetchDebtSyncFromWebhook();
      const timeoutPromise = new Promise<DebtSyncResult>((resolve) => 
        setTimeout(() => resolve({ success: false, paidOrderIds: [], customerDebts: {} }), 2500)
      );
      const webhookRes = await Promise.race([webhookPromise, timeoutPromise]);

      if (webhookRes.success && webhookRes.customers && webhookRes.customers.length > 0) {
        setCustomers(prev => {
          const merged = mergeCustomersFromSheet(prev, webhookRes.customers!);
          try {
            localStorage.setItem('cafe_customers_data', JSON.stringify(merged));
          } catch {}
          return merged;
        });

        const found = webhookRes.customers.find((c: Customer) => {
          const codeDigits = (c.code || '').replace(/\D/g, '');
          if (c.code?.toLowerCase() === cleanCode.toLowerCase()) return true;
          if (inputDigits && codeDigits && codeDigits === inputDigits) return true;
          if (c.name.includes(cleanCode) || (inputDigits && c.name.includes(inputDigits))) return true;
          return false;
        });
        if (found) return found;
      }
    } catch (e) {
      console.warn('Webhook employee verify notice:', e);
    }

    // 2. Only attempt Sheets API if we actually have an active OAuth token
    if (googleAccessToken) {
      const spreadsheetId = activeSpreadsheetId || DEFAULT_SPREADSHEET_ID;
      try {
        const res = await fetchEmployeesAndCustomersFromGoogleSheet(googleAccessToken, spreadsheetId);
        if (res.success && res.customers.length > 0) {
          setCustomers(prev => {
            const merged = mergeCustomersFromSheet(prev, res.customers);
            localStorage.setItem('cafe_customers_data', JSON.stringify(merged));
            return merged;
          });

          const found = res.customers.find(c => {
            const codeDigits = (c.code || '').replace(/\D/g, '');
            if (c.code?.toLowerCase() === cleanCode.toLowerCase()) return true;
            if (inputDigits && codeDigits && codeDigits === inputDigits) return true;
            if (c.name.includes(cleanCode) || (inputDigits && c.name.includes(inputDigits))) return true;
            return false;
          });

          return found || null;
        }
      } catch (err) {
        console.warn('Error verifying employee against sheet:', err);
      }
    }

    return null;
  }, [activeSpreadsheetId, googleAccessToken]);

  const handlePushMenuToSheet = async (): Promise<boolean> => {
    const token = googleAccessToken || await getAccessToken();
    const sheetId = activeSpreadsheetId || DEFAULT_SPREADSHEET_ID;
    if (!token || !sheetId) {
      setIsSheetSyncModalOpen(true);
      return false;
    }
    setIsMenuSyncing(true);
    try {
      const ok = await syncMenuItemsToGoogleSheet(token, sheetId, menuItems);
      return ok;
    } finally {
      setIsMenuSyncing(false);
    }
  };

  // Background Auto-Refresh for Menu items & Employees from Google Sheet
  useEffect(() => {
    const spreadsheetId = activeSpreadsheetId || DEFAULT_SPREADSHEET_ID;
    if (!spreadsheetId) return;

    // 1. Initial silent background sync on start
    const initialTimer = setTimeout(() => {
      handleSyncMenuFromSheet().catch(() => {});
      handleSyncEmployeesFromSheet().catch(() => {});
    }, 1200);

    // 2. Periodic background polling every 45 seconds (auto-refresh)
    const interval = setInterval(() => {
      handleSyncMenuFromSheet().catch(() => {});
      handleSyncEmployeesFromSheet().catch(() => {});
    }, 45000);

    // 3. Auto-sync whenever tab regains focus or becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleSyncMenuFromSheet().catch(() => {});
        handleSyncEmployeesFromSheet().catch(() => {});
      }
    };
    const handleFocus = () => {
      handleSyncMenuFromSheet().catch(() => {});
      handleSyncEmployeesFromSheet().catch(() => {});
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [activeSpreadsheetId, googleAccessToken, handleSyncMenuFromSheet, handleSyncEmployeesFromSheet]);

  // Google Handlers
  const handleConnectGoogle = async () => {
    try {
      setIsGoogleConnecting(true);
      const res = await googleSignIn();
      if (res) {
        setGoogleUser(res.user);
        setGoogleAccessToken(res.accessToken);
        
        let sheetId = activeSpreadsheetId || DEFAULT_SPREADSHEET_ID;
        setActiveSpreadsheetId(sheetId);

        // Ensure spreadsheet tabs exist
        await ensureSpreadsheetTabsAndHeaders(res.accessToken, sheetId).catch(console.warn);

        // Sync all pending orders immediately to Google Sheets!
        if (orders.length > 0) {
          await bulkSyncOrdersToGoogleSheet(res.accessToken, sheetId, orders, customers).catch(console.warn);
        }
      }
    } catch (err: any) {
      console.error('Failed to connect Google Sheets:', err);
    } finally {
      setIsGoogleConnecting(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    await logoutGoogle();
    setGoogleUser(null);
    setGoogleAccessToken(null);
  };

  const handleCreateNewSheet = async () => {
    const token = googleAccessToken || await getAccessToken();
    if (!token) {
      throw new Error('يرجى تسجيل الدخول بحساب Google أولاً.');
    }
    const info = await createCafeOrdersSpreadsheet(token);
    setActiveSpreadsheetId(info.spreadsheetId);
    setActiveSpreadsheetTitle(info.title);

    // Initial sync of existing orders and customers if any exist
    if (orders.length > 0) {
      await bulkSyncOrdersToGoogleSheet(token, info.spreadsheetId, orders, customers).catch(console.error);
    }
    if (customers.length > 0) {
      await syncCustomersToGoogleSheet(token, info.spreadsheetId, customers).catch(console.error);
    }
    if (menuItems.length > 0) {
      await syncMenuItemsToGoogleSheet(token, info.spreadsheetId, menuItems).catch(console.error);
    }
  };

  const handleLinkExistingSheet = async (idOrUrl: string) => {
    const token = googleAccessToken || await getAccessToken();
    if (!token) {
      throw new Error('يرجى تسجيل الدخول بحساب Google أولاً.');
    }
    let sheetId = idOrUrl.trim();
    const match = idOrUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      sheetId = match[1];
    }
    const verified = await verifyGoogleSheet(token, sheetId);
    setActiveSpreadsheetId(sheetId);
    setActiveSpreadsheetTitle(verified.title);

    await ensureSpreadsheetTabsAndHeaders(token, sheetId).catch(console.warn);
    await handleSyncMenuFromSheet();
  };

  const handleSyncAllOrders = async () => {
    const token = googleAccessToken || await getAccessToken();
    if (!token || !activeSpreadsheetId) {
      throw new Error('تأكد من تسجيل الدخول بحساب Google وربط الشيت أولاً.');
    }
    await bulkSyncOrdersToGoogleSheet(token, activeSpreadsheetId, orders, customers);
  };

  const handleSyncCustomers = async () => {
    const token = googleAccessToken || await getAccessToken();
    if (!token || !activeSpreadsheetId) {
      throw new Error('تأكد من تسجيل الدخول بحساب Google وربط الشيت أولاً.');
    }
    await syncCustomersToGoogleSheet(token, activeSpreadsheetId, customers);
  };

  // Save to localStorage on change
  useEffect(() => {
    localStorage.setItem('cafe_customers_data', JSON.stringify(customers));
  }, [customers]);

  useEffect(() => {
    localStorage.setItem('cafe_orders_data_v2', JSON.stringify(orders));
  }, [orders]);

  useEffect(() => {
    localStorage.setItem('cafe_menu_data_v2', JSON.stringify(menuItems));
  }, [menuItems]);

  useEffect(() => {
    localStorage.setItem('cafe_txns_data', JSON.stringify(transactions));
  }, [transactions]);

  // Derived KPIs synchronized with sheet
  const kpis = useMemo(() => {
    return calculateSheetKPIs(customers, orders);
  }, [customers, orders]);

  // Cart operations
  const handleAddToCart = (
    item: MenuItem, 
    options?: { sugar?: string; size?: string; sizePriceDelta?: number; notes?: string }
  ) => {
    const sizeDelta = options?.sizePriceDelta || 0;
    const unitPrice = item.price + sizeDelta;
    const cartItemId = `${item.id}-${options?.sugar || 'default'}-${options?.size || 'regular'}-${options?.notes || ''}`;

    setCart(prev => {
      const existing = prev.find(ci => ci.cartItemId === cartItemId);
      if (existing) {
        return prev.map(ci => 
          ci.cartItemId === cartItemId 
            ? { ...ci, quantity: ci.quantity + 1, itemTotal: (ci.quantity + 1) * unitPrice }
            : ci
        );
      }
      return [
        ...prev,
        {
          cartItemId,
          item,
          quantity: 1,
          selectedSugar: options?.sugar,
          selectedSize: options?.size,
          sizePriceDelta: sizeDelta,
          notes: options?.notes,
          itemTotal: unitPrice,
        }
      ];
    });
  };

  const handleAddFreeGiftToCart = (item: MenuItem) => {
    const cartItemId = `free-gift-${item.id}-${Date.now()}`;
    setCart(prev => [
      ...prev,
      {
        cartItemId,
        item,
        quantity: 1,
        sizePriceDelta: 0,
        notes: 'هدية مجانية من عجلة الحظ 🎁',
        itemTotal: 0,
        isFreeGift: true,
      }
    ]);
    setIsCartOpen(true);
  };

  const handleUpdateQuantity = (cartItemId: string, delta: number) => {
    setCart(prev => {
      return prev.map(ci => {
        if (ci.cartItemId === cartItemId) {
          const newQty = ci.quantity + delta;
          if (newQty <= 0) return null;
          if (ci.isFreeGift) {
            return {
              ...ci,
              quantity: newQty,
              itemTotal: 0,
            };
          }
          const unitPrice = ci.item.price + ci.sizePriceDelta;
          return {
            ...ci,
            quantity: newQty,
            itemTotal: newQty * unitPrice,
          };
        }
        return ci;
      }).filter(Boolean) as CartItem[];
    });
  };

  const handleRemoveFromCart = (cartItemId: string) => {
    setCart(prev => prev.filter(ci => ci.cartItemId !== cartItemId));
  };

  const handleClearCart = () => {
    setCart([]);
  };

  // Checkout handling
  const handleCheckoutComplete = (newOrder: Order) => {
    // 0. Deduplication guard against rapid multi-calls
    if (orders.some(o => o.id === newOrder.id)) {
      return;
    }

    const now = Date.now();
    const customerKey = (newOrder.customerId || newOrder.customerName || '').trim().toLowerCase();
    const itemsKey = newOrder.items
      .map(i => `${i.name}_${i.quantity}_${i.size || ''}_${i.sugar || ''}`)
      .sort()
      .join('|');

    // Prevent duplicate orders for the same customer with exact same items within 60 seconds
    const isDuplicate = recentOrdersRef.current.some(recent => {
      const isSameCustomer = recent.customerKey === customerKey;
      const isSameItems = recent.itemsKey === itemsKey;
      const isRecent = (now - recent.timestamp) < 60000;
      return isSameCustomer && isSameItems && isRecent;
    });

    if (isDuplicate) {
      console.warn('Blocked duplicate order attempt:', newOrder.id, customerKey);
      // Still show receipt modal for the customer's peace of mind without creating a duplicate
      setReceiptOrder(newOrder);
      return;
    }

    recentOrdersRef.current = [
      { orderId: newOrder.id, customerKey, itemsKey, timestamp: now },
      ...recentOrdersRef.current.filter(r => (now - r.timestamp) < 120000)
    ];

    // 1. Prepend order
    setOrders(prev => [newOrder, ...prev]);

    // 2. If customer debt is involved, update customer account
    if (newOrder.customerId) {
      let updatedCustomersList = customers;
      setCustomers(prev => {
        updatedCustomersList = prev.map(c => {
          if (c.id === newOrder.customerId) {
            const newTotalOrders = c.totalOrders + newOrder.totalAmount;
            const newTotalPaid = c.totalPaid + newOrder.paidAmount;
            const newDebt = c.remainingDebt + newOrder.remainingAmount;
            return {
              ...c,
              totalOrders: newTotalOrders,
              totalPaid: newTotalPaid,
              remainingDebt: newDebt,
              status: newDebt > 0 ? 'مدين' : 'مسدد بالكامل',
              lastActivity: newOrder.createdAt,
            };
          }
          return c;
        });
        return updatedCustomersList;
      });

      // Automatically sync updated customer balance to Google Sheets!
      enqueueCustomersDebtSync(updatedCustomersList);

      // If partial paid, record transaction
      if (newOrder.paidAmount > 0) {
        setTransactions(prev => [
          {
            id: `TXN-${Date.now().toString().slice(-4)}`,
            createdAt: newOrder.createdAt,
            customerId: newOrder.customerId!,
            customerName: newOrder.customerName || 'عميل',
            amount: newOrder.paidAmount,
            paymentMethod: newOrder.paymentMethod === 'debt_account' ? 'cash' : (newOrder.paymentMethod as any),
            receiptNumber: `REC-${newOrder.orderNumber}`,
            notes: 'دفعة سداد مع الفاتورة',
          },
          ...prev,
        ]);
      }
    }

    // 3. Open receipt
    setReceiptOrder(newOrder);

    // 4. Send the new order DIRECTLY and IMMEDIATELY to Google Sheets
    let cust = newOrder.customerId ? (customers.find(c => c.id === newOrder.customerId) || INITIAL_CUSTOMERS.find(c => c.id === newOrder.customerId)) : null;
    if (!cust && newOrder.customerName) {
      cust = customers.find(c => c.name === newOrder.customerName) || INITIAL_CUSTOMERS.find(c => c.name === newOrder.customerName) || null;
    }
    if (!cust) {
      const oDigits = extractEmployeeDigits(newOrder.customerId) || extractEmployeeDigits(newOrder.customerName);
      if (oDigits) {
        cust = customers.find(c => extractEmployeeDigits(c.code) === oDigits || extractEmployeeDigits(c.name) === oDigits) ||
               INITIAL_CUSTOMERS.find(c => extractEmployeeDigits(c.code) === oDigits || extractEmployeeDigits(c.name) === oDigits) || null;
      }
    }
    
    // Direct immediate send via Webhook / Sheets
    sendOrderDirectlyToGoogleSheets(newOrder, cust, googleAccessToken, activeSpreadsheetId).catch(console.warn);
  };

  // Payment Settlement handling with background synchronization
  const handleRecordPayment = (txn: PaymentTransaction) => {
    setTransactions(prev => {
      const updatedTxns = [txn, ...prev];
      try {
        localStorage.setItem('cafe_txns_data', JSON.stringify(updatedTxns));
      } catch {}
      return updatedTxns;
    });

    // 1. Mark unpaid orders as paid and reduce order remainingAmount
    let paymentRemaining = txn.amount;
    setOrders(prevOrders => {
      const updatedOrders = prevOrders.map(order => {
        const matchesCustomer =
          order.customerId === txn.customerId ||
          (txn.customerName && order.customerName && (
            order.customerName.includes(txn.customerName) ||
            txn.customerName.includes(order.customerName)
          ));

        if (matchesCustomer && order.remainingAmount > 0 && paymentRemaining > 0) {
          const deduction = Math.min(order.remainingAmount, paymentRemaining);
          paymentRemaining -= deduction;
          const newRemaining = order.remainingAmount - deduction;
          const newPaid = (order.paidAmount || 0) + deduction;
          return {
            ...order,
            paidAmount: newPaid,
            remainingAmount: newRemaining,
          };
        }
        return order;
      });

      try {
        localStorage.setItem('cafe_orders_data_v2', JSON.stringify(updatedOrders));
      } catch {}
      return updatedOrders;
    });

    // 2. Update customer balances
    let updatedList = customers;
    setCustomers(prev => {
      updatedList = prev.map(c => {
        if (c.id === txn.customerId) {
          const newPaid = c.totalPaid + txn.amount;
          const newDebt = Math.max(0, c.remainingDebt - txn.amount);
          return {
            ...c,
            totalPaid: newPaid,
            remainingDebt: newDebt,
            status: newDebt > 0 ? 'مدين' : 'مسدد بالكامل',
            lastActivity: txn.createdAt,
          };
        }
        return c;
      });
      try {
        localStorage.setItem('cafe_customers_data', JSON.stringify(updatedList));
      } catch {}
      return updatedList;
    });

    // Enqueue updated balances to Google Sheets
    enqueueCustomersDebtSync(updatedList);
  };

  // Add Customer handling (deduplicated & automatically synced to cloud)
  const handleSaveCustomer = (newCustomer: Customer) => {
    const merged = deduplicateCustomers([newCustomer, ...customers]);
    setCustomers(merged);
    localStorage.setItem('cafe_customers_data', JSON.stringify(merged));

    // Automatically send employee data to 'بينات الموظفين' sheet!
    enqueueNewEmployeeSync(newCustomer);
    // Send to accounts sheet
    enqueueNewCustomerSync(newCustomer);
    // Sync debts list
    enqueueCustomersDebtSync(merged);

    // Direct automatic cloud synchronization
    handleSyncAllCustomersAndEmployeesToSheet(false, merged).catch(() => {});
  };

  // Import customers from CSV
  const handleImportCustomers = (imported: Partial<Customer>[]) => {
    setCustomers(prev => {
      const updated = [...prev];
      imported.forEach(imp => {
        if (!imp.name) return;
        const existingIdx = updated.findIndex(c => c.name.trim() === imp.name!.trim());
        if (existingIdx >= 0) {
          updated[existingIdx] = {
            ...updated[existingIdx],
            totalOrders: imp.totalOrders ?? updated[existingIdx].totalOrders,
            totalPaid: imp.totalPaid ?? updated[existingIdx].totalPaid,
            remainingDebt: imp.remainingDebt ?? updated[existingIdx].remainingDebt,
            category: imp.category ?? updated[existingIdx].category,
            notes: imp.notes ?? updated[existingIdx].notes,
            status: (imp.remainingDebt ?? updated[existingIdx].remainingDebt) > 0 ? 'مدين' : 'مسدد بالكامل',
          };
        } else {
          updated.push({
            id: `CUST-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            code: `CUST-${Math.floor(1005 + Math.random() * 50)}`,
            name: imp.name!,
            category: imp.category || 'موظف',
            totalOrders: imp.totalOrders || 0,
            totalPaid: imp.totalPaid || 0,
            remainingDebt: imp.remainingDebt || 0,
            creditLimit: 500,
            status: (imp.remainingDebt || 0) > 0 ? 'مدين' : 'مسدد بالكامل',
            notes: imp.notes || 'مستورد من الشيت',
            lastActivity: new Date().toISOString(),
          });
        }
      });
      return updated;
    });
  };

  const handleClearOrders = () => {
    setOrders([]);
    setTransactions([]);
    setCustomers(prev => {
      const reset = prev.map(c => ({
        ...c,
        totalOrders: 0,
        totalPaid: 0,
        remainingDebt: 0,
        status: 'مسدد بالكامل' as const,
      }));
      try {
        localStorage.setItem('cafe_customers_data', JSON.stringify(reset));
      } catch {}
      return reset;
    });
    localStorage.removeItem('cafe_orders_data');
    localStorage.removeItem('cafe_orders_data_v2');
    localStorage.removeItem('cafe_txns_data');
    setOrderSyncFeedback({
      type: 'success',
      message: '✅ تم مسح جميع الطلبات التجريبية وتصفير العدادات بنجاح. التطبيق جاهز للتشغيل الفعلي!'
    });
  };

  const handleResetToDefault = () => {
    setCustomers(INITIAL_CUSTOMERS);
    setOrders(INITIAL_ORDERS);
    setMenuItems(INITIAL_MENU_ITEMS);
    setTransactions(INITIAL_TRANSACTIONS);
    setCart([]);
    localStorage.removeItem('cafe_customers_data');
    localStorage.removeItem('cafe_orders_data');
    localStorage.removeItem('cafe_orders_data_v2');
    localStorage.removeItem('cafe_menu_data');
    localStorage.removeItem('cafe_menu_data_v2');
    localStorage.removeItem('cafe_txns_data');
  };

  // Clear active customer session completely
  const handleClearActiveCustomer = useCallback(() => {
    setActiveCustomerId(null);
    setIsAdminMode(false);
    try {
      localStorage.removeItem('cafe_active_customer_id');
      sessionStorage.removeItem('cafe_active_customer_id');
    } catch {}
  }, []);

  // Handlers for Onboarding & Portal
  const handleEmployeeVerified = (emp: Customer) => {
    setIsAdminMode(false); // Employees are never in admin/cashier mode
    setCustomers(prev => {
      if (!prev.some(c => c.id === emp.id || c.code === emp.code)) {
        const updated = [emp, ...prev];
        try {
          localStorage.setItem('cafe_customers_data', JSON.stringify(updated));
        } catch {}
        return updated;
      }
      return prev;
    });
    setActiveCustomerId(emp.id);
    try {
      localStorage.setItem('cafe_active_customer_id', emp.id);
      sessionStorage.setItem('cafe_active_customer_id', emp.id);
    } catch {}
    setActiveTab('menu');
  };

  const handleRegisterNewEmployee = (newEmp: Customer) => {
    setIsAdminMode(false);
    const regKey = `${newEmp.code || ''}_${newEmp.name || ''}`.trim().toLowerCase();
    if (registeredEmployeesRef.current.has(regKey) || registeredEmployeesRef.current.has(newEmp.id)) {
      setActiveCustomerId(newEmp.id);
      try {
        localStorage.setItem('cafe_active_customer_id', newEmp.id);
        sessionStorage.setItem('cafe_active_customer_id', newEmp.id);
      } catch {}
      return;
    }
    registeredEmployeesRef.current.add(regKey);
    registeredEmployeesRef.current.add(newEmp.id);

    const merged = deduplicateCustomers([newEmp, ...customers]);
    setCustomers(merged);
    try {
      localStorage.setItem('cafe_customers_data', JSON.stringify(merged));
      localStorage.setItem('cafe_active_customer_id', newEmp.id);
      sessionStorage.setItem('cafe_active_customer_id', newEmp.id);
    } catch {}
    setActiveCustomerId(newEmp.id);

    // Fast non-blocking background sync directly via webhook
    appendNewCustomerViaWebhook(newEmp).catch(console.warn);
  };

  const handleSyncEmployeesToSheet = async () => {
    const token = googleAccessToken || await getAccessToken();
    const webhookUrl = getStoredWebhookUrl();
    if (!token && !webhookUrl) {
      throw new Error('يرجى تسجيل الدخول بحساب Google أو ربط الشيت أولاً لمزامنة ورقة بينات الموظفين.');
    }
    const uniqueList = deduplicateCustomers(customers);
    if (token && activeSpreadsheetId) {
      const res = await syncAllEmployeesToEmployeesSheet(token, activeSpreadsheetId, uniqueList);
      return res.appended;
    }
    if (webhookUrl) {
      await syncAllEmployeesViaWebhook(uniqueList, webhookUrl);
      return uniqueList.length;
    }
    return 0;
  };

  const handleSyncAllCustomersAndEmployeesToSheet = async (
    forceOverwrite: boolean = false,
    listToSync?: Customer[]
  ) => {
    const token = googleAccessToken || await getAccessToken();
    const webhookUrl = getStoredWebhookUrl();

    if (!token && !webhookUrl) {
      throw new Error('يرجى تسجيل الدخول بحساب Google أو ربط الشيت أولاً للتمكن من نقل البيانات.');
    }

    const currentList = deduplicateCustomers(listToSync || customers);
    let employeesResult = { appended: 0, total: currentList.length, alreadyPresent: 0, sheetName: EMPLOYEES_SHEET_NAME };
    let accountsOk = false;

    // 1. Direct Google Sheets API v4
    if (token && activeSpreadsheetId) {
      await ensureSpreadsheetTabsAndHeaders(token, activeSpreadsheetId).catch(() => {});
      
      try {
        if (forceOverwrite) {
          const count = await forceOverwriteEmployeesSheet(token, activeSpreadsheetId, currentList);
          employeesResult = { appended: count, total: count, alreadyPresent: 0, sheetName: EMPLOYEES_SHEET_NAME };
        } else {
          employeesResult = await syncAllEmployeesToEmployeesSheet(token, activeSpreadsheetId, currentList);
        }
      } catch (err) {
        console.warn('Sync employees to sheet notice:', err);
      }

      try {
        accountsOk = await syncCustomersToGoogleSheet(token, activeSpreadsheetId, currentList);
      } catch (err) {
        console.warn('Sync customers to accounts notice:', err);
      }
    }

    // 2. Webhook
    if (webhookUrl) {
      await syncAllEmployeesViaWebhook(currentList, webhookUrl).catch(() => {});
      await syncCustomersViaWebhook(currentList, webhookUrl).catch(() => {});
      if (!employeesResult.appended && !employeesResult.alreadyPresent) {
        employeesResult = { appended: currentList.length, total: currentList.length, alreadyPresent: 0, sheetName: EMPLOYEES_SHEET_NAME };
      }
      accountsOk = true;
    }

    return { employeesResult, accountsOk };
  };

  const [isSyncingOrders, setIsSyncingOrders] = useState(false);
  const [orderSyncFeedback, setOrderSyncFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleSyncAllOrdersToSheet = async (): Promise<number> => {
    setIsSyncingOrders(true);
    setOrderSyncFeedback(null);
    try {
      let token = googleAccessToken || await getAccessToken();
      const sheetId = activeSpreadsheetId || DEFAULT_SPREADSHEET_ID;

      if (!token) {
        const res = await googleSignIn();
        if (!res?.accessToken) {
          throw new Error('يرجى تسجيل الدخول بحساب Google للتمكن من مزامنة الطلبات مع الشيت.');
        }
        token = res.accessToken;
        setGoogleUser(res.user);
        setGoogleAccessToken(res.accessToken);
      }

      await ensureSpreadsheetTabsAndHeaders(token, sheetId).catch(() => {});
      const count = await bulkSyncOrdersToGoogleSheet(token, sheetId, orders, customers);
      setOrderSyncFeedback({
        type: 'success',
        message: count > 0 
          ? `تم بنجاح نقل وتحديث ${count} طلب جديد إلى ورقة «سجل_الطلبات» في الشيت!`
          : 'كافة الطلبات والفواتير متزامنة ومسجلة بالفعل في الشيت 100%!'
      });
      return count;
    } catch (err: any) {
      setOrderSyncFeedback({
        type: 'error',
        message: err?.message || 'تعذر مزامنة الطلبات مع الشيت حالياً. تأكد من صلاحيات الشيت.'
      });
      throw err;
    } finally {
      setIsSyncingOrders(false);
    }
  };

  // Initial pull of registered employees and menu from Google Sheet on startup (never overwrites manual rows)
  useEffect(() => {
    const startupTimer = setTimeout(() => {
      handleSyncEmployeesFromSheet().catch(() => {});
    }, 1500);
    return () => clearTimeout(startupTimer);
  }, [handleSyncEmployeesFromSheet]);

  const handleSelectGuest = (guestName?: string) => {
    const displayName = guestName || 'عميل نقدي خارجي';
    let guestCust = customers.find(c => c.category === 'عميل خارجي' && c.name === displayName);
    if (!guestCust) {
      guestCust = {
        id: `CUST-GUEST-${Date.now()}`,
        code: 'GUEST',
        name: displayName,
        category: 'عميل خارجي',
        totalOrders: 0,
        totalPaid: 0,
        remainingDebt: 0,
        creditLimit: 0,
        status: 'مسدد بالكامل',
        notes: 'طلب نقدي لزائر خارجي (دفع كاش فوري)',
        lastActivity: new Date().toISOString(),
      };
      setCustomers(prev => {
        const updated = [guestCust!, ...prev];
        localStorage.setItem('cafe_customers_data', JSON.stringify(updated));
        return updated;
      });
    }
    setActiveCustomerId(guestCust.id);
    sessionStorage.setItem('cafe_active_customer_id', guestCust.id);
    setActiveTab('menu');
  };

  const totalCartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalCartPrice = cart.reduce((sum, item) => sum + item.itemTotal, 0);

  return (
    <div className="min-h-screen flex flex-col bg-[#fcfbf9] text-[#1e1b18]">
      {/* Outside official working hours (8:00 AM - 3:30 PM, or Friday & Saturday weekend): Show Closed Notice */}
      {!isAdminMode && isWorkingHoursEnforced() && !isCurrentTimeWithinHours() ? (
        <ClosedHoursNotice onSwitchToAdmin={() => setIsAdminMode(true)} />
      ) : !activeCustomer && !isAdminMode ? (
        <WelcomeOrderPortal
          customers={customers}
          onEmployeeVerified={handleEmployeeVerified}
          onRegisterNewEmployee={handleRegisterNewEmployee}
          onSelectGuest={handleSelectGuest}
          onSwitchToAdmin={() => setIsAdminMode(true)}
          onVerifyEmployeeCloud={handleVerifyEmployeeCloud}
        />
      ) : (
        <>
          {/* App Header with Tabs & Sheet Status */}
          <Header
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            cart={cart}
            setIsCartOpen={setIsCartOpen}
            onOpenQuickPayment={() => {
              setPaymentTargetCustomer(null);
              setIsPaymentModalOpen(true);
            }}
            onOpenAddCustomer={() => setIsAddCustomerModalOpen(true)}
            onOpenSheetSync={() => setIsSheetSyncModalOpen(true)}
            onOpenLuckyWheel={() => {
              if (isEmployee) setIsLuckyWheelOpen(true);
            }}
            totalDebt={kpis.totalDebt}
            activeCustomer={activeCustomer}
            onSwitchCustomer={handleClearActiveCustomer}
            onOpenCustomerSettle={() => setIsCustomerSettleOpen(true)}
            isAdminMode={isAdminMode}
            onToggleAdminMode={() => setIsAdminMode(prev => !prev)}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            isEmployee={isEmployee}
          />

          {/* Main Content Area */}
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
            {activeTab === 'menu' && (
              <CafeMenu
                items={menuItems}
                onAddToCart={handleAddToCart}
                onOpenLuckyWheel={isEmployee ? () => setIsLuckyWheelOpen(true) : undefined}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                customerGreeting={activeCustomer ? {
                  name: activeCustomer.name,
                  code: activeCustomer.code,
                  isEmployee: isEmployee,
                  remainingDebt: activeCustomer.remainingDebt,
                  creditLimit: activeCustomer.creditLimit,
                } : null}
                onOpenDebts={() => setActiveTab('debts')}
                onSwitchCustomer={handleClearActiveCustomer}
                isEmployee={isEmployee}
              />
            )}

            {activeTab === 'debts' && (
              !isAdminMode && activeCustomer ? (
                /* Customer Portal View: shows ONLY their own debt, and disappears as soon as settled! */
                <CustomerPortalView
                  customer={activeCustomer}
                  orders={orders}
                  transactions={transactions}
                  onOpenSettleModal={() => setIsCustomerSettleOpen(true)}
                  onViewReceipt={(order) => setReceiptOrder(order)}
                  onSwitchAccount={handleClearActiveCustomer}
                  onGoToMenu={() => setActiveTab('menu')}
                  onOpenLuckyWheel={() => setIsLuckyWheelOpen(true)}
                  onRefreshDebt={handleSyncPaidOrdersAndDebts}
                />
              ) : (
                /* Admin view: full debitor management sheet */
                <DebtsDashboard
                  customers={customers}
                  orders={orders}
                  kpis={kpis}
                  onOpenSettleModal={(customer) => {
                    setPaymentTargetCustomer(customer);
                    setIsPaymentModalOpen(true);
                  }}
                  onOpenAddCustomer={() => setIsAddCustomerModalOpen(true)}
                  onOpenCustomerStatement={(customer) => setStatementCustomer(customer)}
                  onSelectCustomerForOrder={(customer) => {
                    setActiveTab('menu');
                    setIsCartOpen(true);
                  }}
                  onOpenSheetSync={() => setIsSheetSyncModalOpen(true)}
                  onSyncAllCustomersToSheet={handleSyncAllCustomersAndEmployeesToSheet}
                  onSyncEmployeesFromSheet={handleSyncEmployeesFromSheet}
                  activeSpreadsheetId={activeSpreadsheetId}
                  isGoogleConnected={Boolean(googleUser)}
                  onRecordHospitalityOrder={handleCheckoutComplete}
                />
              )
            )}

            {activeTab === 'orders' && (
              <OrdersHistory
                orders={activeCustomer && !isAdminMode
                  ? orders.filter(o => {
                      if (o.customerId === activeCustomer.id) return true;
                      if (activeCustomer.code && o.customerName && o.customerName.includes(activeCustomer.code)) return true;
                      const cDigits = extractEmployeeDigits(activeCustomer.code) || extractEmployeeDigits(activeCustomer.name);
                      const oDigits = extractEmployeeDigits(o.customerName) || extractEmployeeDigits(o.customerId);
                      if (cDigits && oDigits && cDigits === oDigits) return true;
                      return false;
                    })
                  : orders
                }
                onViewReceipt={(order) => setReceiptOrder(order)}
                onSyncOrdersToSheet={isAdminMode ? handleSyncAllOrdersToSheet : undefined}
                isSyncingOrders={isSyncingOrders}
                googleUser={googleUser}
                onConnectGoogle={isAdminMode ? handleConnectGoogle : undefined}
                syncFeedback={isAdminMode ? orderSyncFeedback : null}
                onDismissFeedback={() => setOrderSyncFeedback(null)}
                isAdmin={isAdminMode}
                currentCustomerName={activeCustomer?.name}
              />
            )}
          </main>
        </>
      )}

      {/* Floating Bottom Cart Bar for Quick Mobile Access */}
      {totalCartCount > 0 && !isCartOpen && (
        <div className="fixed bottom-4 left-4 right-4 z-30 max-w-md mx-auto print:hidden">
          <button
            onClick={() => setIsCartOpen(true)}
            className="w-full bg-[#26201b] hover:bg-[#c48956] text-white p-3.5 rounded-2xl shadow-xl flex items-center justify-between transition-all cursor-pointer border border-[#3e362f]"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#c48956] text-white flex items-center justify-center font-black text-sm">
                <ShoppingCart className="w-4 h-4" />
              </div>
              <div className="text-right">
                <div className="text-xs text-[#a89e92]">الطلب الحالي جاهز</div>
                <div className="text-sm font-black">{totalCartCount} أصناف محددة</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-base font-black text-amber-300">
                {formatCurrency(totalCartPrice)}
              </span>
              <span className="text-xs bg-white text-[#26201b] px-3 py-1.5 rounded-xl font-bold">
                عرض وإتمام الطلب
              </span>
            </div>
          </button>
        </div>
      )}

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        customers={customers}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveFromCart}
        onClearCart={handleClearCart}
        onCheckoutComplete={handleCheckoutComplete}
        onOpenAddCustomer={() => setIsAddCustomerModalOpen(true)}
        activeCustomer={activeCustomer}
        isAdminMode={isAdminMode}
      />

      {/* Modals */}
      <ReceiptModal
        order={receiptOrder}
        onClose={() => setReceiptOrder(null)}
        onNewOrderForAnotherEmployee={() => {
          setReceiptOrder(null);
          handleClearActiveCustomer();
        }}
      />

      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => {
          setIsPaymentModalOpen(false);
          setPaymentTargetCustomer(null);
        }}
        customer={paymentTargetCustomer}
        customers={customers}
        onRecordPayment={handleRecordPayment}
      />

      {/* Customer Self-Settle Modal */}
      <CustomerSettleModal
        isOpen={isCustomerSettleOpen}
        onClose={() => setIsCustomerSettleOpen(false)}
        customer={activeCustomer}
        onRecordPayment={handleRecordPayment}
      />

      <CustomerModal
        isOpen={isAddCustomerModalOpen}
        onClose={() => setIsAddCustomerModalOpen(false)}
        onSaveCustomer={handleSaveCustomer}
      />

      <CustomerStatementModal
        customer={statementCustomer}
        orders={orders}
        transactions={transactions}
        onClose={() => setStatementCustomer(null)}
        onOpenSettleModal={(customer) => {
          setPaymentTargetCustomer(customer);
          setIsPaymentModalOpen(true);
        }}
      />

      <SheetSyncModal
        isOpen={isSheetSyncModalOpen}
        onClose={() => setIsSheetSyncModalOpen(false)}
        customers={customers}
        orders={orders}
        kpis={kpis}
        onImportCustomers={handleImportCustomers}
        onResetToDefault={handleResetToDefault}
        googleUser={googleUser}
        googleAccessToken={googleAccessToken}
        activeSpreadsheetId={activeSpreadsheetId}
        activeSpreadsheetTitle={activeSpreadsheetTitle}
        isAutoSyncEnabled={isAutoSyncEnabled}
        onConnectGoogle={handleConnectGoogle}
        onDisconnectGoogle={handleDisconnectGoogle}
        onCreateNewSheet={handleCreateNewSheet}
        onLinkExistingSheet={handleLinkExistingSheet}
        onSyncAllOrders={handleSyncAllOrders}
        onSyncCustomers={handleSyncCustomers}
        onSyncEmployeesToSheet={handleSyncEmployeesToSheet}
        onSyncAllCustomersToSheet={handleSyncAllCustomersAndEmployeesToSheet}
        onToggleAutoSync={setIsAutoSyncEnabled}
        menuItems={menuItems}
        onSyncMenuFromSheet={handleSyncMenuFromSheet}
        onPushMenuToSheet={handlePushMenuToSheet}
        isSyncingMenu={isMenuSyncing}
        lastMenuSyncTime={lastMenuSyncTime}
        onImportMenuItems={(newItems: MenuItem[]) => {
          setMenuItems(newItems);
          localStorage.setItem('cafe_menu_data_v3', JSON.stringify(newItems));
        }}
      />

      {/* Lucky Wheel Modal - Strictly for employees */}
      {isEmployee && (
        <LuckyWheelModal
          isOpen={isLuckyWheelOpen}
          onClose={() => setIsLuckyWheelOpen(false)}
          menuItems={menuItems}
          onAddFreeGift={handleAddFreeGiftToCart}
        />
      )}
    </div>
  );
}
