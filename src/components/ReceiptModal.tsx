import React from 'react';
import { X, CheckCircle2 } from 'lucide-react';
import { Order } from '../types';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import { AmreyahBuffetLogo } from './AmreyahBuffetLogo';

interface ReceiptModalProps {
  order: Order | null;
  onClose: () => void;
  onNewOrderForAnotherEmployee?: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ 
  order, 
  onClose,
  onNewOrderForAnotherEmployee,
}) => {
  if (!order) return null;

  const getMethodArabic = (method: string) => {
    switch (method) {
      case 'cash': return 'نقدي (كاش)';
      case 'instapay': return 'انستاباي (InstaPay)';
      case 'vodafone_cash': return 'فودافون كاش';
      case 'debt_account': return 'على الحساب (آجل)';
      default: return method;
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 cursor-pointer"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl max-w-sm w-full p-5 sm:p-6 border border-[#e8e2d9] shadow-2xl relative space-y-4 animate-in fade-in zoom-in duration-150 cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute left-4 top-4 text-[#8c8072] hover:text-[#26201b] p-1 rounded-lg hover:bg-[#f5f1eb] cursor-pointer print:hidden"
          title="إغلاق"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Receipt Content Printable Area */}
        <div id="printable-receipt" className="text-center font-sans space-y-3">
          {/* Cafe Header */}
          <div className="border-b border-dashed border-[#d9d1c7] pb-3">
            <div className="flex justify-center mb-1.5">
              <AmreyahBuffetLogo size="sm" />
            </div>
            <h3 className="text-base font-black text-[#14294a]">بوفية العامرية</h3>
            <p className="text-[10px] font-bold text-[#8c5b30] tracking-wider uppercase">AMREYAH BUFFET</p>
            <p className="text-[10px] text-[#7d7367]">إيصال طلب إلكتروني معتمد</p>
          </div>

          {/* Order Details Metadata */}
          <div className="text-xs text-[#554b40] space-y-1 text-right py-1 border-b border-dashed border-[#d9d1c7]">
            <div className="flex justify-between">
              <span>رقم الفاتورة:</span>
              <span className="font-black text-[#26201b]"># {order.orderNumber}</span>
            </div>
            <div className="flex justify-between">
              <span>التاريخ والوقت:</span>
              <span>{formatDateTime(order.createdAt)}</span>
            </div>
            <div className="flex justify-between">
              <span>العميل / الحساب:</span>
              <span className="font-bold text-[#26201b]">{order.customerName || 'عميل كاش'}</span>
            </div>
            <div className="flex justify-between">
              <span>طريقة السداد:</span>
              <span className="font-bold text-[#915829]">{getMethodArabic(order.paymentMethod)}</span>
            </div>
            {order.notes && (
              <div className="flex justify-between text-[11px] text-[#8c8072]">
                <span>ملاحظات:</span>
                <span>{order.notes}</span>
              </div>
            )}
          </div>

          {/* Items Table */}
          <div className="py-2 border-b border-dashed border-[#d9d1c7]">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="text-[#8c8072] border-b border-gray-100">
                  <th className="pb-1 text-right">الصنف</th>
                  <th className="pb-1 text-center">الكمية</th>
                  <th className="pb-1 text-left">الإجمالي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {order.items.map((item, idx) => (
                  <tr key={idx} className="py-1">
                    <td className="py-1 text-right">
                      <div className="font-bold text-[#26201b]">{item.name}</div>
                      {(item.sugar || item.size) && (
                        <div className="text-[10px] text-[#915829]">
                          {[item.sugar, item.size].filter(Boolean).join(' • ')}
                        </div>
                      )}
                    </td>
                    <td className="py-1 text-center font-bold">{item.quantity}</td>
                    <td className="py-1 text-left font-black">{formatCurrency(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals Breakdown */}
          <div className="text-xs space-y-1 text-right pt-1 pb-3 border-b border-dashed border-[#d9d1c7]">
            <div className="flex justify-between text-[#7d7367]">
              <span>المجموع الفرعي:</span>
              <span>{formatCurrency(order.subtotal)}</span>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between text-xs text-purple-800 font-bold bg-purple-50 p-1.5 rounded-lg border border-purple-200">
                <span>☕ خصم الضيافة (100% مجاني):</span>
                <span>-{formatCurrency(order.discount)}</span>
              </div>
            )}
            <div className="flex justify-between font-black text-sm text-[#26201b] pt-1">
              <span>إجمالي الحساب:</span>
              <span className="text-[#915829]">{formatCurrency(order.totalAmount)}</span>
            </div>
            <div className="flex justify-between text-xs text-emerald-700 font-bold">
              <span>المبلغ المسدد:</span>
              <span>{formatCurrency(order.paidAmount)}</span>
            </div>
            {order.remainingAmount > 0 && (
              <div className="flex justify-between text-xs text-rose-600 font-black bg-rose-50 p-1.5 rounded">
                <span>المتبقي المستحق (آجل):</span>
                <span>{formatCurrency(order.remainingAmount)}</span>
              </div>
            )}
          </div>

          {/* Receipt Footer */}
          <div className="pt-2 text-[11px] text-[#8c8072] space-y-1">
            <p>شكراً لزيارتكم • نتمنى لكم يوماً سعيداً 😊</p>
            <p className="font-mono text-[9px] text-[#b0a599]">تم التسجيل بنجاح في النظام المحاسبي</p>
          </div>
        </div>

        {/* Modal Close Action Button */}
        <div className="pt-2 print:hidden space-y-2">
          <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 py-2 px-3 rounded-xl border border-emerald-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>تم إتمام وتسجيل الطلب بنجاح</span>
          </div>

          {onNewOrderForAnotherEmployee && (
            <button
              type="button"
              onClick={onNewOrderForAnotherEmployee}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 active:scale-[0.99] text-white rounded-xl text-xs font-black transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>طلب جديد لموظف آخر 👤</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 px-4 bg-[#26201b] hover:bg-[#3d332b] active:scale-[0.99] text-white rounded-xl text-sm font-black transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span>إغلاق الإيصال</span>
          </button>
        </div>
      </div>
    </div>
  );
};
