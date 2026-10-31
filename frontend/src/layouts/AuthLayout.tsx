import { CheckIcon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '../components/Logo'

const YEAR = new Date().getFullYear()
const points = ['Invoices generated on billing day, never twice', 'Taxes and discounts applied automatically', 'Recurring revenue and overdue balances, live']

/** Login/register/reset: form on the left, the product itself on the right (large screens). */
export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-[100dvh] bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex min-h-[100dvh] flex-col px-5 py-8 sm:px-10">
        <Link to="/" className="w-fit" aria-label="Brightloop home">
          <Logo />
        </Link>
        <main className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-[400px] animate-enter">
            <h1 className="text-[1.75rem] font-semibold tracking-[-0.03em] text-ink">{title}</h1>
            {subtitle && <p className="mt-2 text-[15px] text-muted">{subtitle}</p>}
            <div className="mt-8">{children}</div>
            {footer && <div className="mt-8 text-sm text-muted">{footer}</div>}
          </div>
        </main>
        <p className="text-xs text-slate-400">© {YEAR} Brightloop Software</p>
      </div>

      <aside className="relative hidden overflow-hidden border-l border-slate-900/[0.06] bg-[#eef2f3] lg:flex lg:flex-col lg:justify-center" aria-hidden="true">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_60%_at_80%_20%,rgb(20_166_147/0.22),transparent_70%),radial-gradient(45%_45%_at_0%_100%,rgb(14_23_38/0.08),transparent_70%)]" />
        <div className="relative pl-14 xl:pl-20">
          <h2 className="max-w-[18ch] text-[2rem] font-semibold leading-[1.1] tracking-[-0.035em] text-ink">Recurring billing that runs itself.</h2>
          <ul className="mt-6 space-y-2.5">
            {points.map((point) => (
              <li key={point} className="flex items-center gap-2.5 text-[15px] text-slate-600">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-accent-dark text-white">
                  <CheckIcon className="h-3 w-3" weight="bold" />
                </span>
                {point}
              </li>
            ))}
          </ul>
          <div className="mt-12 -mr-40 rounded-l-[1.6rem] bg-white/50 p-1.5 pr-0 ring-1 ring-slate-900/[0.06]">
            <img
              src="/screens/dashboard.jpg"
              alt=""
              width={2160}
              height={1350}
              className="block h-auto w-full rounded-l-[calc(1.6rem-0.375rem)] shadow-[0_30px_60px_-30px_rgb(14_23_38/0.45)] ring-1 ring-slate-900/[0.06]"
            />
          </div>
        </div>
      </aside>
    </div>
  )
}
