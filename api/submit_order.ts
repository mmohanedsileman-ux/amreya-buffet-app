const FALLBACK_WEBHOOK_URL =
  'https://script.google.com/macros/s/AKfycbyL2B7HxSxaox7qpl4tEX5FIFKK3Xqr6uAFCMER5ZvPv2trUQYFtxrgf_V8Du0pVLBw4A/exec';

function resolveSafeWebhookUrl(): string {
  const candidate = (process.env.APPS_SCRIPT_WEBHOOK_URL || '').trim();
  if (candidate) {
    try {
      const parsed = new URL(candidate);
      if (
        parsed.protocol === 'https:' &&
        parsed.hostname === 'script.google.com' &&
        parsed.pathname.startsWith('/macros/s/')
      ) {
        return parsed.toString();
      }
    } catch {
      // Fall back to verified production URL if env var is malformed
    }
  }
  return FALLBACK_WEBHOOK_URL;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
  }

  try {
    let rawBody = req.body;
    if (typeof rawBody === 'string') {
      if (rawBody.length > 200_000) {
        return res.status(413).json({ success: false, error: 'Payload too large' });
      }
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

    const webhookUrl = resolveSafeWebhookUrl();

    const postToGoogleSheet = async (timeoutMs = 9500) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          redirect: 'follow',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
          },
          body: JSON.stringify(forwardPayload),
          signal: controller.signal,
        });

        const responseText = await response.text();
        clearTimeout(timeoutId);

        if (!response.ok) {
          return {
            ok: false,
            error: `Google Script HTTP ${response.status}`,
          };
        }

        let parsed: any = null;
        try {
          parsed = JSON.parse(responseText);
        } catch {
          return {
            ok: false,
            error: 'Google Script returned non-JSON response',
          };
        }

        return { ok: true, parsed };
      } catch (err: any) {
        clearTimeout(timeoutId);
        return {
          ok: false,
          error: err?.name === 'AbortError' ? 'Timeout waiting for Google Sheets' : (err?.message || 'Network error'),
        };
      }
    };

    // Fast attempt 1 + 1 quick idempotent retry (same exact orderId -> zero duplicates possible)
    let result = await postToGoogleSheet(9500);
    if (!result.ok) {
      await new Promise((r) => setTimeout(r, 300));
      result = await postToGoogleSheet(9500);
    }

    if (!result.ok || !result.parsed) {
      console.error('[submit_order] Google Sheet request failed:', result);
      return res.status(502).json({
        success: false,
        error: result.error || 'Failed to record order in Google Sheet',
      });
    }

    const parsed = result.parsed;
    const status = String(parsed.status || '').toLowerCase();

    // Strictly idempotent: both "success"/"ok" AND "already_exists" mean THIS exact order
    // is safely recorded ONCE in Google Sheets. NEVER generate a new ID or append extra text!
    if (status === 'success' || status === 'ok' || status === 'already_exists') {
      return res.status(200).json({
        success: true,
        verified: true,
        orderNumber: resolvedOrderNumber,
        row: parsed.row,
        duplicatePrevented: status === 'already_exists',
        message: status === 'already_exists'
          ? 'Order already recorded once in Google Sheet'
          : 'Order verified and recorded in Google Sheet',
      });
    }

    console.error('[submit_order] Google Script returned error:', parsed);
    return res.status(502).json({
      success: false,
      error: parsed.error || parsed.message || 'Google Sheet rejected the order',
    });
  } catch (err: any) {
    console.error('Submit order proxy error:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
}
