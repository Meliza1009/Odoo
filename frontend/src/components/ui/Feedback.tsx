import { CheckCircleIcon, InfoIcon, TrayIcon, WarningIcon, XCircleIcon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

/** Skeleton page body: a header block and a few rows, shaped like the lists and cards it stands in for. */
export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3 p-5">
      <span className="sr-only">{label}</span>
      <div className="skeleton h-4 w-40" />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-4">
          <div className="skeleton h-9 flex-1" style={{ maxWidth: `${92 - i * 9}%` }} />
          <div className="skeleton hidden h-9 w-24 sm:block" />
        </div>
      ))}
    </div>
  )
}

export function FullPageLoader() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background" role="status">
      <span className="sr-only">Loading</span>
      <Spinner className="h-6 w-6 text-accent" />
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
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-slate-900/[0.04] text-slate-400 ring-1 ring-inset ring-slate-900/[0.06]">
        <TrayIcon className="h-5 w-5" />
      </div>
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({ title = 'Something went wrong', description, action }: Partial<StateProps>) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-orange-50 text-danger ring-1 ring-inset ring-orange-700/10">
        <WarningIcon className="h-5 w-5" />
      </div>
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

const alertStyles = {
  info: { className: 'bg-sky-50/80 text-sky-900 ring-sky-700/10', Icon: InfoIcon },
  success: { className: 'bg-emerald-50/80 text-emerald-900 ring-emerald-700/10', Icon: CheckCircleIcon },
  warning: { className: 'bg-amber-50/80 text-amber-900 ring-amber-700/15', Icon: WarningIcon },
  error: { className: 'bg-orange-50/80 text-orange-900 ring-orange-700/15', Icon: XCircleIcon },
}

export function Alert({ tone = 'info', children }: { tone?: keyof typeof alertStyles; children: ReactNode }) {
  const { className, Icon } = alertStyles[tone]
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2.5 rounded-control px-3.5 py-2.5 text-sm ring-1 ring-inset ${className}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" weight="fill" />
      <div className="min-w-0 break-words leading-relaxed">{children}</div>
    </div>
  )
}
