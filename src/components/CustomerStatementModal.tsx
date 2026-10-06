import React from 'react';
import { X, Printer, UserCheck, Calendar, Receipt, DollarSign, Clock } from 'lucide-react';
import { Customer, Order, PaymentTransaction } from '../types';
import { formatCurrency, formatDateTime } from '../utils/formatters';

interface CustomerStatementModalProps {
  customer: Customer | null;
  orders: Order[];
  transactions: PaymentTransaction[];
  onClose: () => void;
  onOpenSettleModal: (customer: Customer) => void;
}

export const CustomerStatementModal: React.FC<CustomerStatementModalProps> = ({
  customer,
  orders,
  transactions,
  onClose,
  onOpenSettleModal,
}) => {
  if (!customer) return null;

  const customerOrders = orders.filter(
    o => o.customerId === customer.id || (o.customerName && o.customerName.includes(customer.name))
  );

  const customerTxns = transactions.filter(
    t => t.customerId === customer.id || t.customerName === customer.name
  );

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col border border-[#e8e2d9] shadow-2xl relative space-y-4 animate-in fade-in zoom-in duration-150 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#f0eae1] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-[#915829] flex items-center justify-center font-bold">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-[#26201b]">{customer.name}</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#f5f1eb] text-[#8c5b30]">
                  {customer.category}
                </span>
              </div>
              <p className="text-xs text-[#7d7367]">
                كود العميل: <span className="font-mono font-bold text-[#26201b]">{customer.code}</span> • كشف حساب تفصيلي معتمد
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-[#8c8072] hover:text-[#26201b] p-1 rounded-lg hover:bg-[#f5f1eb] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {/* Customer Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="bg-[#faf8f5] p-3 rounded-xl border border-[#ece4d9]">
              <span className="text-[11px] text-[#7d7367] block">إجمالي المسحوبات</span>
              <strong className="text-sm font-black text-[#26201b] mt-1 block">
                {formatCurrency(customer.totalOrders)}
              </strong>
            </div>

            <div className="bg-[#faf8f5] p-3 rounded-xl border border-[#ece4d9]">
              <span className="text-[11px] text-[#7d7367] block">إجمالي المسدد</span>
              <strong className="text-sm font-black text-emerald-700 mt-1 block">
                {formatCurrency(customer.totalPaid)}
              </strong>
            </div>

            <div className="bg-rose-50/70 p-3 rounded-xl border border-rose-200">
              <span className="text-[11px] text-rose-800 font-bold block">المديونية المتبقية</span>
              <strong className="text-sm font-black text-rose-600 mt-1 block">
                {formatCurrency(customer.remainingDebt)}
              </strong>
            </div>

            <div className="bg-[#faf8f5] p-3 rounded-xl border border-[#ece4d9]">
              <span className="text-[11px] text-[#7d7367] block">الحد الائتماني</span>
              <strong className="text-sm font-black text-[#63594e] mt-1 block">
                {formatCurrency(customer.creditLimit)}
              </strong>
            </div>
          </div>

          {/* Orders History Section */}
          <div className="space-y-2">
            <h4 className="text-xs font-black text-[#26201b] flex items-center gap-1.5">
              <Receipt className="w-4 h-4 text-[#c48956]" />
              <span>فواتير ومسحوبات العميل من الكافيه ({customerOrders.length})</span>
            </h4>

            {customerOrders.length === 0 ? (
              <p className="text-xs text-[#8c8072] bg-[#faf8f5] p-3 rounded-xl text-center border border-[#eee7dd]">
                لا توجد فواتير مسجلة لهذا العميل حالياً
              </p>
            ) : (
              <div className="border border-[#e8e2d9] rounded-xl overflow-hidden text-xs">
                <table className="w-full text-right">
                  <thead className="bg-[#fcfaf7] border-b border-[#e8e2d9] text-[#7d7367] font-bold">
                    <tr>
                      <th className="py-2 px-3">رقم الفاتورة والتاريخ</th>
                      <th className="py-2 px-3">الأصناف</th>
                      <th className="py-2 px-3">القيمة</th>
                      <th className="py-2 px-3">مسدد / آجل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f0eae1]">
                    {customerOrders.map(o => (
                      <tr key={o.id} className="hover:bg-[#faf7f2]">
                        <td className="py-2 px-3">
                          <span className="font-bold"># {o.orderNumber}</span>
                          <span className="text-[10px] text-[#8c8072] block">{formatDateTime(o.createdAt)}</span>
                        </td>
                        <td className="py-2 px-3 text-[#4a4237]">
                          {o.items.map(i => `${i.quantity}× ${i.name}`).join(' ، ')}
                        </td>
                        <td className="py-2 px-3 font-black text-[#26201b]">
                          {formatCurrency(o.totalAmount)}
                        </td>
                        <td className="py-2 px-3">
                          <div className="text-emerald-700 font-bold">{formatCurrency(o.paidAmount)}</div>
                          {o.remainingAmount > 0 && (
                            <div className="text-rose-600 text-[10px] font-bold">
                              متبقي: {formatCurrency(o.remainingAmount)}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Payments & Collections History */}
          <div className="space-y-2">
            <h4 className="text-xs font-black text-[#26201b] flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              <span>سندات ودفعات السداد المسجلة ({customerTxns.length})</span>
            </h4>

            {customerTxns.length === 0 ? (
              <p className="text-xs text-[#8c8072] bg-[#faf8f5] p-3 rounded-xl text-center border border-[#eee7dd]">
                لا توجد سندات سداد مسجلة
              </p>
            ) : (
              <div className="border border-[#e8e2d9] rounded-xl overflow-hidden text-xs">
                <table className="w-full text-right">
                  <thead className="bg-[#fcfaf7] border-b border-[#e8e2d9] text-[#7d7367] font-bold">
                    <tr>
                      <th className="py-2 px-3">رقم الإيصال والتاريخ</th>
                      <th className="py-2 px-3">طريقة السداد</th>
                      <th className="py-2 px-3">المبلغ المسدد</th>
                      <th className="py-2 px-3">ملاحظات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f0eae1]">
                    {customerTxns.map(t => (
                      <tr key={t.id} className="hover:bg-[#faf7f2]">
                        <td className="py-2 px-3">
                          <span className="font-bold">{t.receiptNumber || t.id}</span>
                          <span className="text-[10px] text-[#8c8072] block">{formatDateTime(t.createdAt)}</span>
                        </td>
                        <td className="py-2 px-3">
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-bold">
                            {t.paymentMethod === 'cash' && 'نقدي'}
                            {t.paymentMethod === 'instapay' && 'انستاباي'}
                            {t.paymentMethod === 'vodafone_cash' && 'فودافون كاش'}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-black text-emerald-700">
                          {formatCurrency(t.amount)}
                        </td>
                        <td className="py-2 px-3 text-[#7d7367]">
                          {t.notes || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-[#f0eae1] flex items-center justify-between gap-3 bg-[#faf8f5]">
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-[#eee6dc] text-[#4a4237] border border-[#d9d1c7] rounded-xl text-xs font-bold cursor-pointer transition-all"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة كشف الحساب</span>
          </button>

          <div className="flex items-center gap-2">
            {customer.remainingDebt > 0 && (
              <button
                onClick={() => {
                  onClose();
                  onOpenSettleModal(customer);
                }}
                className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-xl text-xs font-black cursor-pointer shadow-xs transition-all"
              >
                <DollarSign className="w-4 h-4" />
                <span>سداد مديونية العميل</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 bg-[#f0eae1] hover:bg-[#e4dcce] text-[#26201b] rounded-xl text-xs font-bold cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
