import { ArrowRightIcon, ArrowUpRightIcon, ReceiptIcon, StorefrontIcon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { Reveal } from '../components/Reveal'

const YEAR = new Date().getFullYear()

/** Machined "double bezel": an outer tray holding the inner surface, with concentric radii. */
function Bezel({ children, className = '', inner = '' }: { children: ReactNode; className?: string; inner?: string }) {
  return (
    <div className={`rounded-[1.6rem] bg-slate-900/[0.035] p-1.5 ring-1 ring-slate-900/[0.06] ${className}`}>
      <div className={`overflow-hidden rounded-[calc(1.6rem-0.375rem)] bg-surface shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_24px_48px_-28px_rgb(14_23_38/0.35)] ring-1 ring-slate-900/[0.06] ${inner}`}>
        {children}
      </div>
    </div>
  )
}

/** Real product screenshots captured from the running app (public/screens). Intrinsic sizes prevent layout shift. */
const SHOTS = {
  dashboard: { src: '/screens/dashboard.jpg', width: 2160, height: 1350 },
  invoiceLines: { src: '/screens/invoice-lines.jpg', width: 1468, height: 808 },
  invoiceMain: { src: '/screens/invoice-main.jpg', width: 2384, height: 1600 },
  portal: { src: '/screens/portal.jpg', width: 2160, height: 1350 },
}

function Screenshot({ shot, alt, eager = false, className = '' }: { shot: keyof typeof SHOTS; alt: string; eager?: boolean; className?: string }) {
  const { src, width, height } = SHOTS[shot]
  return <img src={src} alt={alt} width={width} height={height} loading={eager ? 'eager' : 'lazy'} decoding="async" className={`block h-auto w-full ${className}`} />
}

/** Primary marketing CTA: pill with the arrow nested in its own circle. */
function PillCta({ to, children, tone = 'dark' }: { to: string; children: ReactNode; tone?: 'dark' | 'light' }) {
  const dark = tone === 'dark'
  return (
    <Link
      to={to}
      className={`group inline-flex items-center gap-3 rounded-full py-1.5 pl-5 pr-1.5 text-[15px] font-medium transition duration-300 ease-soft active:scale-[0.98] ${
        dark ? 'bg-primary text-white shadow-[0_10px_30px_-12px_rgb(14_23_38/0.6)] hover:bg-primary-light' : 'bg-surface text-ink ring-1 ring-slate-900/10 hover:ring-slate-900/20'
      }`}
    >
      {children}
      <span
        className={`grid h-8 w-8 place-items-center rounded-full transition-transform duration-300 ease-soft group-hover:-translate-y-px group-hover:translate-x-0.5 group-hover:scale-105 ${
          dark ? 'bg-white/12 text-white' : 'bg-slate-900/[0.05] text-ink'
        }`}
      >
        <ArrowUpRightIcon className="h-4 w-4" weight="bold" />
      </span>
    </Link>
  )
}

const LIFECYCLE = ['Draft', 'Quotation', 'Confirmed', 'Active', 'Closed']


export function LandingPage() {
  return (
    <div className="grain relative min-h-[100dvh] overflow-x-clip bg-background">
      {/* Hero backdrop: brand-teal light from the top right, a dot lattice behind the product shot, a cool shadow top left. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[1300px]">
        <div className="absolute inset-0 bg-[radial-gradient(55%_45%_at_78%_10%,rgb(20_166_147/0.18),transparent_70%),radial-gradient(35%_40%_at_8%_0%,rgb(14_23_38/0.07),transparent_70%),radial-gradient(40%_30%_at_40%_95%,rgb(20_166_147/0.07),transparent_70%)]" />
        <div className="bg-dots mask-fade-right absolute inset-0" />
        <div className="absolute inset-x-0 bottom-0 h-[420px] bg-gradient-to-b from-transparent to-background" />
      </div>

      <header className="fixed inset-x-0 top-4 z-30 px-4">
        <nav
          aria-label="Site"
          className="mx-auto flex max-w-5xl items-center justify-between gap-4 rounded-full bg-surface/75 py-2 pl-5 pr-2 shadow-[0_8px_32px_-16px_rgb(14_23_38/0.25)] ring-1 ring-slate-900/[0.07] backdrop-blur-xl"
        >
          <Link to="/" aria-label="Brightloop home">
            <Logo />
          </Link>
          <div className="hidden items-center gap-1 text-[14px] text-slate-600 md:flex">
            <a href="#features" className="rounded-full px-3 py-1.5 transition-colors hover:text-ink">
              Features
            </a>
            <a href="#portal" className="rounded-full px-3 py-1.5 transition-colors hover:text-ink">
              Customer portal
            </a>
          </div>
          <div className="flex items-center gap-1">
            <Link to="/login" className="rounded-full px-3.5 py-2 text-[14px] font-medium text-ink transition-colors hover:bg-slate-900/[0.05]">
              Log in
            </Link>
            <Link to="/register" className="rounded-full bg-primary px-4 py-2 text-[14px] font-medium text-white transition duration-300 ease-soft hover:bg-primary-light active:scale-[0.98]">
              Get started
            </Link>
          </div>
        </nav>
      </header>

      <main>
        <section className="relative mx-auto grid max-w-[1320px] items-center gap-14 px-4 pb-16 pt-32 sm:px-8 lg:grid-cols-12 lg:gap-8 lg:pb-20 lg:pt-40">
          <div className="lg:col-span-5">
            <Reveal>
              <p className="inline-flex rounded-full bg-accent-soft px-3 py-1 text-[12px] font-medium text-accent-dark ring-1 ring-accent-dark/10">Subscription billing for Brightloop Software</p>
            </Reveal>
            <Reveal delay={80}>
              <h1 className="mt-6 text-[2.75rem] font-semibold leading-[1.02] tracking-[-0.045em] text-ink sm:text-6xl lg:text-[4.1rem]">Recurring billing that runs itself.</h1>
            </Reveal>
            <Reveal delay={160}>
              <p className="mt-6 max-w-[42ch] text-[17px] leading-relaxed text-muted">
                Plans, quotations, subscriptions, invoices and payments in one place, with taxes and discounts applied on every billing day.
              </p>
            </Reveal>
            <Reveal delay={240}>
              <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
                <PillCta to="/register">Create an account</PillCta>
                <Link to="/login" className="group inline-flex items-center gap-1.5 text-[15px] font-medium text-ink">
                  Explore the demo
                  <ArrowRightIcon className="h-4 w-4 transition-transform duration-300 ease-soft group-hover:translate-x-1" />
                </Link>
              </div>
            </Reveal>
          </div>

          <div className="relative lg:col-span-7">
            <Reveal delay={200}>
              <Bezel className="lg:-mr-28 xl:-mr-40">
                <Screenshot shot="dashboard" alt="Brightloop dashboard showing monthly recurring revenue, active subscriptions, collections and overdue invoices" eager />
              </Bezel>
            </Reveal>
            <Reveal delay={420} className="relative z-10 -mt-16 ml-4 w-[78%] max-w-lg sm:-mt-24 md:-mt-32 md:ml-[-3rem] md:-rotate-[1.5deg] md:w-[64%]">
              <Bezel>
                <Screenshot shot="invoiceLines" alt="Invoice lines with a welcome discount and 18% GST applied per line, totalling ₹6,040.42" />
              </Bezel>
            </Reveal>
          </div>
        </section>

        <section id="features" className="relative isolate mx-auto max-w-[1240px] scroll-mt-28 px-4 py-24 sm:px-8 lg:py-32">
          {/* Features backdrop: a tinted band that bleeds past the container, dots behind the heading, and two soft glows under the bento. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-[100vw] -translate-x-1/2">
            <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgb(226_233_236/0.6)_30%,rgb(226_233_236/0.6)_78%,transparent)]" />
            <div className="bg-dots mask-fade-left absolute inset-x-0 top-0 h-[560px]" />
            <div className="bg-dots-accent mask-fade-right absolute inset-x-0 bottom-0 h-[620px]" />
            <div className="absolute inset-0 bg-[radial-gradient(38%_32%_at_15%_62%,rgb(20_166_147/0.22),transparent_70%),radial-gradient(32%_30%_at_90%_22%,rgb(14_23_38/0.08),transparent_70%),radial-gradient(34%_28%_at_78%_88%,rgb(20_166_147/0.18),transparent_70%)]" />
          </div>
          <Reveal>
            <h2 className="max-w-[20ch] text-4xl font-semibold leading-[1.05] tracking-[-0.04em] text-ink sm:text-5xl">Everything between the quote and the payment.</h2>
          </Reveal>

          <div className="mt-14 grid grid-cols-1 gap-5 lg:grid-cols-12">
            <Reveal className="lg:col-span-7 lg:row-span-2">
              <Bezel className="h-full" inner="flex h-full flex-col">
                <div className="p-8 sm:p-10">
                  <ReceiptIcon className="h-6 w-6 text-accent-dark" />
                  <h3 className="mt-5 text-2xl font-semibold tracking-[-0.025em] text-ink">Billing day without the spreadsheet</h3>
                  <p className="mt-3 max-w-[48ch] leading-relaxed text-muted">
                    Every active subscription that is due becomes an invoice with customer details, lines, taxes and totals filled in. A period is never billed twice and never skipped.
                  </p>
                </div>
                <div className="relative mt-auto flex-1 overflow-hidden pl-8 sm:pl-10">
                  <div className="overflow-hidden rounded-tl-xl ring-1 ring-slate-900/[0.07]">
                    <Screenshot shot="invoiceMain" alt="Invoice detail with lines, discount, tax, totals and the payment that settled it" className="min-w-[560px]" />
                  </div>
                </div>
              </Bezel>
            </Reveal>

            <Reveal delay={100} className="lg:col-span-5">
              <Bezel className="h-full" inner="h-full bg-[linear-gradient(160deg,var(--color-accent-soft),#ffffff_70%)] p-8 sm:p-10">
                <h3 className="text-xl font-semibold tracking-[-0.02em] text-ink">A lifecycle you can trust</h3>
                <p className="mt-2 leading-relaxed text-muted">Each subscription moves through the same states, and each plan decides whether it can pause, renew or close early.</p>
                <ol className="mt-7 flex flex-wrap items-center gap-2" aria-label="Subscription lifecycle">
                  {LIFECYCLE.map((state, i) => (
                    <li key={state} className="flex items-center gap-2">
                      <span className={`rounded-lg px-2.5 py-1 text-[13px] font-medium ring-1 ${state === 'Active' ? 'bg-accent-dark text-white ring-accent-dark' : 'bg-surface text-ink ring-slate-900/10'}`}>{state}</span>
                      {i < LIFECYCLE.length - 1 && <ArrowRightIcon className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />}
                    </li>
                  ))}
                </ol>
              </Bezel>
            </Reveal>

            <Reveal delay={180} className="lg:col-span-5">
              <Bezel className="h-full" inner="h-full p-8 sm:p-10">
                <h3 className="text-xl font-semibold tracking-[-0.02em] text-ink">Taxes and discounts, applied for you</h3>
                <p className="mt-2 leading-relaxed text-muted">Rules are set once by an admin and picked up by every invoice until they expire or run out.</p>
                <dl className="mt-6 divide-y divide-slate-900/[0.06] text-[14px]">
                  <div className="flex items-baseline justify-between gap-4 pb-3">
                    <dt className="font-medium text-ink">GST 18%</dt>
                    <dd className="text-right text-muted">every product line</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4 py-3">
                    <dt className="font-medium text-ink">GST 12%</dt>
                    <dd className="text-right text-muted">physical goods only</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4 pt-3">
                    <dt className="font-medium text-ink">Welcome offer ₹500</dt>
                    <dd className="text-right text-muted">orders over ₹2,000, first 100 uses</dd>
                  </div>
                </dl>
              </Bezel>
            </Reveal>

            <div id="portal" className="scroll-mt-28 lg:col-span-12">
              <Reveal>
                <Bezel inner="grid items-center gap-8 lg:grid-cols-12">
                  <div className="p-8 sm:p-10 lg:col-span-5">
                    <StorefrontIcon className="h-6 w-6 text-accent-dark" />
                    <h3 className="mt-5 text-2xl font-semibold tracking-[-0.025em] text-ink">A portal your customers will actually use</h3>
                    <p className="mt-3 max-w-[44ch] leading-relaxed text-muted">
                      Customers sign in to see their plans, renewal dates, invoices and payment history. No more emailing finance for a copy of last month.
                    </p>
                  </div>
                  <div className="self-end overflow-hidden pl-8 sm:pl-10 lg:col-span-7 lg:pl-0">
                    <div className="overflow-hidden rounded-tl-xl ring-1 ring-slate-900/[0.07]">
                      <Screenshot shot="portal" alt="Customer portal with amount due, next invoice date, subscriptions and recent invoices" className="min-w-[620px]" />
                    </div>
                  </div>
                </Bezel>
              </Reveal>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1240px] px-4 pb-24 sm:px-8 lg:pb-32">
          <Reveal>
            <Bezel inner="relative overflow-hidden px-8 py-16 sm:px-14 sm:py-20">
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_80%_at_100%_100%,rgb(20_166_147/0.18),transparent_70%),radial-gradient(30%_60%_at_0%_0%,rgb(14_23_38/0.05),transparent_70%)]" />
              <div aria-hidden="true" className="bg-dots-accent mask-fade-right pointer-events-none absolute inset-0" />
              <div className="relative flex flex-col items-start justify-between gap-8 md:flex-row md:items-end">
                <div>
                  <h2 className="max-w-[18ch] text-3xl font-semibold leading-[1.1] tracking-[-0.035em] text-ink sm:text-4xl">Already billed by Brightloop?</h2>
                  <p className="mt-3 max-w-[46ch] leading-relaxed text-muted">Sign in with the email on your invoices to see what is due and download past invoices.</p>
                </div>
                <PillCta to="/login" tone="light">
                  Log in to the portal
                </PillCta>
              </div>
            </Bezel>
          </Reveal>
        </section>
      </main>

      <footer className="mx-auto flex max-w-[1240px] flex-col items-start justify-between gap-4 border-t border-slate-900/[0.07] px-4 py-10 text-[13px] text-muted sm:flex-row sm:items-center sm:px-8">
        <Logo />
        <p>© {YEAR} Brightloop Software</p>
      </footer>
    </div>
  )
}
