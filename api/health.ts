export default function handler(req: any, res: any) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    return res.status(405).json({ status: 'error', error: 'Method not allowed' });
  }

  return res.status(200).json({
    status: 'ok',
    contractVersion: '2.0',
    configSource: {
      webhook: process.env.APPS_SCRIPT_WEBHOOK_URL ? 'env' : 'default',
      sheetId: process.env.GOOGLE_SHEET_ID ? 'env' : 'default',
    },
    timestamp: new Date().toISOString(),
  });
}
