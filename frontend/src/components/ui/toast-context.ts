import { createContext, useContext, useMemo } from 'react'

export type ToastTone = 'success' | 'error' | 'info'

export const ToastContext = createContext<(tone: ToastTone, message: string) => void>(() => undefined)

export function useToast() {
  const push = useContext(ToastContext)
  return useMemo(
    () => ({
      success: (message: string) => push('success', message),
      error: (message: string) => push('error', message),
      info: (message: string) => push('info', message),
    }),
    [push],
  )
}
