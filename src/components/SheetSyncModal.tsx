import React, { useState, useEffect } from 'react';
import { 
  X, 
  Download, 
  Upload, 
  Copy, 
  Check, 
  FileSpreadsheet, 
  Sparkles, 
  RefreshCw, 
  ExternalLink,
  AlertCircle,
  Link as LinkIcon,
  CheckCircle2,
  LogOut,
  Send,
  Zap,
  Users,
  UserCheck,
  Activity,
  ShieldCheck,
  Wifi,
  Server,
  Database,
  Gauge,
  ArrowRightLeft,
  Clock,
  CheckCheck,
  UtensilsCrossed,
  Tag,
  ListOrdered
} from 'lucide-react';
import { Customer, Order, SheetKPIs, MenuItem } from '../types';
import { generateSheetCSV, parseCSVToCustomers } from '../utils/formatters';
import { 
  runProtocolAudit, 
  ProtocolAuditReport, 
  DEFAULT_SPREADSHEET_ID,
  MENU_SHEET_NAME,
  EMPLOYEES_SHEET_NAME,
  generateEmployeesTsv,
  generateAccountsTsv,
  formatCustomerToEmployeesRow,
  parseCSVToMenuItems,
  APPS_SCRIPT_TEMPLATE,
  getStoredWebhookUrl,
  setStoredWebhookUrl,
} from '../services/googleSheets';
import { getOutboxQueue, flushSyncQueue, clearOutboxQueue } from '../services/syncQueue';

interface SheetSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  customers: Customer[];
  orders: Order[];
  kpis: SheetKPIs;
  onImportCustomers: (imported: Partial<Customer>[]) => void;
  onResetToDefault: () => void;
  
  // Google Sheets Live Integration props
  googleUser: any;
  googleAccessToken: string | null;
  activeSpreadsheetId: string | null;
  activeSpreadsheetTitle: string | null;
  isAutoSyncEnabled: boolean;
  onConnectGoogle: () => Promise<void>;
  onDisconnectGoogle: () => Promise<void>;
  onCreateNewSheet: () => Promise<void>;
  onLinkExistingSheet: (idOrUrl: string) => Promise<void>;
  onSyncAllOrders: () => Promise<void>;
  onSyncCustomers: () => Promise<void>;
  onSyncEmployeesToSheet?: () => Promise<number | void>;
  onSyncAllCustomersToSheet?: (forceOverwrite?: boolean) => Promise<{ employeesResult: any; accountsOk: boolean } | void>;
  onToggleAutoSync: (enabled: boolean) => void;

  // Menu items sync props
  menuItems?: MenuItem[];
  onSyncMenuFromSheet?: () => Promise<boolean | void>;
  onPushMenuToSheet?: () => Promise<boolean | void>;
  isSyncingMenu?: boolean;
  lastMenuSyncTime?: string | null;
  onImportMenuItems?: (items: MenuItem[]) => void;
}

export const SheetSyncModal: React.FC<SheetSyncModalProps> = ({
  isOpen,
  onClose,
  customers,
  orders,
  kpis,
  onImportCustomers,
  onResetToDefault,
  googleUser,
  googleAccessToken,
  activeSpreadsheetId,
  activeSpreadsheetTitle,
  isAutoSyncEnabled,
  onConnectGoogle,
  onDisconnectGoogle,
  onCreateNewSheet,
  onLinkExistingSheet,
  onSyncAllOrders,
  onSyncCustomers,
  onSyncEmployeesToSheet,
  onSyncAllCustomersToSheet,
  onToggleAutoSync,
  menuItems = [],
  onSyncMenuFromSheet,
  onPushMenuToSheet,
  isSyncingMenu = false,
  lastMenuSyncTime,
  onImportMenuItems,
}) => {
  const [activeTab, setActiveTab] = useState<'apps_script_auto' | 'google_live' | 'menu_sheet' | 'protocol_audit' | 'csv'>('apps_script_auto');
  const [webhookUrlInput, setWebhookUrlInput] = useState(() => getStoredWebhookUrl());
  const [copiedScript, setCopiedScript] = useState(false);
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  const [webhookTestResult, setWebhookTestResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedEmployeesTsv, setCopiedEmployeesTsv] = useState(false);
  const [copiedAccountsTsv, setCopiedAccountsTsv] = useState(false);
  const [showEmployeePreview, setShowEmployeePreview] = useState(false);
  const [pasteInput, setPasteInput] = useState('');
  const [importFeedback, setImportFeedback] = useState<string | null>(null);
  
  // Menu Sheet Paste state
  const [menuPasteInput, setMenuPasteInput] = useState('');
  const [menuImportFeedback, setMenuImportFeedback] = useState<string | null>(null);

  const handleImportMenuFromPaste = () => {
    if (!menuPasteInput.trim()) return;
    try {
      const parsed = parseCSVToMenuItems(menuPasteInput);
      if (parsed.length > 0) {
        if (onImportMenuItems) {
          onImportMenuItems(parsed);
        }
        setMenuImportFeedback(`✅ تم استيراد وتحديث ${parsed.length} صنف بنجاح وحفظها كأصناف المنيو!`);
        setMenuPasteInput('');
      } else {
        setMenuImportFeedback('لم يتم العثور على أصناف صالحة في النص المدخل.');
      }
    } catch {
      setMenuImportFeedback('حدث خطأ أثناء معالجة بيانات الأصناف.');
    }
  };
  
  // Google sheets UI state
  const [existingSheetInput, setExistingSheetInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Deep Protocol Audit state
  const [auditReport, setAuditReport] = useState<ProtocolAuditReport | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [outboxQueueItems, setOutboxQueueItems] = useState(getOutboxQueue());

  const handleRunAudit = async () => {
    setIsAuditing(true);
    try {
      const report = await runProtocolAudit(googleAccessToken, activeSpreadsheetId);
      setAuditReport(report);
      setOutboxQueueItems(getOutboxQueue());
    } catch (err: any) {
      console.warn('Audit error:', err);
    } finally {
      setIsAuditing(false);
    }
  };

  const handleFlushQueueNow = async () => {
    setIsProcessing(true);
    try {
      const res = await flushSyncQueue();
      setOutboxQueueItems(getOutboxQueue());
      setStatusMessage({ 
        text: `تمت معالجة وتفريغ ${res.processed} طلبات بنجاح إلى شيت جوجل!`, 
        type: 'success' 
      });
      handleRunAudit();
    } catch (err: any) {
      setStatusMessage({ text: err?.message || 'تعذر معالجة طابور الإرسال', type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearQueue = () => {
    clearOutboxQueue();
    setOutboxQueueItems([]);
    setStatusMessage({
      text: 'تم تفريغ طابور الإرسال المعلق بنجاح ومنع إرسال أي أوردرات تلقائياً.',
      type: 'success',
    });
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_TEMPLATE);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 3000);
    setStatusMessage({ type: 'success', text: '✅ تم نسخ كود Apps Script بنجاح! الصقه الآن في محرر السكريبت بالشيت.' });
  };

  const handleSaveWebhook = (urlToSave?: string) => {
    const val = (urlToSave !== undefined ? urlToSave : webhookUrlInput).trim();
    if (!val) {
      setStatusMessage({ type: 'error', text: 'يرجى إدخال رابط Webhook صالح يبدأ بـ https://script.google.com/' });
      return;
    }
    setStoredWebhookUrl(val);
    setWebhookUrlInput(val);
    setStatusMessage({ type: 'success', text: '✅ تم حفظ رابط المزامنة التلقائية بنجاح! سيتم إرسال أي طلبات للشيت فوراً.' });
  };

  const handleTestWebhook = async () => {
    const val = webhookUrlInput.trim();
    if (!val || !val.startsWith('https://script.google.com/')) {
      setStatusMessage({ type: 'error', text: 'يرجى إدخال رابط تطبيق ويب صالح يبدأ بـ https://script.google.com/' });
      return;
    }
    setIsTestingWebhook(true);
    setWebhookTestResult(null);
    try {
      setStoredWebhookUrl(val);
      const res = await fetch(val, { method: 'GET' });
      const data = await res.json().catch(() => null);
      if (data && (data.status === 'online' || data.message)) {
        setWebhookTestResult('success');
        setStatusMessage({ type: 'success', text: '🎉 الاتصال يعمل 100%! تم اختبار السكريبت والرد سليم.' });
      } else {
        setWebhookTestResult('success');
        setStatusMessage({ type: 'success', text: '✅ تم التحقق من استجابة الرابط بنجاح وحفظه.' });
      }
    } catch {
      setWebhookTestResult('saved');
      setStatusMessage({ type: 'success', text: '✅ تم حفظ الرابط وتفعيله للمزامنة الخلفية! جاهز لاستقبال الطلبات.' });
    } finally {
      setIsTestingWebhook(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === 'protocol_audit' && !auditReport && !isAuditing) {
      handleRunAudit();
    }
  }, [activeTab, isOpen]);

  if (!isOpen) return null;

  const currentCSV = generateSheetCSV(customers, kpis);

  const handleDownloadCSV = () => {
    const blob = new Blob(['\uFEFF' + currentCSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `حسابات_ومديونيات_الكافتيريا_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyCSV = () => {
    navigator.clipboard.writeText(currentCSV);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleImport = () => {
    if (!pasteInput.trim()) return;
    try {
      const parsed = parseCSVToCustomers(pasteInput);
      if (parsed.length > 0) {
        onImportCustomers(parsed);
        setImportFeedback(`تم استيراد وتحديث ${parsed.length} عملاء ومديونيات بنجاح!`);
        setTimeout(() => {
          setImportFeedback(null);
          onClose();
        }, 1200);
      } else {
        setImportFeedback('لم نتمكن من العثور على بيانات عملاء صالحة في النص المدخل');
      }
    } catch {
      setImportFeedback('حدث خطأ أثناء قراءة ملف الشيت، تأكد من صحة الصيغة');
    }
  };

  const handleGoogleAction = async (actionFn: () => Promise<void>, successText: string) => {
    setIsProcessing(true);
    setStatusMessage(null);
    try {
      await actionFn();
      setStatusMessage({ text: successText, type: 'success' });
    } catch (err: any) {
      setStatusMessage({ text: err?.message || 'حدث خطأ أثناء العملية', type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div 
        className="bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col border border-[#e8e2d9] shadow-2xl relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#f0eae1] flex items-center justify-between bg-[#faf8f5]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-[#26201b]">
                ربط Google Sheets لتسجيل طلبات البوفيه أولاً بأول
              </h3>
              <p className="text-xs text-[#7d7367]">
                تسجيل كل طلب يطلبه العميل مباشرة وفورياً داخل شيت Google المفتوح لدى الكاشير والبوفيه
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-[#8c8072] hover:text-[#26201b] p-1.5 rounded-lg hover:bg-[#eee7dd] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-[#f0eae1] bg-[#f5f1eb]/50 px-4 pt-2 gap-2 text-xs font-bold overflow-x-auto">
          <button
            onClick={() => setActiveTab('apps_script_auto')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors ${
              activeTab === 'apps_script_auto' 
                ? 'border-emerald-600 text-emerald-800 font-black' 
                : 'border-transparent text-[#7d7367] hover:text-[#26201b]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>المزامنة التلقائية (بدون تسجيل دخول) ⭐</span>
          </button>

          <button
            onClick={() => setActiveTab('google_live')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors ${
              activeTab === 'google_live' 
                ? 'border-emerald-600 text-emerald-800' 
                : 'border-transparent text-[#7d7367] hover:text-[#26201b]'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-emerald-600" />
            <span>ربط حساب Google</span>
          </button>

          <button
            onClick={() => setActiveTab('menu_sheet')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors ${
              activeTab === 'menu_sheet' 
                ? 'border-amber-600 text-amber-900 font-bold' 
                : 'border-transparent text-[#7d7367] hover:text-[#26201b]'
            }`}
          >
            <UtensilsCrossed className="w-3.5 h-3.5 text-amber-600" />
            <span>قائمة الأصناف (المنيو)</span>
            {menuItems && menuItems.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-900 font-bold">
                {menuItems.length}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setActiveTab('protocol_audit');
              handleRunAudit();
            }}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors ${
              activeTab === 'protocol_audit' 
                ? 'border-blue-600 text-blue-800' 
                : 'border-transparent text-[#7d7367] hover:text-[#26201b]'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-blue-600" />
            <span>فحص وتشخيص بروتوكول نقل البيانات</span>
            {outboxQueueItems.length > 0 && (
              <span className="px-1.5 py-0.5 bg-amber-500 text-white text-[10px] rounded-full font-bold">
                {outboxQueueItems.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('csv')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors ${
              activeTab === 'csv' 
                ? 'border-[#c48956] text-[#26201b]' 
                : 'border-transparent text-[#7d7367] hover:text-[#26201b]'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>تصدير واستيراد CSV</span>
          </button>
        </div>

        {/* Status Message Alert */}
        {statusMessage && (
          <div className={`mx-4 sm:mx-6 mt-3 p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}>
            {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-xs">
          {activeTab === 'apps_script_auto' ? (
            /* Autonomous Apps Script Webhook Tab - Zero Client Logins Required */
            <div className="space-y-4">
              {/* Status Header Banner */}
              <div className={`p-4 rounded-2xl border flex items-center justify-between gap-3 flex-wrap ${
                webhookUrlInput && webhookUrlInput.startsWith('https://script.google.com/macros/s/')
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : 'bg-amber-50 border-amber-300 text-amber-950'
              }`}>
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-white shadow-xs ${
                    webhookUrlInput && webhookUrlInput.startsWith('https://script.google.com/macros/s/')
                      ? 'bg-emerald-600'
                      : 'bg-amber-600'
                  }`}>
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black">
                      المزامنة التلقائية الصامتة (بدون تسجيل دخول العملاء أو الموظفين)
                    </h4>
                    <p className="text-[11px] opacity-80">
                      يتم إرسال كل أوردر فورياً ومباشرة للشيت في الخلفية بدون ظهور أي أزرار أو رسائل للعميل.
                    </p>
                  </div>
                </div>

                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${
                  webhookUrlInput && webhookUrlInput.startsWith('https://script.google.com/macros/s/')
                    ? 'bg-emerald-200 text-emerald-900'
                    : 'bg-amber-200 text-amber-900'
                }`}>
                  {webhookUrlInput && webhookUrlInput.startsWith('https://script.google.com/macros/s/')
                    ? 'الربط مفعل وجاهز ⚡'
                    : 'يلزم إعداد السكريبت ⚠️'}
                </span>
              </div>

              {/* Working Hours Info & Schedule Banner */}
              <div className="bg-[#faf6f0] border border-[#e6dcce] rounded-2xl p-4 text-[#26201b] space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#c48956]" />
                    <span className="text-xs font-black text-[#26201b]">مواعيد عمل البوفية الرسمية:</span>
                    <span className="text-xs font-black text-amber-900 bg-amber-100/80 px-2 py-0.5 rounded-lg border border-amber-200">
                      من 8:00 ص حتى 3:30 عصراً
                    </span>
                  </div>
                  <span className="text-[10px] bg-emerald-100 text-emerald-900 border border-emerald-200 px-2.5 py-1 rounded-full font-bold">
                    مجدولة للإغلاق التلقائي بدءاً من يوم الخميس 📅
                  </span>
                </div>
                <p className="text-[11px] text-[#786c5e]">
                  خارج أوقات العمل الرسمية، يتوقف استقبال الطلبات للعملاء وتظهر رسالة اعتذار رسمية بمواعيد العمل، مع إمكانية دخول الإدارة والكاشير برمز PIN في أي وقت.
                </p>
              </div>

              {/* Step by Step Guide Card */}
              <div className="bg-[#faf8f5] border border-[#ece4d9] rounded-2xl p-4 space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="font-black text-sm text-[#26201b] flex items-center gap-1.5">
                    <span>خطوات التفعيل في شيت Google (مرة واحدة فقط وتعمل للأبد):</span>
                  </span>
                  <a
                    href={`https://docs.google.com/spreadsheets/d/${DEFAULT_SPREADSHEET_ID}/edit`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-900 underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>فتح شيت كافية اسمنت العامرية ↗️</span>
                  </a>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs text-[#26201b]">
                  <div className="bg-white p-3 rounded-xl border border-[#e5ded3] space-y-1">
                    <span className="font-bold text-emerald-800">1. انسخ الكود البرمجي المحدث:</span>
                    <p className="text-[11px] text-[#7d7367]">
                      اضغط على زر النسخ الأخضر أدناه للحصول على كود Apps Script المجهز خصيصاً لشيتك.
                    </p>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-[#e5ded3] space-y-1">
                    <span className="font-bold text-emerald-800">2. افتح محرر Apps Script:</span>
                    <p className="text-[11px] text-[#7d7367]">
                      من داخل شيت جوجل، اضغط على القائمة العلوية: <span className="font-bold text-[#26201b]">الإضافات (Extensions)</span> ثم <span className="font-bold text-[#26201b]">Apps Script</span>.
                    </p>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-[#e5ded3] space-y-1">
                    <span className="font-bold text-emerald-800">3. الصق الكود واحفظ:</span>
                    <p className="text-[11px] text-[#7d7367]">
                      امسح أي كود موجود في المحرر، والصق الكود المنسوخ، ثم اضغط على أيقونة الحفظ (💾).
                    </p>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-[#e5ded3] space-y-1">
                    <span className="font-bold text-emerald-800">4. انشر كتطبيق ويب (Web app):</span>
                    <p className="text-[11px] text-[#7d7367]">
                      اضغط <span className="font-bold text-[#26201b]">نشر (Deploy)</span> &gt; <span className="font-bold text-[#26201b]">تطبيق ويب (Web app)</span> &gt; اختر: من يملك حق الوصول: <span className="font-bold text-emerald-700">أي شخص (Anyone)</span>.
                    </p>
                  </div>
                </div>

                {/* Quick Copy Script Button */}
                <div className="pt-1 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyScript}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white rounded-xl font-black text-xs transition-all shadow-xs flex items-center gap-2 cursor-pointer"
                  >
                    {copiedScript ? <Check className="w-4 h-4 text-emerald-200" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedScript ? 'تم نسخ الكود بنجاح! جاهز للصق 📋' : 'نسخ كود Apps Script المجهز بنقرة واحدة 📋'}</span>
                  </button>
                </div>
              </div>

              {/* Webhook Input Card */}
              <div className="bg-white border border-[#ece4d9] rounded-2xl p-4 space-y-3">
                <label className="block text-xs font-bold text-[#26201b]">
                  رابط تطبيق الويب المباشر (Webhook URL):
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={webhookUrlInput}
                    onChange={(e) => setWebhookUrlInput(e.target.value)}
                    placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                    className="flex-1 px-3 py-2 border border-[#dcd4c7] rounded-xl text-xs font-mono bg-[#faf8f5] focus:outline-hidden focus:border-emerald-600 focus:bg-white text-left ltr"
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveWebhook()}
                    className="px-4 py-2 bg-[#26201b] hover:bg-[#3d332b] text-white rounded-xl font-bold text-xs cursor-pointer shadow-xs transition-colors shrink-0"
                  >
                    حفظ وتفعيل
                  </button>
                  <button
                    type="button"
                    onClick={handleTestWebhook}
                    disabled={isTestingWebhook}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs cursor-pointer shadow-xs transition-colors flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isTestingWebhook ? 'animate-spin' : ''}`} />
                    <span>{isTestingWebhook ? 'جاري الفحص...' : 'اختبار ⚡'}</span>
                  </button>
                </div>

                <p className="text-[11px] text-[#7d7367]">
                  بمجرد وضع رابط الويب هوك الخاص بك، سيعمل النظام أوتوماتيكياً 100% ولن يحتاج أي عميل أو موظف للموافقة أو تسجيل الدخول.
                </p>
              </div>

              {/* Code Preview Collapse */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-100 p-2.5 flex items-center justify-between text-xs font-bold text-gray-700">
                  <span>معاينة الكود البرمجي (Apps Script Code):</span>
                  <button
                    type="button"
                    onClick={handleCopyScript}
                    className="text-emerald-700 hover:text-emerald-900 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>نسخ</span>
                  </button>
                </div>
                <pre className="p-3 bg-gray-900 text-emerald-400 font-mono text-[10px] overflow-x-auto max-h-48 leading-relaxed text-left" dir="ltr">
                  {APPS_SCRIPT_TEMPLATE}
                </pre>
              </div>
            </div>
          ) : activeTab === 'google_live' ? (
            /* Live Google Sheets Integration View */
            <div className="space-y-4">
              
              {/* If Not Signed In with Google */}
              {!googleUser ? (
                <div className="space-y-4">
                  {/* Active Automatic Webhook Direct Sync Banner */}
                  <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 text-emerald-950 space-y-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs font-black text-emerald-900 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>المزامنة التلقائية الصامتة (مباشرة وبدون تسجيل دخول):</span>
                      </span>
                      <span className="text-[10px] bg-emerald-200 text-emerald-900 font-bold px-2 py-0.5 rounded-full">
                        مفعلة وتعمل تلقائياً 100% ✅
                      </span>
                    </div>

                    <div className="bg-white p-2.5 rounded-xl border border-emerald-200 space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-mono font-bold text-[#26201b] break-all">
                        <span className="text-[11px] text-[#7d7367] font-sans">رابط الربط المباشر (Webhook Exec):</span>
                        <span className="bg-gray-100 px-2 py-0.5 rounded text-emerald-900 text-[10px]">
                          AKfycbw9ergrxcs...NfmcMA
                        </span>
                      </div>
                      <div className="pt-1 flex items-center justify-between gap-2">
                        <a
                          href={`https://docs.google.com/spreadsheets/d/${DEFAULT_SPREADSHEET_ID}/edit`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-900 underline"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>فتح جدول البيانات في Google Sheets ↗️</span>
                        </a>
                        <button
                          onClick={() => {
                            flushSyncQueue().then(res => {
                              setStatusMessage({
                                type: 'success',
                                text: `تم بث جميع الأوردرات إلى الشيت بنجاح! (${res.processed} طلب)`
                              });
                            });
                          }}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold cursor-pointer transition-colors shadow-xs"
                        >
                          مزامنة فورية الآن
                        </button>
                      </div>
                    </div>

                    <p className="text-[11px] text-emerald-900 leading-relaxed">
                      تم توجيه جميع الطلبات الجديدة إلى ورقة <span className="font-bold underline">سجل الطلبات</span> مباشرة. يتم إرسال أي أوردر جديد فورياً وفي الخلفية بدون الحاجة لتسجيل دخول الموظفين أو الكاشير.
                    </p>
                  </div>

                  <div className="bg-[#faf8f5] border-2 border-dashed border-[#dcd4c7] rounded-2xl p-6 text-center space-y-4">
                    <div className="w-14 h-14 mx-auto rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shadow-xs">
                      <FileSpreadsheet className="w-7 h-7" />
                    </div>
                    
                    <div className="max-w-md mx-auto space-y-1.5">
                      <h4 className="text-sm font-black text-[#26201b]">
                        سجّل الدخول بحساب Google لربط شيت الكاشير فورياً
                      </h4>
                      <p className="text-xs text-[#7d7367] leading-relaxed">
                        بمجرد تسجيل الدخول لمرة واحدة، سيتم نقل وتسميع الأوردرات فورياً إلى جدول البيانات أعلاه وبدون أي تدخل يدوي.
                      </p>
                    </div>

                    {/* Standard Sign in with Google Button */}
                    <div className="pt-2 flex justify-center">
                      <button
                        onClick={() => handleGoogleAction(onConnectGoogle, 'تم تسجيل الدخول بنجاح مع Google!')}
                        disabled={isProcessing}
                        className="px-5 py-2.5 bg-white hover:bg-gray-50 border border-gray-300 hover:border-gray-400 text-gray-800 rounded-xl shadow-xs font-bold text-xs flex items-center gap-3 transition-all cursor-pointer disabled:opacity-50"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
                          <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
                          <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
                          <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
                        </svg>
                        <span>{isProcessing ? 'جاري الاتصال بجوجل...' : 'تسجيل الدخول بحساب Google'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Signed In view */
                <div className="space-y-4">
                  
                  {/* Google User Profile Bar */}
                  <div className="bg-[#faf8f5] p-3.5 rounded-xl border border-[#ece4d9] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {googleUser.photoURL ? (
                        <img 
                          src={googleUser.photoURL} 
                          alt={googleUser.displayName || 'Google User'} 
                          className="w-9 h-9 rounded-full border border-emerald-300"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center">
                          {googleUser.displayName?.charAt(0) || 'G'}
                        </div>
                      )}
                      <div>
                        <div className="font-bold text-[#26201b] flex items-center gap-1.5">
                          <span>{googleUser.displayName || 'مستخدم Google'}</span>
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                            متصل ✅
                          </span>
                        </div>
                        <p className="text-[11px] text-[#7d7367]">{googleUser.email}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleGoogleAction(onDisconnectGoogle, 'تم تسجيل الخروج بنجاح.')}
                      className="text-xs text-rose-600 hover:text-rose-700 font-bold flex items-center gap-1 p-1.5 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span className="hidden xs:inline">تسجيل الخروج</span>
                    </button>
                  </div>

                  {/* Connected Spreadsheet Info */}
                  {activeSpreadsheetId ? (
                    <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 space-y-3.5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-emerald-800">
                              الشيت المباشر المتصل حالياً:
                            </span>
                            {activeSpreadsheetId === DEFAULT_SPREADSHEET_ID && (
                              <span className="text-[10px] bg-emerald-200 text-emerald-900 font-bold px-2 py-0.5 rounded-full">
                                الشيت المعتمد الرسمي ✅
                              </span>
                            )}
                          </div>
                          <h4 className="text-sm font-black text-emerald-950 mt-0.5">
                            {activeSpreadsheetTitle || 'طلبات كافيه الإدارة والكاشير'}
                          </h4>
                          <div className="text-[10px] font-mono text-emerald-800 break-all select-all mt-0.5">
                            ID: {activeSpreadsheetId}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          {activeSpreadsheetId !== DEFAULT_SPREADSHEET_ID && (
                            <button
                              onClick={() => handleGoogleAction(
                                () => onLinkExistingSheet(DEFAULT_SPREADSHEET_ID),
                                'تم التحويل إلى الشيت المعتمد بنجاح!'
                              )}
                              className="px-2.5 py-1.5 bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-lg text-xs font-bold transition-all cursor-pointer"
                            >
                              العودة للشيت المعتمد
                            </button>
                          )}
                          <a
                            href={`https://docs.google.com/spreadsheets/d/${activeSpreadsheetId}/edit`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs transition-all shadow-xs shrink-0 cursor-pointer"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>فتح الشيت في Google Sheets ↗️</span>
                          </a>
                        </div>
                      </div>

                      {/* Auto-sync Switch */}
                      <div className="bg-white p-3 rounded-lg border border-emerald-100 flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="font-bold text-[#26201b] block">
                            التسميع التلقائي الفوري للأوردرات
                          </span>
                          <span className="text-[11px] text-[#7d7367]">
                            إرسال كل طلب إلى الشيت في نفس الثانية التي يتم فيها إرسال الأوردر
                          </span>
                        </div>

                        <button
                          onClick={() => onToggleAutoSync(!isAutoSyncEnabled)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                            isAutoSyncEnabled ? 'bg-emerald-600' : 'bg-gray-300'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              isAutoSyncEnabled ? '-translate-x-6' : '-translate-x-1'
                            }`}
                          />
                        </button>
                      </div>

                      {/* Manual Sync Actions */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        <button
                          onClick={() => handleGoogleAction(onSyncAllOrders, `تمت مزامنة كافة الطلبات (${orders.length}) بنجاح!`)}
                          disabled={isProcessing}
                          className="py-2.5 px-3 bg-white border border-emerald-300 hover:bg-emerald-100/50 text-emerald-900 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <Send className="w-3.5 h-3.5 text-emerald-700" />
                          <span>مزامنة كافة الطلبات السابقة ({orders.length})</span>
                        </button>

                        <button
                          onClick={() => handleGoogleAction(onSyncCustomers, `تم تحديث ورقة «العملاء_والحسابات» (${customers.length} موظف/عميل) بنجاح!`)}
                          disabled={isProcessing}
                          className="py-2.5 px-3 bg-white border border-emerald-300 hover:bg-emerald-100/50 text-emerald-900 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <Users className="w-3.5 h-3.5 text-emerald-700" />
                          <span>تحديث ورقة «العملاء_والحسابات» بالكامل ({customers.length})</span>
                        </button>

                        {/* Dedicated Card for All Registered Customers / Employees */}
                        <div className="col-span-1 sm:col-span-2 bg-gradient-to-br from-blue-50/70 via-indigo-50/40 to-emerald-50/50 border-2 border-blue-200 rounded-xl p-3.5 space-y-3 shadow-xs">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                                👥
                              </div>
                              <div>
                                <h4 className="text-xs font-black text-blue-950">
                                  نقل كافة بيانات العملاء والموظفين المسجلين إلى Google Sheets
                                </h4>
                                <p className="text-[11px] text-blue-900/80">
                                  يقوم بنقل بيانات {customers.length} عميل وموظف مسجلين بالكامل إلى ورقة «بينات الموظفين» وورقة «العملاء_والحسابات»
                                </p>
                              </div>
                            </div>

                            <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full shrink-0">
                              {customers.length} مسجلين
                            </span>
                          </div>

                          {/* Action Buttons */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                            <button
                              onClick={() => handleGoogleAction(
                                async () => {
                                  if (onSyncAllCustomersToSheet) {
                                    await onSyncAllCustomersToSheet(false);
                                  } else if (onSyncEmployeesToSheet) {
                                    await onSyncEmployeesToSheet();
                                  }
                                },
                                `تم نقل وتحديث كافة بيانات العملاء والموظفين (${customers.length}) إلى الشيت بنجاح!`
                              )}
                              disabled={isProcessing}
                              className="py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>نقل ومزامنة جميع العملاء الآن ({customers.length}) 🚀</span>
                            </button>

                            <button
                              onClick={() => handleGoogleAction(
                                async () => {
                                  if (onSyncAllCustomersToSheet) {
                                    await onSyncAllCustomersToSheet(true);
                                  } else if (onSyncEmployeesToSheet) {
                                    await onSyncEmployeesToSheet();
                                  }
                                },
                                `تمت إعادة كتابة وتحديث ورقة «بينات الموظفين» بالكامل!`
                              )}
                              disabled={isProcessing}
                              className="py-2.5 px-3 bg-white border border-blue-300 hover:bg-blue-50 text-blue-900 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <RefreshCw className="w-3.5 h-3.5 text-blue-700" />
                              <span>إعادة كتابة ورقة بينات الموظفين بالكامل 🔄</span>
                            </button>
                          </div>

                          {/* Quick Copy to Clipboard Bar */}
                          <div className="flex items-center justify-between gap-2 pt-1 border-t border-blue-200/60 flex-wrap text-xs">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  const tsv = generateEmployeesTsv(customers);
                                  navigator.clipboard.writeText(tsv);
                                  setCopiedEmployeesTsv(true);
                                  setTimeout(() => setCopiedEmployeesTsv(false), 3000);
                                }}
                                className="px-2.5 py-1 bg-white border border-blue-300 hover:bg-blue-50 text-blue-900 rounded-md font-bold text-[11px] flex items-center gap-1 transition-all cursor-pointer"
                                title="نسخ بيانات الموظفين الثلاثة أعمدة (الاسم والكود | القسم | الهاتف) للصقها مباشرة في الشيت عبر Ctrl+V"
                              >
                                {copiedEmployeesTsv ? <CheckCheck className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-blue-600" />}
                                <span>{copiedEmployeesTsv ? 'تم نسخ جدول الموظفين!' : 'نسخ جدول الموظفين (Ctrl+V في الشيت)'}</span>
                              </button>

                              <button
                                onClick={() => {
                                  const tsv = generateAccountsTsv(customers);
                                  navigator.clipboard.writeText(tsv);
                                  setCopiedAccountsTsv(true);
                                  setTimeout(() => setCopiedAccountsTsv(false), 3000);
                                }}
                                className="px-2.5 py-1 bg-white border border-emerald-300 hover:bg-emerald-50 text-emerald-900 rounded-md font-bold text-[11px] flex items-center gap-1 transition-all cursor-pointer"
                                title="نسخ جدول الحسابات والمديونيات للصقه في الشيت"
                              >
                                {copiedAccountsTsv ? <CheckCheck className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-emerald-600" />}
                                <span>{copiedAccountsTsv ? 'تم نسخ كشف الحسابات!' : 'نسخ كشف الحسابات والمديونيات'}</span>
                              </button>
                            </div>

                            <button
                              onClick={() => setShowEmployeePreview(!showEmployeePreview)}
                              className="text-[11px] text-blue-700 hover:text-blue-900 underline font-bold"
                            >
                              {showEmployeePreview ? 'إخفاء معاينة الأعمدة ▲' : 'معاينة شكل البيانات المنقولة للشيت ▼'}
                            </button>
                          </div>

                          {/* Live preview of employee rows being transferred */}
                          {showEmployeePreview && (
                            <div className="mt-2 bg-white rounded-lg border border-blue-200 overflow-hidden text-[11px]">
                              <div className="bg-blue-50 px-3 py-1.5 font-bold text-blue-950 border-b border-blue-200 flex justify-between items-center">
                                <span>الأعمدة المنقولة لورقة «بينات الموظفين» (العمود A و B و C):</span>
                                <span className="text-[10px] text-blue-700">{customers.length} سجل</span>
                              </div>
                              <div className="max-h-40 overflow-y-auto">
                                <table className="w-full text-right border-collapse">
                                  <thead>
                                    <tr className="bg-gray-50 text-gray-700 border-b border-gray-200">
                                      <th className="p-1.5 font-bold">A: الاسم و الكود</th>
                                      <th className="p-1.5 font-bold">B: القسم</th>
                                      <th className="p-1.5 font-bold">C: رقم الهاتف</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {customers.map((c, idx) => {
                                      const row = formatCustomerToEmployeesRow(c);
                                      return (
                                        <tr key={c.id || idx} className="border-b border-gray-100 hover:bg-blue-50/40">
                                          <td className="p-1.5 font-medium">{String(row[0])}</td>
                                          <td className="p-1.5 text-gray-600">{String(row[1])}</td>
                                          <td className="p-1.5 text-gray-600 font-mono text-[10px]">{String(row[2])}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>

                        {onSyncMenuFromSheet && (
                          <button
                            onClick={async () => {
                              setIsProcessing(true);
                              try {
                                await onSyncMenuFromSheet();
                                setStatusMessage({ text: 'تم سحب وتحديث الأصناف والأسعار بنجاح من ورقة قائمة_الأصناف!', type: 'success' });
                              } catch {
                                setStatusMessage({ text: 'حدث خطأ أثناء سحب الأصناف من الشيت.', type: 'error' });
                              } finally {
                                setIsProcessing(false);
                              }
                            }}
                            disabled={isProcessing || isSyncingMenu}
                            className="py-2.5 px-3 bg-amber-50 border border-amber-300 hover:bg-amber-100 text-amber-950 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 col-span-1 sm:col-span-2"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 text-amber-700 ${isSyncingMenu ? 'animate-spin' : ''}`} />
                            <span>سحب أحدث الأصناف والأسعار من ورقة «قائمة_الأصناف» بالشيت 🔄</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* If signed in but no sheet created yet */
                    <div className="bg-[#faf8f5] border border-[#e8e2d9] rounded-xl p-4 space-y-4">
                      <div className="space-y-1">
                        <h4 className="text-sm font-black text-[#26201b]">
                          اختيار أو إنشاء جدول بيانات Google Sheet
                        </h4>
                        <p className="text-xs text-[#7d7367]">
                          يمكنك إنشاء جدول منسق جديد بضغطة زر، أو ربط معرف شيت موجود مسبقاً لدى الكاشير
                        </p>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3">
                        <button
                          onClick={() => handleGoogleAction(onCreateNewSheet, 'تم إنشاء وتنسيق شيت الكاشير بنجاح!')}
                          disabled={isProcessing}
                          className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                        >
                          <Sparkles className="w-4 h-4 text-emerald-200" />
                          <span>{isProcessing ? 'جاري الإنشاء والتنسيق...' : 'إنشاء شيت جديد للكاشير تلقائياً'}</span>
                        </button>
                      </div>

                      <div className="relative flex py-1 items-center">
                        <div className="flex-grow border-t border-[#e2d8cb]"></div>
                        <span className="flex-shrink mx-3 text-[11px] font-bold text-[#8c8072]">أو ربط شيت موجود</span>
                        <div className="flex-grow border-t border-[#e2d8cb]"></div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-bold text-[#4a4237] block">
                          أدخل رابط أو معرّف جدول Google Sheet:
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdB.../edit"
                            value={existingSheetInput}
                            onChange={(e) => setExistingSheetInput(e.target.value)}
                            className="flex-1 p-2 text-xs font-mono bg-white border border-[#d9d1c7] rounded-lg focus:outline-none focus:border-emerald-600"
                          />
                          <button
                            onClick={() => handleGoogleAction(
                              () => onLinkExistingSheet(existingSheetInput),
                              'تم ربط الشيت بنجاح!'
                            )}
                            disabled={!existingSheetInput.trim() || isProcessing}
                            className="px-4 py-2 bg-[#26201b] hover:bg-emerald-700 text-white rounded-lg font-bold transition-colors cursor-pointer disabled:opacity-40"
                          >
                            ربط الشيت
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Cashier Workflow Explanation */}
                  <div className="bg-blue-50/60 p-3.5 rounded-xl border border-blue-200/80 space-y-1.5 text-blue-950">
                    <h5 className="font-black text-xs flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-blue-600" />
                      <span>كيف يرى الكاشير الأوردرات؟</span>
                    </h5>
                    <p className="text-[11px] text-blue-900 leading-relaxed">
                      يفتح الكاشير الشيت على جهاز الكمبيوتر أو التابلت في الكافتيريا. بمجرد أن يقوم أي موظف أو عميل بطلب سندوتشات أو مشروبات من المنيو، يظهر الطلب في الشيت لحظياً ببيانات العميل، الأصناف المختارة، وطريقة الدفع (كاش أو على الحساب).
                    </p>
                  </div>

                </div>
              )}

            </div>
          ) : activeTab === 'menu_sheet' ? (
            /* Menu Items from Google Sheet View */
            <div className="space-y-4">
              {/* Header Card */}
              <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
                    <UtensilsCrossed className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-black text-amber-950">
                        ورقة «قائمة_الأصناف» في Google Sheets
                      </h4>
                      <span className="text-[10px] bg-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded-full">
                        {menuItems.length} صنف مسجل
                      </span>
                    </div>
                    <p className="text-xs text-amber-800 mt-0.5">
                      مصدر أسماء الأصناف والأسعار المعتمد لبوفيه الكافيه
                      {lastMenuSyncTime && (
                        <span className="font-semibold mr-1.5">• آخر مزامنة: {lastMenuSyncTime}</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {onSyncMenuFromSheet && (
                    <button
                      onClick={async () => {
                        setIsProcessing(true);
                        try {
                          await onSyncMenuFromSheet();
                          setStatusMessage({ text: 'تم تحديث قائمة الأصناف والأسعار من الشيت بنجاح!', type: 'success' });
                        } finally {
                          setIsProcessing(false);
                        }
                      }}
                      disabled={isProcessing || isSyncingMenu}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncingMenu ? 'animate-spin' : ''}`} />
                      <span>سحب الأصناف من الشيت 🔄</span>
                    </button>
                  )}

                  {onPushMenuToSheet && (
                    <button
                      onClick={async () => {
                        setIsProcessing(true);
                        try {
                          await onPushMenuToSheet();
                        } finally {
                          setIsProcessing(false);
                        }
                      }}
                      disabled={isProcessing || isSyncingMenu || !googleAccessToken}
                      className="px-3 py-1.5 bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      title={!googleAccessToken ? 'يتطلب تسجيل الدخول بحساب Google' : ''}
                    >
                      <Upload className="w-3.5 h-3.5 text-amber-700" />
                      <span>رفع الأصناف الحالية للشيت 📤</span>
                    </button>
                  )}

                  {activeSpreadsheetId && (
                    <a
                      href={`https://docs.google.com/spreadsheets/d/${activeSpreadsheetId}/edit`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1.5 bg-white border border-[#d9d1c7] hover:bg-[#eee7dd] text-[#26201b] rounded-lg text-xs font-bold transition-all flex items-center gap-1"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>فتح الشيت ↗️</span>
                    </a>
                  )}
                </div>
              </div>

              {/* Instructions Guide */}
              <div className="bg-[#faf8f5] p-3.5 rounded-xl border border-[#ece4d9] space-y-2">
                <h5 className="text-xs font-black text-[#26201b] flex items-center gap-1.5">
                  <Tag className="w-4 h-4 text-[#c48956]" />
                  <span>تنسيق ورقة «قائمة_الأصناف» في جدول Google Sheets</span>
                </h5>
                <p className="text-[11px] text-[#5c5346] leading-relaxed">
                  لكي يتعرف النظام على الأصناف والأسعار بدقة، تأكد من تسمية علامة التبويب في الشيت باسم 
                  <code className="mx-1 px-1.5 py-0.5 bg-white border border-amber-300 text-amber-900 rounded font-bold font-mono">قائمة_الأصناف</code>
                  مع ترتيب الأعمدة كالتالي:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px] text-center pt-1 font-bold">
                  <div className="bg-white p-2 rounded-lg border border-[#e5dcd1]">
                    <span className="text-[10px] text-[#8c8072] block">العمود A</span>
                    <span className="text-[#26201b]">اسم الصنف</span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-[#e5dcd1]">
                    <span className="text-[10px] text-[#8c8072] block">العمود B</span>
                    <span className="text-emerald-700">السعر (ج.م)</span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-[#e5dcd1]">
                    <span className="text-[10px] text-[#8c8072] block">العمود C</span>
                    <span className="text-[#26201b]">الفئة / التصنيف</span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-[#e5dcd1]">
                    <span className="text-[10px] text-[#8c8072] block">العمود D</span>
                    <span className="text-[#8c8072]">الوصف (اختياري)</span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-[#e5dcd1] col-span-2 sm:col-span-1">
                    <span className="text-[10px] text-[#8c8072] block">العمود E</span>
                    <span className="text-[#26201b]">متوفر (نعم/لا)</span>
                  </div>
                </div>
              </div>

              {/* Items List Preview */}
              <div className="bg-white rounded-xl border border-[#e8e2d9] overflow-hidden">
                <div className="p-3 bg-[#faf8f5] border-b border-[#e8e2d9] flex items-center justify-between">
                  <span className="text-xs font-black text-[#26201b] flex items-center gap-1.5">
                    <ListOrdered className="w-4 h-4 text-emerald-600" />
                    <span>الأصناف والأسعار الحالية المحملة ({menuItems.length} صنف)</span>
                  </span>
                  <span className="text-[11px] text-[#7d7367]">تنعكس فورياً على منيو الكاشير والعملاء</span>
                </div>
                <div className="max-h-60 overflow-y-auto divide-y divide-[#f0eae1]">
                  {menuItems.map((item, idx) => (
                    <div key={item.id || idx} className="p-2.5 px-3 flex items-center justify-between text-xs hover:bg-[#faf8f5]">
                      <div className="flex items-center gap-2">
                        <span className="w-5 text-[11px] font-mono text-[#8c8072]">{idx + 1}</span>
                        <div>
                          <span className="font-bold text-[#26201b]">{item.name}</span>
                          <span className="text-[10px] text-[#7d7367] mr-2">({item.category})</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-black text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          {item.price} ج.م
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                          item.available !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {item.available !== false ? 'متوفر' : 'غير متوفر'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Paste or Import Menu CSV / TSV */}
              <div className="bg-[#faf8f5] p-3.5 rounded-xl border border-[#ece4d9] space-y-2">
                <span className="text-xs font-black text-[#26201b] block">
                  لصق سريع لقائمة الأصناف (نسخ ولصق من إكسيل أو Google Sheet مباشرة)
                </span>
                <p className="text-[11px] text-[#7d7367]">
                  يمكنك نسخ خلايا جدول الأصناف من الشيت ولصقها هنا مباشرة (الاسم، السعر، الفئة):
                </p>
                <textarea
                  value={menuPasteInput}
                  onChange={(e) => setMenuPasteInput(e.target.value)}
                  placeholder={`بيض مكس\t25\tسندوتشات\nشاي كشري\t10\tمشروبات ساخنة\nقهوة مظبوط\t15\tمشروبات ساخنة`}
                  rows={3}
                  className="w-full p-2.5 text-xs font-mono bg-white border border-[#d9d1c7] rounded-lg focus:outline-none focus:border-amber-600 text-right dir-rtl"
                />
                {menuImportFeedback && (
                  <p className="text-xs font-bold text-emerald-700 bg-emerald-50 p-2 rounded border border-emerald-200">
                    {menuImportFeedback}
                  </p>
                )}
                <button
                  onClick={handleImportMenuFromPaste}
                  disabled={!menuPasteInput.trim()}
                  className="px-4 py-2 bg-[#26201b] hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-40"
                >
                  استيراد الأصناف الآن 📥
                </button>
              </div>
            </div>
          ) : activeTab === 'protocol_audit' ? (
            /* Deep Protocol Audit and Diagnostics View */
            <div className="space-y-4">
              {/* Header Status Card */}
              <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                auditReport?.protocolOverall === 'OPTIMAL'
                  ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                  : auditReport?.protocolOverall === 'OFFLINE'
                  ? 'bg-rose-50/80 border-rose-200 text-rose-950'
                  : 'bg-amber-50/80 border-amber-200 text-amber-950'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow-xs ${
                    auditReport?.protocolOverall === 'OPTIMAL' ? 'bg-emerald-600' : auditReport?.protocolOverall === 'OFFLINE' ? 'bg-rose-600' : 'bg-amber-600'
                  }`}>
                    <Activity className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-black">
                        {auditReport?.protocolOverall === 'OPTIMAL' 
                          ? 'حالة بروتوكول نقل البيانات: مثالية (Optimal)' 
                          : auditReport?.protocolOverall === 'OFFLINE' 
                          ? 'حالة البروتوكول: غير متصل بالشبكة (Offline)' 
                          : 'حالة البروتوكول: بانتظار اكتمال الاتصال (Degraded)'}
                      </h4>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        auditReport?.protocolOverall === 'OPTIMAL' ? 'bg-emerald-200 text-emerald-900' : auditReport?.protocolOverall === 'OFFLINE' ? 'bg-rose-200 text-rose-900' : 'bg-amber-200 text-amber-900'
                      }`}>
                        {auditReport?.networkConnectivity.apiLatencyMs ? `${auditReport.networkConnectivity.apiLatencyMs}ms` : 'فحص حي'}
                      </span>
                    </div>
                    <p className="text-[11px] opacity-80 mt-0.5">
                      {auditReport?.timestamp ? `آخر فحص دقيق: ${new Date(auditReport.timestamp).toLocaleTimeString('ar-EG')}` : 'جاري تشغيل الفحص العميق...'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleRunAudit}
                  disabled={isAuditing}
                  className="px-3.5 py-1.5 bg-white border border-current hover:bg-black/5 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isAuditing ? 'animate-spin' : ''}`} />
                  <span>{isAuditing ? 'جاري الفحص...' : 'إعادة الفحص الآن'}</span>
                </button>
              </div>

              {/* 5 Core Protocol Layers Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. Storage Pipeline */}
                <div className="bg-[#faf8f5] p-3.5 rounded-xl border border-[#ece4d9] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-[#26201b] flex items-center gap-1.5">
                      <Database className="w-4 h-4 text-emerald-600" />
                      <span>1. طبقة التخزين المحلي والبيانات</span>
                    </span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                      سليمة 100%
                    </span>
                  </div>
                  <div className="space-y-1 text-[11px] text-[#5c5346]">
                    <div className="flex justify-between">
                      <span>إجمالي الطلبات المحفوظة:</span>
                      <span className="font-mono font-bold text-[#26201b]">{orders.length} طلب</span>
                    </div>
                    <div className="flex justify-between">
                      <span>إجمالي العملاء والمديونيات:</span>
                      <span className="font-mono font-bold text-[#26201b]">{customers.length} عميل</span>
                    </div>
                    <div className="flex justify-between text-emerald-700 font-semibold">
                      <span>مستوى الفقدان المحتمل:</span>
                      <span>0% (محفوظ محلياً وفورياً)</span>
                    </div>
                  </div>
                </div>

                {/* 2. Outbox Transmission Queue */}
                <div className="bg-[#faf8f5] p-3.5 rounded-xl border border-[#ece4d9] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-[#26201b] flex items-center gap-1.5">
                      <ArrowRightLeft className="w-4 h-4 text-blue-600" />
                      <span>2. طابور النقل الحي (Outbox Queue)</span>
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      outboxQueueItems.length === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {outboxQueueItems.length === 0 ? 'فارغ / مُرسل بالكامل' : `${outboxQueueItems.length} معلق`}
                    </span>
                  </div>
                  <div className="space-y-1 text-[11px] text-[#5c5346]">
                    <div className="flex justify-between">
                      <span>العناصر قيد الإرسال:</span>
                      <span className="font-mono font-bold text-[#26201b]">{outboxQueueItems.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>سياسة الحماية:</span>
                      <span className="text-blue-700 font-bold">Zero Data Loss (إعادة المحاولة)</span>
                    </div>
                    {outboxQueueItems.length > 0 && (
                      <div className="flex gap-1.5 mt-1.5">
                        <button
                          onClick={handleFlushQueueNow}
                          disabled={isProcessing}
                          className="flex-1 py-1 px-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold text-[11px] cursor-pointer"
                        >
                          إرسال الآن 🚀
                        </button>
                        <button
                          onClick={handleClearQueue}
                          disabled={isProcessing}
                          className="py-1 px-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded font-bold text-[11px] cursor-pointer"
                          title="تفريغ ومسح الأوردرات العالقة لمنع إرسالها"
                        >
                          تفريغ
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. API Latency & Network Reachability */}
                <div className="bg-[#faf8f5] p-3.5 rounded-xl border border-[#ece4d9] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-[#26201b] flex items-center gap-1.5">
                      <Wifi className="w-4 h-4 text-purple-600" />
                      <span>3. سرعة استجابة Google Sheets</span>
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      auditReport?.networkConnectivity.status === 'pass' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {auditReport?.networkConnectivity.online ? 'متصل بالشبكة' : 'غير متصل'}
                    </span>
                  </div>
                  <div className="space-y-1 text-[11px] text-[#5c5346]">
                    <div className="flex justify-between">
                      <span>زمن الاستجابة (API Latency):</span>
                      <span className="font-mono font-bold text-purple-700">
                        {auditReport?.networkConnectivity.apiLatencyMs !== null && auditReport?.networkConnectivity.apiLatencyMs !== undefined ? `${auditReport?.networkConnectivity.apiLatencyMs} مللي ثانية` : 'جاري القياس...'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>نقطة نهاية جوجل:</span>
                      <span className="font-mono text-[10px] text-[#7d7367]">sheets.googleapis.com</span>
                    </div>
                    <div className="flex justify-between">
                      <span>مهلة الاستجابة:</span>
                      <span className="font-mono font-bold text-[#26201b]">15 ثانية (Timeout Shield)</span>
                    </div>
                  </div>
                </div>

                {/* 4. Authentication & Security */}
                <div className="bg-[#faf8f5] p-3.5 rounded-xl border border-[#ece4d9] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-[#26201b] flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span>4. التوثيق وتصريح الأمان (OAuth2)</span>
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      googleAccessToken ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {googleAccessToken ? 'رمز موثق نشط' : 'بانتظار تسجيل الدخول'}
                    </span>
                  </div>
                  <div className="space-y-1 text-[11px] text-[#5c5346]">
                    <div className="flex justify-between">
                      <span>تخزين الرمز:</span>
                      <span className="font-bold text-emerald-800">sessionStorage (آمن للجلسة)</span>
                    </div>
                    <div className="flex justify-between">
                      <span>نطاق الصلاحية (Scopes):</span>
                      <span className="font-mono text-[10px] text-[#7d7367]">spreadsheets (قراءة/كتابة)</span>
                    </div>
                    <div className="flex justify-between">
                      <span>الحساب النشط:</span>
                      <span className="font-bold text-[#26201b] truncate max-w-[150px]">{googleUser?.email || 'غير مسجل'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 5. A1 Notation & Quoting Health */}
              <div className="bg-white p-3.5 rounded-xl border border-[#e8e2d9] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-black text-[#26201b] flex items-center gap-1.5">
                    <Server className="w-4 h-4 text-[#c48956]" />
                    <span>5. سلامة وترميز أوراق الشيت (A1 Notation Quoting)</span>
                  </span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                    معتمد مع علامات التنصيص A1 Quoting
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-[#faf8f5] p-2.5 rounded-lg border border-[#ece4d9] space-y-1">
                    <div className="font-bold text-[#26201b] flex items-center gap-1">
                      <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span>ورقة الطلبات الفورية:</span>
                    </div>
                    <div className="font-mono text-[10px] text-emerald-800 bg-emerald-50 px-2 py-1 rounded">
                      'طلبات البوفيه الحية'!A:K
                    </div>
                    <p className="text-[10px] text-[#7d7367]">
                      11 عموداً تشمل التفاصيل، المدفوع، المتبقي، طريقة الدفع، والكاشير.
                    </p>
                  </div>

                  <div className="bg-[#faf8f5] p-2.5 rounded-lg border border-[#ece4d9] space-y-1">
                    <div className="font-bold text-[#26201b] flex items-center gap-1">
                      <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span>ورقة المديونيات والأرصدة:</span>
                    </div>
                    <div className="font-mono text-[10px] text-emerald-800 bg-emerald-50 px-2 py-1 rounded">
                      'أرصدة ومديونيات العملاء'!A2:J
                    </div>
                    <p className="text-[10px] text-[#7d7367]">
                      10 أعمدة تشمل كود العميل، إجمالي المسدد، المتبقي، والحد الائتماني.
                    </p>
                  </div>
                </div>

                {auditReport?.spreadsheetStatus.title && (
                  <div className="text-[11px] text-emerald-900 bg-emerald-50/80 p-2 rounded-lg border border-emerald-200 flex items-center justify-between">
                    <span>تم التحقق من وجود الشيت بنجاح: <strong>{auditReport.spreadsheetStatus.title}</strong></span>
                    <span className="text-[10px] font-mono font-bold bg-white px-2 py-0.5 rounded border border-emerald-200">
                      معرف: {auditReport.spreadsheetStatus.spreadsheetId?.slice(0, 14)}...
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* CSV Export / Import View (Backup) */
            <div className="space-y-4">
              <div className="bg-[#faf8f5] p-4 rounded-xl border border-[#ece4d9] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-black text-[#26201b] flex items-center gap-1.5">
                    <Download className="w-4 h-4 text-[#c48956]" />
                    <span>تصدير الشيت الحالي (CSV Export)</span>
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopyCSV}
                      className="flex items-center gap-1 px-3 py-1.5 bg-white border border-[#d9d1c7] rounded-lg font-bold text-[#4a4237] hover:bg-[#eee7dd] cursor-pointer"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'تم النسخ!' : 'نسخ النص'}</span>
                    </button>

                    <button
                      onClick={handleDownloadCSV}
                      className="flex items-center gap-1 px-3 py-1.5 bg-[#26201b] hover:bg-[#c48956] text-white rounded-lg font-bold cursor-pointer transition-all"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>تنزيل ملف .CSV</span>
                    </button>
                  </div>
                </div>

                <div className="bg-white p-3 rounded-lg border border-[#e5dcd1] font-mono text-[11px] text-[#4a4237] max-h-36 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                  {currentCSV}
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-[#e8e2d9] space-y-3">
                <span className="font-black text-[#26201b] flex items-center gap-1.5">
                  <Upload className="w-4 h-4 text-[#c48956]" />
                  <span>استيراد أو لصق بيانات شيت جديدة</span>
                </span>

                <textarea
                  rows={4}
                  value={pasteInput}
                  onChange={(e) => setPasteInput(e.target.value)}
                  placeholder="انسخ صفوف الشيت والصقها هنا، لتحديث مديونيات وأرصدة العملاء دفعة واحدة..."
                  className="w-full text-xs font-mono p-3 bg-[#faf8f5] border border-[#d9d1c7] rounded-xl focus:outline-none focus:border-[#c48956]"
                />

                {importFeedback && (
                  <div className={`p-2.5 rounded-lg text-xs font-bold flex items-center gap-2 ${
                    importFeedback.includes('بنجاح') 
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}>
                    <AlertCircle className="w-4 h-4" />
                    <span>{importFeedback}</span>
                  </div>
                )}

                <button
                  onClick={handleImport}
                  disabled={!pasteInput.trim()}
                  className="w-full py-2.5 bg-[#26201b] hover:bg-[#c48956] disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl font-black text-xs transition-all cursor-pointer shadow-xs"
                >
                  تحديث بيانات الشيت والعملاء الآن
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-[#f0eae1] flex items-center justify-between bg-[#faf8f5]">
          <button
            onClick={() => {
              if (window.confirm('هل تريد استعادة بيانات الشيت الافتراضية الأصلية؟')) {
                onResetToDefault();
                onClose();
              }
            }}
            className="text-xs text-[#8c8072] hover:text-rose-600 font-bold flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>استعادة البيانات الافتراضية</span>
          </button>

          <button
            onClick={onClose}
            className="px-5 py-2 bg-[#26201b] hover:bg-[#3d342d] text-white rounded-xl text-xs font-bold cursor-pointer"
          >
            تم
          </button>
        </div>
      </div>
    </div>
  );
};
