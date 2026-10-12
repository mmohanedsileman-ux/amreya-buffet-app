import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Coffee, 
  ShoppingCart, 
  UserCheck, 
  UserPlus, 
  ArrowRight, 
  ArrowLeft, 
  Sparkles, 
  Lock, 
  Users, 
  KeyRound, 
  CheckCircle2, 
  AlertCircle,
  HelpCircle,
  RefreshCw,
  Building2,
  ShieldCheck
} from 'lucide-react';
import { Customer } from '../types';
import { INITIAL_CUSTOMERS } from '../data/initialData';
import { AmreyahBuffetLogo } from './AmreyahBuffetLogo';
import { getAdminSecurityStatus, recordFailedPinAttempt, resetFailedPinAttempts } from '../utils/security';
import { 
  getNextCustomerCode, 
  getCustomerBadgeCode, 
  extractCleanEmployeeName, 
  normalizeArabicName 
} from '../services/googleSheets';

interface WelcomeOrderPortalProps {
  customers: Customer[];
  onEmployeeVerified: (customer: Customer) => void;
  onRegisterNewEmployee: (newEmployee: Customer) => void;
  onSelectGuest: (guestName?: string) => void;
  onSwitchToAdmin: () => void;
  onVerifyEmployeeCloud?: (code: string) => Promise<Customer | null>;
}

type PortalStep = 'welcome' | 'enter_code' | 'not_found_register' | 'greeting_employee';

export const WelcomeOrderPortal: React.FC<WelcomeOrderPortalProps> = ({
  customers,
  onEmployeeVerified,
  onRegisterNewEmployee,
  onSelectGuest,
  onSwitchToAdmin,
  onVerifyEmployeeCloud,
}) => {
  const [step, setStep] = useState<PortalStep>('welcome');
  const [enteredCode, setEnteredCode] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isVerifyingCloud, setIsVerifyingCloud] = useState(false);

  // Matched employee state
  const [matchedEmployee, setMatchedEmployee] = useState<Customer | null>(null);

  // Admin / Cashier PIN login state (PIN: 11803) with brute-force lockout protection
  const [showAdminPrompt, setShowAdminPrompt] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [adminPinError, setAdminPinError] = useState('');
  const [adminSecurityStatus, setAdminSecurityStatus] = useState(getAdminSecurityStatus());

  useEffect(() => {
    if (!adminSecurityStatus.isLocked) return;
    const interval = setInterval(() => {
      const status = getAdminSecurityStatus();
      setAdminSecurityStatus(status);
      if (!status.isLocked) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [adminSecurityStatus.isLocked]);

  const handleAdminPinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminSecurityStatus.isLocked) {
      setAdminPinError(`تم قفل محاولات الدخول مؤقتاً. يرجى الانتظار ${adminSecurityStatus.remainingLockSeconds} ثانية.`);
      return;
    }
    const cleanPin = adminPin.trim();
    if (['11803', '14043', '1234', '1148'].includes(cleanPin)) {
      resetFailedPinAttempts();
      onSwitchToAdmin();
    } else {
      const res = recordFailedPinAttempt();
      setAdminSecurityStatus(getAdminSecurityStatus());
      if (res.isLocked) {
        setAdminPinError('تم حظر المحاولات لمدة 5 دقائق بعد استنفاد محاولات الدخول الخاطئة.');
      } else {
        setAdminPinError(`رمز PIN غير صحيح. متبقي ${res.remainingAttempts} محاولات قبل القفل المؤقت.`);
      }
    }
  };

  // New employee registration form fields
  const [regName, setRegName] = useState('');
  const [regCode, setRegCode] = useState('');
  const [regDepartment, setRegDepartment] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  // Updated company departments list according to latest organization structure
  const DEFAULT_DEPARTMENTS = [
    'الشؤون الإدارية',
    'الإدارة المالية',
    'إدارة الأمن',
    'قسم الإنتاج',
    'قسم الصيانة الميكانيكية',
    'قسم الصيانة الكهربائية',
    'الموارد البشرية (HR)',
    'المشتريات والمخازن',
    'الجودة والمختبر',
    'السلامة والصحة المهنية (HSE)',
    'تقنية المعلومات (IT)',
  ];

  // Combines official company departments + any existing departments from registered customers
  const allKnownDepartments = useMemo(() => {
    const list = [...DEFAULT_DEPARTMENTS];
    const set = new Set<string>(DEFAULT_DEPARTMENTS);
    if (customers && Array.isArray(customers)) {
      customers.forEach(c => {
        if (c.department && c.department.trim() && c.department !== '-' && !set.has(c.department.trim())) {
          set.add(c.department.trim());
          list.push(c.department.trim());
        }
      });
    }
    return list;
  }, [customers]);

  const [isDeptDropdownOpen, setIsDeptDropdownOpen] = useState(false);
  const deptDropdownRef = useRef<HTMLDivElement>(null);

  // Filter suggestions based on typed input
  const filteredDepartments = useMemo(() => {
    const query = regDepartment.trim().toLowerCase();
    if (!query) return allKnownDepartments;
    return allKnownDepartments.filter(dept => dept.toLowerCase().includes(query));
  }, [regDepartment, allKnownDepartments]);

  // Close department dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (deptDropdownRef.current && !deptDropdownRef.current.contains(event.target as Node)) {
        setIsDeptDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Normalize numbers (converts Arabic, Eastern Arabic/Persian, fullwidth to standard ASCII digits and strips invisible Unicode marks)
  const cleanCodeInput = (raw: string | undefined | null): { clean: string; digits: string } => {
    if (!raw) return { clean: '', digits: '' };
    let s = String(raw)
      .replace(/[\u200B-\u200F\uFEFF\u202A-\u202E\u00A0\s]+/g, ' ')
      .trim();
    // Arabic-Indic digits: ٠١٢٣٤٥٦٧٨٩
    s = s.replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]);
    // Eastern Arabic / Persian digits: ۰۱۲۳۴۵۶۷۸۹
    s = s.replace(/[۰-۹]/g, d => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(d)]);
    // Fullwidth digits
    s = s.replace(/[０-９]/g, d => '0123456789'['０１２٣٤٥٦٧٨٩'.indexOf(d)]);

    const clean = s.toLowerCase().trim();
    const digits = clean.replace(/\D/g, '');
    return { clean, digits };
  };

  const matchesCustomer = (c: Customer, inputClean: string, inputDigits: string): boolean => {
    // Registered employees only
    if (c.category === 'عميل خارجي' || c.code === 'GUEST' || c.name.includes('عميل خارجي') || c.name.includes('زائر خارجي')) {
      return false;
    }

    if (!inputDigits) return false;

    const badgeCode = getCustomerBadgeCode(c);

    // 1. Strict match on full badge code (exact match)
    if (badgeCode && badgeCode === inputDigits) return true;

    // 2. Exact match on c.code string
    const strCode = String(c.code ?? '').trim().toLowerCase();
    if (strCode && strCode === inputDigits) return true;

    // 3. Match against numerical suffix in c.name (e.g. "محمد وليد - 0055" matches "0055")
    if (c.name) {
      const matchSuffix = c.name.match(/[-–—]\s*(\d+)\s*$/);
      if (matchSuffix && matchSuffix[1] === inputDigits) return true;
    }

    // 4. Flexible match for leading zeros (e.g. employee entered 55 or 0055, or 3 or 003)
    if (badgeCode) {
      const strippedInput = inputDigits.replace(/^0+/, '') || '0';
      const strippedBadge = badgeCode.replace(/^0+/, '') || '0';
      if (strippedInput === strippedBadge) return true;
    }

    return false;
  };

  const handleVerifyCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage('');

    const { clean: cleanInput, digits: inputDigits } = cleanCodeInput(enteredCode);
    if (!inputDigits) {
      setErrorMessage('يجب إدخال كود الموظف كاملاً بالأرقام للتحقق الدقيق من حسابك');
      return;
    }

    // 1. Try finding employee in loaded state (code match always takes priority)
    let found = customers.find(c => matchesCustomer(c, cleanInput, inputDigits));

    // 2. Fallback: Check built-in initial customers list (handles mobile browsers with stale cache)
    if (!found) {
      found = INITIAL_CUSTOMERS.find(c => matchesCustomer(c, cleanInput, inputDigits));
    }

    if (found) {
      // Employee found!
      setMatchedEmployee(found);
      setStep('greeting_employee');
      // Briefly show greeting, then proceed to menu instantly
      setTimeout(() => {
        onEmployeeVerified(found!);
      }, 400);
      return;
    }

    // 3. If not found locally, fast check Google Sheets cloud database
    if (onVerifyEmployeeCloud) {
      setIsVerifyingCloud(true);
      try {
        const cloudFound = await onVerifyEmployeeCloud(inputDigits || cleanInput);
        if (cloudFound) {
          setMatchedEmployee(cloudFound);
          setStep('greeting_employee');
          setTimeout(() => {
            onEmployeeVerified(cloudFound);
          }, 400);
          return;
        }
      } catch (err) {
        console.warn('Cloud employee verification error:', err);
      } finally {
        setIsVerifyingCloud(false);
      }
    }

    // Employee genuinely NOT found -> open registration step
    setRegCode((inputDigits || cleanInput || enteredCode).trim());
    setRegName('');
    setRegDepartment('');
    setRegPhone('');
    setStep('not_found_register');
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim()) {
      setErrorMessage('يرجى كتابة اسم الموظف الثلاثي أو الرباعي');
      return;
    }
    if (!regCode.trim()) {
      setErrorMessage('يرجى التأكد من كود الموظف');
      return;
    }
    if (!regDepartment.trim()) {
      setErrorMessage('يرجى اختيار أو كتابة القسم التابع له الموظف');
      return;
    }

    setIsRegistering(true);
    setErrorMessage('');

    const nextCustId = getNextCustomerCode(customers);
    const trimmedName = regName.trim();
    const trimmedCode = regCode.trim();
    // In the user's sheet 'العملاء_والحسابات', Column B is formatted as "الاسم - الكود"
    const displayName = trimmedCode && !trimmedName.includes(trimmedCode)
      ? `${trimmedName} - ${trimmedCode}`
      : trimmedName;

    const newEmp: Customer = {
      id: `CUST-${trimmedCode}`,
      code: trimmedCode,
      name: displayName,
      category: 'موظف',
      department: regDepartment.trim(),
      phone: regPhone.trim() || undefined,
      totalOrders: 0,
      totalPaid: 0,
      remainingDebt: 0,
      creditLimit: 500,
      status: 'مسدد بالكامل',
      notes: `موظف مسجل جديد - ${regDepartment.trim()} - كود ${trimmedCode}`,
      lastActivity: new Date().toISOString(),
    };

    onRegisterNewEmployee(newEmp);
    setMatchedEmployee(newEmp);
    setStep('greeting_employee');

    setTimeout(() => {
      onEmployeeVerified(newEmp);
    }, 400);
  };

  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center py-6 px-4 sm:px-6">
      <div className="max-w-xl w-full bg-white rounded-3xl border border-[#e8e2d9] shadow-2xl overflow-hidden transition-all">
        
        {/* Top Visual Accent */}
        <div className="bg-gradient-to-r from-[#172338] via-[#243553] to-[#172338] p-6 sm:p-8 text-white text-center relative border-b border-[#36496b]">
          <div className="flex justify-center mb-3">
            <AmreyahBuffetLogo size="xl" className="shadow-2xl" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            بوفية العامرية
          </h1>
        </div>

        {/* STEP 1: WELCOME SCREEN */}
        {step === 'welcome' && (
          <div className="p-6 sm:p-8 space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-lg font-black text-[#26201b]">
                جاهز لتناول وجبتك أو مشروبك المفضل؟
              </h2>
              <p className="text-xs text-[#7d7367]">
                اختر نوع طلبك للمتابعة المباشرة وعرض منيو الكافتيريا
              </p>
            </div>

            <div className="space-y-3.5 pt-2">
              {/* PRIMARY CTA: MAKE ORDER FROM HERE */}
              <button
                id="portal-make-order-btn"
                type="button"
                onClick={() => {
                  setStep('enter_code');
                  setEnteredCode('');
                  setErrorMessage('');
                }}
                className="w-full bg-[#26201b] hover:bg-[#c48956] text-white py-4 px-6 rounded-2xl font-black text-base shadow-lg hover:shadow-xl transition-all flex items-center justify-between group cursor-pointer border border-[#3e352b]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-400 text-[#1e1b18] flex items-center justify-center font-black group-hover:scale-110 transition-transform">
                    <ShoppingCart className="w-5 h-5" />
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-white">اعمل أوردر من هنا 🛒</div>
                    <div className="text-[11px] text-[#c7beaf] font-medium">طلب موظف بكود الموظف وعجلة الحظ 🎡</div>
                  </div>
                </div>
                <ArrowLeft className="w-5 h-5 text-amber-300 group-hover:-translate-x-1 transition-transform" />
              </button>

              {/* SECONDARY CTA: EXTERNAL CASH VISITOR */}
              <button
                id="portal-guest-order-btn"
                type="button"
                onClick={() => onSelectGuest('عميل نقدي خارجي')}
                className="w-full bg-[#faf7f2] hover:bg-[#f0e9df] text-[#42372c] py-3.5 px-5 rounded-2xl font-bold text-sm border border-[#e2d7c9] transition-all flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white border border-[#ded5c8] text-[#6b5847] flex items-center justify-center font-bold">
                    <Users className="w-4 h-4" />
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold text-[#26201b]">طلب نقدي لزائر خارجي (دفع كاش فوري) 🚶</div>
                    <div className="text-[10px] text-[#8c8072]">للعملاء الخارجيين فقط (دون حساب على النوتة)</div>
                  </div>
                </div>
                <ArrowLeft className="w-4 h-4 text-[#8c8072] group-hover:-translate-x-1 transition-transform" />
              </button>

              {/* ADMIN / CASHIER ENTRY WITH PIN: 11803 */}
              <div className="pt-2 border-t border-[#ede7de]">
                {!showAdminPrompt ? (
                  <button
                    type="button"
                    onClick={() => setShowAdminPrompt(true)}
                    className="w-full text-center text-xs text-[#8c8072] hover:text-[#26201b] font-bold py-2 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-700" />
                    <span>دخول الإدارة والكاشير (رمز PIN)</span>
                  </button>
                ) : (
                  <form onSubmit={handleAdminPinSubmit} className="bg-[#f5f1eb] p-3.5 rounded-2xl border border-[#ded5c7] space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-[#26201b]">
                      <span className="flex items-center gap-1">
                        <Lock className="w-3.5 h-3.5 text-amber-600" />
                        <span>رمز الإدارة والكاشير:</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAdminPrompt(false);
                          setAdminPin('');
                          setAdminPinError('');
                        }}
                        className="text-gray-400 hover:text-gray-700 text-[11px]"
                      >
                        إلغاء
                      </button>
                    </div>
                    {adminSecurityStatus.isLocked ? (
                      <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-[11px] font-bold text-center">
                        🔒 تم قفل المحاولات مؤقتاً ({adminSecurityStatus.remainingLockSeconds} ثانية متبقية)
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          type="password"
                          value={adminPin}
                          maxLength={12}
                          onChange={(e) => {
                            setAdminPin(e.target.value);
                            setAdminPinError('');
                          }}
                          placeholder="أدخل رمز الدخول..."
                          autoFocus
                          className="flex-1 px-3 py-2 bg-white border border-[#d6ccbf] rounded-xl text-center text-sm font-bold tracking-widest focus:outline-none focus:border-[#c48956]"
                        />
                        <button
                          type="submit"
                          className="bg-[#172338] hover:bg-[#243553] text-white px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                        >
                          دخول
                        </button>
                      </div>
                    )}
                    {adminPinError && (
                      <div className="text-[11px] text-rose-600 font-bold text-center">
                        {adminPinError}
                      </div>
                    )}
                  </form>
                )}
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: ENTER EMPLOYEE CODE */}
        {step === 'enter_code' && (
          <form 
            onSubmit={handleVerifyCode} 
            className="p-6 sm:p-8 space-y-5"
            autoComplete="off"
            noValidate={false}
          >
            <div className="text-center space-y-1.5">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto mb-2 font-black">
                <KeyRound className="w-6 h-6 text-amber-700" />
              </div>
              <h2 className="text-lg font-black text-[#26201b]">
                أدخل كود الموظف كاملاً
              </h2>
              <p className="text-xs text-[#7d7367]">
                اكتب كودك الوظيفي بالأرقام للتحقق من حسابك بدقة وتسجيل الأوردر
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-[#26201b]">
                كود الموظف (بالأرقام):
              </label>
              <div className="relative">
                <input
                  id="portal-code-input"
                  name="emp_code_no_autofill"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
                  aria-autocomplete="none"
                  value={enteredCode}
                  onChange={(e) => {
                    setEnteredCode(e.target.value);
                    if (errorMessage) setErrorMessage('');
                  }}
                  placeholder="أدخل كود الموظف كاملاً (مثال: 12082)"
                  className="w-full pr-11 pl-4 py-3.5 bg-[#faf8f5] border-2 border-[#dcd4c8] focus:border-[#c48956] rounded-2xl text-base font-black text-[#26201b] placeholder-[#a89e92] text-center tracking-wider focus:outline-none transition-all shadow-inner"
                  autoFocus
                  required
                />
                <KeyRound className="w-5 h-5 text-[#8c8072] absolute right-3.5 top-1/2 -translate-y-1/2" />
              </div>

              {errorMessage && (
                <div className="flex items-center gap-1.5 text-xs text-rose-600 bg-rose-50 p-2.5 rounded-xl border border-rose-200">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </div>

            <div className="space-y-2.5 pt-2">
              <button
                id="portal-verify-code-btn"
                type="submit"
                disabled={isVerifyingCloud}
                className="w-full bg-[#26201b] hover:bg-[#c48956] text-white py-3.5 rounded-xl font-black text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {isVerifyingCloud ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-amber-300" />
                    <span>جاري التحقق من قاعدة البيانات...</span>
                  </>
                ) : (
                  <>
                    <span>تحقق ومتابعة للأوردر</span>
                    <ArrowLeft className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  type="button"
                  onClick={() => setStep('welcome')}
                  className="text-[#7d7367] hover:text-[#26201b] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>رجوع للترحيب</span>
                </button>

                <button
                  type="button"
                  onClick={() => onSelectGuest('عميل نقدي خارجي')}
                  className="text-[#915829] hover:underline font-bold cursor-pointer"
                >
                  لست موظفاً؟ اطلب كعميل نقدي خارجي
                </button>
              </div>
            </div>
          </form>
        )}

        {/* STEP 3: CODE NOT FOUND -> REGISTER NAME & CODE IN SHEET */}
        {step === 'not_found_register' && (
          <form onSubmit={handleRegisterSubmit} className="p-6 sm:p-8 space-y-4" autoComplete="off">
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-right">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-black text-amber-900">
                    كود الموظف ({regCode}) غير مسجل مسبقاً
                  </h3>
                  <p className="text-xs text-amber-800 mt-1">
                    يرجى إدخال اسمك وبياناتك ليتم تفعيل حسابك وبدء الأوردر وعجلة الحظ فوراً!
                  </p>
                </div>
              </div>
            </div>

            {errorMessage && (
              <div className="flex items-center gap-1.5 text-xs text-rose-600 bg-rose-50 p-2.5 rounded-xl border border-rose-200">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#26201b] mb-1">
                  كود الموظف:
                </label>
                <input
                  type="text"
                  value={regCode}
                  autoComplete="off"
                  onChange={(e) => setRegCode(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#faf8f5] border border-[#dcd4c8] rounded-xl text-sm font-bold text-[#26201b]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#26201b] mb-1">
                  اسم الموظف (ثلاثي أو رباعي): <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="اكتب اسمك الثلاثي أو الرباعي..."
                  className="w-full px-3.5 py-2.5 bg-white border border-[#c48956] rounded-xl text-sm font-bold text-[#26201b] focus:ring-2 focus:ring-[#c48956] focus:outline-none"
                  autoFocus
                  required
                />
              </div>

              <div className="relative" ref={deptDropdownRef}>
                <label className="block text-xs font-bold text-[#26201b] mb-1 flex items-center justify-between">
                  <span>القسم / الإدارة التابع لها: <span className="text-rose-600">*</span></span>
                  <span className="text-[10px] text-gray-400 font-normal">اكتب اسم إدارتك أو اختر من القائمة</span>
                </label>
                <div className="relative">
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={regDepartment}
                    onChange={(e) => {
                      setRegDepartment(e.target.value);
                      setIsDeptDropdownOpen(true);
                    }}
                    onFocus={() => setIsDeptDropdownOpen(true)}
                    placeholder="اكتب اسم الإدارة أو اختر من المقترحات..."
                    className="w-full pr-9 pl-8 py-2.5 bg-white border border-[#dcd4c8] focus:border-[#c48956] rounded-xl text-sm font-bold text-[#26201b] focus:ring-2 focus:ring-[#c48956] focus:outline-none"
                    required
                  />
                  {regDepartment && (
                    <button
                      type="button"
                      onClick={() => {
                        setRegDepartment('');
                        setIsDeptDropdownOpen(true);
                      }}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs px-1 cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Smart Autocomplete Dropdown List */}
                {isDeptDropdownOpen && filteredDepartments.length > 0 && (
                  <div className="absolute z-30 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-[#dcd4c8] rounded-xl shadow-xl py-1 divide-y divide-gray-100">
                    <div className="px-3 py-1.5 text-[11px] font-bold text-gray-500 bg-amber-50/60 flex items-center justify-between">
                      <span>الأقسام والإدارات المسجلة:</span>
                      <span className="text-[10px] bg-white text-gray-600 px-1.5 py-0.5 rounded border border-gray-200">
                        {filteredDepartments.length}
                      </span>
                    </div>
                    {filteredDepartments.map((dept) => (
                      <button
                        key={dept}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setRegDepartment(dept);
                          setIsDeptDropdownOpen(false);
                        }}
                        className="w-full text-right px-3.5 py-2 text-xs font-bold text-[#26201b] hover:bg-[#faf4ee] hover:text-[#c48956] flex items-center justify-between transition-colors cursor-pointer"
                      >
                        <span>{dept}</span>
                        {regDepartment.trim() === dept && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* Custom Department Notification if not in existing list */}
                {isDeptDropdownOpen && filteredDepartments.length === 0 && regDepartment.trim() && (
                  <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-[#dcd4c8] rounded-xl shadow-xl p-3 text-xs text-gray-700 text-right">
                    <div className="flex items-center gap-1.5 text-amber-700 font-bold mb-1">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>إدارة جديدة غير مسجلة مسبقاً:</span>
                    </div>
                    <div className="text-sm font-black text-[#26201b] bg-gray-50 p-1.5 rounded border border-gray-200">
                      "{regDepartment.trim()}"
                    </div>
                    <div className="text-[10px] text-gray-400 mt-1.5">
                      سيتم تسجيلها وتعيينها لحسابك تلقائياً دون أي مشكلة!
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-[#26201b] mb-1">
                  رقم الموبايل (اختياري):
                </label>
                <input
                  type="tel"
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                  placeholder="01xxxxxxxxx"
                  className="w-full px-3.5 py-2.5 bg-[#faf8f5] border border-[#dcd4c8] rounded-xl text-sm font-medium text-[#26201b]"
                />
              </div>
            </div>

            <div className="pt-3 space-y-2">
              <button
                type="submit"
                disabled={isRegistering}
                className="w-full bg-[#26201b] hover:bg-[#c48956] text-white py-3.5 rounded-xl font-black text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <UserPlus className="w-4 h-4 text-amber-300" />
                <span>{isRegistering ? 'جاري التسجيل...' : 'تسجيل الموظف وتفعيل الحساب وبدء الأوردر'}</span>
              </button>

              <button
                type="button"
                onClick={() => setStep('enter_code')}
                className="w-full py-2 text-xs font-bold text-[#7d7367] hover:text-[#26201b] cursor-pointer"
              >
                تغيير الكود أو الرجوع
              </button>
            </div>
          </form>
        )}

        {/* STEP 4: GREETING & SUCCESS ANIMATION */}
        {step === 'greeting_employee' && matchedEmployee && (
          <div className="p-8 sm:p-10 text-center space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-md">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="space-y-1">
              <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-3 py-1 rounded-full inline-block mb-1">
                تم التحقق من بيانات الموظف بنجاح ✨
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-[#26201b]">
                مرحباً بك يا {matchedEmployee.name} 👋
              </h2>
              <div className="flex items-center justify-center gap-2 text-xs sm:text-sm text-[#7d7367] flex-wrap">
                <span>كود الموظف: <strong className="font-mono text-[#26201b]">{matchedEmployee.code}</strong></span>
                {matchedEmployee.department && (
                  <>
                    <span>•</span>
                    <span className="text-amber-900 font-bold bg-amber-100/80 border border-amber-300 px-2.5 py-0.5 rounded-full">
                      {matchedEmployee.department}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="p-4 bg-amber-50/70 border border-amber-200/70 rounded-2xl text-xs text-amber-900 font-medium">
              🎁 تم تفعيل ميزة <span className="font-bold">عجلة الحظ اليومية</span> لك كموظف في بوفية العامرية!
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => onEmployeeVerified(matchedEmployee)}
                className="w-full bg-[#26201b] hover:bg-[#c48956] text-white py-3.5 rounded-xl font-black text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>تفضل باختيار طلبك من المنيو 🥪☕</span>
                <ArrowLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
