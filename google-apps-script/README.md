# Google Apps Script — بوفية أسمنت العامرية

هذا المجلد مستقل عن كود الواجهة (`src/`) ومستبعد من بناء TypeScript/Vite (`tsconfig.json`).

## طريقة التحديث اليدوي
1. افتح جوجل شيت ← **Extensions (الإضافات)** ← **Apps Script**.
2. انسخ محتوى `Code.gs` بالكامل وألصقه في المحرر ثم احفظ (`Ctrl+S`).
3. اضغط **Deploy** ← **Manage deployments** ← تعديل النسخة النشطة (أو **New deployment** من نوع **Web app** مع `Execute as: Me` و `Who has access: Anyone`).
4. إذا حصلت على رابط `/exec` جديد، حدّث المتغير `APPS_SCRIPT_WEBHOOK_URL` في إعدادات **Vercel Environment Variables** ثم أعد النشر (Redeploy) بدون تعديل كود الواجهة.

## النشر المستقل عبر `clasp` (المرحلة الثالثة)
```bash
npm install -g @google/clasp
clasp login
cd google-apps-script
clasp clone <YOUR_APPS_SCRIPT_ID>
clasp push
clasp deploy -d "v2 - lock + flush"
```
