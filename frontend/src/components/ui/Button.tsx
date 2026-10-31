import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Spinner } from './Feedback'

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-white shadow-xs hover:bg-primary-light',
  // accent-dark keeps white text above WCAG AA (the lighter brand teal does not).
  accent: 'bg-accent-dark text-white shadow-xs hover:bg-[#0b7064]',
  secondary: 'bg-surface text-ink shadow-xs ring-1 ring-inset ring-slate-900/10 hover:bg-slate-50 hover:ring-slate-900/15',
  ghost: 'text-slate-700 hover:bg-slate-900/[0.05] hover:text-ink',
  danger: 'bg-danger text-white shadow-xs hover:bg-[#a8380a]',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-11 px-5 text-[15px] gap-2',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  className = '',
  disabled,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex select-none items-center justify-center whitespace-nowrap rounded-control font-medium transition duration-200 ease-soft active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {loading ? <Spinner className="h-4 w-4" /> : icon}
      {children}
    </button>
  )
}
