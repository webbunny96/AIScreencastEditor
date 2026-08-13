/**
 * Toast Store - Zustand store for toast notifications
 */
import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info';
export interface Toast { id: number; type: ToastType; message: string; }
interface ToastState { toasts: Toast[]; addToast: (type: ToastType, message: string) => void; removeToast: (id: number) => void; }

let toastId = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (type, message) => {
    const id = ++toastId;
    set((state) => ({ toasts: [...state.toasts, { id, type, message }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  success: (msg: string) => useToastStore.getState().addToast('success', msg),
  error: (msg: string) => useToastStore.getState().addToast('error', msg),
  info: (msg: string) => useToastStore.getState().addToast('info', msg),
};