import React from 'react';
import { 
  X, 
  Printer, 
  DollarSign, 
  CreditCard, 
  Coins, 
  Clock, 
  CheckCircle2, 
  FileSpreadsheet, 
  ArrowUpRight,
  Receipt
} from 'lucide-react';
import { Order, PaymentTransaction } from '../types';
import { formatCurrency, formatDateTime } from '../utils/formatters';

interface ShiftSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: Order[];
  transactions: PaymentTransaction[];
}

export const ShiftSummaryModal: React.FC<ShiftSummaryModalProps> = ({
  isOpen,
  onClose,
  orders,
  transactions,
}) => {
  if (!isOpen) return null;

  // Filter today's activity (current shift)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const isToday = (isoString?: string) => {
    if (!isoString) return true; // Include current session items
    try {
      const d = new Date(isoString);
      return d >= todayStart;
    } catch {
      return true;
    }
  };

  const todayOrders = orders.filter(o => isToday(o.createdAt));
  const todayTxns = transactions.filter(t => isToday(t.createdAt));

  // Calculations
  const cashSales = todayOrders
    .filter(o => o.paymentMethod === 'cash')
    .reduce((s, o) => s + (o.paidAmount || 0), 0);

  const instapaySales = todayOrders
    .filter(o => o.paymentMethod === 'instapay')
    .reduce((s, o) => s + (o.paidAmount || 0), 0);

  const vodafoneSales = todayOrders
    .filter(o => o.paymentMethod === 'vodafone_cash')
    .reduce((s, o) => s + (o.paidAmount || 0), 0);

  const creditDebtSales = todayOrders
    .filter(o => o.paymentMethod === 'debt_account')
    .reduce((s, o) => s + (o.remainingAmount || 0), 0);

  // Debt payments collected today
  const cashDebtCollected = todayTxns
    .filter(t => t.paymentMethod === 'cash')
    .reduce((s, t) => s + (t.amount || 0), 0);

  const digitalDebtCollected = todayTxns
    .filter(t => t.paymentMethod === 'instapay' || t.paymentMethod === 'vodafone_cash')
    .reduce((s, t) => s + (t.amount || 0), 0);

  // Total physical cash currently expected in drawer:
  const totalPhysicalCashDrawer = cashSales + cashDebtCollected;

  // Total digital revenue today:
  const totalDigitalRevenue = instapaySales + vodafoneSales + digitalDebtCollected;

  // Grand total revenue collected today:
  const grandTotalCollected = totalPhysicalCashDrawer + totalDigitalRevenue;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col border border-[#e8e2d9] shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-[#f0eae1] flex items-center justify-between bg-gradient-to-r from-[#172338] to-[#243553] text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold border border-amber-400/30">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black">تقرير الوردية وتقفيل الكاشير</h3>
              <p className="text-xs text-[#cad5e6] mt-0.5">
                كشف فوري شامل لمبيعات اليوم، المتحصلات النقدية والإلكترونية، والآجل
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-white/70 hover:text-white p-1 rounded-xl hover:bg-white/10 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* Main Highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {/* Cash Drawer */}
            <div className="bg-emerald-50/80 rounded-2xl p-4 border-2 border-emerald-300 shadow-2xs">
              <div className="flex items-center justify-between text-emerald-900">
                <span className="text-xs font-bold">الدرج النقدي (كاش)</span>
                <Coins className="w-4 h-4 text-emerald-700" />
              </div>
              <div className="text-2xl font-black text-emerald-800 mt-2">
                {formatCurrency(totalPhysicalCashDrawer)}
              </div>
              <span className="text-[11px] text-emerald-700 mt-1 block font-semibold">
                مبيعات كاش: {formatCurrency(cashSales)} + تحصيل مديونية: {formatCurrency(cashDebtCollected)}
              </span>
            </div>

            {/* Digital Revenue */}
            <div className="bg-blue-50/80 rounded-2xl p-4 border border-blue-200 shadow-2xs">
              <div className="flex items-center justify-between text-blue-900">
                <span className="text-xs font-bold">إلكتروني (إنستاباي/فودافون)</span>
                <CreditCard className="w-4 h-4 text-blue-700" />
              </div>
              <div className="text-2xl font-black text-blue-800 mt-2">
                {formatCurrency(totalDigitalRevenue)}
              </div>
              <span className="text-[11px] text-blue-700 mt-1 block font-semibold">
                إنستاباي: {formatCurrency(instapaySales)} + فودافون: {formatCurrency(vodafoneSales)}
              </span>
            </div>

            {/* Credit / Debt Sales */}
            <div className="bg-amber-50/80 rounded-2xl p-4 border border-amber-200 shadow-2xs">
              <div className="flex items-center justify-between text-amber-900">
                <span className="text-xs font-bold">مبيعات آجل (على الحساب)</span>
                <Clock className="w-4 h-4 text-amber-700" />
              </div>
              <div className="text-2xl font-black text-amber-800 mt-2">
                {formatCurrency(creditDebtSales)}
              </div>
              <span className="text-[11px] text-amber-700 mt-1 block font-semibold">
                فواتير مؤجلة مقيدة على مديونيات العملاء
              </span>
            </div>
          </div>

          {/* Detailed Breakdown */}
          <div className="bg-[#faf8f5] rounded-2xl p-4 sm:p-5 border border-[#e8e0d5] space-y-3">
            <h4 className="text-xs font-black text-[#26201b] uppercase tracking-wider">
              تفاصيل حركة الوردية
            </h4>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-[#ece3d6]">
                <span className="text-[#695d50]">عدد طلبات اليوم الكلية:</span>
                <strong className="text-[#26201b] font-bold">{todayOrders.length} طلب</strong>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-[#ece3d6]">
                <span className="text-[#695d50]">مبيعات الكاش الفورية:</span>
                <strong className="text-emerald-700 font-bold">{formatCurrency(cashSales)}</strong>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-[#ece3d6]">
                <span className="text-[#695d50]">مبيعات إنستاباي:</span>
                <strong className="text-blue-700 font-bold">{formatCurrency(instapaySales)}</strong>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-[#ece3d6]">
                <span className="text-[#695d50]">مبيعات فودافون كاش:</span>
                <strong className="text-rose-700 font-bold">{formatCurrency(vodafoneSales)}</strong>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-[#ece3d6]">
                <span className="text-[#695d50]">مبيعات على الحساب (آجل):</span>
                <strong className="text-amber-800 font-bold">{formatCurrency(creditDebtSales)}</strong>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-[#ece3d6]">
                <span className="text-[#695d50]">مديونيات تم تحصيلها اليوم:</span>
                <strong className="text-emerald-700 font-bold">{formatCurrency(cashDebtCollected + digitalDebtCollected)}</strong>
              </div>

              <div className="flex items-center justify-between pt-2 text-sm font-black text-[#26201b]">
                <span>إجمالي النقدية والمتحصلات الكلية:</span>
                <span className="text-base text-emerald-800">{formatCurrency(grandTotalCollected)}</span>
              </div>
            </div>
          </div>

          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>
              جميع الطلبات والتحصيلات تُرحّل لحظياً إلى شيت الإدارة الرسمية وتنعكس على أرصدة المديونيات.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-[#f0eae1] flex items-center justify-between gap-3 bg-[#faf8f5]">
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-white hover:bg-[#eee6dc] text-[#4a4237] border border-[#d9d1c7] rounded-xl text-xs font-bold cursor-pointer transition-all shadow-2xs"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة تقرير الوردية</span>
          </button>

          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-[#26201b] hover:bg-[#3b322a] text-white rounded-xl text-xs font-bold cursor-pointer transition-colors"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
