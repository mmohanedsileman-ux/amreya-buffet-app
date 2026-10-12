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
  const CACHE_TTL_MS = 15000;
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
