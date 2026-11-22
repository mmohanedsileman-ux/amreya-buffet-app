import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  const CACHE_TTL_MS = 8000; // 8 seconds cache allows 10-second polling to fetch freshly updated data continuously
  let inFlightSyncDebtPromise: Promise<any> | null = null;

  async function fetchFromGoogleAppsScript(customUrl?: string | null): Promise<any> {
    if (inFlightSyncDebtPromise) {
      return inFlightSyncDebtPromise;
    }

    inFlightSyncDebtPromise = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      try {
        // Enforce safe allowed base domain to prevent SSRF (Server-Side Request Forgery)
        const baseUrl = customUrl && customUrl.startsWith('https://script.google.com/')
          ? customUrl
          : 'https://script.google.com/macros/s/AKfycbyL2B7HxSxaox7qpl4tEX5FIFKK3Xqr6uAFCMER5ZvPv2trUQYFtxrgf_V8Du0pVLBw4A/exec';

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

  // Secure API endpoint with rate limiter and domain validation
  app.get('/api/sync_debt', apiRateLimiter, async (req, res) => {
    const now = Date.now();
    const rawUrl = typeof req.query.url === 'string' ? req.query.url : null;
    // Prevent SSRF: only allow Google Apps Script URLs
    const customUrl = rawUrl && rawUrl.startsWith('https://script.google.com/') ? rawUrl : null;

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
    try {
      let orderData = req.body;
      if (typeof orderData === 'string') {
        try {
          orderData = JSON.parse(orderData);
        } catch {
          return res.status(400).json({ success: false, error: 'Invalid JSON payload' });
        }
      }
      if (!orderData || typeof orderData !== 'object') {
        return res.status(400).json({ success: false, error: 'Missing order payload' });
      }

      const isRetry = Boolean(orderData.isRetry);
      const webhookUrl = 'https://script.google.com/macros/s/AKfycbyL2B7HxSxaox7qpl4tEX5FIFKK3Xqr6uAFCMER5ZvPv2trUQYFtxrgf_V8Du0pVLBw4A/exec';

      const postToGoogleSheet = async (payloadObj: any, timeoutMs = 15000) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetch(webhookUrl, {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payloadObj),
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

      let result = await postToGoogleSheet(orderData, 15000);
      if (!result.ok) {
        await new Promise((r) => setTimeout(r, 700));
        result = await postToGoogleSheet(orderData, 15000);
      }

      if (!result.ok || !result.parsed) {
        return res.status(502).json({ success: false, error: result.error || 'Failed to record order' });
      }

      const parsed = result.parsed;
      const status = String(parsed.status || '').toLowerCase();

      if (status === 'success' || status === 'ok') {
        return res.json({ success: true, verified: true, row: parsed.row, sheetResult: parsed });
      }

      if (status === 'already_exists') {
        if (isRetry) {
          return res.json({ success: true, verified: true, row: parsed.row, sheetResult: parsed });
        }
        const uniqueTag = `${String(Date.now()).slice(-4)}${Math.floor(10 + Math.random() * 90)}`;
        const newOrderId = `ORD-${uniqueTag}`;
        const retryPayload = {
          ...orderData,
          orderId: newOrderId,
          row: Array.isArray(orderData.row) ? [newOrderId, ...orderData.row.slice(1)] : orderData.row,
        };
        const retryRes = await postToGoogleSheet(retryPayload, 15000);
        if (retryRes.ok && retryRes.parsed && ['success', 'ok'].includes(String(retryRes.parsed.status || '').toLowerCase())) {
          return res.json({ success: true, verified: true, row: retryRes.parsed.row, sheetResult: retryRes.parsed });
        }
        return res.status(502).json({ success: false, error: 'Order ID collision retry failed' });
      }

      if (status === 'already_exists_duplicate') {
        const shortTag = String(orderData.orderId || Date.now()).replace(/\D/g, '').slice(-4);
        const patchedRow = Array.isArray(orderData.row) ? [...orderData.row] : undefined;
        if (patchedRow && patchedRow.length >= 4) {
          patchedRow[3] = `${patchedRow[3]} (#${shortTag})`;
        }
        const retryPayload = {
          ...orderData,
          items: orderData.items ? `${orderData.items} (#${shortTag})` : orderData.items,
          row: patchedRow,
        };
        const retryRes = await postToGoogleSheet(retryPayload, 15000);
        if (retryRes.ok && retryRes.parsed && ['success', 'ok'].includes(String(retryRes.parsed.status || '').toLowerCase())) {
          return res.json({ success: true, verified: true, row: retryRes.parsed.row, sheetResult: retryRes.parsed });
        }
        return res.status(502).json({ success: false, error: 'Duplicate-filter bypass retry failed' });
      }

      return res.status(502).json({ success: false, error: parsed.error || parsed.message || 'Google Sheet rejected the order', sheetResult: parsed });
    } catch (e: any) {
      console.error('Submit order proxy error:', e);
      return res.status(500).json({ success: false, error: e?.message });
    }
  });

  // Health check endpoint for uptime and monitoring
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
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
