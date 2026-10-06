import React, { useState, useEffect } from 'react';
import { X, DollarSign, Banknote, CreditCard, Smartphone, Check } from 'lucide-react';
import { Customer, PaymentTransaction } from '../types';
import { formatCurrency } from '../utils/formatters';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  customers: Customer[];
  onRecordPayment: (transaction: PaymentTransaction) => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  customer,
  customers,
  onRecordPayment,
}) => {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'instapay' | 'vodafone_cash'>('cash');
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    if (customer) {
      setSelectedCustomerId(customer.id);
      setAmount(customer.remainingDebt > 0 ? customer.remainingDebt.toString() : '');
    } else if (customers.length > 0) {
      const firstDebtor = customers.find(c => c.remainingDebt > 0) || customers[0];
      setSelectedCustomerId(firstDebtor.id);
      setAmount(firstDebtor.remainingDebt > 0 ? firstDebtor.remainingDebt.toString() : '');
    }
  }, [customer, customers, isOpen]);

  if (!isOpen) return null;

  const currentCustomer = customers.find(c => c.id === selectedCustomerId) || customer;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (!currentCustomer || isNaN(parsedAmount) || parsedAmount <= 0) return;

    const newTxn: PaymentTransaction = {
      id: `TXN-${Date.now().toString().slice(-4)}`,
      createdAt: new Date().toISOString(),
      customerId: currentCustomer.id,
      customerName: currentCustomer.name,
      amount: parsedAmount,
      paymentMethod,
      receiptNumber: `REC-${Math.floor(100 + Math.random() * 900)}`,
      notes: notes.trim() || undefined,
    };

    onRecordPayment(newTxn);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 border border-[#e8e2d9] shadow-2xl relative space-y-4 animate-in fade-in zoom-in duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#f0eae1] pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
              <DollarSign className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-black text-[#26201b]">تسجيل سداد مديونية</h3>
              <p className="text-xs text-[#7d7367]">تحصيل نقدي أو إلكتروني وتحديث الشيت فورياً</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-[#8c8072] hover:text-[#26201b] p-1 rounded-lg hover:bg-[#f5f1eb] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Select Customer */}
          <div>
            <label className="block text-xs font-bold text-[#4a4237] mb-1">
              اسم العميل أو الموظف:
            </label>
            <select
              value={selectedCustomerId}
              onChange={(e) => {
                setSelectedCustomerId(e.target.value);
                const cust = customers.find(c => c.id === e.target.value);
                if (cust && cust.remainingDebt > 0) {
                  setAmount(cust.remainingDebt.toString());
                }
              }}
              className="w-full text-xs font-bold p-2.5 bg-[#faf8f5] border border-[#d9d1c7] rounded-xl focus:outline-none focus:border-[#c48956]"
            >
              {customers.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.category}) - كود: {c.code} [متبقي: {formatCurrency(c.remainingDebt)}]
                </option>
              ))}
            </select>
          </div>

          {/* Current Debt Badge */}
          {currentCustomer && (
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-center justify-between text-xs">
              <span className="text-amber-900 font-bold">إجمالي المديونية المستحقة الحالية:</span>
              <strong className="text-sm font-black text-rose-600">
                {formatCurrency(currentCustomer.remainingDebt)}
              </strong>
            </div>
          )}

          {/* Amount to pay */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-[#4a4237]">
                المبلغ المسدد (ج.م):
              </label>
              {currentCustomer && currentCustomer.remainingDebt > 0 && (
                <button
                  type="button"
                  onClick={() => setAmount(currentCustomer.remainingDebt.toString())}
                  className="text-[11px] text-[#915829] hover:underline font-bold cursor-pointer"
                >
                  سداد كامل المبلغ ({formatCurrency(currentCustomer.remainingDebt)})
                </button>
              )}
            </div>
            <input
              type="number"
              min={1}
              max={currentCustomer?.remainingDebt || 10000}
              step="any"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full text-base font-black px-3 py-2 bg-white border border-[#d9d1c7] rounded-xl focus:outline-none focus:border-[#c48956]"
              placeholder="أدخل المبلغ..."
            />
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-xs font-bold text-[#4a4237] mb-1.5">
              طريقة التحصيل:
            </label>
            <div className="w-full">
              <div className="flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-emerald-600 bg-emerald-50 text-emerald-950 font-black text-xs shadow-2xs">
                <Banknote className="w-4 h-4 text-emerald-600" />
                <span>نقدي (كاش)</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-[#4a4237] mb-1">
              ملاحظات أو رقم الإيصال (اختياري):
            </label>
            <input
              type="text"
              placeholder="مثال: تحويل انستاباي رقم مرجعي 9283..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-[#faf8f5] border border-[#d9d1c7] rounded-xl focus:outline-none focus:border-[#c48956]"
            />
          </div>

          {/* Submit */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-[#f0eae1]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-[#7a7063] hover:text-[#26201b] cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white px-5 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer shadow-sm"
            >
              <Check className="w-4 h-4" />
              <span>تأكيد السداد وتحديث الشيت</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
