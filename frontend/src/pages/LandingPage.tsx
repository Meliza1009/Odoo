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
  invoiceLines: { src: '/screens/invoice-lines.jpg', width: 1120, height: 1072 },
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

const LIFECYCLE = [
  { number: '01', title: 'Build the quote', detail: 'Start with a plan or a ready-made template. Set the products and terms once.' },
  { number: '02', title: 'Start the subscription', detail: 'Confirm, activate, pause or renew with a clear history at every step.' },
  { number: '03', title: 'Collect with confidence', detail: 'Billing creates the invoice; taxes, discounts and payments stay in sync.' },
]


export function LandingPage() {
  return (
    <div className="grain relative min-h-[100dvh] overflow-x-clip bg-background">
      {/* Hero backdrop: a light paper field with teal light and a restrained dot fade. */}
      <div aria-hidden="true" className="paper-field pointer-events-none absolute inset-x-0 top-0 h-[960px]">
        <div className="bg-dots mask-fade-right absolute inset-0 opacity-30" />
        <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-b from-transparent to-background" />
      </div>

      <header className="fixed inset-x-0 top-4 z-30 px-4">
        <nav
          aria-label="Site"
          className="mx-auto flex max-w-6xl items-center justify-between gap-2 rounded-full bg-surface/90 py-2 pl-3 pr-2 sm:gap-4 sm:pl-5 shadow-[0_8px_32px_-16px_rgb(14_23_38/0.25)] ring-1 ring-slate-900/[0.07] backdrop-blur-xl"
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
          <div className="flex shrink-0 items-center gap-1">
            <Link to="/login" className="inline-flex min-h-10 items-center whitespace-nowrap rounded-full px-2 py-2 text-xs font-medium text-ink sm:px-3.5 sm:text-[14px] transition-colors hover:bg-slate-900/[0.05]">
              Log in
            </Link>
            <Link to="/register" className="inline-flex min-h-10 items-center whitespace-nowrap rounded-full bg-primary px-2 py-2 text-xs font-medium text-white sm:px-4 sm:text-[14px] transition duration-300 ease-soft hover:bg-primary-light active:scale-[0.98]">
              Get started
            </Link>
          </div>
        </nav>
      </header>

      <main>
        <section className="relative mx-auto grid max-w-[1400px] items-center gap-12 px-4 pb-20 pt-36 sm:px-8 lg:min-h-[830px] lg:grid-cols-12 lg:gap-8 lg:pb-24 lg:pt-28">
          <div className="lg:col-span-5">
            <Reveal>
              <p className="mb-6 flex items-center gap-3 text-[12px] font-semibold tracking-[0.14em] text-accent-dark uppercase">
                <span className="h-px w-8 bg-accent-dark" /> Subscription management, simplified
              </p>
            </Reveal>
            <Reveal delay={80}>
              <h1 className="max-w-[12ch] text-[3.3rem] font-semibold leading-[0.99] tracking-[-0.065em] text-ink sm:text-7xl lg:text-[clamp(4rem,5.2vw,5.65rem)]">
                Better billing.<br /><span className="text-accent-dark">Brighter business.</span>
              </h1>
            </Reveal>
            <Reveal delay={160}>
              <p className="mt-7 max-w-[38ch] text-[17px] leading-relaxed text-muted">
                From the first quote to the final payment, keep every subscription moving in one beautifully clear workspace.
              </p>
            </Reveal>
            <Reveal delay={240}>
              <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
                <PillCta to="/register">Create an account</PillCta>
                <Link to="/login" className="group inline-flex items-center gap-1.5 text-[15px] font-medium text-ink">
                  See the demo
                  <ArrowRightIcon className="h-4 w-4 transition-transform duration-300 ease-soft group-hover:translate-x-1" />
                </Link>
              </div>
            </Reveal>
          </div>

          <div className="relative lg:col-span-7 lg:pl-8">
            <Reveal delay={200}>
              <div className="loop-field overflow-hidden rounded-[2rem] bg-primary px-5 pb-12 pt-12 shadow-[0_36px_80px_-40px_rgb(14_23_38/0.5)] sm:px-10 sm:pt-16 lg:-mr-28 lg:px-10 lg:pb-16 xl:-mr-40">
                <p className="mb-6 text-[11px] font-medium tracking-[0.16em] text-white/65 uppercase">A clearer picture of every cycle</p>
                <div className="overflow-hidden rounded-t-xl rounded-b-md bg-white shadow-pop ring-1 ring-white/30">
                  <Screenshot shot="dashboard" alt="Brightloop dashboard showing monthly recurring revenue, active subscriptions, collections and overdue invoices" eager />
                </div>
              </div>
            </Reveal>
            <Reveal delay={420} className="relative z-10 -mt-9 ml-3 w-[76%] max-w-lg sm:-mt-16 md:-mt-20 md:-ml-10 md:w-[62%]">
              <Bezel>
                <Screenshot shot="invoiceLines" alt="Invoice lines with a welcome discount and 18% GST applied per line" />
              </Bezel>
            </Reveal>
          </div>
        </section>

        <section id="features" className="relative isolate scroll-mt-28 py-20 sm:py-28">
          {/* Features backdrop: a full-width canvas that separates the product flow from the hero. */}
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-canvas" />
          <div className="mx-auto max-w-[1240px] px-4 sm:px-8">
            <Reveal>
              <div className="flex flex-col gap-5 border-t border-primary/15 pt-6 md:flex-row md:justify-between">
                <p className="text-xs font-semibold tracking-[0.14em] text-accent-dark uppercase">The Brightloop flow</p>
                <h2 className="max-w-[18ch] text-4xl font-semibold leading-[1.04] tracking-[-0.05em] text-ink sm:text-5xl">
                  From first quote to final payment. All connected.
                </h2>
              </div>
            </Reveal>
            <div className="mt-14 grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-16">
              <ol className="min-w-0 border-t border-primary/15" aria-label="Subscription lifecycle">
                {LIFECYCLE.map(({ number, title, detail }) => (
                  <li key={number} className="grid grid-cols-[3rem_1fr] gap-4 border-b border-primary/15 py-7 sm:py-9">
                    <span className="pt-1 font-mono text-sm text-accent-dark">{number}</span>
                    <div>
                      <h3 className="text-xl font-semibold tracking-[-0.03em] text-ink sm:text-2xl">{title}</h3>
                      <p className="mt-2 max-w-[44ch] text-sm leading-relaxed text-muted sm:text-[15px]">{detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <Reveal delay={120} className="min-w-0 lg:pt-5">
                <div className="overflow-hidden rounded-[1.5rem] bg-primary p-4 pb-0 shadow-[0_30px_65px_-35px_rgb(14_23_38/0.45)] sm:p-7 sm:pb-0">
                  <div className="flex items-center justify-between gap-4 pb-5 text-[11px] font-medium tracking-[0.12em] text-white/70 uppercase">
                    <span>Invoices, without the busywork</span>
                    <ReceiptIcon className="h-5 w-5 text-accent" />
                  </div>
                  <div className="overflow-hidden rounded-t-xl ring-1 ring-white/10">
                    <Screenshot shot="invoiceMain" alt="Invoice detail with lines, discounts, tax, totals and the payment that settled it" className="min-w-[460px]" />
                  </div>
                </div>
              </Reveal>
            </div>
            <Reveal className="mt-16 grid items-center gap-10 border-t border-primary/15 pt-9 md:grid-cols-2 md:gap-16">
              <div>
                <p className="text-xs font-semibold tracking-[0.14em] text-accent-dark uppercase">Precision at every step</p>
                <h3 className="mt-4 max-w-[20ch] text-3xl font-semibold leading-[1.1] tracking-[-0.04em] text-ink sm:text-4xl">The rules are set once. The details take care of themselves.</h3>
              </div>
              <p className="max-w-[48ch] text-base leading-relaxed text-muted">
                Plan-specific terms, automated tax rules and recurring discounts follow every active subscription into its next invoice. You keep control without keeping another spreadsheet.
              </p>
            </Reveal>
          </div>
        </section>

        <section id="portal" className="mx-auto max-w-[1240px] scroll-mt-28 px-4 py-20 sm:px-8 lg:py-28">
          <Reveal className="grid items-center gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
            <div>
              <StorefrontIcon className="h-8 w-8 text-accent-dark" weight="light" />
              <p className="mt-7 text-xs font-semibold tracking-[0.14em] text-accent-dark uppercase">Customer portal</p>
              <h2 className="mt-4 max-w-[14ch] text-4xl font-semibold leading-[1.04] tracking-[-0.05em] text-ink sm:text-5xl">
                A clearer view for everyone on the other side.
              </h2>
              <p className="mt-6 max-w-[42ch] text-base leading-relaxed text-muted">
                Give customers a place to see what is active, what is due and what has been paid. No more chasing a copy of last month’s invoice.
              </p>
              <Link to="/login" className="group mt-7 inline-flex items-center gap-2 text-sm font-semibold text-accent-dark">
                View your account <ArrowRightIcon className="h-4 w-4 transition-transform duration-200 ease-soft group-hover:translate-x-1" />
              </Link>
            </div>
            <div className="overflow-hidden rounded-[1.5rem] bg-wash p-4 pb-0 sm:p-8 sm:pb-0">
              <div className="overflow-hidden rounded-t-xl bg-surface shadow-pop ring-1 ring-primary/10">
                <Screenshot shot="portal" alt="Customer portal showing subscriptions, upcoming invoice date and recent invoices" className="min-w-[500px]" />
              </div>
            </div>
          </Reveal>
        </section>

        <section className="mx-auto max-w-[1240px] px-4 pb-24 sm:px-8 lg:pb-32">
          <Reveal>
            <div className="loop-field relative overflow-hidden rounded-[1.75rem] bg-primary px-8 py-14 sm:px-14 sm:py-16">
              <div className="relative flex flex-col items-start justify-between gap-8 md:flex-row md:items-end">
                <div>
                  <h2 className="max-w-[18ch] text-3xl font-semibold leading-[1.1] tracking-[-0.035em] text-white sm:text-4xl">Already billed by Brightloop?</h2>
                  <p className="mt-3 max-w-[46ch] leading-relaxed text-white/70">Sign in with the email on your invoices to see what is due and download past invoices.</p>
                </div>
                <PillCta to="/login" tone="light">
                  Log in to the portal
                </PillCta>
              </div>
            </div>
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
