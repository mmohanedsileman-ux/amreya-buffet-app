export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
  }

  try {
    const orderData = req.body;
    if (!orderData) {
      return res.status(400).json({ success: false, error: 'Missing order payload' });
    }

    const webhookUrl = 'https://script.google.com/macros/s/AKfycbyL2B7HxSxaox7qpl4tEX5FIFKK3Xqr6uAFCMER5ZvPv2trUQYFtxrgf_V8Du0pVLBw4A/exec';

    // Forward the order payload to Google Apps Script Webhook with reliable datacenter connection
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: typeof orderData === 'string' ? orderData : JSON.stringify(orderData),
        signal: controller.signal,
      });

      const responseText = await response.text();
      clearTimeout(timeoutId);

      let parsed: any = null;
      try {
        parsed = JSON.parse(responseText);
      } catch {
        parsed = { status: 'success', raw: responseText };
      }

      return res.status(200).json({
        success: true,
        sheetResult: parsed,
        message: 'Order successfully recorded to Google Sheet',
      });
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      console.error('Server proxy fetch to Google Sheet failed:', fetchErr);
      return res.status(500).json({
        success: false,
        error: fetchErr?.message || 'Failed connecting to Google Apps Script',
      });
    }
  } catch (err: any) {
    console.error('Submit order proxy error:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Internal server error',
    });
  }
}
