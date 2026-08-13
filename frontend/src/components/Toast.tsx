/**
 * ToastContainer Component - renders toast notifications
 */
import { useToastStore } from '../store/toastStore';
import type { ToastType } from '../store/toastStore';

const styles: Record<ToastType, string> = {
  success: 'bg-green-600 text-white',
  error: 'bg-red-600 text-white',
  info: 'bg-blue-600 text-white',
};

const icons: Record<ToastType, string> = { success: '✓', error: '✕', info: 'ℹ' };

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();
  if (toasts.length === 0) return null;
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col space-y-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`${styles[t.type]} px-4 py-3 rounded-lg shadow-lg flex items-center space-x-2 min-w-[250px] max-w-sm cursor-pointer`}
          onClick={() => removeToast(t.id)}
        >
          <span className="font-bold">{icons[t.type]}</span>
          <span className="text-sm">{t.message}</span>
        </div>
      ))}
    </div>
  );
}