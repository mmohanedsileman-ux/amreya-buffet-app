import React, { useState, useMemo } from 'react';
import { 
  Coffee, 
  Sparkles, 
  Search, 
  Plus, 
  Check, 
  Flame, 
  GlassWater, 
  UtensilsCrossed, 
  Cake,
  SlidersHorizontal,
  ChevronDown,
  Gift,
  PartyPopper,
  Receipt,
  AlertCircle,
  Ban
} from 'lucide-react';
import { MenuItem, ProductCategory } from '../types';
import { formatCurrency } from '../utils/formatters';

interface CafeMenuProps {
  items: MenuItem[];
  onAddToCart: (
    item: MenuItem, 
    options?: { sugar?: string; size?: string; sizePriceDelta?: number; notes?: string }
  ) => void;
  onOpenAddMenuItem?: () => void;
  onOpenLuckyWheel?: () => void;
  searchQuery?: string;
  setSearchQuery?: (query: string) => void;
  customerGreeting?: { 
    name: string; 
    code?: string; 
    isEmployee: boolean;
    remainingDebt?: number;
    creditLimit?: number;
  } | null;
  onSwitchCustomer?: () => void;
  onOpenDebts?: () => void;
  isEmployee?: boolean;
  onSwitchToAdmin?: () => void;
}

const CATEGORIES: { key: ProductCategory | 'all'; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'all', label: 'جميع الأصناف', icon: Sparkles },
  { key: 'food', label: 'سندوتشات', icon: UtensilsCrossed },
  { key: 'special', label: 'أطباق بطاطس', icon: Flame },
  { key: 'desserts', label: 'شيبسي ومولتو', icon: Cake },
  { key: 'cold_drinks', label: 'ساقع ومياه', icon: GlassWater },
];

export const CafeMenu: React.FC<CafeMenuProps> = ({ 
  items, 
  onAddToCart, 
  onOpenLuckyWheel, 
  searchQuery: externalSearchQuery, 
  setSearchQuery: setExternalSearchQuery,
  customerGreeting,
  onSwitchCustomer,
  onOpenDebts,
  isEmployee = false,
  onSwitchToAdmin,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | 'all'>('all');
  const [internalSearchQuery, setInternalSearchQuery] = useState('');
  
  const searchQuery = externalSearchQuery !== undefined ? externalSearchQuery : internalSearchQuery;
  const setSearchQuery = setExternalSearchQuery || setInternalSearchQuery;
  const [activeItemWithOptions, setActiveItemWithOptions] = useState<MenuItem | null>(null);

  // Options state for modal/drawer
  const [selectedSugar, setSelectedSugar] = useState<string>('مظبوط');
  const [selectedSize, setSelectedSize] = useState<string>('عادي');
  const [itemNote, setItemNote] = useState<string>('');
  const [addedAnimationId, setAddedAnimationId] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchCategory = selectedCategory === 'all' || item.category === selectedCategory;
      const matchQuery = 
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.code && item.code.toLowerCase().includes(searchQuery.toLowerCase())) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCategory && matchQuery;
    });
  }, [items, selectedCategory, searchQuery]);

  const handleQuickAdd = (item: MenuItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!item.available) return;
    if (item.allowSugarOptions || item.allowSizeOptions) {
      // open options popup for fine-tuned taste
      setActiveItemWithOptions(item);
      setSelectedSugar('مظبوط');
      setSelectedSize('عادي');
      setItemNote('');
    } else {
      onAddToCart(item);
      triggerAddedFeedback(item.id);
    }
  };

  const triggerAddedFeedback = (id: string) => {
    setAddedAnimationId(id);
    setTimeout(() => {
      setAddedAnimationId(null);
    }, 900);
  };

  const handleConfirmWithOptions = () => {
    if (!activeItemWithOptions) return;
    const sizeDelta = selectedSize === 'كبير (+5 ج.م)' ? 5 : 0;
    onAddToCart(activeItemWithOptions, {
      sugar: activeItemWithOptions.allowSugarOptions ? selectedSugar : undefined,
      size: activeItemWithOptions.allowSizeOptions ? selectedSize : undefined,
      sizePriceDelta: sizeDelta,
      notes: itemNote.trim() ? itemNote : undefined,
    });
    triggerAddedFeedback(activeItemWithOptions.id);
    setActiveItemWithOptions(null);
  };

  return (
    <div className="space-y-6">
      {/* Customer Greeting Banner */}
      {customerGreeting && (
        <div className="bg-white rounded-2xl p-4 border border-[#e8e2d9] shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3 w-full sm:w-auto text-right">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-base flex-shrink-0">
              👋
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-black text-[#26201b]">
                  مرحباً بك يا {customerGreeting.name}
                </h2>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                  {customerGreeting.isEmployee ? 'حساب موظف معتمد' : 'طلب زائر / عميل خارجي'}
                </span>
              </div>
              <p className="text-xs text-[#7d7367] mt-0.5">
                {customerGreeting.isEmployee && customerGreeting.code
                  ? `كود الموظف: ${customerGreeting.code} • تفضل باختيار أصناف وجبتك ومشروباتك من المنيو`
                  : 'أهلاً بك في بوفية العامرية • طلبك جاهز للتسجيل الفوري'}
              </p>
            </div>
          </div>

          {/* Actions: Debt badge, Switch Account, and Cashier Mode */}
          <div className="w-full sm:w-auto flex flex-wrap items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#f0eae1]">
            {/* Employee Debt Status Badge */}
            {customerGreeting.isEmployee && (
              <div>
                {customerGreeting.remainingDebt && customerGreeting.remainingDebt > 0 ? (
                  <button
                    type="button"
                    onClick={onOpenDebts}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-800 font-bold text-xs transition-all shadow-xs cursor-pointer group"
                    title="اضغط لعرض تفاصيل حسابك وفواتيرك المعلقة"
                  >
                    <Receipt className="w-3.5 h-3.5 text-rose-600" />
                    <span>المديونية:</span>
                    <span className="font-black text-rose-700 bg-white px-2 py-0.5 rounded-lg border border-rose-200 shadow-inner">
                      {formatCurrency(customerGreeting.remainingDebt)}
                    </span>
                  </button>
                ) : (
                  <div className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-xs">
                    <span>الحساب مسدد بالكامل ✅</span>
                  </div>
                )}
              </div>
            )}

            {/* Switch / Logout Button */}
            {onSwitchCustomer && (
              <button
                type="button"
                onClick={onSwitchCustomer}
                className="px-3 py-1.5 bg-[#f5f1eb] hover:bg-[#eae3d8] text-[#5c5043] hover:text-[#26201b] rounded-xl text-xs font-bold transition-all border border-[#ded5c8] flex items-center gap-1 cursor-pointer"
                title="تسجيل الخروج والعودة لشاشة الترحيب الرئيسية"
              >
                <span>🚪 خروج / تبديل الحساب</span>
              </button>
            )}

            {/* Switch to Admin / Cashier Mode */}
            {onSwitchToAdmin && (
              <button
                type="button"
                onClick={onSwitchToAdmin}
                className="px-3 py-1.5 bg-[#172338] hover:bg-[#243553] text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-xs"
                title="الانتقال إلى لوحة الكاشير والإدارة العامة"
              >
                <span>🔑 لوحة الكاشير</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Lucky Wheel Promo Banner - ONLY FOR EMPLOYEES */}
      {isEmployee && onOpenLuckyWheel && (
        <div 
          onClick={onOpenLuckyWheel}
          className="bg-gradient-to-r from-[#26201b] via-[#3a2d21] to-[#26201b] rounded-2xl p-4 text-white border border-[#4d3c2c] shadow-sm hover:border-amber-400/60 transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-between gap-4 group"
        >
          <div className="flex items-center gap-3.5 w-full sm:w-auto">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-[#1e1b18] flex items-center justify-center text-2xl shadow-md group-hover:scale-105 group-hover:rotate-12 transition-all flex-shrink-0">
              🎡
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-black text-white">
                  جرب حظك
                </h3>
                <span className="text-[10px] bg-amber-400 text-[#1e1b18] px-2 py-0.5 rounded-full font-black animate-pulse">
                  مرة واحدة كل يوم 🎁
                </span>
              </div>
              <p className="text-xs text-[#d8cfc4] mt-0.5">
                دور العجلة دلوقتي وجرب حظك تكسب أي صنف في المنيو (شاورما، برجر، بطاطس، كانز...) مجاناً تماماً!
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenLuckyWheel();
            }}
            className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-xl text-xs font-black shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap"
          >
            <Sparkles className="w-4 h-4 text-amber-200" />
            <span>لف العجلة واكسب صنفك</span>
          </button>
        </div>
      )}

      {/* Menu Items Grid */}
      {filteredItems.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-[#e8e2d9]">
          <Coffee className="w-12 h-12 mx-auto text-[#c4b5a5] mb-3 stroke-[1.5]" />
          <h3 className="text-base font-bold text-[#26201b]">لم نتمكن من العثور على أي صنف</h3>
          <p className="text-xs text-[#8c8072] mt-1">
            جرب البحث بكلمة أخرى أو اختر تصنيفاً مختلفاً
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredItems.map(item => {
            const isAddedJustNow = addedAnimationId === item.id;
            const isAvailable = item.available !== false;
            return (
              <div
                key={item.id}
                onClick={() => {
                  if (!isAvailable) return;
                  if (item.allowSugarOptions || item.allowSizeOptions) {
                    setActiveItemWithOptions(item);
                    setSelectedSugar('مظبوط');
                    setSelectedSize('عادي');
                    setItemNote('');
                  } else {
                    onAddToCart(item);
                    triggerAddedFeedback(item.id);
                  }
                }}
                className={`group relative rounded-2xl border transition-all duration-200 p-4 flex flex-col justify-between ${
                  !isAvailable
                    ? 'bg-gray-50/80 border-gray-200 opacity-60 grayscale-[40%] cursor-not-allowed select-none shadow-none'
                    : isAddedJustNow
                    ? 'bg-white border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/20 cursor-pointer hover:shadow-md'
                    : 'bg-white border-[#e8e2d9] hover:border-[#c48956] cursor-pointer hover:shadow-md'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {item.code && (
                        <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                          !isAvailable
                            ? 'bg-gray-100 text-gray-500 border-gray-200'
                            : 'bg-amber-50 text-amber-900 border-amber-200'
                        }`}>
                          {item.code}
                        </span>
                      )}
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                        !isAvailable
                          ? 'bg-gray-100 text-gray-500'
                          : 'bg-[#f7f2ec] text-[#8c5b30]'
                      }`}>
                        {item.category === 'food' && 'سندوتش'}
                        {item.category === 'special' && 'طبق بطاطس'}
                        {item.category === 'desserts' && 'شيبسي / سناكس'}
                        {item.category === 'cold_drinks' && 'ساقع ومياه'}
                        {item.category === 'hot_drinks' && 'مشروب ساخن'}
                      </span>
                    </div>
                    {!isAvailable ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-full bg-rose-100 text-rose-700 border border-rose-200 shadow-xs">
                        <Ban className="w-3 h-3 text-rose-600" />
                        غير متوفر حالياً
                      </span>
                    ) : item.popular ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                        <Flame className="w-3 h-3 text-amber-600 fill-amber-500" />
                        الأكثر طلباً
                      </span>
                    ) : null}
                  </div>
                  <h3 className={`text-base font-black transition-colors leading-snug ${
                    !isAvailable ? 'text-gray-500 line-through decoration-gray-400' : 'text-[#26201b] group-hover:text-[#915829]'
                  }`}>
                    {item.name}
                  </h3>
                  <p className={`text-xs mt-1 line-clamp-2 leading-relaxed ${
                    !isAvailable ? 'text-gray-400' : 'text-[#7a7063]'
                  }`}>
                    {item.description}
                  </p>
                  {/* Availability note or Customization hints */}
                  {!isAvailable ? (
                    <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-rose-700 font-bold bg-rose-50 px-2 py-1 rounded-lg border border-rose-200/60">
                      <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
                      <span>نفد من المخزون / غير متوفر حالياً</span>
                    </div>
                  ) : (item.allowSugarOptions || item.allowSizeOptions) ? (
                    <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-[#915829] font-medium bg-[#fcf9f5] px-2 py-1 rounded-lg border border-[#eee7dd]">
                      <SlidersHorizontal className="w-3 h-3" />
                      <span>تخصيص السكر والحجم متوفر</span>
                    </div>
                  ) : null}
                </div>

                {/* Price and Add button */}
                <div className="mt-4 pt-3 border-t border-[#f0eae1] flex items-center justify-between">
                  <div>
                    <span className="text-xs text-[#8c8072]">السعر:</span>
                    <div className={`text-lg font-black ${!isAvailable ? 'text-gray-400' : 'text-[#26201b]'}`}>
                      {formatCurrency(item.price)}
                    </div>
                  </div>
                  {!isAvailable ? (
                    <button
                      type="button"
                      disabled
                      aria-disabled="true"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-gray-200 text-gray-500 cursor-not-allowed border border-gray-300 shadow-none"
                    >
                      <Ban className="w-3.5 h-3.5 text-gray-400" />
                      <span>غير متوفر</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => handleQuickAdd(item, e)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs ${
                        isAddedJustNow
                          ? 'bg-emerald-600 text-white'
                          : 'bg-[#26201b] group-hover:bg-[#c48956] text-white'
                      }`}
                    >
                      {isAddedJustNow ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>تمت الإضافة!</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5" />
                          <span>إضافة للطلب</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal for Item Options (Sugar, Size, Notes) */}
      {activeItemWithOptions && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div 
            className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 border border-[#e8e2d9] shadow-2xl space-y-5 animate-in fade-in zoom-in duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-[#f0eae1] pb-3">
              <div>
                <span className="text-[11px] font-bold text-[#915829] bg-[#f7f2ec] px-2 py-0.5 rounded-md">
                  تخصيص المشروب
                </span>
                <h3 className="text-lg font-black text-[#26201b] mt-1">
                  {activeItemWithOptions.name}
                </h3>
              </div>
              <div className="text-left">
                <span className="text-xs text-[#8c8072]">السعر الأساسي</span>
                <div className="text-base font-black text-[#26201b]">
                  {formatCurrency(activeItemWithOptions.price)}
                </div>
              </div>
            </div>

            {/* Sugar Options */}
            {activeItemWithOptions.allowSugarOptions && (
              <div className="space-y-2">
                <label className="block text-xs font-bold text-[#4a4237]">
                  درجة السكر المطلوبة:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {['بدون سكر', 'على الريحة', 'مظبوط', 'زيادة', 'مانو'].map(sugar => (
                    <button
                      key={sugar}
                      type="button"
                      onClick={() => setSelectedSugar(sugar)}
                      className={`py-2 px-2 text-xs font-bold rounded-xl border text-center transition-all cursor-pointer ${
                        selectedSugar === sugar
                          ? 'border-[#c48956] bg-[#fbf6f0] text-[#915829] font-black'
                          : 'border-[#e0d7cb] bg-white text-[#63594e] hover:bg-[#faf7f2]'
                      }`}
                    >
                      {sugar}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Size Options */}
            {activeItemWithOptions.allowSizeOptions && (
              <div className="space-y-2">
                <label className="block text-xs font-bold text-[#4a4237]">
                  حجم الكوب:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedSize('عادي')}
                    className={`py-2 px-3 text-xs font-bold rounded-xl border text-center transition-all cursor-pointer ${
                      selectedSize === 'عادي'
                        ? 'border-[#c48956] bg-[#fbf6f0] text-[#915829] font-black'
                        : 'border-[#e0d7cb] bg-white text-[#63594e]'
                    }`}
                  >
                    حجم عادي (سعر أساسي)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedSize('كبير (+5 ج.م)')}
                    className={`py-2 px-3 text-xs font-bold rounded-xl border text-center transition-all cursor-pointer ${
                      selectedSize === 'كبير (+5 ج.م)'
                        ? 'border-[#c48956] bg-[#fbf6f0] text-[#915829] font-black'
                        : 'border-[#e0d7cb] bg-white text-[#63594e]'
                    }`}
                  >
                    حجم كبير (+5 ج.م)
                  </button>
                </div>
              </div>
            )}

            {/* Special Instructions Note */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#4a4237]">
                ملاحظات خاصة (اختياري):
              </label>
              <input
                type="text"
                placeholder="مثال: حليب ساخن، خفيف، بدون ثلج..."
                value={itemNote}
                onChange={(e) => setItemNote(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-[#faf8f5] border border-[#d9d1c7] rounded-xl focus:outline-none focus:border-[#c48956]"
              />
            </div>

            {/* Summary & Actions */}
            <div className="pt-2 border-t border-[#f0eae1] flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setActiveItemWithOptions(null)}
                className="px-4 py-2 text-xs font-bold text-[#7a7063] hover:text-[#26201b] rounded-xl cursor-pointer"
              >
                إلغاء
              </button>

              <button
                type="button"
                onClick={handleConfirmWithOptions}
                className="flex items-center gap-2 bg-[#c48956] hover:bg-[#b07847] text-white px-5 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer shadow-sm"
              >
                <Check className="w-4 h-4" />
                <span>إضافة إلى الفاتورة ({formatCurrency(
                  activeItemWithOptions.price + (selectedSize === 'كبير (+5 ج.م)' ? 5 : 0)
                )})</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
