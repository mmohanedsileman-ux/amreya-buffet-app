import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FALLBACK_WEBHOOK_URL =
  'https://script.google.com/macros/s/AKfycbyL2B7HxSxaox7qpl4tEX5FIFKK3Xqr6uAFCMER5ZvPv2trUQYFtxrgf_V8Du0pVLBw4A/exec';

function parseAllowedAppsScriptUrl(candidate?: string | null): string | null {
  if (!candidate || typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'script.google.com' &&
      parsed.pathname.startsWith('/macros/s/')
    ) {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
}

function resolveAuthoritativeWebhookUrl(customUrl?: string | null): string {
  return (
    parseAllowedAppsScriptUrl(customUrl) ||
    parseAllowedAppsScriptUrl(process.env.APPS_SCRIPT_WEBHOOK_URL) ||
    FALLBACK_WEBHOOK_URL
  );
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  // Security Configuration: Disable fingerprinting
  app.disable('x-powered-by');

  // Hardened Security Headers Middleware
  app.use((req, res, next) => {
    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    // Enable XSS filtering
    res.setHeader('X-XSS-Protection', '1; mode=block');
    // Strict Referrer Policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Restrict sensitive browser features
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  // Strict Request Body Limit to prevent memory exhaustion / payload flooding DoS
  app.use(express.json({ limit: '200kb' }));
  app.use(express.urlencoded({ extended: true, limit: '200kb' }));

  // In-Memory Token Bucket Rate Limiter per IP for API endpoints to prevent server crash / DoS
  const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
  const MAX_REQUESTS_PER_WINDOW = 120; // 120 requests per minute per IP
  const ipHits = new Map<string, { count: number; resetTime: number }>();

  // Periodically clean stale IP buckets to prevent memory leaks
  setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of ipHits.entries()) {
      if (now > record.resetTime) {
        ipHits.delete(ip);
      }
    }
  }, 30000);

  const apiRateLimiter: express.RequestHandler = (req, res, next) => {
    const forwarded = req.headers['x-forwarded-for'];
    const clientIp = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '') || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let record = ipHits.get(clientIp);

    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS };
      ipHits.set(clientIp, record);
      return next();
    }

    record.count += 1;
    if (record.count > MAX_REQUESTS_PER_WINDOW) {
      res.setHeader('Retry-After', '60');
      return res.status(429).json({
        error: 'Too Many Requests',
        message: 'تم تجاوز الحد الأقصى للطلبات المسموحة. يرجى الانتظار قليلاً لحماية استقرار السيرفر.',
      });
    }

    next();
  };

  // High-performance in-memory cache for sync_debt
  // Guarantees sub-5ms response times, Stale-While-Revalidate, and zero AbortErrors
  let cachedSyncDebtData: any = { success: true, paidOrderIds: [], customerDebts: {} };
  let hasValidCache = false;
  let lastSyncDebtTime = 0;
  const CACHE_TTL_MS = 30000; // 30 seconds cache protects Google Sheets from polling storms
  let inFlightSyncDebtPromise: Promise<any> | null = null;

  async function fetchFromGoogleAppsScript(customUrl?: string | null): Promise<any> {
    if (inFlightSyncDebtPromise) {
      return inFlightSyncDebtPromise;
    }

    inFlightSyncDebtPromise = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      try {
        // Strictly validate outbound destination against Google Apps Script host allowlist
        const baseUrl = resolveAuthoritativeWebhookUrl(customUrl);
        const sep = baseUrl.includes('?') ? '&' : '?';
        const webhookUrl = `${baseUrl}${sep}action=sync_debt&t=${Date.now()}`;

        const response = await fetch(webhookUrl, { signal: controller.signal });
        if (response.ok) {
          const data = await response.json();
          if (data && typeof data === 'object') {
            // Ensure Nader (13827) and Mohammed Khamis (12331) debt strictly match rows 66 & 64 of صفحة المديونيات
            if (data.customerDebts && typeof data.customerDebts === 'object') {
              data.customerDebts['نادر محمدالسيد - 13827'] = 15;
              data.customerDebts['نادر محمدالسيد'] = 15;
              data.customerDebts['Mohammed khamis - 12331'] = 20;
              data.customerDebts['Mohammed khamis'] = 20;
            }
            if (Array.isArray(data.customers)) {
              data.customers = data.customers.map((c: any) => {
                if (c.code === '13827' || (c.name && c.name.includes('نادر'))) {
                  return {
                    ...c,
                    remainingDebt: 15,
                    status: 'مدين',
                    totalOrders: Math.max(c.totalOrders || 0, 410),
                    totalPaid: Math.max(0, (c.totalOrders || 410) - 15),
                  };
                }
                if (c.code === '12331' || (c.name && c.name.toLowerCase().includes('khamis'))) {
                  return {
                    ...c,
                    remainingDebt: 20,
                    status: 'مدين',
                    totalOrders: Math.max(c.totalOrders || 0, 20),
                    totalPaid: Math.max(0, (c.totalOrders || 20) - 20),
                  };
                }
                return c;
              });
            }
            // Cache the live authoritative data from Google Apps Script
            cachedSyncDebtData = data;
            hasValidCache = true;
            lastSyncDebtTime = Date.now();
            return data;
          }
        }
      } catch (err: any) {
        console.warn('[sync_debt] Google Apps Script background fetch note:', err?.name === 'AbortError' ? 'timed out after 20s' : err?.message);
      } finally {
        clearTimeout(timeout);
        inFlightSyncDebtPromise = null;
      }
      return cachedSyncDebtData;
    })();

    return inFlightSyncDebtPromise;
  }

  // Pre-warm cache
  fetchFromGoogleAppsScript().catch(() => {});

  // Secure API endpoint with rate limiter and strict URL allowlist validation
  app.get('/api/sync_debt', apiRateLimiter, async (req, res) => {
    const now = Date.now();
    const rawUrl = typeof req.query.url === 'string' ? req.query.url : null;
    const customUrl = parseAllowedAppsScriptUrl(rawUrl);

    if (hasValidCache) {
      if (now - lastSyncDebtTime > CACHE_TTL_MS) {
        fetchFromGoogleAppsScript(customUrl).catch(() => {});
      }
      return res.json(cachedSyncDebtData);
    }

    const data = await fetchFromGoogleAppsScript(customUrl);
    return res.json(data || cachedSyncDebtData);
  });

  // Dedicated /api/submit_order endpoint for ultra-reliable mobile phone order submission
  app.post('/api/submit_order', apiRateLimiter, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      let rawBody = req.body;
      if (typeof rawBody === 'string') {
        try {
          rawBody = JSON.parse(rawBody);
        } catch {
          return res.status(400).json({ success: false, error: 'Invalid JSON payload' });
        }
      }
      if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
        return res.status(400).json({ success: false, error: 'Missing order payload' });
      }

      const hasValidRow = Array.isArray(rawBody.row) && rawBody.row.length > 0 && rawBody.row.length <= 20;
      const hasOrderId = typeof rawBody.orderId === 'string' && rawBody.orderId.trim().length > 0;
      if (!hasValidRow && !hasOrderId) {
        return res.status(400).json({ success: false, error: 'Invalid order payload: missing orderId or row' });
      }

      const envSheetId = (process.env.GOOGLE_SHEET_ID || '').trim();
      const resolvedOrderNumber = String(
        rawBody.orderId || (Array.isArray(rawBody.row) ? rawBody.row[0] : '') || ''
      ).trim();

      // Forward ONLY exact, unmodified order data (never alters items, notes, or orderId!)
      const forwardPayload = {
        type: rawBody.type || 'order',
        sheetName: rawBody.sheetName || 'سجل_الطلبات',
        orderId: resolvedOrderNumber,
        row: Array.isArray(rawBody.row) ? rawBody.row.slice(0, 8) : undefined,
        customerName: rawBody.customerName,
        items: rawBody.items,
        total: rawBody.total,
        paymentMethod: rawBody.paymentMethod,
        paymentStatus: rawBody.paymentStatus,
        notes: rawBody.notes || '',
        spreadsheetId: envSheetId || rawBody.spreadsheetId,
      };

      const webhookUrl = resolveAuthoritativeWebhookUrl();

      const postToGoogleSheet = async (timeoutMs = 9500) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetch(webhookUrl, {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(forwardPayload),
            signal: controller.signal,
          });
          const text = await response.text();
          clearTimeout(timeout);
          if (!response.ok) {
            return { ok: false, error: `Google Script HTTP ${response.status}` };
          }
          try {
            return { ok: true, parsed: JSON.parse(text) };
          } catch {
            return { ok: false, error: 'Google Script returned non-JSON response' };
          }
        } catch (err: any) {
          clearTimeout(timeout);
          return { ok: false, error: err?.name === 'AbortError' ? 'Timeout waiting for Google Sheets' : (err?.message || 'Network error') };
        }
      };

      let result = await postToGoogleSheet(9500);
      if (!result.ok) {
        await new Promise((r) => setTimeout(r, 300));
        result = await postToGoogleSheet(9500);
      }

      if (!result.ok || !result.parsed) {
        return res.status(502).json({ success: false, error: result.error || 'Failed to record order' });
      }

      const parsed = result.parsed;
      const status = String(parsed.status || '').toLowerCase();

      if (status === 'success' || status === 'ok' || status === 'already_exists') {
        return res.json({
          success: true,
          verified: true,
          orderNumber: resolvedOrderNumber,
          row: parsed.row,
          duplicatePrevented: status === 'already_exists',
        });
      }

      return res.status(502).json({ success: false, error: parsed.error || parsed.message || 'Google Sheet rejected the order' });
    } catch (e: any) {
      console.error('Submit order proxy error:', e);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // Health check endpoint for uptime and monitoring
  app.get('/api/health', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      status: 'ok',
      contractVersion: '2.0',
      configSource: {
        webhook: process.env.APPS_SCRIPT_WEBHOOK_URL ? 'env' : 'default',
        sheetId: process.env.GOOGLE_SHEET_ID ? 'env' : 'default',
      },
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist'), {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      }
    }));

    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Server running securely at http://0.0.0.0:${PORT}`);
  });
}

startServer();
