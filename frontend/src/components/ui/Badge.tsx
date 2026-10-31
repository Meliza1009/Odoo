import type { ReactNode } from 'react'
import { titleCase } from '../../lib/format'

type Tone = 'gray' | 'blue' | 'indigo' | 'green' | 'amber' | 'red' | 'teal' | 'navy'

const tones: Record<Tone, string> = {
  gray: 'bg-slate-100 text-slate-700 ring-slate-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  green: 'bg-green-50 text-green-700 ring-green-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  teal: 'bg-teal-50 text-teal-700 ring-teal-200',
  navy: 'bg-primary/10 text-primary ring-primary/20',
}

export function Badge({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}>
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
  cancelled: 'red',
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
