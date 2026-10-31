import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react'

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string
  hint?: ReactNode
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox({ label, hint, id, className = '', ...props }, ref) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <div className={`flex items-start gap-2.5 ${className}`}>
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-accent accent-[var(--color-accent-dark)] focus:ring-accent/30"
        {...props}
      />
      <label htmlFor={inputId} className="text-sm">
        <span className="font-medium text-ink">{label}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </label>
    </div>
  )
})

/** Label/value pairs for detail pages. */
export function DetailList({ items, columns = 2 }: { items: { label: string; value: ReactNode }[]; columns?: 2 | 3 }) {
  return (
    <dl className={`grid gap-x-6 gap-y-4 sm:grid-cols-2 ${columns === 3 ? 'lg:grid-cols-3' : ''}`}>
      {items.map(({ label, value }) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
          <dd className="mt-1 break-words text-sm text-ink">{value ?? '-'}</dd>
        </div>
      ))}
    </dl>
  )
}

interface SegmentedProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  label: string
}

/** Pill-style filter (e.g. invoice status). Scrolls horizontally on small screens. */
export function Segmented<T extends string>({ value, onChange, options, label }: SegmentedProps<T>) {
  return (
    <div role="tablist" aria-label={label} className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            value === option.value ? 'bg-white text-primary shadow-xs' : 'text-slate-600 hover:text-ink'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** Totals block under line tables (subtotal, discount, tax, total). */
export function Totals({ rows }: { rows: { label: string; value: ReactNode; strong?: boolean }[] }) {
  return (
    <dl className="ml-auto w-full max-w-xs space-y-1.5 text-sm">
      {rows.map(({ label, value, strong }) => (
        <div key={label} className={`flex justify-between gap-4 ${strong ? 'border-t border-slate-200 pt-2 text-base font-semibold text-primary' : 'text-slate-600'}`}>
          <dt>{label}</dt>
          <dd className="tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
