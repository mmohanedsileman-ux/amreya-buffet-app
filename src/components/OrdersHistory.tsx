import React, { useState } from 'react';
import { 
  Receipt, 
  Search, 
  Filter, 
  Printer, 
  CheckCircle2, 
  Clock, 
  CreditCard, 
  Banknote, 
  Smartphone, 
  UserCheck,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { Order, PaymentMethod } from '../types';
import { formatCurrency, formatDateTime } from '../utils/formatters';

interface OrdersHistoryProps {
  orders: Order[];
  onViewReceipt: (order: Order) => void;
  onSyncOrdersToSheet?: () => Promise<number>;
  isSyncingOrders?: boolean;
  googleUser?: any;
  onConnectGoogle?: () => void;
  syncFeedback?: { type: 'success' | 'error'; message: string } | null;
  onDismissFeedback?: () => void;
  isAdmin?: boolean;
  currentCustomerName?: string;
}

export const OrdersHistory: React.FC<OrdersHistoryProps> = ({ 
  orders, 
  onViewReceipt,
  onSyncOrdersToSheet,
  isSyncingOrders = false,
  googleUser,
  onConnectGoogle,
  syncFeedback,
  onDismissFeedback,
  isAdmin = false,
  currentCustomerName,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | 'all'>('all');

  const filteredOrders = orders.filter(order => {
    const matchSearch = 
      order.orderNumber.toString().includes(searchQuery) ||
      (order.customerName && order.customerName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      order.items.some(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchMethod = selectedMethod === 'all' || order.paymentMethod === selectedMethod;
    return matchSearch && matchMethod;
  });

  const getMethodBadge = (method: PaymentMethod) => {
    switch (method) {
      case 'cash':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
            <Banknote className="w-3 h-3 text-emerald-600" />
            نقدي
          </span>
        );
      case 'instapay':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-800 border border-indigo-200">
            <CreditCard className="w-3 h-3 text-indigo-600" />
            انستاباي
          </span>
        );
      case 'vodafone_cash':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-rose-50 text-rose-800 border border-rose-200">
            <Smartphone className="w-3 h-3 text-rose-600" />
            فودافون كاش
          </span>
        );
      case 'debt_account':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200">
            <UserCheck className="w-3 h-3 text-amber-700" />
            على الحساب (آجل)
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#e8e2d9] shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-[#26201b] flex items-center gap-2">
            <span>{isAdmin ? 'سجل فواتير وطلبات الكافيه (الإدارة)' : 'سجل طلباتي وفواتيري'}</span>
            <span className="text-xs bg-[#f4ece3] text-[#915829] px-2.5 py-0.5 rounded-full font-bold">
              {filteredOrders.length} فاتورة
            </span>
          </h2>
          <p className="text-xs text-[#7d7367] mt-0.5">
            {isAdmin 
              ? 'عرض وتتبع جميع الطلبات المسجلة وطرق الدفع والخصم من الحسابات'
              : (currentCustomerName ? `عرض وتتبع طلباتك الخاصة بك فقط يا ${currentCustomerName}` : 'عرض وتتبع طلباتك وفواتيرك السابقة الخاصة بك')}
          </p>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-60">
            <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-[#9e9386]" />
            <input
              type="text"
              placeholder={isAdmin ? "بحث برقم الطلب أو اسم العميل..." : "بحث برقم الطلب أو الأصناف..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pr-8 pl-3 py-1.5 text-xs bg-[#faf8f5] border border-[#d9d1c7] rounded-xl focus:outline-none focus:border-[#c48956]"
            />
          </div>

          <select
            value={selectedMethod}
            onChange={(e) => setSelectedMethod(e.target.value as any)}
            className="text-xs font-bold py-1.5 px-3 bg-[#faf8f5] border border-[#d9d1c7] rounded-xl focus:outline-none"
          >
            <option value="all">كل طرق الدفع</option>
            <option value="cash">نقدي (كاش)</option>
            <option value="debt_account">على الحساب (آجل)</option>
          </select>
        </div>
      </div>

      {/* Sync Feedback Banner */}
      {syncFeedback && (
        <div className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs font-bold animate-in fade-in ${
          syncFeedback.type === 'success' 
            ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
            : 'bg-rose-50 border-rose-300 text-rose-900'
        }`}>
          <div className="flex items-center gap-2">
            {syncFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{syncFeedback.message}</span>
          </div>
          {onDismissFeedback && (
            <button 
              onClick={onDismissFeedback}
              className="text-xs opacity-60 hover:opacity-100 font-bold px-2 py-0.5 cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* Orders List */}
      <div className="bg-white rounded-2xl border border-[#e8e2d9] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-[#fcfaf7] border-b border-[#e8e2d9] text-[#7d7367] font-bold">
              <tr>
                <th className="py-3 px-4">رقم الطلب والتاريخ</th>
                <th className="py-3 px-3">العميل / الحساب</th>
                <th className="py-3 px-3">الأصناف والكميات</th>
                <th className="py-3 px-3">طريقة الدفع</th>
                <th className="py-3 px-3">إجمالي الفاتورة</th>
                <th className="py-3 px-3">المسدد / المتبقي</th>
                <th className="py-3 px-4 text-center">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0eae1]">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#8c8072]">
                    لا توجد فواتير مسجلة مطابقة للبحث
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order, idx) => (
                  <tr key={`${order.id || 'ord'}-${idx}`} className="hover:bg-[#faf7f2]/80 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-black text-[#26201b]"># {order.orderNumber}</div>
                      <div className="text-[10px] text-[#8c8072] flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" />
                        <span>{formatDateTime(order.createdAt)}</span>
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <div className="font-black text-[#26201b]">
                        {order.customerName || 'عميل نقدي'}
                      </div>
                      <div className="text-[10px] text-[#8c8072]">
                        {order.cashierName}
                      </div>
                    </td>

                    <td className="py-3 px-3 max-w-xs">
                      <div className="truncate text-[#4a4237]">
                        {order.items.map(i => `${i.quantity}× ${i.name}`).join(' ، ')}
                      </div>
                      <div className="text-[10px] text-[#8c8072]">
                        {order.items.reduce((s, i) => s + i.quantity, 0)} قطع
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      {getMethodBadge(order.paymentMethod)}
                    </td>

                    <td className="py-3 px-3">
                      <span className="text-sm font-black text-[#26201b]">
                        {formatCurrency(order.totalAmount)}
                      </span>
                    </td>

                    <td className="py-3 px-3">
                      <div className="text-xs font-bold text-emerald-700">
                        مسدد: {formatCurrency(order.paidAmount)}
                      </div>
                      {order.remainingAmount > 0 && (
                        <div className="text-[11px] font-black text-rose-600">
                          متبقي: {formatCurrency(order.remainingAmount)}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => onViewReceipt(order)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#f5f1eb] hover:bg-[#c48956] hover:text-white text-[#554b40] rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>عرض الفاتورة</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
