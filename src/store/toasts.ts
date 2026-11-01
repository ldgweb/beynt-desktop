import { create } from 'zustand'

export type ToastKind = 'success' | 'error' | 'info'

export interface Toast {
  id: number
  message: string
  kind: ToastKind
}

interface ToastStore {
  toasts: Toast[]
  push: (message: string, kind?: ToastKind) => void
  dismiss: (id: number) => void
}

let seq = 0

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  push: (message, kind = 'info') => {
    const id = ++seq
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }))
    setTimeout(() => get().dismiss(id), 2600)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))

/** Fire a toast from anywhere (components or plain functions). */
export const toast = (message: string, kind: ToastKind = 'info'): void =>
  useToastStore.getState().push(message, kind)
