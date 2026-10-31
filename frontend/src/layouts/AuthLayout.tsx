import { CheckIcon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '../components/Logo'

const YEAR = new Date().getFullYear()
const points = ['Invoices generated on billing day, never twice', 'Taxes and discounts applied automatically', 'Recurring revenue and overdue balances, live']

/** Login/register/reset: form on the left, the product itself on the right (large screens). */
export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-[100dvh] bg-[#f8faf8] lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <div className="flex min-h-[100dvh] flex-col px-5 py-7 sm:px-10 lg:px-14">
        <Link to="/" className="w-fit" aria-label="Brightloop home">
          <Logo />
        </Link>
        <main className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-[400px] animate-enter">
            <span className="mb-5 flex items-center gap-3 text-xs font-semibold tracking-[0.12em] text-accent-dark uppercase"><span className="h-px w-8 bg-accent-dark" /> Welcome to Brightloop</span>
            <h1 className="text-[2.25rem] font-semibold leading-tight tracking-[-0.05em] text-ink sm:text-[2.75rem]">{title}</h1>
            {subtitle && <p className="mt-2 text-[15px] leading-relaxed text-muted">{subtitle}</p>}
            <div className="mt-9">{children}</div>
            {footer && <div className="mt-9 border-t border-primary/10 pt-5 text-sm text-muted">{footer}</div>}
          </div>
        </main>
        <p className="text-xs text-slate-400">© {YEAR} Brightloop Software</p>
      </div>

      <aside className="loop-field relative hidden overflow-hidden bg-primary lg:flex lg:flex-col lg:justify-center" aria-hidden="true">
        <div className="relative pl-14 xl:pl-20">
          <p className="mb-5 text-xs font-semibold tracking-[0.14em] text-[#57dbc7] uppercase">One connected workspace</p>
          <h2 className="max-w-[17ch] text-[2.6rem] font-semibold leading-[1.06] tracking-[-0.05em] text-white xl:text-[3.2rem]">More clarity, every billing cycle.</h2>
          <ul className="mt-7 space-y-3">
            {points.map((point) => (
              <li key={point} className="flex items-center gap-2.5 text-sm text-white/75">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-[#177c70] text-white">
                  <CheckIcon className="h-3 w-3" weight="bold" />
                </span>
                {point}
              </li>
            ))}
          </ul>
          <div className="mt-12 -mr-40 rounded-l-[1.6rem] bg-white/10 p-1.5 pr-0 ring-1 ring-white/15">
            <img
              src="/screens/dashboard.jpg"
              alt=""
              width={2160}
              height={1350}
              className="block h-auto w-full rounded-l-[calc(1.6rem-0.375rem)] shadow-[0_30px_60px_-30px_rgb(0_0_0/0.4)] ring-1 ring-white/15"
            />
          </div>
        </div>
      </aside>
    </div>
  )
}
