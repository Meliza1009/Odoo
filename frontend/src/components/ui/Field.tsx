import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

const controlClass = (error?: string) =>
  `block w-full rounded-control bg-surface px-3 text-sm text-ink shadow-xs ring-1 ring-inset transition duration-200 ease-soft placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:bg-slate-50 disabled:text-slate-500 read-only:bg-slate-50 ${
    error ? 'ring-danger/60 focus:ring-danger/50' : 'ring-slate-900/10 hover:ring-slate-900/20 focus:ring-accent/50'
  }`

interface WrapperProps {
  id: string
  label?: string
  error?: string
  hint?: ReactNode
  required?: boolean
  children: ReactNode
}

function FieldWrapper({ id, label, error, hint, required, children }: WrapperProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-[13px] font-medium text-slate-700">
          {label}
          {required && (
            <span aria-hidden="true" className="ml-0.5 text-danger">
              *
            </span>
          )}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs leading-relaxed text-muted">{hint}</p>
      )}
    </div>
  )
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, error, hint, id, className = '', ...props }, ref) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <FieldWrapper id={inputId} label={label} error={error} hint={hint} required={props.required}>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : undefined}
        className={`h-9 ${controlClass(error)} ${className}`}
        {...props}
      />
    </FieldWrapper>
  )
})

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  hint?: ReactNode
  options: { value: string | number; label: string }[]
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, id, options, placeholder, className = '', ...props },
  ref,
) {
  const autoId = useId()
  const selectId = id ?? autoId
  return (
    <FieldWrapper id={selectId} label={label} error={error} hint={hint} required={props.required}>
      <select
        ref={ref}
        id={selectId}
        aria-invalid={!!error}
        className={`h-9 appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2016%2016'%20fill='none'%20stroke='%235b6474'%20stroke-width='1.5'%3E%3Cpath%20d='M4%206l4%204%204-4'/%3E%3C/svg%3E")] bg-[length:14px] bg-[right_0.6rem_center] bg-no-repeat pr-8 ${controlClass(error)} ${className}`}
        {...props}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldWrapper>
  )
})

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  hint?: ReactNode
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, id, className = '', rows = 3, ...props },
  ref,
) {
  const autoId = useId()
  const textareaId = id ?? autoId
  return (
    <FieldWrapper id={textareaId} label={label} error={error} hint={hint} required={props.required}>
      <textarea ref={ref} id={textareaId} rows={rows} aria-invalid={!!error} className={`py-2 leading-relaxed ${controlClass(error)} ${className}`} {...props} />
    </FieldWrapper>
  )
})
