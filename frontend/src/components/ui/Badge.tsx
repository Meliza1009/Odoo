import type { ReactNode } from 'react'
import { titleCase } from '../../lib/format'

type Tone = 'gray' | 'blue' | 'indigo' | 'green' | 'amber' | 'red' | 'teal' | 'navy'

const tones: Record<Tone, string> = {
  gray: 'bg-slate-100 text-slate-600 ring-slate-900/[0.06]',
  blue: 'bg-sky-50 text-sky-700 ring-sky-700/10',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-700/10',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-700/10',
  amber: 'bg-amber-50 text-amber-800 ring-amber-700/15',
  red: 'bg-orange-50 text-orange-800 ring-orange-700/15',
  teal: 'bg-accent-soft text-accent-dark ring-accent-dark/15',
  navy: 'bg-primary/[0.06] text-primary ring-primary/10',
}

export function Badge({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}>
      {children}
    </span>
  )
}

/** Colour mapping for every status used across subscriptions, quotations, invoices and accounts. */
const statusTones: Record<string, Tone> = {
  draft: 'gray',
  quotation: 'blue',
  confirmed: 'indigo',
  active: 'green',
  paused: 'amber',
  cancelled: 'gray',
  closed: 'navy',
  paid: 'green',
  overdue: 'red',
  outstanding: 'amber',
  inactive: 'gray',
  scheduled: 'blue',
  expired: 'gray',
  exhausted: 'amber',
  completed: 'green',
  running: 'blue',
  failed: 'red',
  admin: 'navy',
  staff: 'teal',
  customer: 'blue',
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTones[status] ?? 'gray'}>{titleCase(status)}</Badge>
}
