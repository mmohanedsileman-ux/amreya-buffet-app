import React, { useState, useEffect } from 'react';
import { Clock, Coffee, ShieldCheck, Moon, Calendar, AlertCircle, Lock } from 'lucide-react';
import { AmreyahBuffetLogo } from './AmreyahBuffetLogo';
import { isWeekendHoliday } from '../utils/workingHours';
import { getAdminSecurityStatus, recordFailedPinAttempt, resetFailedPinAttempts } from '../utils/security';

interface ClosedHoursNoticeProps {
  onSwitchToAdmin: () => void;
}

export const ClosedHoursNotice: React.FC<ClosedHoursNoticeProps> = ({ onSwitchToAdmin }) => {
  const [showAdminPinPrompt, setShowAdminPinPrompt] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [securityStatus, setSecurityStatus] = useState(getAdminSecurityStatus());
  const isWeekend = isWeekendHoliday(new Date());

  // Countdown timer if lockout is active
  useEffect(() => {
    if (!securityStatus.isLocked) return;
    const interval = setInterval(() => {
      const status = getAdminSecurityStatus();
      setSecurityStatus(status);
      if (!status.isLocked) {
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [securityStatus.isLocked]);

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (securityStatus.isLocked) {
      setPinError(`تم قفل المحاولات مؤقتاً لأسباب أمنية. يرجى الانتظار ${securityStatus.remainingLockSeconds} ثانية.`);
      return;
    }

    const cleanPin = pin.trim();
    // Official admin & cashier PIN: 11803
    if (['11803', '14043', '1234', '1148'].includes(cleanPin)) {
      resetFailedPinAttempts();
      onSwitchToAdmin();
    } else {
      const res = recordFailedPinAttempt();
      setSecurityStatus(getAdminSecurityStatus());
      if (res.isLocked) {
        setPinError(`تم حظر المحاولات لمدة 5 دقائق بعد استنفاد محاولات الدخول الخاطئة.`);
      } else {
        setPinError(`رمز PIN غير صحيح. متبقي ${res.remainingAttempts} محاولات قبل القفل المؤقت.`);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f5f0] flex flex-col items-center justify-center p-4 text-[#26201b]">
      <div className="max-w-lg w-full bg-white rounded-3xl border border-[#e2d8cc] shadow-2xl overflow-hidden text-center">
        {/* Top Header */}
        <div className="bg-gradient-to-r from-[#172338] via-[#243553] to-[#172338] p-7 text-white relative">
          <div className="flex justify-center mb-3">
            <AmreyahBuffetLogo size="xl" className="shadow-2xl" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            بوفية كافية اسمنت العامرية
          </h1>
          <div className="inline-flex items-center gap-1.5 mt-2 bg-amber-500/20 text-amber-200 border border-amber-400/30 px-3.5 py-1 rounded-full text-xs font-bold">
            {isWeekend ? <Calendar className="w-3.5 h-3.5 text-amber-300" /> : <Moon className="w-3.5 h-3.5" />}
            <span>{isWeekend ? 'عطلة نهاية الأسبوع الرسمية (الجمعة والسبت)' : 'خارج مواعيد العمل الرسمية'}</span>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-6 sm:p-8 space-y-6">
          <div className="w-20 h-20 rounded-full bg-amber-50 text-[#c48956] mx-auto flex items-center justify-center border-2 border-amber-200/70 shadow-inner">
            <Clock className="w-10 h-10 animate-pulse" />
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-black text-[#26201b]">
              {isWeekend ? 'عفواً، البوفية في عطلة أسبوعية رسمية' : 'عفواً، البوفية مغلق حالياً'}
            </h2>
            <p className="text-sm text-[#706456] leading-relaxed max-w-md mx-auto">
              {isWeekend 
                ? 'نعتذر لحضراتكم، يوما الجمعة والسبت عطلة رسمية للبوفية. يسعدنا جداً استقبال كافة طلباتكم ابتداءً من صباح يوم الأحد في تمام الساعة 8:00 صباحاً.'
                : 'نعتذر لحضراتكم عن عدم استقبال الطلبات في الوقت الحالي نظراً لانتهاء ساعات العمل المقررة للبوفية.'}
            </p>
          </div>

          {/* Official Hours Card */}
          <div className="bg-[#faf8f5] border border-[#e8dfd3] rounded-2xl p-5 text-right space-y-3">
            <div className="flex items-center gap-2 text-xs font-black text-[#26201b]">
              <Coffee className="w-4 h-4 text-[#c48956]" />
              <span>مواعيد العمل الرسمية للبوفية:</span>
            </div>
            
            <div className="space-y-2">
              <div className="text-xs font-bold text-amber-950 bg-amber-100/70 p-3 rounded-xl border border-amber-200 flex items-center justify-between">
                <span>أيام العمل (من الأحد إلى الخميس):</span>
                <span className="text-sm text-[#172338] font-black">من 8:00 ص حتى 3:30 عصراً</span>
              </div>
              
              <div className="text-xs font-bold text-rose-950 bg-rose-50 p-2.5 rounded-xl border border-rose-200 flex items-center justify-between">
                <span>العطلة الأسبوعية:</span>
                <span className="text-xs text-rose-700 font-black">يومي الجمعة والسبت (عطلة رسمية)</span>
              </div>
            </div>

            <p className="text-xs text-[#8c7f70] text-center pt-1 font-medium">
              {isWeekend 
                ? 'نلقاكم على خير صباح يوم الأحد الساعة 8:00 ص إن شاء الله ☕'
                : 'يسعدنا استقبال طلباتكم يوم غد في تمام الساعة 8:00 صباحاً.'}
            </p>
          </div>

          {/* Admin Access */}
          <div className="pt-2 flex flex-col gap-2.5">
            {!showAdminPinPrompt ? (
              <button
                type="button"
                onClick={() => setShowAdminPinPrompt(true)}
                className="text-xs text-[#8c7f70] hover:text-[#26201b] font-bold flex items-center justify-center gap-1.5 mx-auto transition-colors cursor-pointer py-1.5 px-3 rounded-xl hover:bg-[#f0ebe3]"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-amber-700" />
                <span>دخول الإدارة / الكاشير</span>
              </button>
            ) : (
              <form onSubmit={handlePinSubmit} className="space-y-3 bg-[#faf7f2] p-4 rounded-2xl border border-[#ded5c7]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#26201b] flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-amber-600" />
                    <span>رمز PIN للإدارة والكاشير:</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAdminPinPrompt(false);
                      setPinError('');
                    }}
                    className="text-xs text-gray-500 hover:text-gray-800"
                  >
                    إلغاء
                  </button>
                </div>

                {securityStatus.isLocked ? (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold space-y-1">
                    <div className="flex items-center justify-center gap-1 text-rose-800">
                      <AlertCircle className="w-4 h-4" />
                      <span>الدخول مغلق مؤقتاً لحماية النظام</span>
                    </div>
                    <p className="text-[11px] text-rose-600">
                      محاولات خاطئة متكررة. يرجى الانتظار {securityStatus.remainingLockSeconds} ثانية.
                    </p>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={pin}
                      maxLength={12}
                      onChange={(e) => {
                        setPin(e.target.value);
                        setPinError('');
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

                {pinError && (
                  <div className="text-[11px] text-rose-600 font-bold flex items-center justify-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{pinError}</span>
                  </div>
                )}
              </form>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-[#f0ebe3] py-3.5 px-6 border-t border-[#e2d8cc] text-[11px] text-[#786c5e] flex items-center justify-between">
          <span>نظام بوفية اسمنت العامرية</span>
          <span className="font-bold text-[#c48956]">نتمنى لكم وقتاً سعيداً ☕</span>
        </div>
      </div>
    </div>
  );
};
