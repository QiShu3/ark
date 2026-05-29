import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (message: string, type?: ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (message, type = 'info', duration = 4000) => {
    const id = Math.random().toString(36).substring(2, 9);
    set((state) => ({
      toasts: [...state.toasts, { id, message, type, duration }],
    }));

    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, duration);
    }
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));

export const toast = {
  success: (msg: string, duration?: number) => useToastStore.getState().addToast(msg, 'success', duration),
  error: (msg: string, duration?: number) => useToastStore.getState().addToast(msg, 'error', duration),
  info: (msg: string, duration?: number) => useToastStore.getState().addToast(msg, 'info', duration),
  warning: (msg: string, duration?: number) => useToastStore.getState().addToast(msg, 'warning', duration),
};

// Global intercept for window.alert to automatically route to custom toasts
if (typeof window !== 'undefined') {
  window.alert = (message: string) => {
    const lowerMsg = message.toLowerCase();
    if (
      lowerMsg.includes('恭喜') ||
      lowerMsg.includes('成功') ||
      lowerMsg.includes('complete') ||
      lowerMsg.includes('finish')
    ) {
      toast.success(message);
    } else if (
      lowerMsg.includes('失败') ||
      lowerMsg.includes('错误') ||
      lowerMsg.includes('error') ||
      lowerMsg.includes('fail')
    ) {
      toast.error(message);
    } else if (lowerMsg.includes('警告') || lowerMsg.includes('注意') || lowerMsg.includes('warn')) {
      toast.warning(message);
    } else {
      toast.info(message);
    }
  };
}
