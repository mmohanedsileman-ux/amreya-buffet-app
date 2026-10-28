import React, { useState } from 'react';
import { 
  FileSpreadsheet, 
  TrendingUp, 
  Users, 
  AlertCircle, 
  AlertTriangle,
  CheckCircle2, 
  ArrowUpRight, 
  CreditCard, 
  Building2, 
  UserCheck, 
  Search, 
  UserPlus, 
  Download, 
  Upload, 
  Coffee,
  Check,
  ChevronRight,
  ShieldCheck,
  DollarSign,
  Send,
  Copy,
  ExternalLink,
  RefreshCw,
  Sparkles,
  CheckCheck,
  MessageSquare
} from 'lucide-react';
import { Customer, Order, SheetKPIs } from '../types';
import { formatCurrency } from '../utils/formatters';
import { generateEmployeesTsv, generateAccountsTsv } from '../services/googleSheets';

interface DebtsDashboardProps {
  customers: Customer[];
  orders: Order[];
  kpis: SheetKPIs;
  onOpenSettleModal: (customer: Customer) => void;
  onOpenAddCustomer: () => void;
  onOpenCustomerStatement: (customer: Customer) => void;
  onSelectCustomerForOrder: (customer: Customer) => void;
  onOpenSheetSync?: () => void;
  onSyncAllCustomersToSheet?: (forceOverwrite?: boolean) => Promise<{ employeesResult: any; accountsOk: boolean } | void>;
  onSyncEmployeesFromSheet?: () => Promise<boolean>;
  activeSpreadsheetId?: string | null;
  isGoogleConnected?: boolean;
  onRecordHospitalityOrder?: (order: Order) => void;
}

export const DebtsDashboard: React.FC<DebtsDashboardProps> = ({
  customers,
  orders,
  kpis,
  onOpenSettleModal,
  onOpenAddCustomer,
  onOpenCustomerStatement,
  onSelectCustomerForOrder,
  onOpenSheetSync,
  onSyncAllCustomersToSheet,
  onSyncEmployeesFromSheet,
  activeSpreadsheetId,
  isGoogleConnected,
  onRecordHospitalityOrder,
}) => {
  // Target customer for Instant Account Statement Query
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    customers.find(c => c.code === '11998' || c.name.includes('ملهم'))?.id || customers.find(c => c.remainingDebt > 0)?.id || customers[0]?.id || ''
  );
  const [tableSearch, setTableSearch] = useState<string>('');
  const [tableCategory, setTableCategory] = useState<string>('all');
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
    details?: string;
  } | null>(null);
  const [copiedTsvSuccess, setCopiedTsvSuccess] = useState(false);
  const [copiedAccountsSuccess, setCopiedAccountsSuccess] = useState(false);

  const handlePullFromSheet = async () => {
    if (!onSyncEmployeesFromSheet) return;
    setIsPulling(true);
    setSyncFeedback(null);
    try {
      const ok = await onSyncEmployeesFromSheet();
      if (ok) {
        setSyncFeedback({
          type: 'success',
          message: 'تم سحب وتحديث بيانات العملاء والموظفين من الشيت بنجاح! تم حفظ كافة الموظفين الذين تم إدخالهم يدوياً.',
        });
      } else {
        setSyncFeedback({
          type: 'info',
          message: 'لم يتم العثور على موظفين جدد في الشيت أو تعذر الاتصال بالشيت حالياً.',
        });
      }
    } catch (err: any) {
      setSyncFeedback({
        type: 'error',
        message: 'تعذر سحب البيانات من الشيت: ' + (err?.message || 'خطأ غير متوقع'),
      });
    } finally {
      setIsPulling(false);
    }
  };

  const handleTransferAllCustomers = async (forceOverwrite: boolean = false) => {
    if (!onSyncAllCustomersToSheet) {
      onOpenSheetSync?.();
      return;
    }
    setIsSyncingAll(true);
    setSyncFeedback(null);
    try {
      const res = await onSyncAllCustomersToSheet(forceOverwrite);
      if (res) {
        const empAppended = res.employeesResult?.appended ?? 0;
        const already = res.employeesResult?.alreadyPresent ?? 0;
        setSyncFeedback({
          type: 'success',
          message: `تم بنجاح نقل وتحديث كافة بيانات العملاء والموظفين (${customers.length}) إلى Google Sheets!`,
          details: `• ورقة «بينات الموظفين»: تم تحديث ${empAppended} موظف (${already > 0 ? `${already} مسجل مسبقاً، ` : ''}بيانات الاسم والكود والقسم والهاتف).\n• ورقة «العملاء_والحسابات»: تم تحديث وتسميع كافة الأرصدة والمديونيات لـ ${customers.length} عميل.`,
        });
      } else {
        setSyncFeedback({
          type: 'success',
          message: `تم نقل كافة بيانات العملاء والموظفين (${customers.length}) إلى الشيت بنجاح!`,
        });
      }
    } catch (err: any) {
      setSyncFeedback({
        type: 'error',
        message: err?.message || 'تعذر النقل، يرجى التأكد من تسجيل الدخول بحساب Google أو ربط الشيت.',
      });
    } finally {
      setIsSyncingAll(false);
    }
  };

  const handleCopyEmployeesTsv = () => {
    try {
      const tsv = generateEmployeesTsv(customers);
      navigator.clipboard.writeText(tsv);
      setCopiedTsvSuccess(true);
      setTimeout(() => setCopiedTsvSuccess(false), 4000);
    } catch {
      // Fallback
    }
  };

  const handleCopyAccountsTsv = () => {
    try {
      const tsv = generateAccountsTsv(customers);
      navigator.clipboard.writeText(tsv);
      setCopiedAccountsSuccess(true);
      setTimeout(() => setCopiedAccountsSuccess(false), 4000);
    } catch {
      // Fallback
    }
  };

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId) || customers[0];

  const overLimitCustomers = customers.filter(c => (c.creditLimit > 0) && (c.remainingDebt > c.creditLimit));
  const isSelectedOverLimit = Boolean(
    selectedCustomer && 
    selectedCustomer.creditLimit > 0 && 
    selectedCustomer.remainingDebt > selectedCustomer.creditLimit
  );

  const filteredCustomers = customers.filter(c => {
    const matchesSearch = 
      String(c.name || '').toLowerCase().includes(tableSearch.toLowerCase()) ||
      String(c.code || '').toLowerCase().includes(tableSearch.toLowerCase()) ||
      (c.notes && String(c.notes).toLowerCase().includes(tableSearch.toLowerCase()));
    
    let matchesCat = true;
    if (tableCategory === 'over_limit') {
      matchesCat = c.creditLimit > 0 && c.remainingDebt > c.creditLimit;
    } else if (tableCategory !== 'all') {
      matchesCat = c.category === tableCategory || (tableCategory === 'ضيوف وإدارة' && (c.category?.includes('ضيوف') || c.name.includes('ضيوف') || c.code === '1000'));
    }
    return matchesSearch && matchesCat;
  });

  return (
    <div className="space-y-6">
      {/* Top Title Banner */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 border border-[#e8e2d9] shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span className="text-xs font-bold text-[#8c5b30] uppercase tracking-wider">
              نظام إدارة وحسابات الكافتيريا والمطعم
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-[#26201b] mt-1">
            لوحة التحكم والمبيعات والمديونيات المباشرة
          </h2>
          <p className="text-xs sm:text-sm text-[#7d7367] mt-1">
            بيانات متزامنة مع شيت الحسابات تحسب تلقائياً حركة المبيعات، كشف الحساب الفوري، والمديونيات المعلقة
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto">
          <button
            onClick={onOpenAddCustomer}
            className="flex-1 md:flex-none flex items-center justify-center gap-1.5 bg-[#26201b] hover:bg-[#c48956] text-white px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer shadow-xs"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ إضافة عميل / موظف</span>
          </button>
        </div>
      </div>

      {/* Sync Status Banner */}
      {syncFeedback && (
        <div className={`p-4 rounded-2xl border shadow-xs animate-in fade-in flex items-start justify-between gap-3 ${
          syncFeedback.type === 'success' 
            ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
            : 'bg-rose-50 border-rose-300 text-rose-950'
        }`}>
          <div className="flex items-start gap-3">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0 mt-0.5 ${
              syncFeedback.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
            }`}>
              {syncFeedback.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            </div>
            <div>
              <h4 className="text-xs font-black">{syncFeedback.message}</h4>
              {syncFeedback.details && (
                <pre className="text-[11px] font-sans opacity-90 mt-1 whitespace-pre-line leading-relaxed">
                  {syncFeedback.details}
                </pre>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeSpreadsheetId && (
              <a
                href={`https://docs.google.com/spreadsheets/d/${activeSpreadsheetId}/edit`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1 bg-white border border-current rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-black/5"
              >
                <span>فتح الشيت</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <button
              onClick={() => setSyncFeedback(null)}
              className="text-xs opacity-60 hover:opacity-100 font-bold px-2 py-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Visual Red Alert Banner for Over-Limit Customers */}
      {overLimitCustomers.length > 0 && (
        <div className="bg-rose-50 border-2 border-rose-500 text-rose-950 p-4 sm:p-5 rounded-2xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs animate-pulse">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-rose-900">
                  تنبيه ائتماني عاجل: عملاء تجاوزت مديونياتهم الحد الائتماني (Credit Limit)!
                </h3>
                <span className="bg-rose-600 text-white text-[11px] font-black px-2 py-0.5 rounded-full">
                  {overLimitCustomers.length} عملاء
                </span>
              </div>
              <p className="text-xs text-rose-800 mt-0.5">
                يوجد عملاء وموظفون تخطت مستحقاتهم المالية الحد الائتماني المقترح بالشيت. يرجى التحصيل الفوري أو السداد.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              onClick={() => {
                setTableCategory('over_limit');
                const el = document.getElementById('debtors-table-container');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-xs whitespace-nowrap"
            >
              عرض المتجاوزين بالجدول
            </button>
          </div>
        </div>
      )}

      {/* Row 1: Top 4 KPI Cards (Exactly as in the Sheet) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: إجمالي المبيعات والطلبات */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#e8e2d9] shadow-xs relative overflow-hidden">
          <div className="flex items-start justify-between">
            <span className="text-xs font-bold text-[#7d7367]">
              إجمالي المبيعات والطلبات
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-[#915829] flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-[#26201b] mt-2">
            {formatCurrency(kpis.totalSales)}
          </div>
          <p className="text-[11px] text-[#8c8072] mt-1 font-medium">
            إجمالي قيمة فواتير الطلبات
          </p>
        </div>

        {/* KPI 2: إجمالي التحصيلات المسددة */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#e8e2d9] shadow-xs relative overflow-hidden">
          <div className="flex items-start justify-between">
            <span className="text-xs font-bold text-[#7d7367]">
              إجمالي التحصيلات المسددة
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-700 mt-2">
            {formatCurrency(kpis.totalPaid)}
          </div>
          <p className="text-[11px] text-[#8c8072] mt-1 font-medium">
            إجمالي المبالغ المحصلة فعلياً
          </p>
        </div>

        {/* KPI 3: إجمالي المديونيات المتبقية */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#e8e2d9] shadow-xs relative overflow-hidden">
          <div className="flex items-start justify-between">
            <span className="text-xs font-bold text-[#7d7367]">
              إجمالي المديونيات المتبقية
            </span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-rose-600 mt-2">
            {formatCurrency(kpis.totalDebt)}
          </div>
          <p className="text-[11px] text-[#8c8072] mt-1 font-medium">
            مستحقات جارية واجبة التحصيل
          </p>
        </div>

        {/* KPI 4: عدد العملاء المدينين */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#e8e2d9] shadow-xs relative overflow-hidden">
          <div className="flex items-start justify-between">
            <span className="text-xs font-bold text-[#7d7367]">
              عدد العملاء المدينين
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-[#26201b] mt-2">
            {kpis.debtorCount}
          </div>
          <p className="text-[11px] text-[#8c8072] mt-1 font-medium">
            عملاء وموظفين عليهم متبقي
          </p>
        </div>
      </div>

      {/* Row 2: Instant Statement Query + Quick Collection KPIs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left/Main Block: استعلام كشف حساب عميل فوري (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl p-5 sm:p-6 border border-[#e8e2d9] shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-[#f0eae1]">
              <div>
                <span className="text-[11px] font-bold text-[#915829] bg-[#f7f2ec] px-2 py-0.5 rounded-md">
                  كشف حساب لحظي
                </span>
                <h3 className="text-base font-black text-[#26201b] mt-1">
                  استعلام كشف حساب عميل فوري
                </h3>
              </div>

              {/* Customer Selector Dropdown */}
              <div className="w-full sm:w-64">
                <label className="block text-[10px] font-bold text-[#7d7367] mb-1">
                  اختر اسم العميل:
                </label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full text-xs font-black p-2 bg-[#fcf9f5] border border-[#d8cdbf] rounded-xl focus:outline-none focus:border-[#c48956]"
                >
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.department ? `[${c.department}]` : `(${c.category})`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Customer Details Sheet Table */}
            {selectedCustomer && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Field: كود العميل */}
                <div className="bg-[#faf8f5] p-3 rounded-xl border border-[#ece4d9]">
                  <span className="text-[11px] text-[#7d7367] block">كود العميل:</span>
                  <span className="text-sm font-black text-[#26201b] tracking-wider">
                    {selectedCustomer.code}
                  </span>
                </div>

                {/* Field: الفئة / الصفة */}
                <div className="bg-[#faf8f5] p-3 rounded-xl border border-[#ece4d9]">
                  <span className="text-[11px] text-[#7d7367] block">الفئة والقسم:</span>
                  <span className="text-sm font-black text-[#915829]">
                    {selectedCustomer.category} {selectedCustomer.department ? `• ${selectedCustomer.department}` : ''}
                  </span>
                </div>

                {/* Field: إجمالي المسحوبات */}
                <div className="bg-[#faf8f5] p-3 rounded-xl border border-[#ece4d9]">
                  <span className="text-[11px] text-[#7d7367] block">إجمالي المسحوبات (الطلبات):</span>
                  <span className="text-sm font-black text-[#26201b]">
                    {formatCurrency(selectedCustomer.totalOrders)}
                  </span>
                </div>

                {/* Field: إجمالي المبالغ المسددة */}
                <div className="bg-[#faf8f5] p-3 rounded-xl border border-[#ece4d9]">
                  <span className="text-[11px] text-[#7d7367] block">إجمالي المبالغ المسددة:</span>
                  <span className="text-sm font-black text-emerald-700">
                    {formatCurrency(selectedCustomer.totalPaid)}
                  </span>
                </div>

                {/* Field: المتبقي المستحق (المديونية) */}
                <div className={`p-3 rounded-xl border transition-all ${
                  isSelectedOverLimit 
                    ? 'bg-rose-100/90 border-2 border-rose-500 shadow-xs' 
                    : 'bg-rose-50/60 border-rose-200'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-rose-800 font-bold block">
                      المتبقي المستحق (المديونية):
                    </span>
                    {isSelectedOverLimit && (
                      <span className="text-[9px] bg-rose-600 text-white font-black px-1.5 py-0.5 rounded shadow-2xs animate-pulse">
                        ⚠️ تخطى الحد!
                      </span>
                    )}
                  </div>
                  <span className="text-lg font-black text-rose-700 block mt-0.5">
                    {formatCurrency(selectedCustomer.remainingDebt)}
                  </span>
                  {isSelectedOverLimit && (
                    <span className="text-[10px] font-black text-rose-900 block mt-0.5">
                      تجاوز الحد ({formatCurrency(selectedCustomer.creditLimit)}) بـ {formatCurrency(selectedCustomer.remainingDebt - selectedCustomer.creditLimit)}
                    </span>
                  )}
                </div>

                {/* Field: حالة الحساب والسداد */}
                <div className={`p-3 rounded-xl border flex flex-col justify-center transition-all ${
                  isSelectedOverLimit 
                    ? 'bg-rose-50 border-2 border-rose-400' 
                    : 'bg-[#faf8f5] border-[#ece4d9]'
                }`}>
                  <span className="text-[11px] text-[#7d7367] block">حالة السداد والحساب:</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {isSelectedOverLimit ? (
                      <span className="inline-flex items-center gap-1 text-xs font-black text-white bg-rose-600 px-2.5 py-1 rounded-md border border-rose-700 shadow-xs animate-pulse">
                        🚨 تجاوز الحد الائتماني ({formatCurrency(selectedCustomer.remainingDebt)} / {formatCurrency(selectedCustomer.creditLimit)})
                      </span>
                    ) : selectedCustomer.remainingDebt > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs font-black text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-300">
                        ⚠️ عليه مديونية ({selectedCustomer.status})
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-300">
                        خالص السداد (لا توجد مديونية)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Visual Red Warning Message for Over-Limit Customer in Instant Statement */}
            {isSelectedOverLimit && (
              <div className="mt-3 p-3 bg-rose-50 border-2 border-rose-500 rounded-xl flex items-start gap-2.5 text-rose-900 animate-in fade-in">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <span className="font-black text-rose-700 block">
                    تنبيه: مديونية هذا العميل تخطت الحد الائتماني المسموح به في الشيت!
                  </span>
                  <span className="text-[11px] text-rose-800 mt-0.5 block">
                    الحد الائتماني المحدد: <strong>{formatCurrency(selectedCustomer.creditLimit)}</strong> • المديونية المستحقة: <strong>{formatCurrency(selectedCustomer.remainingDebt)}</strong> • يرجى السداد الفوري لتفادي إيقاف السحب على الحساب.
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Quick Action Buttons for This Customer */}
          {selectedCustomer && (
            <div className="mt-5 pt-4 border-t border-[#f0eae1] flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => onOpenSettleModal(selectedCustomer)}
                disabled={selectedCustomer.remainingDebt <= 0}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer shadow-xs ${
                  selectedCustomer.remainingDebt > 0
                    ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                <DollarSign className="w-4 h-4" />
                <span>سداد مديونية العميل</span>
              </button>

              <button
                onClick={() => onSelectCustomerForOrder(selectedCustomer)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-[#26201b] hover:bg-[#c48956] text-white px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer"
              >
                <Coffee className="w-4 h-4" />
                <span>طلب جديد لهذا العميل</span>
              </button>

              <button
                onClick={() => onOpenCustomerStatement(selectedCustomer)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-[#faf8f5] hover:bg-[#f2ece2] text-[#63594e] border border-[#d8cdbf] px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                <span>كشف حساب تفصيلي</span>
              </button>

              {selectedCustomer.remainingDebt > 0 && (
                <a
                  href={`https://wa.me/${(selectedCustomer.phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(
                    `مرحباً أستاذ ${selectedCustomer.name} (كود: ${selectedCustomer.code})،\nنود إحاطتكم علماً بأن رصيد مديونيتكم المعلق لدى كافيتريا وبوفيه أسمنت العامرية هو: ${selectedCustomer.remainingDebt} ج.م.\nيمكنكم السداد نقداً للكاشير أو عبر إنستاباي / فودافون كاش.\nشاكرين لتعاونكم الدائم!`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs"
                  title="إرسال تذكير بالمديونية على واتساب"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                  <span>تذكير واتساب 💬</span>
                </a>
              )}
            </div>
          )}
        </div>

        {/* Right Block: مؤشرات أداء التحصيل السريع (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-2xl p-5 sm:p-6 border border-[#e8e2d9] shadow-xs flex flex-col justify-between">
          <div>
            <div className="pb-3 border-b border-[#f0eae1]">
              <span className="text-[11px] font-bold text-[#915829] bg-[#f7f2ec] px-2 py-0.5 rounded-md">
                مؤشرات الشيت المالي
              </span>
              <h3 className="text-base font-black text-[#26201b] mt-1">
                مؤشرات أداء التحصيل السريع
              </h3>
            </div>

            {/* Collection Performance Gauge */}
            <div className="mt-4 bg-[#fbf9f6] p-3.5 rounded-xl border border-[#ece3d6]">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-[#63594e]">نسبة التحصيل الفعلية:</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-lg font-black text-emerald-700">
                    {kpis.collectionRate}%
                  </span>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${
                    kpis.collectionRate >= 80 
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300' 
                      : kpis.collectionRate >= 60
                      ? 'bg-amber-100 text-amber-800 border-amber-300'
                      : 'bg-rose-100 text-rose-800 border-rose-300'
                  }`}>
                    {kpis.collectionRate >= 80 ? 'ممتاز' : kpis.collectionRate >= 60 ? 'جيد' : 'يحتاج متابعة'}
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-[#e5ddd1] h-2.5 rounded-full mt-2.5 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-emerald-600 to-emerald-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(kpis.collectionRate, 100)}%` }}
                />
              </div>
            </div>

            {/* Metrics List matching Sheet */}
            <div className="mt-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#faf8f5] border border-[#ece4d9]">
                <span className="text-[#7d7367]">إجمالي الذمم المعلقة:</span>
                <strong className="text-rose-600 font-black">{formatCurrency(kpis.totalDebt)}</strong>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#faf8f5] border border-[#ece4d9]">
                <span className="text-[#7d7367]">أعلى مديونية فردية:</span>
                <strong className="text-[#26201b] font-black">{formatCurrency(kpis.maxSingleDebt)}</strong>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#faf8f5] border border-[#ece4d9]">
                <span className="text-[#7d7367]">متوسط مديونية العميل:</span>
                <strong className="text-[#26201b] font-black">{formatCurrency(kpis.avgDebt)}</strong>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#faf8f5] border border-[#ece4d9]">
                <span className="text-[#7d7367]">الحد الائتماني المقترح:</span>
                <strong className="text-[#26201b] font-black">500 ج.م</strong>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#faf8f5] border border-[#ece4d9]">
                <span className="text-[#7d7367]">حساب الإدارة / الضيافة:</span>
                <strong className="text-emerald-700 font-black">0 ج.م (تسوية معتمدة)</strong>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#f5efe6] border border-[#e8dfd3] text-[#42372c] font-bold">
                <span>إجمالي حسابات العملاء المسجلة:</span>
                <span className="text-xs bg-white px-2 py-0.5 rounded border border-[#ded4c7]">
                  {customers.length} حساب
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#f0eae1] text-[11px] text-[#8c8072]">
            * يتم تحديث المؤشرات تلقائياً فور تسجيل أي طلب كاش أو على الحساب.
          </div>
        </div>
      </div>

      {/* Row 3: قائمة كبار المديونين والحسابات المعلقة (Table) */}
      <div id="debtors-table-container" className="bg-white rounded-2xl border border-[#e8e2d9] shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-[#e8e2d9] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-[#26201b] flex items-center gap-2 flex-wrap">
              <span>قائمة كبار المديونين والحسابات المعلقة</span>
              <span className="text-xs bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full font-bold">
                {filteredCustomers.filter(c => c.remainingDebt > 0).length} مدينين
              </span>
              {overLimitCustomers.length > 0 && (
                <span className="text-xs bg-rose-600 text-white px-2 py-0.5 rounded-full font-black animate-pulse flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  <span>{overLimitCustomers.length} تجاوزوا الحد</span>
                </span>
              )}
            </h3>
            <p className="text-xs text-[#7d7367] mt-0.5">
              جدول الحسابات المربوط مباشرة مع الشيت لمتابعة السداد والمسحوبات مع تنبيهات الحدود الائتمانية
            </p>
          </div>

          {/* Search & Category Filter */}
          <div className="flex items-center gap-2">
            <div className="relative w-48 sm:w-60">
              <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-[#9e9386]" />
              <input
                type="text"
                placeholder="بحث باسم العميل أو الكود..."
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                className="w-full pr-8 pl-3 py-1.5 text-xs bg-[#faf8f5] border border-[#d9d1c7] rounded-xl focus:outline-none focus:border-[#c48956]"
              />
            </div>

            <select
              value={tableCategory}
              onChange={(e) => setTableCategory(e.target.value)}
              className="text-xs font-bold py-1.5 px-2.5 bg-[#faf8f5] border border-[#d9d1c7] rounded-xl focus:outline-none"
            >
              <option value="all">كل الفئات</option>
              <option value="موظف">موظفون</option>
              <option value="ضيوف وإدارة">ضيوف وإدارة</option>
              <option value="over_limit">🚨 متجاوزون للحد الائتماني ({overLimitCustomers.length})</option>
            </select>

            <button
              onClick={() => handleTransferAllCustomers(false)}
              disabled={isSyncingAll}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-50 shrink-0"
              title="نقل وتحديث كافة بيانات العملاء والموظفين للشيت"
            >
              {isSyncingAll ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">نقل للشيت</span>
            </button>
          </div>
        </div>

        {/* Responsive Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-[#fcfaf7] border-b border-[#e8e2d9] text-[#7d7367] font-bold">
              <tr>
                <th className="py-3 px-4">اسم العميل والكود</th>
                <th className="py-3 px-3">الفئة</th>
                <th className="py-3 px-3">إجمالي الطلبات</th>
                <th className="py-3 px-3">إجمالي المسدد</th>
                <th className="py-3 px-3">المديونية المتبقية</th>
                <th className="py-3 px-3">الحد الائتماني</th>
                <th className="py-3 px-3">الحالة</th>
                <th className="py-3 px-4">ملاحظات وربط الشيت</th>
                <th className="py-3 px-4 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0eae1]">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-[#8c8072]">
                    لا توجد حسابات مطابقة لمعايير البحث
                  </td>
                </tr>
              ) : (
                filteredCustomers.map(c => {
                  const isDebtor = c.remainingDebt > 0;
                  const isOverLimit = c.creditLimit > 0 && c.remainingDebt > c.creditLimit;
                  
                  return (
                    <tr 
                      key={c.id} 
                      className={`transition-colors ${
                        isOverLimit 
                          ? 'bg-rose-50/90 border-r-4 border-r-rose-600 hover:bg-rose-100/90' 
                          : 'hover:bg-[#faf7f2]/80'
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`font-black ${isOverLimit ? 'text-rose-950' : 'text-[#26201b]'}`}>
                            {c.name}
                          </span>
                          {isOverLimit && (
                            <span className="inline-flex items-center gap-1 bg-rose-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow-2xs animate-pulse">
                              <AlertTriangle className="w-2.5 h-2.5 inline" />
                              <span>تجاوز الحد!</span>
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-[#8c8072] font-mono">{c.code}</div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex flex-col gap-1 items-start">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            c.category === 'ضيوف وإدارة' 
                              ? 'bg-purple-100 text-purple-800' 
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {c.category}
                          </span>
                          {c.department && (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-900 border border-amber-200">
                              {c.department}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-bold text-[#26201b]">
                        {formatCurrency(c.totalOrders)}
                      </td>
                      <td className="py-3 px-3 font-bold text-emerald-700">
                        {formatCurrency(c.totalPaid)}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`font-black text-sm block ${
                          isOverLimit 
                            ? 'text-rose-700 font-black' 
                            : isDebtor 
                            ? 'text-rose-600' 
                            : 'text-emerald-700'
                        }`}>
                          {formatCurrency(c.remainingDebt)}
                        </span>
                        {isOverLimit && (
                          <span className="text-[10px] text-rose-800 font-black block mt-0.5">
                            +{formatCurrency(c.remainingDebt - c.creditLimit)} زيادة
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`font-bold font-mono text-xs ${
                          isOverLimit ? 'text-rose-900 font-black' : 'text-[#63594e]'
                        }`}>
                          {formatCurrency(c.creditLimit)}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        {isOverLimit ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black text-white bg-rose-600 px-2 py-0.5 rounded-md shadow-xs animate-pulse whitespace-nowrap">
                            🚨 تجاوز الحد
                          </span>
                        ) : isDebtor ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                            مدين
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            مسدد
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-[#7d7367] max-w-xs truncate">
                        {c.notes || '—'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => onOpenSettleModal(c)}
                            disabled={!isDebtor}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition-all cursor-pointer whitespace-nowrap ${
                              isOverLimit
                                ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-xs animate-pulse'
                                : isDebtor
                                ? 'bg-emerald-700 hover:bg-emerald-800 text-white shadow-2xs'
                                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            }`}
                          >
                            {isOverLimit ? 'سداد عاجل' : 'سداد'}
                          </button>
                          <button
                            onClick={() => onOpenCustomerStatement(c)}
                            className="px-2 py-1 bg-[#f5f1eb] hover:bg-[#eae3d8] text-[#554b40] rounded-lg text-[11px] font-bold cursor-pointer"
                          >
                            كشف
                          </button>
                          {isDebtor && (
                            <a
                              href={`https://wa.me/${(c.phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(
                                `مرحباً أستاذ ${c.name} (كود: ${c.code})،\nنود إحاطتكم علماً بأن رصيد مديونيتكم المعلق لدى كافيتريا وبوفيه أسمنت العامرية هو: ${c.remainingDebt} ج.م.\nيمكنكم السداد نقداً للكاشير أو عبر إنستاباي / فودافون كاش.\nشاكرين لتعاونكم الدائم!`
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-[11px] font-bold cursor-pointer transition-colors shadow-2xs"
                              title="إرسال تذكير عبر واتساب"
                            >
                              <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row 4: دليل الربط بالتطبيقات الذكية (Smart App Integration Guide) */}
      <div className="bg-gradient-to-br from-[#26201b] to-[#1a1714] text-white rounded-2xl p-5 sm:p-6 border border-[#3e362f] shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-[#3b342e]">
          <div>
            <span className="text-[10px] font-bold text-amber-300 bg-amber-900/60 px-2 py-0.5 rounded uppercase tracking-wider">
              نظام الربط المتكامل
            </span>
            <h3 className="text-base sm:text-lg font-black mt-1">
              دليل الربط بالتطبيقات الذكية والشيت
            </h3>
            <p className="text-xs text-[#b8ada0]">
              الميزات المتطابقة 100% مع شيت الحسابات وقواعد التحقق الفوري
            </p>
          </div>

          <button
            onClick={onOpenSheetSync}
            className="flex items-center gap-1.5 bg-[#c48956] hover:bg-[#b07847] text-white px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer shadow-sm self-start md:self-auto"
          >
            <Download className="w-4 h-4" />
            <span>تنزيل نسخة الشيت الحالية (CSV)</span>
          </button>
        </div>

        {/* 7 Feature Grid from User Sheet */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="bg-[#2e2823] p-3 rounded-xl border border-[#443b33]">
            <div className="flex items-center justify-between text-amber-400 font-bold">
              <span>مفاتيح فريدة (Keys)</span>
              <span className="text-[10px] bg-emerald-900/70 text-emerald-300 px-1.5 py-0.2 rounded">جاهز للربط</span>
            </div>
            <p className="text-[#a89e92] text-[11px] mt-1">أكواد عملاء وطلبات فريدة لا تتكرر</p>
          </div>

          <div className="bg-[#2e2823] p-3 rounded-xl border border-[#443b33]">
            <div className="flex items-center justify-between text-amber-400 font-bold">
              <span>علاقات الجداول (Ref)</span>
              <span className="text-[10px] bg-emerald-900/70 text-emerald-300 px-1.5 py-0.2 rounded">مترابطة</span>
            </div>
            <p className="text-[#a89e92] text-[11px] mt-1">ربط العملاء بالطلبات وسندات القبض</p>
          </div>

          <div className="bg-[#2e2823] p-3 rounded-xl border border-[#443b33]">
            <div className="flex items-center justify-between text-amber-400 font-bold">
              <span>التحقق والتوافق</span>
              <span className="text-[10px] bg-emerald-900/70 text-emerald-300 px-1.5 py-0.2 rounded">100%</span>
            </div>
            <p className="text-[#a89e92] text-[11px] mt-1">قوائم منسدلة لمنع أخطاء الإدخال اليدوي</p>
          </div>

          <div className="bg-[#2e2823] p-3 rounded-xl border border-[#443b33]">
            <div className="flex items-center justify-between text-amber-400 font-bold">
              <span>التحديث التلقائي</span>
              <span className="text-[10px] bg-emerald-900/70 text-emerald-300 px-1.5 py-0.2 rounded">لحظي</span>
            </div>
            <p className="text-[#a89e92] text-[11px] mt-1">معادلات مرنة تحسب المديونية فورياً</p>
          </div>

          <div className="bg-[#2e2823] p-3 rounded-xl border border-[#443b33]">
            <div className="flex items-center justify-between text-amber-400 font-bold">
              <span>تطبيق الكاشير</span>
              <span className="text-[10px] bg-emerald-900/70 text-emerald-300 px-1.5 py-0.2 rounded">متوافق</span>
            </div>
            <p className="text-[#a89e92] text-[11px] mt-1">تسجيل الطلب بضغطة زر وطباعة الفاتورة</p>
          </div>

          <div className="bg-[#2e2823] p-3 rounded-xl border border-[#443b33]">
            <div className="flex items-center justify-between text-amber-400 font-bold">
              <span>تطبيق العميل/الموظف</span>
              <span className="text-[10px] bg-emerald-900/70 text-emerald-300 px-1.5 py-0.2 rounded">متوافق</span>
            </div>
            <p className="text-[#a89e92] text-[11px] mt-1">استعلام فوري عن الرصيد والمتبقي</p>
          </div>

          <div className="bg-[#2e2823] p-3 rounded-xl border border-[#443b33] sm:col-span-2">
            <div className="flex items-center justify-between text-amber-400 font-bold">
              <span>دعم الدفع الإلكتروني المتعدد</span>
              <span className="text-[10px] bg-emerald-900/70 text-emerald-300 px-1.5 py-0.2 rounded">متوفر</span>
            </div>
            <p className="text-[#a89e92] text-[11px] mt-1">
              محاسبة فورية: نقدي / انستاباي InstaPay / فودافون كاش / آجل على حساب الموظف
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
