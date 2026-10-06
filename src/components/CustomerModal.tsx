import React, { useState } from 'react';
import { X, UserPlus, Check } from 'lucide-react';
import { Customer, CustomerCategory } from '../types';

interface CustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveCustomer: (customer: Customer) => void;
}

export const CustomerModal: React.FC<CustomerModalProps> = ({
  isOpen,
  onClose,
  onSaveCustomer,
}) => {
  const [name, setName] = useState('');
  const [code, setCode] = useState(`CUST-${Math.floor(1004 + Math.random() * 50)}`);
  const [category, setCategory] = useState<CustomerCategory>('موظف');
  const [department, setDepartment] = useState('');
  const [phone, setPhone] = useState('');
  const [creditLimit, setCreditLimit] = useState('500');
  const [initialDebt, setInitialDebt] = useState('0');
  const [notes, setNotes] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const parsedDebt = parseFloat(initialDebt) || 0;
    const trimmedCode = code.trim();
    const trimmedName = name.trim();
    const displayName = trimmedCode && !trimmedName.includes(trimmedCode)
      ? `${trimmedName} - ${trimmedCode}`
      : trimmedName;

    const newCustomer: Customer = {
      id: `CUST-${Date.now().toString().slice(-4)}`,
      code: trimmedCode || `CUST-${Date.now().toString().slice(-4)}`,
      name: displayName,
      category,
      department: department.trim() || undefined,
      phone: phone.trim() || undefined,
      totalOrders: parsedDebt,
      totalPaid: 0,
      remainingDebt: parsedDebt,
      creditLimit: parseFloat(creditLimit) || 500,
      status: parsedDebt > 0 ? 'مدين' : 'مسدد بالكامل',
      notes: notes.trim() || 'ربط مباشر بالشيت',
      lastActivity: new Date().toISOString(),
    };

    onSaveCustomer(newCustomer);
    onClose();
    setName('');
    setDepartment('');
    setPhone('');
    setInitialDebt('0');
    setNotes('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 border border-[#e8e2d9] shadow-2xl relative space-y-4 animate-in fade-in zoom-in duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#f0eae1] pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#c48956] text-white flex items-center justify-center font-bold">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-black text-[#26201b]">إضافة عميل / موظف جديد</h3>
              <p className="text-xs text-[#7d7367]">إضافة حساب جديد للربط مع الشيت والطلبات الآجلة</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-[#8c8072] hover:text-[#26201b] p-1 rounded-lg hover:bg-[#f5f1eb] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-[11px] text-emerald-900 flex items-center gap-2">
          <span className="text-base">⚡</span>
          <span>
            يتم إرسال بيانات الموظف تلقائياً لورقة <strong>«بينات الموظفين»</strong> وورقة <strong>«العملاء_والحسابات»</strong> في الشيت فور الحفظ!
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs font-bold text-[#4a4237]">
          <div>
            <label className="block mb-1">اسم الموظف أو العميل:</label>
            <input
              type="text"
              required
              placeholder="مثال: مهند سليمان"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-xs font-medium px-3 py-2 bg-[#faf8f5] border border-[#d9d1c7] rounded-xl focus:outline-none focus:border-[#c48956]"
            />
          </div>

          <div>
            <label className="block mb-1">القسم / الإدارة التابع لها:</label>
            <input
              type="text"
              list="customer-departments-list"
              placeholder="مثال: الشؤون الإدارية، الإدارة المالية، قسم الإنتاج..."
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full text-xs font-medium px-3 py-2 bg-[#faf8f5] border border-[#d9d1c7] rounded-xl focus:outline-none focus:border-[#c48956]"
            />
            <datalist id="customer-departments-list">
              <option value="الشؤون الإدارية" />
              <option value="الإدارة المالية" />
              <option value="إدارة الأمن" />
              <option value="قسم الإنتاج" />
              <option value="قسم الصيانة الميكانيكية" />
              <option value="قسم الصيانة الكهربائية" />
              <option value="الموارد البشرية (HR)" />
              <option value="المشتريات والمخازن" />
              <option value="الجودة والمختبر" />
              <option value="السلامة والصحة المهنية (HSE)" />
              <option value="تقنية المعلومات (IT)" />
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1">كود الموظف / العميل:</label>
              <input
                type="text"
                required
                placeholder="مثال: 11803"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full text-xs font-mono px-3 py-2 bg-[#faf8f5] border border-[#d9d1c7] rounded-xl focus:outline-none focus:border-[#c48956]"
              />
            </div>

            <div>
              <label className="block mb-1">الفئة / الصفة:</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full text-xs px-3 py-2 bg-[#faf8f5] border border-[#d9d1c7] rounded-xl focus:outline-none focus:border-[#c48956]"
              >
                <option value="موظف">موظف</option>
                <option value="ضيوف وإدارة">ضيوف وإدارة</option>
                <option value="عميل دائم">عميل دائم</option>
                <option value="عميل خارجي">عميل خارجي</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1">الحد الائتماني (ج.م):</label>
              <input
                type="number"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-[#faf8f5] border border-[#d9d1c7] rounded-xl focus:outline-none focus:border-[#c48956]"
              />
            </div>

            <div>
              <label className="block mb-1">مديونية سابقة (افتتاحية):</label>
              <input
                type="number"
                min="0"
                value={initialDebt}
                onChange={(e) => setInitialDebt(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-[#faf8f5] border border-[#d9d1c7] rounded-xl focus:outline-none focus:border-[#c48956]"
              />
            </div>
          </div>

          <div>
            <label className="block mb-1">رقم الهاتف (اختياري):</label>
            <input
              type="tel"
              placeholder="01xxxxxxxxx"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full text-xs font-medium px-3 py-2 bg-[#faf8f5] border border-[#d9d1c7] rounded-xl focus:outline-none focus:border-[#c48956]"
            />
          </div>

          <div>
            <label className="block mb-1">ملاحظات الشيت:</label>
            <input
              type="text"
              placeholder="مثال: خصم راتب، معتمد من الشؤون الإدارية..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full text-xs font-medium px-3 py-2 bg-[#faf8f5] border border-[#d9d1c7] rounded-xl focus:outline-none focus:border-[#c48956]"
            />
          </div>

          <div className="pt-3 flex items-center justify-end gap-2 border-t border-[#f0eae1]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-[#7a7063] hover:text-[#26201b] cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 bg-[#26201b] hover:bg-[#c48956] text-white px-5 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer shadow-sm"
            >
              <Check className="w-4 h-4" />
              <span>إضافة العميل للشيت</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
