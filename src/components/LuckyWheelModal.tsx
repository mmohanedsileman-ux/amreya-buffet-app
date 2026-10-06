import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Sparkles, 
  Gift, 
  Check, 
  RotateCcw, 
  ShoppingCart, 
  Trophy, 
  Clock, 
  PartyPopper 
} from 'lucide-react';
import { MenuItem } from '../types';
import { formatCurrency } from '../utils/formatters';

interface LuckyWheelModalProps {
  isOpen: boolean;
  onClose: () => void;
  menuItems: MenuItem[];
  onAddFreeGift: (item: MenuItem) => void;
}

// 6 distinctive, appetizing colors for 5 hot drinks + 'ولا حاجة'
const WHEEL_SLICE_COLORS = [
  '#d97706', // شاى حليب (كراميل ذهبي)
  '#3d2314', // قهوة (إسبريسو داكن)
  '#475569', // ولا حاجة (رمادي أنيق)
  '#b45309', // نسكافية (بني محمص)
  '#78350f', // قهوة حليب (كافيه أو ليه)
  '#15803d', // ينسون (أخضر عشبي)
];

// Fallback items in case menu items are still loading
const DEFAULT_HOT_DRINK_PRIZES: MenuItem[] = [
  {
    id: 'wheel-item-501',
    code: 'ITM-501',
    name: 'شاى حليب',
    category: 'hot_drinks',
    price: 15,
    description: 'كوب شاي طازج بالحليب الساخن (شاي بلبن)',
    allowSugarOptions: true,
    available: true,
    popular: true,
  },
  {
    id: 'wheel-item-502',
    code: 'ITM-502',
    name: 'قهوة',
    category: 'hot_drinks',
    price: 12,
    description: 'فنجان قهوة تركي فاخر بوش ممتاز',
    allowSugarOptions: true,
    available: true,
    popular: true,
  },
  {
    id: 'wheel-item-503',
    code: 'ITM-503',
    name: 'نسكافية',
    category: 'hot_drinks',
    price: 15,
    description: 'مج نسكافيه كلاسيك ساخن برغوة غنية',
    allowSugarOptions: true,
    available: true,
    popular: true,
  },
  {
    id: 'wheel-item-504',
    code: 'ITM-504',
    name: 'قهوة حليب',
    category: 'hot_drinks',
    price: 15,
    description: 'قهوة فرنساوي بالحليب الطازج والوش الكريمي',
    allowSugarOptions: true,
    available: true,
    popular: true,
  },
  {
    id: 'wheel-item-505',
    code: 'ITM-505',
    name: 'ينسون',
    category: 'hot_drinks',
    price: 10,
    description: 'مشروب ينسون بلدي طبيعي ساخن ومريح',
    allowSugarOptions: true,
    available: true,
    popular: true,
  },
];

// 'ولا حاجة' option for realistic lucky wheel gameplay
export const NO_PRIZE_ITEM: MenuItem = {
  id: 'wheel-item-no-prize',
  code: 'NO-PRIZE',
  name: 'ولا حاجة',
  category: 'hot_drinks',
  price: 0,
  description: 'حظ أوفر المرة القادمة! لك لفة مجانية جديدة كل يوم',
  allowSugarOptions: false,
  available: true,
  popular: false,
};

export const LuckyWheelModal: React.FC<LuckyWheelModalProps> = ({
  isOpen,
  onClose,
  menuItems,
  onAddFreeGift,
}) => {
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [wonItem, setWonItem] = useState<MenuItem | null>(null);
  const [alreadySpunToday, setAlreadySpunToday] = useState(false);
  const [todayPrizeName, setTodayPrizeName] = useState<string | null>(null);
  const [addedToCart, setAddedToCart] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);

  const wheelRef = useRef<SVGSVGElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const todayStr = new Date().toISOString().slice(0, 10);

  // Exactly 6 slices: 5 hot drinks + 1 'ولا حاجة'
  const wheelItems = React.useMemo(() => {
    return [
      DEFAULT_HOT_DRINK_PRIZES[0], // شاى حليب
      DEFAULT_HOT_DRINK_PRIZES[1], // قهوة
      NO_PRIZE_ITEM,               // ولا حاجة
      DEFAULT_HOT_DRINK_PRIZES[2], // نسكافية
      DEFAULT_HOT_DRINK_PRIZES[3], // قهوة حليب
      DEFAULT_HOT_DRINK_PRIZES[4], // ينسون
    ];
  }, []);

  // Check today's spin status on mount
  useEffect(() => {
    const lastSpinDate = localStorage.getItem('cafe_lucky_wheel_last_date');
    const storedPrize = localStorage.getItem('cafe_lucky_wheel_prize');
    const storedPrizeId = localStorage.getItem('cafe_lucky_wheel_prize_id');

    if (lastSpinDate === todayStr) {
      setAlreadySpunToday(true);
      setTodayPrizeName(storedPrize || 'صنف مجاني');
      if (storedPrizeId) {
        const allPossible = [...DEFAULT_HOT_DRINK_PRIZES, NO_PRIZE_ITEM];
        const found = allPossible.find(m => m.id === storedPrizeId || m.name === storedPrize);
        if (found) setWonItem(found);
      }
    } else {
      setAlreadySpunToday(false);
      setTodayPrizeName(null);
      setWonItem(null);
      setAddedToCart(false);
    }
  }, [isOpen, todayStr]);

  // Subtle click sound using Web Audio API
  const playClickSound = () => {
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } catch {
      // Audio context might be restricted, silent fallback
    }
  };

  // Play fanfare sound on win
  const playWinSound = () => {
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      const now = ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.12, now + i * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.1);
        osc.stop(now + i * 0.1 + 0.45);
      });
    } catch {
      // Audio context fallback
    }
  };

  // Play gentle sympathetic sound on 'ولا حاجة'
  const playTryAgainSound = () => {
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      const now = ctx.currentTime;
      [392, 349.23, 329.63].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.09, now + i * 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.15);
        osc.stop(now + i * 0.15 + 0.4);
      });
    } catch {
      // Audio fallback
    }
  };

  const handleSpin = () => {
    if (isSpinning || alreadySpunToday || wheelItems.length === 0) return;

    setIsSpinning(true);
    setShowCelebration(false);
    setWonItem(null);

    // Pick random winner
    const winnerIndex = Math.floor(Math.random() * wheelItems.length);
    const targetItem = wheelItems[winnerIndex];

    const numSlices = wheelItems.length;
    const sliceAngle = 360 / numSlices;

    // Calculate angle to land on pointer (top pointer is at 270° in standard SVG coordinates)
    const sliceMiddle = (winnerIndex + 0.5) * sliceAngle;
    
    // To bring sliceMiddle to the top pointer (270°):
    const fullSpins = 360 * 6; // 6 full turns
    const targetAngle = fullSpins + (270 - sliceMiddle) + (Math.random() * 8 - 4);

    setRotation(targetAngle);

    // Play periodic ticking
    let tickCount = 0;
    const tickInterval = setInterval(() => {
      tickCount++;
      playClickSound();
      if (tickCount > 28) clearInterval(tickInterval);
    }, 140);

    // Spin completes after 4.5 seconds
    setTimeout(() => {
      clearInterval(tickInterval);
      setIsSpinning(false);
      setWonItem(targetItem);
      setShowCelebration(true);
      setAlreadySpunToday(true);
      setTodayPrizeName(targetItem.name);

      if (targetItem.id === NO_PRIZE_ITEM.id) {
        playTryAgainSound();
      } else {
        playWinSound();
      }

      // Persist in localStorage
      localStorage.setItem('cafe_lucky_wheel_last_date', todayStr);
      localStorage.setItem('cafe_lucky_wheel_prize', targetItem.name);
      localStorage.setItem('cafe_lucky_wheel_prize_id', targetItem.id);
    }, 4600);
  };

  const handleClaimPrize = () => {
    if (!wonItem) return;
    onAddFreeGift(wonItem);
    setAddedToCart(true);
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  // Reset function for testing / cashier demo
  const handleResetForTesting = () => {
    localStorage.removeItem('cafe_lucky_wheel_last_date');
    localStorage.removeItem('cafe_lucky_wheel_prize');
    localStorage.removeItem('cafe_lucky_wheel_prize_id');
    setAlreadySpunToday(false);
    setTodayPrizeName(null);
    setWonItem(null);
    setAddedToCart(false);
    setShowCelebration(false);
    setRotation(0);
  };

  if (!isOpen) return null;

  const numSlices = wheelItems.length;
  const sliceAngle = 360 / numSlices;
  const center = 170;
  const radius = 145;

  // Helper to get matching emoji for each hot drink
  const getDrinkEmoji = (name: string) => {
    if (name.includes('ولا حاجة')) return '😅';
    if (name.includes('شاى')) return '🫖';
    if (name === 'قهوة') return '☕';
    if (name.includes('نسكاف')) return '✨';
    if (name.includes('قهوة حليب')) return '🥛';
    return '🌿';
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="bg-white rounded-3xl max-w-lg w-full flex flex-col border border-[#e8e2d9] shadow-2xl relative overflow-hidden animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Decorative Header */}
        <div className="bg-gradient-to-r from-[#26201b] via-[#433528] to-[#26201b] p-4 text-white flex items-center justify-between border-b border-[#5a4837] relative">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-[#1e1b18] flex items-center justify-center font-black shadow-md">
              <Gift className="w-5 h-5 animate-bounce" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-1.5">
                  <span>عجلة الحظ اليومية</span>
                  <span className="text-xs bg-amber-400/20 text-amber-300 border border-amber-400/30 px-2 py-0.5 rounded-full font-bold">
                    هدية مجانية 100%
                  </span>
                </h3>
              </div>
              <p className="text-xs text-[#d8cfc4]">
                لك لفة واحدة كل يوم • جرب حظك واكسب مشروبك المفضل مجاناً!
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

        {/* Content Area */}
        <div className="p-5 flex flex-col items-center justify-center bg-[#faf8f5] relative overflow-hidden">
          {/* Confetti Celebration or 'ولا حاجة' Result Overlay */}
          {showCelebration && (
            <div className="absolute inset-0 z-30 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/40 backdrop-blur-2xs pointer-events-none" />
              {wonItem?.id === NO_PRIZE_ITEM.id ? (
                <div className="relative text-center p-5 bg-white rounded-3xl border-2 border-slate-300 shadow-2xl animate-in zoom-in-95 duration-300 max-w-[85%] w-full">
                  <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-2 text-2xl shadow-inner border border-slate-200">
                    😅
                  </div>
                  <span className="text-xs font-bold text-slate-600 block">حظ أوفر المرة القادمة!</span>
                  <h4 className="text-lg sm:text-xl font-black text-[#26201b] my-1">
                    النتيجة: ولا حاجة ☕
                  </h4>
                  <p className="text-xs text-[#7d7367] mb-4 leading-relaxed">
                    معلش يا بطل، لسه عندك لفة مجانية جديدة بكرة وإن شاء الله هتكسب مشروبك المفضل!
                  </p>
                  <button
                    onClick={() => setShowCelebration(false)}
                    className="w-full py-2.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white rounded-xl font-black text-xs transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>حسناً، بالتوفيق غداً 👍</span>
                  </button>
                </div>
              ) : (
                <div className="relative text-center p-4 bg-white/95 backdrop-blur-md rounded-2xl border-2 border-amber-400 shadow-2xl animate-in zoom-in-95 duration-300 max-w-[85%] w-full">
                  <PartyPopper className="w-12 h-12 text-amber-500 mx-auto animate-bounce mb-1" />
                  <span className="text-xs font-bold text-amber-800 block">🎉 ألف مبروك يا بطل! 🎉</span>
                  <h4 className="text-lg sm:text-xl font-black text-[#26201b] my-1">
                    ربحت {wonItem?.name} مجاناً اليوم!
                  </h4>
                  <p className="text-xs text-[#7d7367] mb-3">
                    قيمته الأصلية {formatCurrency(wonItem?.price || 0)} وأصبح هديتك الآن من الكافيه
                  </p>
                  <button
                    onClick={handleClaimPrize}
                    disabled={addedToCart}
                    className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white rounded-xl font-black text-xs transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {addedToCart ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>تمت الإضافة للسلة بنجاح!</span>
                      </>
                    ) : (
                      <>
                        <ShoppingCart className="w-4 h-4" />
                        <span>إضافة الهدية للسلة الآن (0 ج.م)</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Wheel Graphic Container */}
          <div className="relative w-[320px] h-[320px] sm:w-[350px] sm:h-[350px] flex items-center justify-center my-1">
            {/* Pointer / Needle at Top */}
            <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center">
              <div className="w-7 h-9 bg-gradient-to-b from-amber-400 via-amber-500 to-amber-600 rounded-b-full shadow-xl border-2 border-white flex items-center justify-center">
                <div className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping"></div>
              </div>
              <div className="w-0 h-0 border-l-[9px] border-l-transparent border-r-[9px] border-r-transparent border-t-[12px] border-t-amber-600 -mt-1 drop-shadow-lg"></div>
            </div>

            {/* The SVG Wheel */}
            <svg
              ref={wheelRef}
              viewBox="0 0 340 340"
              className="w-full h-full drop-shadow-2xl select-none"
              style={{
                transform: `rotate(${rotation}deg)`,
                transition: isSpinning ? 'transform 4.5s cubic-bezier(0.12, 0.9, 0.15, 1)' : 'none',
              }}
            >
              {/* Outer Golden Border Rim */}
              <circle
                cx={center}
                cy={center}
                r={radius + 8}
                fill="#26201b"
                stroke="#c48956"
                strokeWidth="6"
              />

              {/* Little Bulb dots around the rim */}
              {Array.from({ length: 24 }).map((_, i) => {
                const angle = (i * 360) / 24;
                const dotX = center + (radius + 4) * Math.cos((angle * Math.PI) / 180);
                const dotY = center + (radius + 4) * Math.sin((angle * Math.PI) / 180);
                return (
                  <circle
                    key={`dot-${i}`}
                    cx={dotX}
                    cy={dotY}
                    r={2.5}
                    fill={i % 2 === 0 ? '#ffea79' : '#ffffff'}
                  />
                );
              })}

              {/* Slices */}
              {wheelItems.map((item, index) => {
                const startAngle = index * sliceAngle;
                const endAngle = (index + 1) * sliceAngle;
                const midAngle = startAngle + sliceAngle / 2;

                // Path coordinates
                const x1 = center + radius * Math.cos((startAngle * Math.PI) / 180);
                const y1 = center + radius * Math.sin((startAngle * Math.PI) / 180);
                const x2 = center + radius * Math.cos((endAngle * Math.PI) / 180);
                const y2 = center + radius * Math.sin((endAngle * Math.PI) / 180);

                const pathData = `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2} Z`;

                // If midAngle is on the left half of the wheel, flip text so it is always right-side up
                const isFlipped = midAngle > 90 && midAngle < 270;
                const textRadius = center + 78;
                const emojiRadius = center + radius - 16;
                const emoji = getDrinkEmoji(item.name);

                return (
                  <g key={`${item.id}-${index}`}>
                    <path
                      d={pathData}
                      fill={WHEEL_SLICE_COLORS[index % WHEEL_SLICE_COLORS.length]}
                      stroke="#ffffff"
                      strokeWidth="2"
                    />

                    {/* Slice Elements oriented along the slice ray */}
                    <g transform={`rotate(${midAngle}, ${center}, ${center})`}>
                      {/* Emoji Icon near the outer rim */}
                      <text
                        x={emojiRadius}
                        y={center}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize="17"
                        transform={isFlipped ? `rotate(180, ${emojiRadius}, ${center})` : undefined}
                        className="select-none pointer-events-none"
                      >
                        {emoji}
                      </text>

                      {/* Clear, High-Contrast Bold Arabic Drink Name */}
                      <g transform={isFlipped ? `rotate(180, ${textRadius}, ${center})` : undefined}>
                        <text
                          x={textRadius}
                          y={center}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="#ffffff"
                          fontSize="15"
                          fontWeight="900"
                          fontFamily="Cairo, system-ui, -apple-system, sans-serif"
                          stroke="#120c08"
                          strokeWidth="3.6"
                          paintOrder="stroke fill"
                          strokeLinejoin="round"
                          className="select-none pointer-events-none"
                        >
                          {item.name}
                        </text>
                      </g>
                    </g>
                  </g>
                );
              })}

              {/* Center Hub */}
              <circle
                cx={center}
                cy={center}
                r="30"
                fill="#26201b"
                stroke="#c48956"
                strokeWidth="4"
              />
              <circle
                cx={center}
                cy={center}
                r="19"
                fill="#c48956"
              />
              <text
                x={center}
                y={center + 5}
                textAnchor="middle"
                fill="#ffffff"
                fontSize="14"
                fontWeight="900"
              >
                ☕
              </text>
            </svg>
          </div>

          {/* Status and Action Buttons */}
          <div className="w-full mt-4 space-y-2.5">
            {alreadySpunToday ? (
              <div className={`p-3.5 rounded-2xl text-center space-y-2 border ${
                todayPrizeName === 'ولا حاجة'
                  ? 'bg-slate-50 border-slate-300'
                  : 'bg-amber-50 border-amber-300'
              }`}>
                <div className="flex items-center justify-center gap-1.5 font-black text-xs">
                  {todayPrizeName === 'ولا حاجة' ? (
                    <>
                      <span className="text-base">😅</span>
                      <span className="text-slate-800">لقد استخدمت لفتك المجانية لليوم!</span>
                    </>
                  ) : (
                    <>
                      <Trophy className="w-4 h-4 text-amber-600" />
                      <span className="text-amber-900">لقد استخدمت لفتك المجانية لليوم!</span>
                    </>
                  )}
                </div>
                <p className="text-xs text-[#7d7367]">
                  {todayPrizeName === 'ولا حاجة' ? (
                    <>نتيجة لفتك اليوم: <strong className="text-slate-800 font-black">ولا حاجة</strong> (حظ أوفر غداً إن شاء الله)</>
                  ) : (
                    <>جائزتك اليوم كانت: <strong className="text-[#26201b] font-black">{todayPrizeName}</strong> 🎁</>
                  )}
                </p>

                {wonItem && wonItem.id !== NO_PRIZE_ITEM.id && !addedToCart && (
                  <button
                    onClick={handleClaimPrize}
                    className="w-full py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-black text-xs transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <ShoppingCart className="w-3.5 h-3.5" />
                    <span>إضافة {wonItem.name} كهدية مجانية للسلة</span>
                  </button>
                )}

                {wonItem && wonItem.id !== NO_PRIZE_ITEM.id && addedToCart && (
                  <div className="text-xs text-emerald-800 font-bold bg-emerald-100/80 py-1.5 px-3 rounded-lg flex items-center justify-center gap-1">
                    <Check className="w-3.5 h-3.5" />
                    <span>تمت إضافة الهدية لسلة الطلبات بنجاح</span>
                  </div>
                )}

                <div className="flex items-center justify-center gap-1 text-[11px] text-[#8c8072] pt-1">
                  <Clock className="w-3 h-3" />
                  <span>تتجدد اللفة المجانية القادمة غداً تلقائياً</span>
                </div>
              </div>
            ) : (
              <button
                onClick={handleSpin}
                disabled={isSpinning}
                className="w-full py-3.5 bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 hover:from-amber-600 hover:to-amber-800 disabled:opacity-60 text-white rounded-2xl font-black text-sm transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 cursor-pointer transform active:scale-98"
              >
                <Sparkles className="w-5 h-5 text-amber-200 animate-spin" />
                <span>{isSpinning ? 'جاري تدوير العجلة وترقب الجائزة...' : 'لف العجلة الآن مجاناً! 🎡'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Footer info & testing reset */}
        <div className="p-3.5 bg-white border-t border-[#f0eae1] flex items-center justify-between text-xs text-[#8c8072]">
          <span className="flex items-center gap-1">
            <Gift className="w-3.5 h-3.5 text-[#c48956]" />
            <span>هدية يومية حقيقية لعملاء الكافيه</span>
          </span>

          <div className="flex items-center gap-2">
            {alreadySpunToday && (
              <button
                onClick={handleResetForTesting}
                className="text-[11px] text-[#a89e92] hover:text-rose-600 font-medium flex items-center gap-1 transition-colors cursor-pointer"
                title="إعادة التعيين لغرض تجربة وتدوير العجلة مجدداً"
              >
                <RotateCcw className="w-3 h-3" />
                <span>إعادة التجربة</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="px-3 py-1 bg-[#f5f1eb] hover:bg-[#eae3d8] text-[#26201b] rounded-lg font-bold transition-colors cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
