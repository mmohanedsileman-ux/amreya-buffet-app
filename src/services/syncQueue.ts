import { Order, Customer } from '../types';
import { 
  syncCustomersToGoogleSheet,
  DEFAULT_SPREADSHEET_ID,
  getStoredWebhookUrl,
  appendOrderViaWebhook,
  appendNewCustomerViaWebhook,
  appendCustomerToGoogleSheet,
  appendEmployeeToGoogleSheet,
  appendEmployeeViaWebhook,
  getSyncedOrderIds,
  markOrderAsSynced,
  SYNCED_ORDERS_CACHE_KEY
} from './googleSheets';
import { getAccessToken } from './googleAuth';

export { getSyncedOrderIds, markOrderAsSynced, SYNCED_ORDERS_CACHE_KEY };

type OrderSyncedListener = (orderId: string) => void;
const orderSyncedListeners = new Set<OrderSyncedListener>();

export function onOrderSynced(listener: OrderSyncedListener): () => void {
  orderSyncedListeners.add(listener);
  return () => orderSyncedListeners.delete(listener);
}

function notifyOrderSynced(orderId: string) {
  orderSyncedListeners.forEach(fn => {
    try { fn(orderId); } catch {}
  });
}

export interface QueueItem {
  id: string;
  type: 'order' | 'customers_debt' | 'new_customer' | 'new_employee';
  payload: any;
  addedAt: number;
  attempts: number;
  lastAttemptAt?: number;
  error?: string;
}

const OUTBOX_STORAGE_KEY = 'cafe_sheets_outbox_queue_v1';

/**
 * Retrieves the persisted outbox queue from local storage
 */
export function getOutboxQueue(): QueueItem[] {
  try {
    const raw = localStorage.getItem(OUTBOX_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Saves queue to local storage
 */
/**
 * Saves queue to local storage
 */
function saveOutboxQueue(queue: QueueItem[]) {
  try {
    localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.warn('Failed to save outbox queue:', e);
  }
}

/**
 * Purges old/stuck items from the outbox queue to prevent re-sending historical orders
 */
export function purgeStuckOldOrdersFromQueue(): void {
  try {
    const queue = getOutboxQueue();
    if (queue.length === 0) return;

    const synced = getSyncedOrderIds();
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;

    const cleaned = queue.filter(item => {
      if (item.type === 'order') {
        const order = item.payload?.order;
        if (!order) return false;
        const orderCode = order.id?.startsWith('ORD-') ? order.id : `ORD-${order.orderNumber}`;
        // If already marked as synced, remove from queue
        if (synced.has(order.id) || synced.has(String(order.orderNumber)) || synced.has(orderCode)) {
          return false;
        }
        // Keep order in queue for up to 10 attempts over 24 hours to ensure zero lost orders
        if (item.attempts >= 10 || (item.addedAt && (now - item.addedAt) > ONE_DAY)) {
          return false;
        }
      }
      return true;
    });

    if (cleaned.length !== queue.length) {
      saveOutboxQueue(cleaned);
    }
  } catch (e) {
    console.warn('Failed to purge stuck outbox items:', e);
  }
}

/**
 * Clears the entire outbox queue from local storage
 */
export function clearOutboxQueue(): void {
  try {
    localStorage.removeItem(OUTBOX_STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear outbox queue:', e);
  }
}

/**
 * Transmits an order DIRECTLY and IMMEDIATELY to Google Sheets / Webhook
 * If network fails or is interrupted on mobile, automatically enqueues for background retry!
 */
export async function sendOrderDirectlyToGoogleSheets(
  order: Order,
  customer?: Customer | null,
  token?: string | null,
  spreadsheetId?: string | null
): Promise<boolean> {
  const targetSpreadsheetId = spreadsheetId || localStorage.getItem('cafe_spreadsheet_id') || DEFAULT_SPREADSHEET_ID;
  const webhookUrl = getStoredWebhookUrl();
  const orderCode = order.id?.startsWith('ORD-') ? order.id : `ORD-${order.orderNumber}`;
  const synced = getSyncedOrderIds();

  // If already synced, don't re-send!
  if (synced.has(order.id) || synced.has(String(order.orderNumber)) || synced.has(orderCode)) {
    return true;
  }

  // Prevent multiple simultaneous transmissions of the exact same order
  if (inFlightOrderIds.has(order.id) || inFlightOrderIds.has(String(order.orderNumber)) || inFlightOrderIds.has(orderCode)) {
    return true;
  }

  inFlightOrderIds.add(order.id);
  inFlightOrderIds.add(String(order.orderNumber));
  inFlightOrderIds.add(orderCode);

  let success = false;
  try {
    // Single authoritative idempotent write channel (/api/submit_order -> Apps Script with LockService + orderId deduplication)
    // Eliminates duplicate writes from racing two different writers (Webhook + Sheets API v4)
    try {
      success = await appendOrderViaWebhook(order, customer, webhookUrl, targetSpreadsheetId);
    } catch (err) {
      console.warn('Direct Webhook append attempt notice:', err);
    }

    if (success) {
      markOrderAsSynced(order.id);
      markOrderAsSynced(String(order.orderNumber));
      markOrderAsSynced(orderCode);
      notifyOrderSynced(order.id);

      // Remove from outbox queue if it was pending
      const queue = getOutboxQueue();
      const nextQueue = queue.filter(q => q.id !== `order_${order.id}` && q.id !== order.id);
      if (nextQueue.length !== queue.length) {
        saveOutboxQueue(nextQueue);
      }
    } else {
      // Offline / network interrupted on mobile: save into outbox queue for guaranteed background retry!
      const queue = getOutboxQueue();
      if (!queue.some(q => q.id === `order_${order.id}`)) {
        queue.push({
          id: `order_${order.id}`,
          type: 'order',
          payload: { order, customer },
          addedAt: Date.now(),
          lastAttemptAt: Date.now(),
          attempts: 1,
        });
        saveOutboxQueue(queue);
      }
    }
  } finally {
    inFlightOrderIds.delete(order.id);
    inFlightOrderIds.delete(String(order.orderNumber));
    inFlightOrderIds.delete(orderCode);
  }

  return success;
}

/**
 * Enqueue an order for direct synchronization (dispatches directly; never queues to avoid duplicate replays)
 */
export function enqueueOrderForSync(order: Order, customer?: Customer | null) {
  sendOrderDirectlyToGoogleSheets(order, customer).catch(console.warn);
}

/**
 * Enqueue customers list for debts synchronization (debounced by nature of queue replacement)
 */
export function enqueueCustomersDebtSync(customers: Customer[]) {
  const queue = getOutboxQueue();
  // Filter out any older pending customers_debt sync items to send only latest snapshot
  const filtered = queue.filter(item => item.type !== 'customers_debt');
  filtered.push({
    id: `queue_cust_${Date.now()}`,
    type: 'customers_debt',
    payload: { customers },
    addedAt: Date.now(),
    attempts: 0,
  });
  saveOutboxQueue(filtered);

  // Trigger flush immediately
  flushSyncQueue();
}

/**
 * Enqueue a newly registered employee / customer for immediate append to Google Sheets
 */
export function enqueueNewCustomerSync(customer: Customer) {
  const queue = getOutboxQueue();
  queue.push({
    id: `queue_newcust_${customer.id}_${Date.now()}`,
    type: 'new_customer',
    payload: { customer },
    addedAt: Date.now(),
    attempts: 0,
  });
  saveOutboxQueue(queue);

  // Trigger flush immediately
  flushSyncQueue();
}

/**
 * Enqueue a newly registered employee for immediate append to Google Sheets "بينات الموظفين"
 */
export function enqueueNewEmployeeSync(customer: Customer) {
  const queue = getOutboxQueue();
  queue.push({
    id: `queue_newemp_${customer.id}_${Date.now()}`,
    type: 'new_employee',
    payload: { customer },
    addedAt: Date.now(),
    attempts: 0,
  });
  saveOutboxQueue(queue);

  // Trigger flush immediately
  flushSyncQueue();
}

let isFlushingQueue = false;
const inFlightOrderIds = new Set<string>();

/**
 * Processes and transmits pending queue items through the protocol with strict mutex & continuous draining
 */
export async function flushSyncQueue(): Promise<{ processed: number; remaining: number }> {
  if (isFlushingQueue) {
    return { processed: 0, remaining: getOutboxQueue().length };
  }

  isFlushingQueue = true;
  let totalProcessed = 0;

  try {
    // Continuously drain queue until empty or no more items can be processed
    while (true) {
      const result = await internalFlushSyncQueue();
      totalProcessed += result.processed;
      if (result.processed === 0 || result.remaining === 0) {
        break;
      }
    }
  } finally {
    isFlushingQueue = false;
  }

  return { processed: totalProcessed, remaining: getOutboxQueue().length };
}

async function internalFlushSyncQueue(): Promise<{ processed: number; remaining: number }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    // Offline, postpone transmission
    return { processed: 0, remaining: getOutboxQueue().length };
  }

  const webhookUrl = getStoredWebhookUrl();
  const spreadsheetId = localStorage.getItem('cafe_spreadsheet_id') || DEFAULT_SPREADSHEET_ID;
  const token = await getAccessToken();

  // If neither Google OAuth Token nor Webhook URL is available, postpone
  if (!webhookUrl && !token) {
    return { processed: 0, remaining: getOutboxQueue().length };
  }

  const queue = getOutboxQueue();
  if (queue.length === 0) {
    return { processed: 0, remaining: 0 };
  }

  const processedItemIds = new Set<string>();
  let processedCount = 0;

  const updatedItemsMap = new Map<string, QueueItem>();

  for (const item of queue) {
    // Allow up to 15 retry attempts for orders (zero lost orders), 4 for auxiliary syncs
    const maxAttempts = item.type === 'order' ? 15 : 4;
    if (item.attempts >= maxAttempts) {
      console.warn(`Dropping queue item ${item.id} after ${maxAttempts} attempts`);
      processedItemIds.add(item.id);
      continue;
    }

    // Backoff: 6s -> 12s -> 20s -> 30s max
    const backoffDelay = Math.min(30000, Math.max(6000, item.attempts * 6000));
    if (item.lastAttemptAt && Date.now() - item.lastAttemptAt < backoffDelay) {
      continue;
    }

    item.attempts += 1;
    item.lastAttemptAt = Date.now();
    updatedItemsMap.set(item.id, item);

    try {
      if (item.type === 'order') {
        const { order, customer } = item.payload;
        if (!order) {
          processedItemIds.add(item.id);
          continue;
        }
        const orderCode = order.id?.startsWith('ORD-') ? order.id : `ORD-${order.orderNumber}`;
        const synced = getSyncedOrderIds();
        if (synced.has(order.id) || synced.has(String(order.orderNumber)) || synced.has(orderCode)) {
          processedItemIds.add(item.id);
          notifyOrderSynced(order.id);
          continue;
        }

        if (
          inFlightOrderIds.has(order.id) ||
          inFlightOrderIds.has(String(order.orderNumber)) ||
          inFlightOrderIds.has(orderCode)
        ) {
          continue;
        }

        inFlightOrderIds.add(order.id);
        inFlightOrderIds.add(String(order.orderNumber));
        inFlightOrderIds.add(orderCode);

        let ok = false;
        try {
          // Single authoritative idempotent write channel (/api/submit_order -> Apps Script LockService)
          ok = await appendOrderViaWebhook(order, customer, webhookUrl, spreadsheetId, true);
        } catch (err: any) {
          item.error = err?.message || 'Order transmission error';
        } finally {
          inFlightOrderIds.delete(order.id);
          inFlightOrderIds.delete(String(order.orderNumber));
          inFlightOrderIds.delete(orderCode);
        }

        if (ok) {
          markOrderAsSynced(order.id);
          markOrderAsSynced(String(order.orderNumber));
          markOrderAsSynced(orderCode);
          processedItemIds.add(item.id);
          processedCount++;
          notifyOrderSynced(order.id);
        }
        continue;
      } else if (item.type === 'customers_debt') {
        const { customers } = item.payload;
        try {
          // Only sync full customer balances table when Admin/Cashier has an active Google Sheets OAuth token.
          // Customer devices must NOT POST bulk customer snapshots to Apps Script doPost (which would steal LockService from incoming orders).
          if (token && spreadsheetId) {
            const ok = await syncCustomersToGoogleSheet(token, spreadsheetId, customers);
            if (ok) {
              processedItemIds.add(item.id);
              processedCount++;
            } else {
              item.error = 'Sync customers returned false';
            }
          } else {
            // Sheet formulas calculate debts from سجل_الطلبات automatically; drop cleanly on customer devices
            processedItemIds.add(item.id);
          }
        } catch (err: any) {
          item.error = err?.message || 'Network exception';
        }
      } else if (item.type === 'new_customer') {
        const { customer } = item.payload;
        let ok = false;
        try {
          // Priority 1: Direct Google Sheets API v4
          if (token && spreadsheetId) {
            ok = await appendCustomerToGoogleSheet(token, spreadsheetId, customer);
          }
          // Priority 2: Webhook fallback
          if (!ok && webhookUrl) {
            ok = await appendNewCustomerViaWebhook(customer, webhookUrl);
          }

          if (ok) {
            processedItemIds.add(item.id);
            processedCount++;
          } else {
            item.error = 'Append customer to sheet returned false';
          }
        } catch (err: any) {
          item.error = err?.message || 'Network exception';
        }
      } else if (item.type === 'new_employee') {
        const { customer } = item.payload;
        let ok = false;
        try {
          // Priority 1: Direct Google Sheets API v4 to 'بينات الموظفين'
          if (token && spreadsheetId) {
            ok = await appendEmployeeToGoogleSheet(token, spreadsheetId, customer);
          }
          // Priority 2: Webhook fallback
          if (!ok && webhookUrl) {
            ok = await appendEmployeeViaWebhook(customer, webhookUrl);
          }

          if (ok) {
            processedItemIds.add(item.id);
            processedCount++;
          } else {
            item.error = 'Append employee to sheet returned false';
          }
        } catch (err: any) {
          item.error = err?.message || 'Network exception';
        }
      }
    } catch (err: any) {
      item.error = err?.message || 'Processing exception';
    }
  }

  // Atomically remove processed items & persist updated attempt counters for remaining items
  const freshQueue = getOutboxQueue();
  const remainingQueue = freshQueue
    .filter(it => !processedItemIds.has(it.id))
    .map(it => updatedItemsMap.get(it.id) || it);
  saveOutboxQueue(remainingQueue);

  return { processed: processedCount, remaining: remainingQueue.length };
}

/**
 * Background queue listener initialization
 * Automatically syncs periodically (every 15s), on network reconnect, and on tab visibility.
 */
export function initBackgroundSyncQueueWorker() {
  if (typeof window === 'undefined') return () => {};

  // Clean any old stuck orders on worker start
  purgeStuckOldOrdersFromQueue();

  // Initial immediate flush on app startup
  flushSyncQueue().catch(console.warn);

  // Process queue when network goes back online
  const handleOnline = () => {
    purgeStuckOldOrdersFromQueue();
    flushSyncQueue().catch(console.warn);
  };

  // Process queue when window / tab gains focus or visibility
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      flushSyncQueue().catch(console.warn);
    }
  };

  // Automatic periodic sync interval every 15 seconds for fast mobile recovery
  const intervalId = setInterval(() => {
    if (getOutboxQueue().length > 0) {
      flushSyncQueue().catch(console.warn);
    }
  }, 15000);

  window.addEventListener('online', handleOnline);
  window.addEventListener('focus', handleVisibilityChange);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    clearInterval(intervalId);
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('focus', handleVisibilityChange);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}
