import { CheckCircle2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '../components/Logo'

const YEAR = new Date().getFullYear()
const points = ['Invoices generated on billing day, never twice', 'Taxes and discounts applied automatically', 'Live view of recurring revenue and overdue balances']

/** Split screen for login/register/reset: brand panel on large screens, form card everywhere. */
export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-primary p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />
        <Link to="/" className="relative w-fit">
          <Logo light />
        </Link>
        <div className="relative max-w-md">
          <h2 className="text-3xl font-bold leading-tight">Recurring billing that runs itself.</h2>
          <ul className="mt-8 space-y-4">
            {points.map((point) => (
              <li key={point} className="flex items-start gap-3 text-slate-300">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-slate-400">© {YEAR} Brightloop Software</p>
      </aside>

      <main className="flex flex-col items-center justify-center px-4 py-10 sm:px-6">
        <Link to="/" className="mb-8 lg:hidden">
          <Logo />
        </Link>
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
            <h1 className="text-2xl font-bold tracking-tight text-primary">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </div>
          {footer && <div className="mt-6 text-center text-sm text-slate-600">{footer}</div>}
        </div>
      </main>
    </div>
  )
}
