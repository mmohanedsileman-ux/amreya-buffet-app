import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Trash2, 
  Plus, 
  Minus, 
  CreditCard, 
  Banknote, 
  Smartphone, 
  UserCheck, 
  AlertTriangle,
  AlertCircle,
  ArrowRight,
  Receipt,
  UserPlus
} from 'lucide-react';
import { CartItem, Customer, PaymentMethod, Order } from '../types';
import { formatCurrency } from '../utils/formatters';
import { extractCleanEmployeeName, extractEmployeeDigits } from '../services/googleSheets';
import { INITIAL_CUSTOMERS } from '../data/initialData';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  customers: Customer[];
  onUpdateQuantity: (cartItemId: string, delta: number) => void;
  onRemoveItem: (cartItemId: string) => void;
  onClearCart: () => void;
  onCheckoutComplete: (order: Order) => void;
  onOpenAddCustomer: () => void;
  activeCustomer?: Customer | null;
  isAdminMode?: boolean;
}

export const isGuestOrExternalCustomer = (customer?: Customer | null): boolean => {
  if (!customer) return true;
  if (customer.category === 'عميل خارجي') return true;
  if (customer.code === 'GUEST' || customer.id?.startsWith('CUST-GUEST')) return true;
  if (customer.name?.includes('عميل خارجي') || customer.name?.includes('زائر خارجي')) return true;
  return false;
};

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  cart,
  customers,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onCheckoutComplete,
  onOpenAddCustomer,
  activeCustomer,
  isAdminMode = false,
}) => {
  // Resolve effective active customer with multi-layer fallback so an employee session is NEVER lost
  const storedActiveId = typeof window !== 'undefined'
    ? (localStorage.getItem('cafe_active_customer_id') || sessionStorage.getItem('cafe_active_customer_id'))
    : null;

  const effectiveActiveCustomer = activeCustomer || (storedActiveId ? (
    customers.find(c => c.id === storedActiveId || c.code === storedActiveId) ||
    INITIAL_CUSTOMERS.find(c => c.id === storedActiveId || c.code === storedActiveId)
  ) : null);

  // A registered employee can NEVER be a guest or hospitality order!
  const isRegisteredEmployee = Boolean(
    effectiveActiveCustomer && 
    !isGuestOrExternalCustomer(effectiveActiveCustomer) &&
    (effectiveActiveCustomer.category === 'موظف' || extractEmployeeDigits(effectiveActiveCustomer.code) || extractEmployeeDigits(effectiveActiveCustomer.name))
  );

  const isDebtAllowed = isRegisteredEmployee || !isGuestOrExternalCustomer(effectiveActiveCustomer);

  const eligibleDebtCustomers = customers.filter(c => !isGuestOrExternalCustomer(c));
  const defaultDebtCustomerId = eligibleDebtCustomers[0]?.id || 'CUST-1003';

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    effectiveActiveCustomer && !isGuestOrExternalCustomer(effectiveActiveCustomer) ? effectiveActiveCustomer.id : defaultDebtCustomerId
  );
  const [cashierNotes, setCashierNotes] = useState<string>('');
  const [partialPaidAmount, setPartialPaidAmount] = useState<string>('');
  const [isPartialPayment, setIsPartialPayment] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const isSubmittingRef = useRef<boolean>(false);

  // Reset submitting lock whenever drawer is closed
  useEffect(() => {
    if (!isOpen) {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      setOrderError(null);
    }
  }, [isOpen]);

  // If debt is not allowed for the active customer, immediately reset to 'cash'
  useEffect(() => {
    if (!isAdminMode && !isDebtAllowed && paymentMethod === 'debt_account') {
      setPaymentMethod('cash');
    }
  }, [isAdminMode, isDebtAllowed, paymentMethod]);

  const lastCheckoutClickRef = useRef<number>(0);
  const [justSubmitted, setJustSubmitted] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      const timer = setTimeout(() => setJustSubmitted(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Sync selected customer if activeCustomer changes
  useEffect(() => {
    if (activeCustomer && !isGuestOrExternalCustomer(activeCustomer)) {
      setSelectedCustomerId(activeCustomer.id);
    }
  }, [activeCustomer]);

  // Selected customer for debt order:
  const selectedDebtCustomer = customers.find(c => c.id === selectedCustomerId) || eligibleDebtCustomers[0];
  const selectedCustomer = selectedDebtCustomer;

  // Detect if current order is for Hospitality account (Code 1000 or category 'ضيوف وإدارة' or name contains 'ضيوف')
  const isHospitalityAccount = Boolean(
    (activeCustomer && (activeCustomer.code === '1000' || activeCustomer.category === 'ضيوف وإدارة' || activeCustomer.name?.includes('ضيوف'))) ||
    (isAdminMode && selectedCustomer && (selectedCustomer.code === '1000' || selectedCustomer.category === 'ضيوف وإدارة' || selectedCustomer.name?.includes('ضيوف')))
  );

  const subtotal = cart.reduce((sum, item) => sum + item.itemTotal, 0);
  const discountAmount = isHospitalityAccount ? subtotal : 0;
  const totalAmount = isHospitalityAccount ? 0 : subtotal;

  const calculatedPaidAmount = () => {
    if (isHospitalityAccount) {
      return 0;
    }
    if (paymentMethod !== 'debt_account') {
      return totalAmount;
    }
    if (isPartialPayment) {
      const parsed = parseFloat(partialPaidAmount);
      return isNaN(parsed) ? 0 : Math.min(parsed, totalAmount);
    }
    return 0; // Purely on credit
  };

  const remainingOnDebt = totalAmount - calculatedPaidAmount();

  const handleCreateOrder = () => {
    const now = Date.now();
    if (now - lastCheckoutClickRef.current < 2500) {
      return;
    }
    lastCheckoutClickRef.current = now;

    if (isSubmittingRef.current || isSubmitting || justSubmitted || cart.length === 0) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setJustSubmitted(true);

    const paid = calculatedPaidAmount();
    const remaining = totalAmount - paid;

    // CRITICAL: Determine customer for order strictly and never default an unauthenticated cash customer to another employee!
    let customerForOrder: Customer | undefined = undefined;

    if (isHospitalityAccount) {
      customerForOrder = activeCustomer || selectedCustomer || customers.find(c => c.code === '1000');
    } else if (isRegisteredEmployee && effectiveActiveCustomer) {
      // 100% Guaranteed: Registered employee ALWAYS gets their own account
      customerForOrder = effectiveActiveCustomer;
    } else if (isAdminMode && paymentMethod === 'debt_account') {
      customerForOrder = selectedDebtCustomer;
    } else {
      // Cash payment when no employee is logged in: external cash customer
      customerForOrder = undefined;
    }

    // Guard: External customers / visitors can NEVER checkout on debt
    if (!isHospitalityAccount && paymentMethod === 'debt_account' && isGuestOrExternalCustomer(customerForOrder)) {
      setOrderError('عذراً، نظام على الحساب (الآجل) مخصص للموظفين المسجلين فقط، ولا يُتاح للعملاء الخارجيين.');
      setPaymentMethod('cash');
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      return;
    }
    setOrderError(null);

    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const finalCustomerId = isHospitalityAccount
      ? (activeCustomer?.id || selectedCustomer?.id || 'CUST-1000')
      : (isRegisteredEmployee && effectiveActiveCustomer)
        ? effectiveActiveCustomer.id
        : (customerForOrder ? customerForOrder.id : 'CUST-EXTERNAL');

    const finalCustomerName = isHospitalityAccount
      ? 'ضيوف - 1000'
      : (isRegisteredEmployee && effectiveActiveCustomer)
        ? effectiveActiveCustomer.name
        : (customerForOrder ? customerForOrder.name : 'عميل نقدي خارجي');

    const finalNotes = isHospitalityAccount
      ? (cashierNotes.trim() ? cashierNotes.trim() : 'طلب ضيافة معتمد')
      : (cashierNotes.trim() ? cashierNotes.trim() : undefined);

    const newOrder: Order = {
      id: `ORD-${randomNum}`,
      orderNumber: randomNum,
      createdAt: new Date().toISOString(),
      items: cart.map(item => ({
        name: item.item.name,
        quantity: item.quantity,
        price: item.item.price + item.sizePriceDelta,
        sugar: item.selectedSugar,
        size: item.selectedSize,
        total: item.itemTotal,
      })),
      subtotal: subtotal,
      discount: discountAmount,
      totalAmount: totalAmount,
      paymentMethod: isHospitalityAccount ? 'cash' : paymentMethod,
      customerId: finalCustomerId,
      customerName: finalCustomerName,
      paidAmount: paid,
      remainingAmount: remaining,
      notes: finalNotes,
      cashierName: isAdminMode ? 'كاشير الكافتيريا' : (isHospitalityAccount ? 'طلب ضيافة (حساب 1000)' : 'طلب ذاتي (بوابة الموظف)'),
    };

    onCheckoutComplete(newOrder);
    onClearCart();
    setCashierNotes('');
    setIsPartialPayment(false);
    setPartialPaidAmount('');
    isSubmittingRef.current = false;
    setIsSubmitting(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-xs transition-opacity" 
        onClick={onClose}
      />

      <div className="fixed inset-y-0 left-0 max-w-full flex pl-0 sm:pl-10">
        <div className="w-screen max-w-md bg-[#faf8f5] text-[#26201b] shadow-2xl flex flex-col border-r border-[#e3dbcf]">
          {/* Header */}
          <div className="p-4 sm:p-5 bg-white border-b border-[#e8e2d9] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#c48956] text-white flex items-center justify-center font-bold">
                <Receipt className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-black text-[#26201b]">فاتورة الطلب الحالية</h3>
                <p className="text-xs text-[#8c8072]">
                  {cart.length > 0 ? `${cart.length} أصناف في السلة` : 'السلة فارغة'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {cart.length > 0 && (
                <button
                  onClick={onClearCart}
                  className="text-xs text-rose-600 hover:text-rose-700 font-bold px-2 py-1 rounded cursor-pointer"
                >
                  إفراغ
                </button>
              )}
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg text-[#7d7367] hover:bg-[#f0ebe3] flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
            {cart.length === 0 ? (
              <div className="py-16 text-center text-[#8c8072]">
                <Receipt className="w-12 h-12 mx-auto text-[#d4c9bd] mb-3 stroke-[1.5]" />
                <p className="text-sm font-bold text-[#4a4237]">لا توجد طلبات في السلة بعد</p>
                <p className="text-xs mt-1 text-[#8c8072]">
                  تصفح منيو الكافيه واضغط "إضافة للطلب" للبدء
                </p>
              </div>
            ) : (
              cart.map((cartItem) => (
                <div
                  key={cartItem.cartItemId}
                  className="bg-white rounded-xl p-3 border border-[#e8e2d9] shadow-2xs flex items-center justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h4 className="text-sm font-black text-[#26201b] truncate">
                        {cartItem.item.name}
                      </h4>
                      {cartItem.isFreeGift && (
                        <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black px-1.5 py-0.5 rounded-md inline-flex items-center gap-0.5 animate-pulse">
                          <span>🎁 هدية عجلة الحظ</span>
                        </span>
                      )}
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px] text-[#7d7367]">
                      {cartItem.selectedSugar && (
                        <span className="bg-[#f5f1eb] text-[#8c5b30] px-1.5 py-0.5 rounded font-medium">
                          {cartItem.selectedSugar}
                        </span>
                      )}
                      {cartItem.selectedSize && (
                        <span className="bg-[#f5f1eb] text-[#8c5b30] px-1.5 py-0.5 rounded font-medium">
                          {cartItem.selectedSize}
                        </span>
                      )}
                      {cartItem.notes && (
                        <span className="text-[#915829] italic truncate max-w-[140px]">
                          "{cartItem.notes}"
                        </span>
                      )}
                    </div>

                    <div className="text-xs font-bold text-[#26201b] mt-1">
                      {cartItem.isFreeGift ? (
                        <span className="text-emerald-700 font-black">مجاناً (0 ج.م)</span>
                      ) : (
                        formatCurrency(cartItem.itemTotal)
                      )}
                    </div>
                  </div>

                  {/* Quantity Controls */}
                  <div className="flex items-center gap-1.5 bg-[#f5f1eb] rounded-lg p-1">
                    <button
                      onClick={() => onUpdateQuantity(cartItem.cartItemId, -1)}
                      className="w-6 h-6 rounded bg-white text-[#4a4237] hover:bg-[#eae3d8] flex items-center justify-center cursor-pointer shadow-2xs"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-6 text-center text-xs font-black text-[#26201b]">
                      {cartItem.quantity}
                    </span>
                    <button
                      onClick={() => onUpdateQuantity(cartItem.cartItemId, 1)}
                      className="w-6 h-6 rounded bg-white text-[#4a4237] hover:bg-[#eae3d8] flex items-center justify-center cursor-pointer shadow-2xs"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Remove Item */}
                  <button
                    onClick={() => onRemoveItem(cartItem.cartItemId)}
                    className="text-[#b0a599] hover:text-rose-600 p-1 cursor-pointer"
                    title="حذف الصنف"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Checkout & Payment Section */}
          {cart.length > 0 && (
            <div className="bg-white border-t border-[#e8e2d9] p-4 sm:p-5 space-y-4 shadow-lg">
              {/* Total Calculation */}
              <div className="space-y-1.5 bg-[#faf8f5] p-3 rounded-xl border border-[#ece4d9]">
                <div className="flex items-center justify-between text-xs text-[#7d7367]">
                  <span>مجموع الطلب:</span>
                  <span className="font-bold text-[#26201b]">{formatCurrency(subtotal)}</span>
                </div>

                {isHospitalityAccount && (
                  <div className="flex items-center justify-between text-xs text-purple-900 bg-purple-50 p-2 rounded-lg border border-purple-200 font-bold">
                    <span className="flex items-center gap-1.5">
                      <span>☕</span>
                      <span>خصم الضيافة (100% مجاني):</span>
                    </span>
                    <span className="font-black text-purple-700">-{formatCurrency(subtotal)}</span>
                  </div>
                )}

                <div className="flex items-center justify-between text-sm font-black text-[#26201b] pt-1.5 border-t border-[#e5dcd1]">
                  <span>الإجمالي المستحق:</span>
                  <span className={`text-base font-black ${isHospitalityAccount ? 'text-emerald-700' : 'text-[#915829]'}`}>
                    {isHospitalityAccount ? '0 ج.م (ضيافة مجانية)' : formatCurrency(totalAmount)}
                  </span>
                </div>
              </div>

              {/* Payment Method Selector */}
              {isHospitalityAccount ? (
                <div className="p-3.5 bg-purple-50 border-2 border-purple-300 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-base">☕</span>
                      <span className="text-xs font-black text-purple-950">حساب الضيافة والضيوف (1000)</span>
                    </div>
                    <span className="text-[10px] bg-purple-700 text-white font-black px-2.5 py-0.5 rounded-full shadow-2xs">
                      مجاني 100%
                    </span>
                  </div>
                  <p className="text-[11px] text-purple-800 leading-relaxed font-medium">
                    طلب ضيافة معتمد لضيوف الإدارة بقيمة 0 ج.م دون أي مديونية أو دفع نقدي.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-[#4a4237]">
                      طريقة المحاسبة والسداد:
                    </label>
                    {isAdminMode && (
                      <span className="text-[10px] bg-purple-100 text-purple-900 font-black px-2 py-0.5 rounded-md">
                        صلاحيات الكاشير والإدارة 🔑
                      </span>
                    )}
                  </div>

                  <div className={`grid gap-2 ${isDebtAllowed ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {/* Option 1: Cash */}
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('cash')}
                      className={`flex items-center justify-center gap-1.5 p-2.5 rounded-xl text-xs font-bold border-2 transition-all cursor-pointer ${
                        paymentMethod === 'cash'
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-black shadow-xs ring-1 ring-emerald-600'
                          : 'border-[#dcd4c8] bg-[#fbf9f6] text-[#63594e] hover:bg-[#f3ede4]'
                      }`}
                    >
                      <Banknote className="w-4 h-4 text-emerald-600" />
                      <span>نقدي (كاش)</span>
                    </button>

                    {/* Option 2: Debt (if allowed or admin) */}
                    {(isDebtAllowed || isAdminMode) && (
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('debt_account')}
                        className={`flex items-center justify-center gap-1.5 p-2.5 rounded-xl text-xs font-bold border-2 transition-all cursor-pointer ${
                          paymentMethod === 'debt_account'
                            ? 'border-amber-600 bg-amber-50 text-amber-950 font-black shadow-xs ring-1 ring-amber-600'
                            : 'border-[#dcd4c8] bg-[#fbf9f6] text-[#63594e] hover:bg-[#f3ede4]'
                        }`}
                      >
                        <UserCheck className="w-4 h-4 text-amber-700" />
                        <span>على الحساب (آجل)</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* If Debt Account is Selected: Customer Picker & Balances */}
              {paymentMethod === 'debt_account' && (
                <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-3 space-y-3">
                  {!isAdminMode && activeCustomer ? (
                    // Customer view: only their own account
                    <div className="flex items-center justify-between pb-1 border-b border-amber-200/60">
                      <div>
                        <span className="text-xs font-black text-amber-950 block">
                          تسجيل الطلب على حسابك:
                        </span>
                        <span className="text-xs text-amber-900 font-bold">
                          {activeCustomer.name} (كود: {activeCustomer.code})
                        </span>
                      </div>
                      <span className="text-[10px] bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full font-bold">
                        {activeCustomer.category}
                      </span>
                    </div>
                  ) : (
                    // Admin view: dropdown selector for any eligible employee/corporate customer
                    <>
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-amber-900">
                          اختر الموظف:
                        </label>
                        <button
                          onClick={onOpenAddCustomer}
                          className="text-[11px] text-[#915829] hover:underline font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <UserPlus className="w-3 h-3" />
                          <span>+ موظف جديد</span>
                        </button>
                      </div>

                      <select
                        value={selectedCustomerId}
                        onChange={(e) => setSelectedCustomerId(e.target.value)}
                        className="w-full text-xs font-bold p-2 bg-white border border-amber-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
                      >
                        {customers
                          .filter(c => !isGuestOrExternalCustomer(c))
                          .map(c => (
                            <option key={c.id} value={c.id}>
                              {c.name} ({c.category}) - كود: {c.code} [متبقي عليه: {formatCurrency(c.remainingDebt)}]
                            </option>
                          ))}
                      </select>
                    </>
                  )}

                  {/* Customer Credit Balance Breakdown */}
                  {selectedCustomer && (
                    <div className="text-[11px] space-y-1 bg-white p-2.5 rounded-lg border border-amber-200 text-amber-950">
                      <div className="flex justify-between">
                        <span className="text-[#7d7367]">المديونية السابقة المسجلة:</span>
                        <strong className={selectedCustomer.remainingDebt > 0 ? "text-rose-600 font-black" : "text-emerald-600 font-black"}>
                          {formatCurrency(selectedCustomer.remainingDebt)}
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#7d7367]">الحد الائتماني المسموح:</span>
                        <span>{formatCurrency(selectedCustomer.creditLimit)}</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-amber-100 font-bold">
                        <span>الرصيد بعد هذا الطلب:</span>
                        <span className="text-amber-800">
                          {formatCurrency(selectedCustomer.remainingDebt + remainingOnDebt)}
                        </span>
                      </div>

                      {selectedCustomer.remainingDebt + remainingOnDebt > selectedCustomer.creditLimit && (
                        <div className="mt-1 flex items-center gap-1 text-[10px] text-rose-600 font-bold bg-rose-50 p-1 rounded">
                          <AlertTriangle className="w-3 h-3" />
                          <span>تنبيه: سيتجاوز العميل الحد الائتماني المقترح!</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Partial Payment Toggle (like paying 15 cash and 15 on debt) */}
                  <div className="pt-1">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-amber-900">
                      <input
                        type="checkbox"
                        checked={isPartialPayment}
                        onChange={(e) => {
                          setIsPartialPayment(e.target.checked);
                          if (e.target.checked) {
                            setPartialPaidAmount((totalAmount / 2).toString());
                          }
                        }}
                        className="rounded text-amber-600 focus:ring-amber-500 w-3.5 h-3.5"
                      />
                      <span>سداد جزء نقدي/إلكتروني الآن والباقي على الحساب</span>
                    </label>

                    {isPartialPayment && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-xs text-[#7d7367]">المبلغ المسدد حالياً:</span>
                        <input
                          type="number"
                          value={partialPaidAmount}
                          onChange={(e) => setPartialPaidAmount(e.target.value)}
                          max={totalAmount}
                          min={0}
                          className="w-24 text-xs font-black px-2 py-1 bg-white border border-amber-300 rounded-lg text-center"
                        />
                        <span className="text-xs font-bold text-rose-600">
                          (المتبقي آجل: {formatCurrency(remainingOnDebt)})
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Cashier Notes */}
              <div>
                <input
                  type="text"
                  placeholder="ملاحظات على الفاتورة (رقم طاولة، اسم الضيف...)"
                  value={cashierNotes}
                  onChange={(e) => setCashierNotes(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-[#faf8f5] border border-[#d9d1c7] rounded-xl focus:outline-none focus:border-[#c48956]"
                />
              </div>

              {/* Inline error feedback if any */}
              {orderError && (
                <div className="flex items-center gap-2 p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-bold animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{orderError}</span>
                </div>
              )}

              {/* Submit Order Button */}
              <button
                id="checkout-confirm-btn"
                type="button"
                onClick={handleCreateOrder}
                disabled={isSubmitting || justSubmitted || cart.length === 0}
                className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-sm transition-all cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed text-white ${
                  isHospitalityAccount 
                    ? 'bg-purple-700 hover:bg-purple-800 ring-2 ring-purple-400/50' 
                    : 'bg-[#26201b] hover:bg-[#c48956]'
                }`}
              >
                <span>
                  {isSubmitting || justSubmitted
                    ? 'جاري تأكيد وتسجيل الطلب... ⏳' 
                    : isHospitalityAccount
                      ? 'إتمام طلب الضيافة (مجاني 0 ج.م) ☕'
                      : `إتمام الطلب (${formatCurrency(totalAmount)})`}
                </span>
                <ArrowRight className="w-4 h-4 rotate-180" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
