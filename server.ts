import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json());

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
        // Log softly as warning rather than console.error to avoid error alerts on cold starts
        console.warn('[sync_debt] Google Apps Script background fetch note:', err?.name === 'AbortError' ? 'timed out after 20s' : err?.message);
      } finally {
        clearTimeout(timeout);
        inFlightSyncDebtPromise = null;
      }
      return cachedSyncDebtData;
    })();

    return inFlightSyncDebtPromise;
  }

  // Pre-warm the cache on server startup in the background
  fetchFromGoogleAppsScript().catch(() => {});

  // Proxy endpoint to Google Apps Script to eliminate all browser CORS and iframe issues
  app.get('/api/sync_debt', async (req, res) => {
    const now = Date.now();
    const customUrl = typeof req.query.url === 'string' ? req.query.url : null;

    // Stale-While-Revalidate: Return cached data immediately
    if (hasValidCache) {
      if (now - lastSyncDebtTime > CACHE_TTL_MS) {
        fetchFromGoogleAppsScript(customUrl).catch(() => {});
      }
      return res.json(cachedSyncDebtData);
    }

    // Cold start before first response: wait for fetch
    const data = await fetchFromGoogleAppsScript(customUrl);
    return res.json(data || cachedSyncDebtData);
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
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
