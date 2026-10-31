import { AlertTriangle, CheckCircle2, Inbox, Info, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

export function LoadingState({ label = 'Loading...' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-16 text-slate-500">
      <Spinner className="h-6 w-6 text-accent" />
      <span className="text-sm">{label}</span>
    </div>
  )
}

export function FullPageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Spinner className="h-8 w-8 text-accent" />
    </div>
  )
}

interface StateProps {
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ title, description, action }: StateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <div className="rounded-full bg-slate-100 p-3 text-slate-400">
        <Inbox className="h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description && <p className="max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function ErrorState({ title = 'Something went wrong', description, action }: Partial<StateProps>) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <div className="rounded-full bg-red-50 p-3 text-danger">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description && <p className="max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

const alertStyles = {
  info: { className: 'border-sky-200 bg-sky-50 text-sky-800', Icon: Info },
  success: { className: 'border-green-200 bg-green-50 text-green-800', Icon: CheckCircle2 },
  warning: { className: 'border-amber-200 bg-amber-50 text-amber-800', Icon: AlertTriangle },
  error: { className: 'border-red-200 bg-red-50 text-red-800', Icon: XCircle },
}

export function Alert({ tone = 'info', children }: { tone?: keyof typeof alertStyles; children: ReactNode }) {
  const { className, Icon } = alertStyles[tone]
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${className}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 break-words">{children}</div>
    </div>
  )
}
