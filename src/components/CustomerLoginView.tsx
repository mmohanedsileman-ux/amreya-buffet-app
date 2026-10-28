import React, { useState } from 'react';
import { 
  User, 
  Search, 
  UserPlus, 
  Coffee, 
  CheckCircle2, 
  ArrowLeft, 
  ShieldAlert,
  Sparkles,
  Lock
} from 'lucide-react';
import { Customer } from '../types';
import { formatCurrency } from '../utils/formatters';
import { AmreyahBuffetLogo } from './AmreyahBuffetLogo';

interface CustomerLoginViewProps {
  customers: Customer[];
  onSelectCustomer: (customer: Customer) => void;
  onOpenAddCustomer: () => void;
  onSwitchToAdminMode?: () => void;
}

export const CustomerLoginView: React.FC<CustomerLoginViewProps> = ({
  customers,
  onSelectCustomer,
  onOpenAddCustomer,
  onSwitchToAdminMode,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('all');

  // Extract unique departments dynamically
  const departments = React.useMemo(() => {
    const set = new Set<string>();
    customers.forEach(c => {
      if (c.department && c.department.trim() && c.department !== '-') {
        set.add(c.department.trim());
      }
    });
    return Array.from(set).sort();
  }, [customers]);

  const filteredCustomers = customers.filter(c => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = (
      String(c.name || '').toLowerCase().includes(q) ||
      String(c.code || '').toLowerCase().includes(q) ||
      (c.phone && String(c.phone).includes(q))
    );

    if (!matchesSearch) return false;

    if (selectedDept === 'all') return true;
    return c.department === selectedDept;
  });

  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center py-8 px-4 sm:px-6">
      <div className="max-w-2xl w-full bg-white rounded-3xl border border-[#e8e2d9] shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Banner Header */}
        <div className="bg-gradient-to-r from-[#172338] via-[#243553] to-[#172338] p-6 text-white text-center relative border-b border-[#36496b]">
          <div className="flex justify-center mb-3">
            <AmreyahBuffetLogo size="lg" className="shadow-lg" />
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
            بوابة عملاء وموظفي بوفية العامرية
          </h2>
          <div className="text-[11px] font-bold text-amber-300 tracking-wider uppercase mt-0.5">
            AMREYAH BUFFET
          </div>
          <p className="text-xs sm:text-sm text-[#d4deed] mt-1.5 max-w-md mx-auto">
            سجّل دخولك لمتابعة مديونيتك الشخصية، طلب الأوردرات من المنيو، وتدوير عجلة الحظ اليومية 🎡
          </p>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-8 space-y-5">
          {/* Search / Selection input */}
          <div className="space-y-2">
            <label className="block text-xs sm:text-sm font-bold text-[#26201b]">
              اختر اسمك أو ابحث برقم الكود أو الاسم:
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث باسمك (مثال: نادر محمد أو 13827)..."
                className="w-full pr-10 pl-4 py-3 bg-[#faf8f5] border border-[#dcd4c8] rounded-2xl text-sm font-bold text-[#26201b] placeholder-[#a89e92] focus:outline-none focus:ring-2 focus:ring-[#c48956] focus:border-transparent transition-all"
                autoFocus
              />
              <Search className="w-5 h-5 text-[#8c8072] absolute right-3.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          {/* Department Quick Filter Chips */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-[#8c8072] block">تصفية سريعة:</span>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
              <button
                type="button"
                onClick={() => setSelectedDept('all')}
                className={`px-3 py-1 rounded-xl font-bold whitespace-nowrap transition-colors cursor-pointer ${
                  selectedDept === 'all'
                    ? 'bg-[#26201b] text-white shadow-xs'
                    : 'bg-[#f4efe8] text-[#635749] hover:bg-[#eae3d8]'
                }`}
              >
                جميع الأقسام ({customers.length})
              </button>
              {departments.map(dept => (
                <button
                  key={dept}
                  type="button"
                  onClick={() => setSelectedDept(dept)}
                  className={`px-3 py-1 rounded-xl font-bold whitespace-nowrap transition-colors cursor-pointer ${
                    selectedDept === dept
                      ? 'bg-[#c48956] text-white shadow-xs'
                      : 'bg-[#f4efe8] text-[#635749] hover:bg-[#eae3d8]'
                  }`}
                >
                  {dept}
                </button>
              ))}
            </div>
          </div>

          {/* Customers List Grid */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-[#7d7367]">
              <span>العملاء والموظفون المسجلون ({filteredCustomers.length}):</span>
              <button
                type="button"
                onClick={onOpenAddCustomer}
                className="text-[#915829] hover:underline font-bold flex items-center gap-1 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>+ تسجيل حساب جديد</span>
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto pr-1 space-y-2 divide-y divide-[#f2ece4] border border-[#eee8df] rounded-2xl p-2 bg-[#fcfbf9]">
              {filteredCustomers.length === 0 ? (
                <div className="p-8 text-center text-[#8c8072]">
                  <p className="text-sm font-bold">لم يتم العثور على اسم مطابق</p>
                  <p className="text-xs text-[#a89e92] mt-1">
                    يمكنك تسجيل اسمك الجديد الآن بسهولة بالنقر على "تسجيل حساب جديد".
                  </p>
                  <button
                    type="button"
                    onClick={onOpenAddCustomer}
                    className="mt-3 px-4 py-2 bg-[#c48956] hover:bg-[#a66f40] text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    + إضافة اسمي كعميل جديد
                  </button>
                </div>
              ) : (
                filteredCustomers.map(customer => {
                  const hasDebt = customer.remainingDebt > 0;
                  return (
                    <button
                      key={customer.id}
                      onClick={() => onSelectCustomer(customer)}
                      className="w-full pt-2 first:pt-0 pb-2 px-3 hover:bg-white rounded-xl transition-all flex items-center justify-between group cursor-pointer text-right border border-transparent hover:border-[#e2dad0] hover:shadow-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-[#f0eae1] group-hover:bg-[#c48956] group-hover:text-white text-[#5c5043] flex items-center justify-center font-bold text-xs transition-colors flex-shrink-0">
                          <User className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-black text-[#26201b] group-hover:text-[#915829] transition-colors truncate">
                              {customer.name}
                            </span>
                            <span className="text-[10px] bg-[#f0eae1] text-[#635749] px-1.5 py-0.5 rounded font-bold">
                              {customer.category}
                            </span>
                          </div>
                          <span className="text-xs text-[#8c8072]">
                            كود: {customer.code}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[11px] text-[#8c8072] font-semibold hidden sm:inline">
                          تسجيل الدخول
                        </span>
                        <div className="w-7 h-7 rounded-lg bg-[#f0eae1] group-hover:bg-[#26201b] group-hover:text-white text-[#7d7367] flex items-center justify-center transition-all">
                          <ArrowLeft className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Privacy Guarantee Note */}
          <div className="bg-[#faf8f5] p-3.5 rounded-2xl border border-[#e8e2d9] flex items-start gap-2.5 text-xs text-[#7d7367]">
            <Sparkles className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p>
              <strong>خصوصية تامة:</strong> يظهر لكل عميل مديونيته وسجل طلباته الخاصة به هو فقط. بمجرد سدادك للمبلغ تختفي المديونية تلقائياً ويصبح حسابك مسدداً بالكامل.
            </p>
          </div>
        </div>

        {/* Footer with discreet Admin / Cashier Switch */}
        {onSwitchToAdminMode && (
          <div className="p-3 bg-[#f5f1eb] border-t border-[#e8e2d9] flex items-center justify-between text-xs text-[#8c8072]">
            <span>بوابة مخصصة للعملاء والموظفين</span>
            <button
              onClick={onSwitchToAdminMode}
              className="text-[#915829] hover:underline font-bold flex items-center gap-1 cursor-pointer"
            >
              <Lock className="w-3 h-3" />
              <span>وضع الكاشير والإدارة (لوحة التحكم العامة)</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
