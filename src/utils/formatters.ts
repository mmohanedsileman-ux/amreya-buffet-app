import { Customer, Order, SheetKPIs } from '../types';

export function formatCurrency(amount: number): string {
  const rounded = Math.round(amount * 10) / 10;
  return `${rounded.toLocaleString('ar-EG')} ج.م`;
}

export function formatNumber(val: number): string {
  return val.toLocaleString('ar-EG');
}

export function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function calculateSheetKPIs(customers: Customer[], orders: Order[]): SheetKPIs {
  const totalSales = orders.reduce((acc, curr) => acc + (curr.totalAmount || 0), 0);
  const totalPaid = orders.reduce((acc, curr) => acc + (curr.paidAmount || 0), 0);
  
  // Calculate remaining debts strictly from customers with positive remaining debt
  const debtorCustomers = customers.filter(c => (c.remainingDebt || 0) > 0);
  const totalDebt = debtorCustomers.reduce((acc, curr) => acc + curr.remainingDebt, 0);
  const debtorCount = debtorCustomers.length;

  const collectionRate = totalSales > 0 
    ? Math.round((totalPaid / totalSales) * 1000) / 10 
    : 100;

  const maxSingleDebt = debtorCustomers.length > 0 
    ? Math.max(...debtorCustomers.map(c => c.remainingDebt)) 
    : 0;

  const avgDebt = debtorCount > 0 
    ? Math.round((totalDebt / debtorCount) * 10) / 10 
    : 0;

  // Management / Hospitality account
  const managementCustomer = customers.find(c => 
    c.category === 'ضيوف وإدارة' || c.name.includes('ضيوف') || c.name.includes('إدارة')
  );
  const managementAccount = managementCustomer ? managementCustomer.remainingDebt : 80;

  return {
    totalSales,
    totalPaid,
    totalDebt,
    debtorCount,
    collectionRate,
    maxSingleDebt,
    avgDebt,
    managementAccount,
  };
}

export function generateSheetCSV(customers: Customer[], kpis: SheetKPIs, sampleCustomer?: Customer): string {
  const target = sampleCustomer || customers[0];
  const targetName = target ? target.name : 'محمد عباس صبرى عبداللطيف - 12168';
  const targetCode = target ? target.code : 'CUST-1003';
  const targetOrders = target ? `${target.totalOrders} ج.م` : '30 ج.م';
  const targetPaid = target ? `${target.totalPaid} ج.م` : '15 ج.م';
  const targetDebt = target ? `${target.remainingDebt} ج.م` : '15 ج.م';
  const targetCategory = target ? target.category : 'موظف';
  const targetStatus = target && target.remainingDebt > 0 ? '⚠️ عليه مديونية' : 'خالص السداد';

  const rows = [
    'نظام إدارة وحسابات الكافتيريا والمطعم | لوحة التحكم والمديونيات,,,,,,,',
    'إجمالي المبيعات والطلبات,,إجمالي التحصيلات المسددة,,إجمالي المديونيات المتبقية,,عدد العملاء المدينين,',
    `${kpis.totalSales} ج.م,,${kpis.totalPaid} ج.م,,${kpis.totalDebt} ج.م,,${kpis.debtorCount},`,
    'إجمالي قيمة فواتير الطلبات,,إجمالي المبالغ المحصلة فعلياً,,مستحقات جارية واجبة التحصيل,,عملاء وموظفين عليهم متبقي,',
    ',,,,,,,',
    'استعلام كشف حساب عميل فوري,,,,مؤشرات أداء التحصيل السريع,,,',
    `اختر اسم العميل:,${targetName},كود العميل:,${targetCode},نسبة التحصيل الفعلية:,${kpis.collectionRate}%,حالة التحصيل:,${kpis.collectionRate >= 80 ? 'ممتاز' : 'جيد'}`,
    `إجمالي المسحوبات (الطلبات):,${targetOrders},الفئة / الصفة:,${targetCategory},إجمالي الذمم المعلقة:,${kpis.totalDebt} ج.م,أعلى مديونية فردية:,${kpis.maxSingleDebt}`,
    `إجمالي المبالغ المسددة:,${targetPaid},حالة الحساب:,${target && target.remainingDebt > 0 ? 'مدين' : 'مسدد'},متوسط مديونية العميل:,${kpis.avgDebt} ج.م,الحد الائتماني المقترح:,500 ج.م`,
    `المتبقي المستحق (المديونية):,${targetDebt},حالة السداد:,${targetStatus},حساب الإدارة / الضيافة:,${kpis.managementAccount} ج.م,تسوية الإدارة:,معتمد شهرياً`,
    ',,,,,,,',
    'قائمة كبار المديونين والحسابات المعلقة,,,,,دليل الربط بالتطبيقات الذكية,,',
    'اسم العميل,الفئة,إجمالي الطلبات,إجمالي المسدد,المديونية المتبقية,خاصية الربط,الحالة,ملاحظات',
  ];

  customers.forEach(c => {
    rows.push(
      `"${c.name}","${c.category}","${c.totalOrders} ج.م","${c.totalPaid} ج.م","${c.remainingDebt} ج.م","مفاتيح فريدة (Keys)","${c.remainingDebt > 0 ? 'مدين' : 'مسدد'}","${c.notes || ''}"`
    );
  });

  // Appendix matching the sheet smart connection guide
  rows.push(',,,,,التحديث التلقائي,لحظي,معادلات مرنة تحسب المديونية فورياً');
  rows.push(',,,,,تطبيق الكاشير,متوافق,تسجيل الطلب بضغطة زر');
  rows.push(',,,,,تطبيق العميل/الموظف,متوافق,استعلام فوري عن الرصيد المتبقي');
  rows.push(',,,,,دعم الدفع الإلكتروني,متوفر,نقدي / انستاباي / فودافون كاش');

  return rows.join('\n');
}

export function parseCSVToCustomers(csvText: string): Partial<Customer>[] {
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const parsedCustomers: Partial<Customer>[] = [];
  
  let inDebtorTable = false;
  for (const line of lines) {
    if (line.includes('قائمة كبار المديونين') || line.includes('اسم العميل,الفئة')) {
      inDebtorTable = true;
      continue;
    }
    if (inDebtorTable) {
      if (line.startsWith(',,,,,') || line.includes('دليل الربط')) {
        continue;
      }
      const parts = line.split(',').map(p => p.replace(/"/g, '').trim());
      if (parts.length >= 5 && parts[0]) {
        const name = parts[0];
        const category = (parts[1] as any) || 'موظف';
        const totalOrders = parseFloat(parts[2].replace(/[^\d.]/g, '')) || 0;
        const totalPaid = parseFloat(parts[3].replace(/[^\d.]/g, '')) || 0;
        const remainingDebt = parseFloat(parts[4].replace(/[^\d.]/g, '')) || 0;
        const notes = parts[7] || '';
        
        parsedCustomers.push({
          name,
          category,
          totalOrders,
          totalPaid,
          remainingDebt,
          notes,
          status: remainingDebt > 0 ? 'مدين' : 'مسدد بالكامل',
        });
      }
    }
  }

  return parsedCustomers;
}
