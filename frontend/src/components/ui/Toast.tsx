import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { ToastContext, type ToastTone } from './toast-context'

interface ToastItem {
  id: number
  tone: ToastTone
  message: string
}

const styles: Record<ToastTone, { className: string; Icon: typeof Info }> = {
  success: { className: 'border-green-200 bg-white text-green-800', Icon: CheckCircle2 },
  error: { className: 'border-red-200 bg-white text-red-800', Icon: XCircle },
  info: { className: 'border-sky-200 bg-white text-sky-800', Icon: Info },
}

/** Short-lived notifications for completed actions ("Invoice confirmed"), stacked bottom-right. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(0)

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), [])

  const push = useCallback(
    (tone: ToastTone, message: string) => {
      nextId.current += 1
      const id = nextId.current
      setToasts((list) => [...list.slice(-3), { id, tone, message }])
      setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 4000)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-2 sm:left-auto sm:right-6" aria-live="polite">
        {toasts.map(({ id, tone, message }) => {
          const { className, Icon } = styles[tone]
          return (
            <div key={id} role={tone === 'error' ? 'alert' : 'status'} className={`pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg ${className}`}>
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="min-w-0 flex-1 break-words">{message}</p>
              <button onClick={() => dismiss(id)} className="rounded p-0.5 text-slate-400 hover:text-slate-600" aria-label="Dismiss">
                <X className="h-4 w-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
