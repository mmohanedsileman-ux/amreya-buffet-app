export type ProductCategory = 'hot_drinks' | 'cold_drinks' | 'food' | 'desserts' | 'special';

export interface MenuItemOption {
  sugar?: 'بدون سكر' | 'على الريحة' | 'مظبوط' | 'زيادة' | 'مانو';
  size?: 'عادي' | 'كبير (+5 ج.م)' | 'دبل (+10 ج.م)';
  notes?: string;
}

export interface MenuItem {
  id: string;
  code?: string;
  name: string;
  category: ProductCategory;
  price: number;
  description: string;
  popular?: boolean;
  available: boolean;
  image?: string;
  allowSugarOptions?: boolean;
  allowSizeOptions?: boolean;
}

export interface CartItem {
  cartItemId: string;
  item: MenuItem;
  quantity: number;
  selectedSugar?: string;
  selectedSize?: string;
  sizePriceDelta: number;
  notes?: string;
  itemTotal: number;
  isFreeGift?: boolean;
}

export type CustomerCategory = 'موظف' | 'ضيوف وإدارة' | 'عميل دائم' | 'عميل خارجي';

export interface Customer {
  id: string;
  code: string;
  name: string;
  category: CustomerCategory;
  phone?: string;
  department?: string;      // القسم / الإدارة التابع لها الموظف
  totalOrders: number;      // إجمالي المسحوبات (الطلبات)
  totalPaid: number;        // إجمالي المبالغ المسددة
  remainingDebt: number;    // المتبقي المستحق (المديونية)
  creditLimit: number;      // الحد الائتماني
  status: 'مدين' | 'مسدد بالكامل' | 'رصيد دائن';
  notes?: string;
  lastActivity?: string;
}

export type PaymentMethod = 'cash' | 'instapay' | 'vodafone_cash' | 'debt_account';

export interface OrderItemRecord {
  name: string;
  quantity: number;
  price: number;
  sugar?: string;
  size?: string;
  total: number;
}

export interface Order {
  id: string;
  orderNumber: number;
  createdAt: string;
  items: OrderItemRecord[];
  subtotal: number;
  discount: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  customerId?: string;
  customerName?: string;
  paidAmount: number;
  remainingAmount: number;
  notes?: string;
  cashierName: string;
}

export interface PaymentTransaction {
  id: string;
  createdAt: string;
  customerId: string;
  customerName: string;
  amount: number;
  paymentMethod: 'cash' | 'instapay' | 'vodafone_cash';
  notes?: string;
  receiptNumber?: string;
}

export interface SheetKPIs {
  totalSales: number;        // إجمالي المبيعات والطلبات
  totalPaid: number;         // إجمالي التحصيلات المسددة
  totalDebt: number;         // إجمالي المديونيات المتبقية
  debtorCount: number;       // عدد العملاء المدينين
  collectionRate: number;    // نسبة التحصيل الفعلية %
  maxSingleDebt: number;     // أعلى مديونية فردية
  avgDebt: number;           // متوسط مديونية العميل
  managementAccount: number; // حساب الإدارة / الضيافة
}
