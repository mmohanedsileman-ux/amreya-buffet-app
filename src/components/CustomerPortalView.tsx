import React, { useState, useEffect } from 'react';
import { 
  User, 
  CreditCard, 
  CheckCircle2, 
  AlertCircle, 
  ArrowUpRight, 
  ShoppingBag, 
  Receipt, 
  Clock, 
  Sparkles, 
  Check, 
  Gift,
  PartyPopper,
  ExternalLink,
  DollarSign
} from 'lucide-react';
import { Customer, Order, PaymentTransaction } from '../types';
import { formatCurrency, formatDateTime } from '../utils/formatters';

interface CustomerPortalViewProps {
  customer: Customer;
  orders: Order[];
  transactions: PaymentTransaction[];
  onOpenSettleModal: () => void;
  onViewReceipt: (order: Order) => void;
  onSwitchAccount: () => void;
  onGoToMenu: () => void;
  onOpenLuckyWheel: () => void;
  onRefreshDebt?: () => Promise<boolean | void>;
}

export const CustomerPortalView: React.FC<CustomerPortalViewProps> = ({
  customer,
  orders,
  transactions,
  onOpenSettleModal,
  onViewReceipt,
  onSwitchAccount,
  onGoToMenu,
  onOpenLuckyWheel,
  onRefreshDebt,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'orders' | 'payments'>('orders');

  // Filter ONLY this customer's data (matching by customerId, employee code, or normalized name)
  const customerOrders = orders.filter(o => 
    o.customerId === customer.id || 
    (customer.code && o.customerName?.includes(customer.code))
  );
  const customerTransactions = transactions.filter(t => t.customerId === customer.id);

  // Compute live remaining debt directly from authoritative customer account:
  // If customer.remainingDebt > 0, they definitely have debt!
  const liveDebt = Math.max(0, customer.remainingDebt || 0);
  const hasDebt = liveDebt > 0;
  const isAccountSettled = !hasDebt;

  // ONLY pending debt orders are displayed to the customer (never the entire history of past paid orders)
  const pendingDebtOrders = hasDebt 
    ? customerOrders.filter(o => o.remainingAmount > 0)
    : [];

  // Silent fast background sync for immediate payment verification from Google Sheet
  useEffect(() => {
    if (!onRefreshDebt) return;
    onRefreshDebt().catch(() => {});
    const interval = setInterval(() => {
      onRefreshDebt().catch(() => {});
    }, 3000); // Check every 3 seconds for instant real-time response!
    return () => clearInterval(interval);
  }, [onRefreshDebt]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Customer Profile Card */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-[#e8e2d9] shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#c48956] to-[#915829] text-white flex items-center justify-center font-black text-xl shadow-md">
            <User className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl sm:text-2xl font-black text-[#26201b]">
                {customer.name}
              </h2>
              <span className="text-xs bg-[#f5f1eb] text-[#635749] border border-[#e2dad0] px-2.5 py-0.5 rounded-full font-bold">
                {customer.category}
              </span>
              {customer.department && (
                <span className="text-xs bg-amber-50 text-amber-900 border border-amber-300 px-2.5 py-0.5 rounded-full font-bold">
                  القسم: {customer.department}
                </span>
              )}
              <span className="text-xs text-[#8c8072] font-semibold">
                كود: {customer.code}
              </span>
            </div>
            <p className="text-xs text-[#8c8072] mt-0.5">
              أهلاً بك في حسابك الشخصي • مخصص لك فقط بكل خصوصية
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={onOpenLuckyWheel}
            className="flex-1 sm:flex-none px-3.5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-xl text-xs font-black transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Gift className="w-4 h-4 text-amber-100" />
            <span>عجلة الحظ 🎡</span>
          </button>

          <button
            onClick={onSwitchAccount}
            className="flex-1 sm:flex-none px-3.5 py-2 bg-[#f5f1eb] hover:bg-[#eae3d8] text-[#5c5043] rounded-xl text-xs font-bold transition-all border border-[#e2dad0] cursor-pointer"
          >
            تبديل الحساب
          </button>
        </div>
      </div>

      {/* CORE REQUIREMENT: Dynamic Debt Display */}
      {/* If the customer has a debt: show prominent debt alert & pay button */}
      {/* If remainingDebt === 0: THE DEBT DISAPPEARS COMPLETELY and shows a clean, green settled badge! */}
      {hasDebt ? (
        <div className="bg-gradient-to-br from-amber-50 via-rose-50/40 to-amber-50 rounded-3xl p-6 border-2 border-amber-300 shadow-md relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping"></span>
                <span className="text-xs font-black uppercase tracking-wider text-rose-800 bg-rose-100 px-2.5 py-0.5 rounded-full">
                  تنبيه مديونية معلقة مستحقة السداد
                </span>
              </div>

              <div>
                <span className="text-xs sm:text-sm font-bold text-[#6b584b] block">
                  إجمالي المديونية المستحقة عليك حالياً:
                </span>
                <div className="text-3xl sm:text-4xl font-black text-rose-600 mt-1">
                  {formatCurrency(liveDebt)}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-[#7d6b5e] pt-1">
                <span>إجمالي مسحوباتك: <strong className="text-[#26201b]">{formatCurrency(Math.max(customer.totalOrders, customerOrders.reduce((s, o) => s + (o.totalAmount || 0), 0)))}</strong></span>
                <span>•</span>
                <span>ما تم سداده: <strong className="text-emerald-700">{formatCurrency(Math.max(customer.totalPaid, customerOrders.reduce((s, o) => s + (o.paidAmount || 0), 0)))}</strong></span>
                <span>•</span>
                <span>الحد الائتماني: <strong className="text-[#26201b]">{formatCurrency(customer.creditLimit)}</strong></span>
              </div>
            </div>

            {/* Direct Action & Cashier Settle Notice (No self-settle button) */}
            <div className="flex flex-col gap-2.5 min-w-[220px]">
              <div className="bg-white/90 border border-amber-300/80 p-3.5 rounded-2xl text-xs space-y-1 shadow-2xs">
                <div className="flex items-center gap-1.5 font-black text-amber-950">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  <span>طريقة السداد:</span>
                </div>
                <p className="text-[11px] leading-relaxed text-[#6b584b]">
                  يتم السداد مباشرة لدى <strong>كاشير البوفيه</strong> (نقداً / إنستاباي / فودافون كاش)، ويتم إسقاط وتصفير المديونية من حسابك تلقائياً فور إثبات الدفع.
                </p>
              </div>

              <button
                onClick={onGoToMenu}
                className="w-full py-3 px-4 bg-[#26201b] hover:bg-[#c48956] text-white rounded-2xl font-black text-xs transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <ShoppingBag className="w-4 h-4 text-amber-300" />
                <span>طلب أوردر جديد من المنيو</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* When Debt is 0 or Settled: DEBT DISAPPEARS and this clean, reassuring green state is shown */
        <div className="bg-gradient-to-br from-emerald-50 via-teal-50/40 to-emerald-50 rounded-3xl p-6 sm:p-7 border-2 border-emerald-300 shadow-sm relative overflow-hidden">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-5 text-center sm:text-right">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-black shadow-md flex-shrink-0">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <div className="flex items-center gap-2 justify-center sm:justify-start">
                  <h3 className="text-lg sm:text-xl font-black text-emerald-900">
                    حسابك خالص ومسدد بالكامل 🎉
                  </h3>
                </div>
                <p className="text-xs sm:text-sm text-emerald-800 mt-1">
                  لا توجد أي مديونيات مستحقة عليك حالياً. رصيد المتبقي: <strong>0 ج.م</strong>.
                </p>
                <p className="text-xs text-emerald-700/80 mt-0.5">
                  جميع مسحوباتك وفواتيرك مسددة بانتظام، ويمكنك الطلب في أي وقت بكل حرية.
                </p>
              </div>
            </div>

            <button
              onClick={onGoToMenu}
              className="px-6 py-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-2xl font-black text-xs sm:text-sm transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>طلب أوردر جديد من المنيو</span>
            </button>
          </div>
        </div>
      )}

      {/* Stats Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-[#e8e2d9] shadow-2xs">
          <span className="text-[11px] text-[#8c8072] font-semibold block">إجمالي مسحوباتك</span>
          <span className="text-base sm:text-lg font-black text-[#26201b] mt-0.5 block">
            {formatCurrency(Math.max(customer.totalOrders, customerOrders.reduce((s, o) => s + (o.totalAmount || 0), 0)))}
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-[#e8e2d9] shadow-2xs">
          <span className="text-[11px] text-[#8c8072] font-semibold block">ما تم سداده</span>
          <span className="text-base sm:text-lg font-black text-emerald-700 mt-0.5 block">
            {formatCurrency(Math.max(customer.totalPaid, customerOrders.reduce((s, o) => s + (o.paidAmount || 0), 0)))}
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-[#e8e2d9] shadow-2xs">
          <span className="text-[11px] text-[#8c8072] font-semibold block">حالة الحساب</span>
          <span className={`text-base sm:text-lg font-black mt-0.5 block ${hasDebt ? 'text-rose-600' : 'text-emerald-600'}`}>
            {hasDebt ? 'مديونية معلقة' : 'خالص ومسدد'}
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-[#e8e2d9] shadow-2xs">
          <span className="text-[11px] text-[#8c8072] font-semibold block">المديونية المستحقة</span>
          <span className={`text-base sm:text-lg font-black mt-0.5 block ${hasDebt ? 'text-rose-600' : 'text-emerald-700'}`}>
            {hasDebt ? formatCurrency(liveDebt) : '0 ج.م (خالص)'}
          </span>
        </div>
      </div>

      {/* Tabs: Pending Debt Invoices vs My Payments */}
      <div className="bg-white rounded-3xl border border-[#e8e2d9] shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-[#eee8df] flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 bg-[#f5f1eb] p-1 rounded-xl">
            <button
              onClick={() => setActiveSubTab('orders')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'orders'
                  ? 'bg-white text-[#26201b] shadow-xs font-black'
                  : 'text-[#7d7367] hover:text-[#26201b]'
              }`}
            >
              <AlertCircle className={`w-3.5 h-3.5 ${hasDebt ? 'text-rose-600' : 'text-emerald-600'}`} />
              <span>
                {hasDebt 
                  ? `الفواتير والمديونيات المعلقة (${pendingDebtOrders.length || 1})` 
                  : 'حالة الفواتير (خالص ومسدد)'}
              </span>
            </button>

            <button
              onClick={() => setActiveSubTab('payments')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'payments'
                  ? 'bg-white text-[#26201b] shadow-xs font-black'
                  : 'text-[#7d7367] hover:text-[#26201b]'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>إيصالات سداد المديونية ({customerTransactions.length})</span>
            </button>
          </div>

          <button
            onClick={onGoToMenu}
            className="text-xs text-[#915829] hover:underline font-bold flex items-center gap-1 cursor-pointer"
          >
            <span>+ طلب جديد من المنيو</span>
          </button>
        </div>

        {/* Tab 1: Pending Debt Invoices Only (Never show past paid history) */}
        {activeSubTab === 'orders' && (
          <div className="p-4 sm:p-5">
            {!hasDebt ? (
              <div className="text-center py-10 px-4 bg-emerald-50/60 rounded-2xl border border-emerald-200 space-y-2">
                <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-600 mb-1" />
                <h4 className="text-sm font-black text-emerald-900">حسابك خالص تماماً ومسدد بالكامل 🎉</h4>
                <p className="text-xs text-emerald-700 max-w-md mx-auto">
                  لا توجد أي فواتير معلقة أو مديونيات مستحقة عليك حالياً. حسابك نظيف 100%، ويمكنك الطلب في أي وقت.
                </p>
                <button
                  onClick={onGoToMenu}
                  className="mt-3 px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black transition-all cursor-pointer inline-flex items-center gap-2 shadow-xs"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>طلب أوردر جديد من المنيو</span>
                </button>
              </div>
            ) : pendingDebtOrders.length > 0 ? (
              <div className="space-y-3">
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-xs text-rose-900">
                  <span className="font-bold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                    <span>الفواتير المعلقة غير المسددة المطلوب سدادها:</span>
                  </span>
                  <span className="font-black text-rose-700">{formatCurrency(liveDebt)}</span>
                </div>
                {pendingDebtOrders.map((order, idx) => (
                  <div
                    key={`${order.id || 'ord'}-${idx}`}
                    className="p-4 rounded-2xl border-2 border-rose-200 bg-rose-50/20 hover:border-rose-300 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-[#26201b]">
                          فاتورة #{order.orderNumber}
                        </span>
                        <span className="text-[11px] text-[#8c8072]">
                          {formatDateTime(order.createdAt)}
                        </span>
                        <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                          متبقي: {formatCurrency(order.remainingAmount)}
                        </span>
                      </div>

                      {/* Items */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {order.items.map((item, idx) => (
                          <span
                            key={idx}
                            className="bg-[#f2ece4] text-[#4a4034] text-[11px] px-2 py-0.5 rounded-md font-medium"
                          >
                            {item.quantity}× {item.name}
                            {item.sugar ? ` (${item.sugar})` : ''}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-[#f0eae1]">
                      <div className="text-left">
                        <span className="text-[10px] text-[#8c8072] block">قيمة الفاتورة:</span>
                        <span className="text-sm font-black text-rose-700">
                          {formatCurrency(order.totalAmount)}
                        </span>
                      </div>

                      <button
                        onClick={() => onViewReceipt(order)}
                        className="px-3 py-1.5 bg-white hover:bg-[#f5f1eb] text-[#26201b] border border-[#dcd4c8] rounded-xl text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <Receipt className="w-3.5 h-3.5 text-[#c48956]" />
                        <span>عرض الإيصال</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-5 rounded-2xl border-2 border-rose-300 bg-rose-50/70 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
                    <span className="text-xs font-black text-rose-900 bg-rose-100 px-2.5 py-0.5 rounded-full">
                      مديونية معلقة مسجلة في شيت الكافيتريا
                    </span>
                  </div>
                  <span className="text-base font-black text-rose-600">
                    {formatCurrency(liveDebt)}
                  </span>
                </div>
                <p className="text-xs text-[#6b584b]">
                  يوجد رصيد مديونية مسجل باسمك في شيت الحسابات بقيمة <strong>{formatCurrency(liveDebt)}</strong>. يرجى التوجه لكاشير البوفيه لتسوية الحساب وسداد المبلغ، وسيتم تحديث رصيدك تلقائياً.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Customer Payments List */}
        {activeSubTab === 'payments' && (
          <div className="p-4 sm:p-5">
            {customerTransactions.length === 0 ? (
              <div className="text-center py-12 text-[#8c8072]">
                <CheckCircle2 className="w-12 h-12 mx-auto text-[#d4c8ba] mb-2" />
                <h4 className="text-sm font-bold text-[#26201b]">لا توجد عمليات سداد مسجلة حتى الآن</h4>
                <p className="text-xs text-[#8c8072] mt-1">عند سداد أي مديونية ستظهر إيصالات السداد المؤكدة هنا فوراً.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {customerTransactions.map((txn, idx) => (
                  <div
                    key={`${txn.id || 'txn'}-${idx}`}
                    className="p-4 rounded-2xl border border-[#ece4d9] bg-[#fdfcfb] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-black text-xs flex-shrink-0">
                        ✓
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-black text-[#26201b]">
                            سداد دفعة مالية: {formatCurrency(txn.amount)}
                          </span>
                          <span className="text-[10px] bg-[#f2ece4] text-[#4a4034] px-1.5 py-0.5 rounded font-bold">
                            {txn.paymentMethod === 'cash' ? 'نقدي (كاش)' : txn.paymentMethod === 'instapay' ? 'إنستاباي' : 'فودافون كاش'}
                          </span>
                        </div>
                        <p className="text-xs text-[#8c8072] mt-0.5">
                          {formatDateTime(txn.createdAt)} • {txn.receiptNumber || txn.id}
                          {txn.notes ? ` • ${txn.notes}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="text-xs font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-xl">
                      تم السداد بنجاح
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
