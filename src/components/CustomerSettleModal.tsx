import React, { useState } from 'react';
import { 
  X, 
  CreditCard, 
  Banknote, 
  Smartphone, 
  CheckCircle2, 
  Sparkles,
  Receipt,
  PartyPopper
} from 'lucide-react';
import { Customer, PaymentTransaction } from '../types';
import { formatCurrency } from '../utils/formatters';

interface CustomerSettleModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  onRecordPayment: (txn: PaymentTransaction) => void;
}

export const CustomerSettleModal: React.FC<CustomerSettleModalProps> = ({
  isOpen,
  onClose,
  customer,
  onRecordPayment,
}) => {
  if (!isOpen || !customer) return null;

  const currentDebt = customer.remainingDebt;
  const [payAmount, setPayAmount] = useState<number>(currentDebt > 0 ? currentDebt : 0);
  const [method, setMethod] = useState<'cash' | 'instapay' | 'vodafone_cash'>('cash');
  const [reference, setReference] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (payAmount <= 0) return;

    const receiptNum = `REC-${Date.now().toString().slice(-6)}`;
    const txn: PaymentTransaction = {
      id: `TXN-${Date.now()}`,
      createdAt: new Date().toISOString(),
      customerId: customer.id,
      customerName: customer.name,
      amount: Number(payAmount),
      paymentMethod: method,
      receiptNumber: receiptNum,
      notes: reference.trim() || (payAmount >= currentDebt ? 'سداد الحساب بالكامل' : 'سداد دفعة من المديونية'),
    };

    onRecordPayment(txn);
    setIsSuccess(true);

    setTimeout(() => {
      setIsSuccess(false);
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="bg-white rounded-3xl max-w-md w-full border border-[#e8e2d9] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-[#26201b] via-[#3a2d21] to-[#26201b] p-4 text-white flex items-center justify-between border-b border-[#4d3c2c]">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-md">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-white">
                سداد المديونية المستحقة
              </h3>
              <p className="text-xs text-[#d8cfc4]">
                حساب العميل: {customer.name} (كود: {customer.code})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-[#bbb0a2] hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success View */}
        {isSuccess ? (
          <div className="p-8 text-center space-y-3 bg-[#faf8f5]">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto animate-bounce">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h4 className="text-xl font-black text-[#26201b]">
              تم تسجيل سداد المبلغ بنجاح! 🎉
            </h4>
            <p className="text-sm text-emerald-800 font-bold">
              تم سداد {formatCurrency(payAmount)}
            </p>
            <p className="text-xs text-[#7d7367]">
              {payAmount >= currentDebt
                ? 'تم تسوية مديونيتك بالكامل، واختفت المديونية من حسابك الآن.'
                : `المتبقي الجديد عليك: ${formatCurrency(Math.max(0, currentDebt - payAmount))}`}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4 bg-[#faf8f5]">
            {/* Current Debt Badge */}
            <div className="bg-rose-50 border border-rose-200 p-3.5 rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-xs text-rose-800 font-bold block">إجمالي مديونيتك المستحقة:</span>
                <span className="text-2xl font-black text-rose-600 mt-0.5 block">
                  {formatCurrency(currentDebt)}
                </span>
              </div>

              {currentDebt > 0 && (
                <button
                  type="button"
                  onClick={() => setPayAmount(currentDebt)}
                  className="text-xs bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 rounded-xl font-black transition-colors cursor-pointer"
                >
                  سداد كامل المبلغ
                </button>
              )}
            </div>

            {/* Amount Input */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#4a4237]">
                المبلغ المراد سداده الآن (ج.م):
              </label>
              <input
                type="number"
                min="1"
                max={currentDebt}
                step="any"
                value={payAmount}
                onChange={(e) => setPayAmount(Number(e.target.value))}
                className="w-full p-3 bg-white border border-[#dcd4c8] rounded-xl text-lg font-black text-[#26201b] focus:outline-none focus:ring-2 focus:ring-emerald-600"
                required
              />

              {/* Quick presets */}
              {currentDebt > 0 && (
                <div className="flex gap-2 pt-1 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setPayAmount(currentDebt)}
                    className="text-xs bg-white hover:bg-[#eae3d8] border border-[#dcd4c8] text-[#26201b] px-2.5 py-1 rounded-lg font-bold cursor-pointer"
                  >
                    كامل المديونية ({formatCurrency(currentDebt)})
                  </button>
                  {currentDebt > 50 && (
                    <button
                      type="button"
                      onClick={() => setPayAmount(50)}
                      className="text-xs bg-white hover:bg-[#eae3d8] border border-[#dcd4c8] text-[#26201b] px-2.5 py-1 rounded-lg font-bold cursor-pointer"
                    >
                      50 ج.م
                    </button>
                  )}
                  {currentDebt > 100 && (
                    <button
                      type="button"
                      onClick={() => setPayAmount(100)}
                      className="text-xs bg-white hover:bg-[#eae3d8] border border-[#dcd4c8] text-[#26201b] px-2.5 py-1 rounded-lg font-bold cursor-pointer"
                    >
                      100 ج.م
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#4a4237]">
                طريقة السداد:
              </label>
              <div className="w-full">
                <div className="p-3 rounded-xl border-2 border-emerald-600 bg-emerald-50 text-emerald-950 font-black text-xs flex items-center justify-center gap-2 shadow-2xs">
                  <Banknote className="w-4 h-4 text-emerald-600" />
                  <span>نقدي للكاشير في البوفية (كاش)</span>
                </div>
              </div>
            </div>

            {/* Notes / Reference */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#4a4237]">
                ملاحظات أو تفاصيل السداد (اختياري):
              </label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="مثال: تم تسليم المبلغ نقداً للكاشير..."
                className="w-full p-2.5 bg-white border border-[#dcd4c8] rounded-xl text-xs text-[#26201b] focus:outline-none focus:ring-1 focus:ring-emerald-600"
              />
            </div>

            {/* Note about disappearance of debt */}
            <div className="text-[11px] text-[#7d7367] bg-white p-2.5 rounded-xl border border-[#eee8df]">
              بمجرد تأكيد السداد الكامل ({formatCurrency(payAmount)})، ستختفي مديونيتك من الشاشة فوراً ويصبح حسابك مسدداً بالكامل.
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full py-3 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white rounded-xl font-black text-sm transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>تأكيد سداد {formatCurrency(payAmount)} الآن</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
