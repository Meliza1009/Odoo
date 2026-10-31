import { MagnifyingGlassIcon } from '@phosphor-icons/react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-5 border-b border-primary/10 pb-7 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[2rem] font-semibold leading-tight tracking-[-0.045em] text-ink sm:text-[2.4rem]">{title}</h1>
        {description && <p className="mt-2 max-w-[58ch] text-sm leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`min-w-0 rounded-surface bg-surface shadow-card ring-1 ring-primary/[0.055] ${className}`}>{children}</div>
}

export function CardHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-primary/[0.07] px-5 py-4 sm:px-6">
      <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-ink">{title}</h2>
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
        className="block h-10 w-full rounded-control bg-surface pl-9 pr-3 text-sm shadow-xs ring-1 ring-inset ring-primary/15 transition duration-200 ease-soft placeholder:text-slate-400 hover:ring-primary/25 focus:outline-none focus:ring-2 focus:ring-accent-dark/60"
        {...props}
      />
    </div>
  )
}

interface Metric {
  label: string
  value: ReactNode
  hint?: ReactNode
  to?: string
}

/** Several headline numbers in one surface, split by hairlines, instead of a row of separate cards. */
export function MetricStrip({ items }: { items: Metric[] }) {
  return (
    <Card className="grid grid-cols-2 overflow-hidden lg:grid-cols-4">
      {items.map(({ label, value, hint, to }, i) => {
        const className = `min-w-0 px-4 py-6 sm:px-6 sm:py-7 ${to ? 'group relative transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-accent-dark' : ''} ${i === 0 ? 'loop-field bg-primary' : ''} ${i % 2 === 1 ? 'border-l border-primary/[0.06]' : ''} ${i >= 2 ? 'border-t border-primary/[0.06] lg:border-t-0' : ''} ${i === 2 ? 'lg:border-l' : ''}`
        const content = <>
          <p className={`text-[12px] font-medium leading-tight ${i === 0 ? 'text-white/70' : 'text-muted'}`}>{label}</p>
          <p className={`mt-3 text-[clamp(1.35rem,2vw,1.8rem)] font-semibold leading-none tracking-[-0.045em] tabular-nums ${i === 0 ? 'text-white' : 'text-ink'}`}>{value}</p>
          {hint && <p className={`mt-2 text-xs ${i === 0 ? 'text-white/60' : 'text-muted'}`}>{hint}</p>}
          {to && <span className={`mt-3 block text-xs font-medium ${i === 0 ? 'text-white/80' : 'text-accent-dark'} group-hover:underline`}>View details →</span>}
        </>
        return to ? <Link key={label} to={to} className={className}>{content}</Link> : <div key={label} className={className}>{content}</div>
      })}
    </Card>
  )
}

export function StatCard({ label, value, hint, icon, to }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; to?: string }) {
  const content = <>
    <div className="flex items-center justify-between gap-3">
      <p className="text-[13px] font-medium text-muted">{label}</p>
      {icon && <span className="text-slate-400 [&_svg]:h-[18px] [&_svg]:w-[18px]">{icon}</span>}
    </div>
    <p className="mt-3 text-[clamp(1.35rem,2vw,1.8rem)] font-semibold leading-none tracking-[-0.04em] text-ink tabular-nums">{value}</p>
    {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
    {to && <span className="mt-3 block text-xs font-medium text-accent-dark group-hover:underline">View details →</span>}
  </>
  if (to) return <Link to={to} className="group block min-w-0 rounded-surface bg-surface p-5 shadow-card ring-1 ring-primary/[0.055] transition hover:shadow-pop focus-visible:outline-2 focus-visible:outline-accent-dark sm:p-6">{content}</Link>
  return (
    <Card className="group min-w-0 p-5 transition duration-300 ease-soft hover:-translate-y-0.5 hover:shadow-pop sm:p-6">
      {content}
    </Card>
  )
}
