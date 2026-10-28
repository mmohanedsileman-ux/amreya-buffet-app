import React, { useState, useRef, useEffect } from 'react';
import { 
  Coffee, 
  Search, 
  ShoppingCart, 
  Gift, 
  Menu as MenuIcon, 
  X, 
  FileSpreadsheet, 
  User, 
  PlusCircle,
  Sparkles,
  Receipt,
  Volume2,
  VolumeX,
  Coins,
  Lock,
  LogOut
} from 'lucide-react';
import { CartItem } from '../types';
import { formatCurrency } from '../utils/formatters';
import { AmreyahBuffetLogo } from './AmreyahBuffetLogo';
import { sounds } from '../utils/soundEffects';

interface HeaderProps {
  activeTab: 'menu' | 'debts' | 'orders';
  setActiveTab: (tab: 'menu' | 'debts' | 'orders') => void;
  cart: CartItem[];
  setIsCartOpen: (open: boolean) => void;
  onOpenQuickPayment: () => void;
  onOpenAddCustomer: () => void;
  onOpenSheetSync?: () => void;
  onOpenLuckyWheel: () => void;
  onOpenShiftSummary?: () => void;
  totalDebt: number;
  activeCustomer: any;
  onSwitchCustomer: () => void;
  onOpenCustomerSettle?: () => void;
  isAdminMode: boolean;
  onToggleAdminMode: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isEmployee?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  cart,
  setIsCartOpen,
  onOpenQuickPayment,
  onOpenAddCustomer,
  onOpenSheetSync,
  onOpenLuckyWheel,
  onOpenShiftSummary,
  totalDebt,
  activeCustomer,
  onSwitchCustomer,
  onOpenCustomerSettle,
  isAdminMode,
  onToggleAdminMode,
  searchQuery,
  setSearchQuery,
  isEmployee = false,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(() => sounds.getMuted());
  const menuRef = useRef<HTMLDivElement>(null);

  const totalCartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalCartPrice = cart.reduce((sum, item) => sum + item.itemTotal, 0);

  // Close menu dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  return (
    <header className="sticky top-0 z-40 bg-[#1e1b18] text-[#fbfaf8] border-b border-[#312b25] shadow-sm">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-2 sm:gap-4">
        
        {/* Right side: App Logo & Name */}
        <div className="flex items-center gap-2.5 shrink-0">
          <AmreyahBuffetLogo size="sm" />
          <div className="flex flex-col">
            <span className="text-sm font-black tracking-tight text-white leading-tight">
              بوفية العامرية
            </span>
            <span className="text-[9px] font-bold text-amber-300/80 tracking-wider hidden sm:inline">
              AMREYAH BUFFET
            </span>
          </div>
        </div>

        {/* Center: Small Search Bar */}
        <div className="flex-1 max-w-xs sm:max-w-md mx-2">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-[#9e9386]" />
            <input
              id="header-search-input"
              type="text"
              placeholder="بحث في المنيو..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8.5 pr-8 pl-6 text-xs bg-[#2b2520] border border-[#423931] text-white rounded-full focus:outline-none focus:border-[#c48956] focus:bg-[#322c26] transition-all placeholder:text-[#8a8073]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-[#a89f91] hover:text-white"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Left side: Quick actions & Simple Menu */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          
          {/* Active Customer Chip */}
          {activeCustomer && (
            <div className="hidden md:flex items-center gap-1.5 bg-[#2b2520] border border-[#423931] px-2.5 py-1 rounded-lg text-xs">
              <User className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-bold text-white max-w-[120px] truncate" title={activeCustomer.name}>
                {activeCustomer.name}
              </span>
            </div>
          )}

          {/* Lucky Wheel quick icon - ONLY FOR EMPLOYEES */}
          {isEmployee && (
            <button
              id="header-lucky-wheel-btn"
              onClick={onOpenLuckyWheel}
              className="h-8.5 px-2.5 bg-gradient-to-r from-amber-500/20 to-amber-600/30 hover:from-amber-500/30 hover:to-amber-600/40 border border-amber-500/40 text-amber-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              title="عجلة الحظ اليومية 🎁 (خاصة بالموظفين فقط)"
            >
              <Gift className="w-3.5 h-3.5 text-amber-300" />
              <span className="hidden sm:inline">عجلة الحظ</span>
            </button>
          )}

          {/* Sound Mute/Unmute Toggle Button */}
          <button
            type="button"
            onClick={() => setIsMuted(sounds.toggleMute())}
            className="h-8.5 w-8.5 flex items-center justify-center rounded-lg bg-[#2b2520] hover:bg-[#3a322b] text-[#d8cfc4] hover:text-white border border-[#423931] transition-all cursor-pointer"
            title={isMuted ? 'تشغيل الأصوات التفاعلية' : 'كتم الأصوات'}
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5 text-[#8c8072]" /> : <Volume2 className="w-3.5 h-3.5 text-amber-400" />}
          </button>

          {/* Cart button */}
          <button
            id="header-cart-toggle-btn"
            onClick={() => setIsCartOpen(true)}
            className="h-8.5 px-3 bg-[#c48956] hover:bg-[#b07847] text-white rounded-lg font-bold text-xs transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">الطلب</span>
            {totalCartCount > 0 && (
              <span className="bg-[#1e1b18] text-amber-300 text-[10px] font-black px-1.5 py-0.2 rounded-full">
                {totalCartCount}
              </span>
            )}
          </button>

          {/* Simple Dropdown Menu */}
          <div className="relative" ref={menuRef}>
            <button
              id="header-menu-toggle-btn"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="h-8.5 w-8.5 flex items-center justify-center rounded-lg bg-[#2b2520] hover:bg-[#3a322b] text-[#d8cfc4] hover:text-white border border-[#423931] transition-all cursor-pointer"
              title="القائمة"
            >
              {isMenuOpen ? <X className="w-4 h-4" /> : <MenuIcon className="w-4 h-4" />}
            </button>

            {/* Simple Menu Dropdown Content */}
            {isMenuOpen && (
              <div className="absolute left-0 mt-2 w-52 bg-[#25201c] border border-[#423931] rounded-xl shadow-xl py-1.5 z-50 text-xs">
                {activeCustomer && (
                  <div className="px-3.5 py-2 border-b border-[#3a322b] text-right">
                    <div className="text-[10px] text-[#a89e92]">المستخدم الحالي:</div>
                    <div className="font-black text-amber-300 truncate">{activeCustomer.name}</div>
                  </div>
                )}

                {/* Navigation Items */}
                <button
                  onClick={() => {
                    setActiveTab('menu');
                    setIsMenuOpen(false);
                  }}
                  className={`w-full text-right px-3.5 py-2 flex items-center gap-2.5 transition-colors cursor-pointer ${
                    activeTab === 'menu' ? 'bg-[#c48956] text-white font-bold' : 'text-[#d8cfc4] hover:bg-[#322c26]'
                  }`}
                >
                  <Coffee className="w-3.5 h-3.5" />
                  <span>منيو الكافيه</span>
                </button>

                <button
                  onClick={() => {
                    setActiveTab('debts');
                    setIsMenuOpen(false);
                  }}
                  className={`w-full text-right px-3.5 py-2 flex items-center gap-2.5 transition-colors cursor-pointer ${
                    activeTab === 'debts' ? 'bg-[#c48956] text-white font-bold' : 'text-[#d8cfc4] hover:bg-[#322c26]'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>{isAdminMode ? 'شيت المديونيات العام' : 'حسابي ومديونيتي'}</span>
                </button>

                <button
                  onClick={() => {
                    setActiveTab('orders');
                    setIsMenuOpen(false);
                  }}
                  className={`w-full text-right px-3.5 py-2 flex items-center gap-2.5 transition-colors cursor-pointer ${
                    activeTab === 'orders' ? 'bg-[#c48956] text-white font-bold' : 'text-[#d8cfc4] hover:bg-[#322c26]'
                  }`}
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>{isAdminMode ? 'سجل الطلبات العام (الإدارة)' : 'سجل طلباتي السابقة'}</span>
                </button>

                {/* Shift Summary Button - Cashier & Admin Only */}
                {isAdminMode && onOpenShiftSummary && (
                  <>
                    <div className="h-px bg-[#3a322b] my-1" />
                    <button
                      onClick={() => {
                        onOpenShiftSummary();
                        setIsMenuOpen(false);
                      }}
                      className="w-full text-right px-3.5 py-2 flex items-center gap-2.5 text-emerald-400 hover:bg-[#322c26] transition-colors cursor-pointer font-bold"
                    >
                      <Coins className="w-3.5 h-3.5" />
                      <span>تقرير الوردية والكاشير 📊</span>
                    </button>
                  </>
                )}

                {/* Lucky wheel only for employees */}
                {isEmployee && (
                  <>
                    <div className="h-px bg-[#3a322b] my-1" />
                    <button
                      onClick={() => {
                        onOpenLuckyWheel();
                        setIsMenuOpen(false);
                      }}
                      className="w-full text-right px-3.5 py-2 flex items-center gap-2.5 text-amber-300 hover:bg-[#322c26] transition-colors cursor-pointer"
                    >
                      <Gift className="w-3.5 h-3.5" />
                      <span>عجلة الحظ اليومية 🎡</span>
                    </button>
                  </>
                )}

                {isAdminMode && (
                  <button
                    onClick={() => {
                      onOpenAddCustomer();
                      setIsMenuOpen(false);
                    }}
                    className="w-full text-right px-3.5 py-2 flex items-center gap-2.5 text-[#d8cfc4] hover:bg-[#322c26] transition-colors cursor-pointer"
                  >
                    <User className="w-3.5 h-3.5" />
                    <span>+ إضافة حساب عميل جديد</span>
                  </button>
                )}

                <div className="h-px bg-[#3a322b] my-1" />

                {/* Switch to Admin Mode (PIN) */}
                {!isAdminMode && onToggleAdminMode && (
                  <button
                    onClick={() => {
                      onToggleAdminMode();
                      setIsMenuOpen(false);
                    }}
                    className="w-full text-right px-3.5 py-2 flex items-center gap-2.5 text-amber-300 hover:bg-[#322c26] transition-colors cursor-pointer font-bold"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>🔑 وضع الكاشير والإدارة (PIN)</span>
                  </button>
                )}

                {/* Exit / Switch Account */}
                {activeCustomer && (
                  <button
                    onClick={() => {
                      onSwitchCustomer();
                      setIsMenuOpen(false);
                    }}
                    className="w-full text-right px-3.5 py-2 flex items-center gap-2.5 text-rose-300 hover:bg-[#322c26] transition-colors cursor-pointer font-bold"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>🚪 تسجيل الخروج / تبديل الحساب</span>
                  </button>
                )}
              </div>
            )}
          </div>

        </div>

      </div>
    </header>
  );
};
