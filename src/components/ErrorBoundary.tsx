import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleClearCacheAndReset = () => {
    try {
      sessionStorage.clear();
      localStorage.removeItem('cafe_active_customer_id');
      localStorage.removeItem('cafe_orders_data');
    } catch {}
    window.location.href = window.location.origin + window.location.pathname;
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#faf8f5] flex items-center justify-center p-4 text-[#26201b]" dir="rtl">
          <div className="max-w-md w-full bg-white rounded-3xl border border-[#e8dfd3] shadow-2xl p-6 sm:p-8 text-center space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 mx-auto flex items-center justify-center border border-rose-200 shadow-xs">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-black text-[#26201b]">حدث خطأ أثناء تحميل الشاشة</h2>
              <p className="text-xs text-[#706456] leading-relaxed">
                واجه التطبيق استجابة غير متوقعة في معالجة البيانات، تم تسجيل الخطأ لمنع توقف النظام.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-rose-50/60 border border-rose-200 rounded-xl p-3 text-right">
                <span className="text-[10px] font-mono text-rose-800 break-words block">
                  {this.state.error.message || String(this.state.error)}
                </span>
              </div>
            )}

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full py-3 px-4 bg-[#26201b] hover:bg-[#c48956] text-white rounded-xl text-sm font-black transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>إعادة تحميل التطبيق</span>
              </button>

              <button
                type="button"
                onClick={this.handleClearCacheAndReset}
                className="w-full py-2.5 px-4 bg-white hover:bg-[#f5f1eb] text-[#8c8072] hover:text-[#26201b] border border-[#e2d8cc] rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>إعادة تعيين الجلسة والبدء من جديد</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
