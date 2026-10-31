import { MagnifyingGlassIcon } from '@phosphor-icons/react'
import type { InputHTMLAttributes, ReactNode } from 'react'

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink sm:text-[1.75rem]">{title}</h1>
        {description && <p className="mt-1.5 max-w-[65ch] text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-surface bg-surface shadow-card ring-1 ring-slate-900/[0.06] ${className}`}>{children}</div>
}

export function CardHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-900/[0.06] px-5 py-3.5">
      <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
      {actions}
    </div>
  )
}

export function SearchInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={`relative ${className}`}>
      <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        className="block h-9 w-full rounded-control bg-surface pl-9 pr-3 text-sm shadow-xs ring-1 ring-inset ring-slate-900/10 transition duration-200 ease-soft placeholder:text-slate-400 hover:ring-slate-900/20 focus:outline-none focus:ring-2 focus:ring-accent/50"
        {...props}
      />
    </div>
  )
}

interface Metric {
  label: string
  value: ReactNode
  hint?: ReactNode
}

/** Several headline numbers in one surface, split by hairlines, instead of a row of separate cards. */
export function MetricStrip({ items }: { items: Metric[] }) {
  return (
    <Card className="grid grid-cols-2 lg:grid-cols-4">
      {items.map(({ label, value, hint }, i) => (
        <div
          key={label}
          className={`min-w-0 px-5 py-5 ${i % 2 === 1 ? 'border-l border-slate-900/[0.06]' : ''} ${i >= 2 ? 'border-t border-slate-900/[0.06] lg:border-t-0' : ''} ${i === 2 ? 'lg:border-l' : ''}`}
        >
          <p className="truncate text-[13px] font-medium text-muted">{label}</p>
          <p className="mt-2.5 truncate text-[1.6rem] font-semibold leading-none tracking-[-0.03em] text-ink tabular-nums">{value}</p>
          {hint && <p className="mt-2 truncate text-xs text-muted">{hint}</p>}
        </div>
      ))}
    </Card>
  )
}

export function StatCard({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <Card className="group p-5 transition duration-300 ease-soft hover:-translate-y-0.5 hover:shadow-pop">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-medium text-muted">{label}</p>
        {icon && <span className="text-slate-400 transition-colors duration-300 group-hover:text-accent-dark [&_svg]:h-[18px] [&_svg]:w-[18px]">{icon}</span>}
      </div>
      <p className="mt-3 truncate text-[1.65rem] font-semibold leading-none tracking-[-0.03em] text-ink tabular-nums">{value}</p>
      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
    </Card>
  )
}
