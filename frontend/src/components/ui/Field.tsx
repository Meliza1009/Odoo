import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

const controlClass = (error?: string) =>
  `block w-full rounded-lg border bg-white px-3 py-2 text-sm text-ink shadow-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:bg-slate-100 ${
    error ? 'border-danger focus:ring-danger/30' : 'border-slate-300 focus:border-accent focus:ring-accent/30'
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
    <div className="space-y-1">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-ink">
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-slate-500">{hint}</p>
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
        className={`${controlClass(error)} ${className}`}
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
      <select ref={ref} id={selectId} aria-invalid={!!error} className={`${controlClass(error)} ${className}`} {...props}>
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
      <textarea ref={ref} id={textareaId} rows={rows} aria-invalid={!!error} className={`${controlClass(error)} ${className}`} {...props} />
    </FieldWrapper>
  )
})
