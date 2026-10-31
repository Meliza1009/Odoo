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
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 accent-[var(--color-accent-dark)]"
        {...props}
      />
      <label htmlFor={inputId} className="cursor-pointer text-sm leading-tight">
        <span className="font-medium text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-xs leading-relaxed text-muted">{hint}</span>}
      </label>
    </div>
  )
})

/** Label/value pairs for detail pages. */
export function DetailList({ items, columns = 2 }: { items: { label: string; value: ReactNode }[]; columns?: 1 | 2 | 3 }) {
  return (
    <dl className={`grid gap-x-6 gap-y-4 ${columns === 1 ? '' : 'sm:grid-cols-2'} ${columns === 3 ? 'lg:grid-cols-3' : ''}`}>
      {items.map(({ label, value }) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs text-muted">{label}</dt>
          <dd className="mt-0.5 break-words text-sm font-medium text-ink">{value ?? '-'}</dd>
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
    <div role="tablist" aria-label={label} className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-control bg-slate-900/[0.05] p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={`whitespace-nowrap rounded-[0.5rem] px-3 py-1.5 text-[13px] font-medium transition duration-200 ease-soft ${
            value === option.value ? 'bg-surface text-ink shadow-xs ring-1 ring-slate-900/[0.06]' : 'text-muted hover:text-ink'
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
    <dl className="ml-auto w-full max-w-xs space-y-2 text-sm">
      {rows.map(({ label, value, strong }) => (
        <div key={label} className={`flex justify-between gap-4 ${strong ? 'border-t border-slate-900/[0.08] pt-2.5 text-[15px] font-semibold text-ink' : 'text-muted'}`}>
          <dt>{label}</dt>
          <dd className="tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
