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
    const orderData = {
      ...rawBody,
      spreadsheetId: envSheetId || rawBody.spreadsheetId,
    };

    const isRetry = Boolean(orderData.isRetry);
    const webhookUrl = resolveSafeWebhookUrl();

    const postToGoogleSheet = async (payloadObj: any, timeoutMs = 15000) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          redirect: 'follow',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
          },
          body: JSON.stringify(payloadObj),
          signal: controller.signal,
        });

        const responseText = await response.text();
        clearTimeout(timeoutId);

        if (!response.ok) {
          return {
            ok: false,
            httpStatus: response.status,
            error: `Google Script HTTP ${response.status}`,
            raw: responseText.slice(0, 300),
          };
        }

        let parsed: any = null;
        try {
          parsed = JSON.parse(responseText);
        } catch {
          return {
            ok: false,
            httpStatus: response.status,
            error: 'Google Script returned non-JSON response (possible rate limit or script error)',
            raw: responseText.slice(0, 300),
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

    // Attempt 1 (with 1 automatic server-side retry on transient failure/timeout)
    let result = await postToGoogleSheet(orderData, 15000);
    if (!result.ok) {
      await new Promise((r) => setTimeout(r, 700));
      result = await postToGoogleSheet(orderData, 15000);
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
    const resolvedOrderNumber = String(orderData.orderId || (Array.isArray(orderData.row) ? orderData.row[0] : '') || '');

    // Verified written to Google Sheet!
    if (status === 'success' || status === 'ok') {
      return res.status(200).json({
        success: true,
        verified: true,
        orderNumber: resolvedOrderNumber,
        row: parsed.row,
        sheetResult: parsed,
        message: 'Order verified and recorded in Google Sheet',
      });
    }

    // Order ID already exists in sheet:
    // - If this was a retry from the outbox queue, the earlier attempt DID succeed -> confirm success!
    // - If this was a brand new order with an accidental ID collision -> regenerate unique suffix & save!
    if (status === 'already_exists') {
      if (isRetry) {
        return res.status(200).json({
          success: true,
          verified: true,
          orderNumber: resolvedOrderNumber,
          row: parsed.row,
          sheetResult: parsed,
          message: 'Order already recorded on earlier attempt',
        });
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
        return res.status(200).json({
          success: true,
          verified: true,
          orderNumber: newOrderId,
          row: retryRes.parsed.row,
          sheetResult: retryRes.parsed,
          message: 'Order recorded with fresh unique ID',
        });
      }
      return res.status(502).json({
        success: false,
        error: 'Order ID collision retry failed',
        sheetResult: retryRes.parsed || retryRes.error,
      });
    }

    // Legacy Apps Script 5-row same-customer + same-items filter rejected a genuine repeat order!
    // Disambiguate the items cell with the short order code and immediately re-submit so the order is NEVER lost.
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
        return res.status(200).json({
          success: true,
          verified: true,
          orderNumber: resolvedOrderNumber,
          row: retryRes.parsed.row,
          sheetResult: retryRes.parsed,
          message: 'Repeat order disambiguated and recorded in Google Sheet',
        });
      }
      return res.status(502).json({
        success: false,
        error: 'Duplicate-filter bypass retry failed',
        sheetResult: retryRes.parsed || retryRes.error,
      });
    }

    // Any explicit Apps Script error -> NEVER lie and return success: true!
    console.error('[submit_order] Google Script returned error:', parsed);
    return res.status(502).json({
      success: false,
      error: parsed.error || parsed.message || 'Google Sheet rejected the order',
      sheetResult: parsed,
    });
  } catch (err: any) {
    console.error('Submit order proxy error:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
}
