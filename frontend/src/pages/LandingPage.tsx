import { ArrowRight, BarChart3, CalendarClock, CreditCard, Receipt, ShieldCheck, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Logo } from '../components/Logo'

const features = [
  { icon: CalendarClock, title: 'Plans that bill themselves', text: 'Daily, weekly, monthly or yearly plans with pause, renewal and auto-close rules per plan.' },
  { icon: Receipt, title: 'Invoices on billing day', text: 'Every due subscription becomes an invoice with taxes and discounts applied, never billed twice.' },
  { icon: CreditCard, title: 'Payments matched instantly', text: 'Record cash, bank or card payments against the right invoice and see what is still outstanding.' },
  { icon: BarChart3, title: 'Revenue at a glance', text: 'Active subscriptions, recurring revenue and overdue invoices on one dashboard.' },
  { icon: Users, title: 'Self-service portal', text: 'Customers see their own subscriptions, invoices and payment history without emailing anyone.' },
  { icon: ShieldCheck, title: 'Roles built in', text: 'Admins control the system, staff handle daily work, customers only ever see their own data.' },
]

const YEAR = new Date().getFullYear()

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link to="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-ink hover:bg-slate-100">
            Log in
          </Link>
          <Link to="/register" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-light">
            Get started
          </Link>
        </nav>
      </header>

      <section className="relative overflow-hidden bg-primary">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:py-28">
          <div>
            <p className="mb-4 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-accent">Subscription management for Brightloop Software</p>
            <h1 className="text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
              Plans, subscriptions and recurring billing in one place.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-300">
              Replace spreadsheets, missed renewals and hand-typed invoices with one system that runs every billing month on its own.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/register" className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-3 font-semibold text-primary hover:bg-accent-dark">
                Create an account <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/login" className="inline-flex items-center rounded-lg border border-white/30 px-5 py-3 font-semibold text-white hover:bg-white/10">
                Log in
              </Link>
            </div>
          </div>
          <div className="hidden items-center lg:flex">
            <div className="w-full rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
              <div className="grid grid-cols-2 gap-4">
                {[
                  ['Active subscriptions', '1,284'],
                  ['Monthly recurring revenue', '₹18.4L'],
                  ['Collected this month', '₹15.9L'],
                  ['Overdue invoices', '12'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-white/10 p-4">
                    <p className="text-xs text-slate-300">{label}</p>
                    <p className="mt-2 text-2xl font-bold text-white">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight text-primary">Everything a subscription business runs on</h2>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-xl border border-slate-200 p-6">
              <div className="inline-flex rounded-lg bg-accent/10 p-2 text-accent-dark">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold text-ink">{title}</h3>
              <p className="mt-2 text-sm text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-500">© {YEAR} Brightloop Software</footer>
    </div>
  )
}
