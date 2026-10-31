import { ArrowRightIcon, ArrowsClockwiseIcon, CalendarDotsIcon, WalletIcon, WarningIcon } from '@phosphor-icons/react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { useAuth } from '../../auth/useAuth'
import { Alert, Button, Card, CardHeader, DataTable, ErrorState, LoadingState, StatusBadge } from '../../components/ui'
import { useAsync } from '../../hooks/useAsync'
import { formatDate, formatMoney, perInterval } from '../../lib/format'
import type { InvoiceRow, SubscriptionRow, Paged } from '../../types'
import type { PortalSummary } from './portal-types'

const loadPortal = async () => {
  const [summary, subs, recent] = await Promise.all([
    api.get<PortalSummary>('/portal/summary'),
    api.get<Paged<SubscriptionRow>>('/subscriptions', { params: { pageSize: 5 } }),
    api.get<Paged<InvoiceRow>>('/invoices', { params: { pageSize: 5 } }),
  ])
  return { summary: summary.data, subs: subs.data.data, recent: recent.data.data }
}

export function PortalDashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data, error, loading, reload } = useAsync(loadPortal)

  if (!data) return loading ? <LoadingState /> : <ErrorState description={error ?? undefined} action={<Button variant="secondary" onClick={reload}>Try again</Button>} />

  const { summary } = data

  return (
    <>
      <div className="mb-8 border-b border-primary/10 pb-6">
        <p className="mb-2 text-xs font-semibold tracking-[0.12em] text-accent-dark uppercase">{user?.customer?.companyName ?? 'Your account'}</p>
        <h1 className="text-[2.25rem] font-semibold tracking-[-0.05em] text-ink sm:text-[2.75rem]">{`Hello, ${user?.fullName.split(' ')[0] ?? ''}`}</h1>
        <p className="mt-1 text-sm text-muted">Your subscriptions and billing, all in one place.</p>
      </div>

      {summary.overdueCount > 0 && (
        <div className="mb-4">
          <Alert tone="error">
            {summary.overdueCount} invoice{summary.overdueCount === 1 ? ' is' : 's are'} overdue ({formatMoney(summary.overdueBalance)}).{' '}
            <Link to="/portal/invoices?status=overdue" className="font-medium underline">
              View overdue invoices
            </Link>
          </Alert>
        </div>
      )}
      {summary.openQuotations > 0 && (
        <div className="mb-4">
          <Alert tone="info">
            You have {summary.openQuotations} quotation{summary.openQuotations === 1 ? '' : 's'} waiting for your approval. <Link to="/portal/subscriptions?status=quotation" className="font-medium underline">View quotations</Link> or contact your account manager to confirm.
          </Alert>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Link to="/portal/invoices?status=outstanding" className="loop-field group flex min-h-56 flex-col justify-between rounded-surface bg-primary p-6 text-white sm:p-8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-dark">
          <div className="flex items-start justify-between">
            <span className="text-[13px] font-medium text-white/70">Amount due</span>
            <WalletIcon className="h-5 w-5 text-[#57dbc7]" weight="light" />
          </div>
          <div className="mt-10">
            <p className="text-[clamp(2rem,5vw,3.3rem)] font-semibold leading-none tracking-[-0.055em] tabular-nums">{formatMoney(summary.outstandingBalance)}</p>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] text-white/65">{summary.outstandingCount} unpaid invoice{summary.outstandingCount === 1 ? '' : 's'}</p>
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#7de4d2]">
                View invoices <ArrowRightIcon className="h-4 w-4 transition-transform duration-200 ease-soft group-hover:translate-x-1" />
              </span>
            </div>
          </div>
        </Link>
        <div className="grid grid-cols-2 overflow-hidden rounded-surface bg-surface shadow-card ring-1 ring-primary/[0.055]">
          {[
            { label: 'Active subscriptions', value: summary.activeSubscriptions, icon: ArrowsClockwiseIcon, to: '/portal/subscriptions?status=active' },
            { label: 'Next invoice', value: summary.nextBillingDate ? formatDate(summary.nextBillingDate) : '-', icon: CalendarDotsIcon, to: summary.nextBillingSubscriptionId ? `/portal/subscriptions/${summary.nextBillingSubscriptionId}` : '/portal/subscriptions' },
            { label: 'Overdue', value: formatMoney(summary.overdueBalance), icon: WarningIcon, to: '/portal/invoices?status=overdue' },
            { label: 'Paid invoices', value: summary.paidInvoices, icon: WalletIcon, to: '/portal/invoices?status=paid' },
          ].map(({ label, value, icon: Icon, to }, index) => (
            <Link key={label} to={to} className={`group min-w-0 p-4 transition hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent-dark sm:p-5 ${index % 2 ? 'border-l border-primary/[0.07]' : ''} ${index > 1 ? 'border-t border-primary/[0.07]' : ''}`}>
              <Icon className="h-5 w-5 text-accent-dark" weight="light" />
              <p className="mt-4 text-xs text-muted">{label}</p>
              <p className="mt-1 text-[clamp(1.05rem,2vw,1.4rem)] font-semibold leading-tight tracking-[-0.04em] text-ink tabular-nums">{value}</p>
              <span className="mt-2 block text-xs font-medium text-accent-dark group-hover:underline">View details →</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-4 text-sm font-medium text-accent-dark"><Link to="/portal/catalog" className="hover:underline">Explore available plans & products →</Link><Link to="/portal/discounts" className="hover:underline">View my discounts →</Link></div>

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="My subscriptions" actions={<Link to="/portal/subscriptions" className="text-sm font-medium text-accent-dark hover:underline">View all</Link>} />
          <DataTable
            columns={[
              { key: 'number', header: 'Subscription', render: (s) => <span className="font-medium text-primary">{s.subscriptionNumber}</span> },
              { key: 'plan', header: 'Plan', render: (s) => s.planName, hideOnMobile: true },
              { key: 'status', header: 'Status', render: (s) => <StatusBadge status={s.status} /> },
              { key: 'total', header: 'Amount', render: (s) => `${formatMoney(s.total)} ${perInterval(s.billingInterval)}`, className: 'text-right tabular-nums whitespace-nowrap' },
            ]}
            rows={data.subs.slice(0, 5)}
            rowKey={(s) => s.id}
            onRowClick={(s) => navigate(`/portal/subscriptions/${s.id}`)}
            emptyTitle="No subscriptions yet"
          />
        </Card>
        <Card>
          <CardHeader title="Recent invoices" actions={<Link to="/portal/invoices" className="text-sm font-medium text-accent-dark hover:underline">View all</Link>} />
          <DataTable
            columns={[
              { key: 'number', header: 'Invoice', render: (i) => <span className="font-medium text-primary">{i.invoiceNumber}</span> },
              { key: 'date', header: 'Date', render: (i) => formatDate(i.invoiceDate), hideOnMobile: true },
              { key: 'status', header: 'Status', render: (i) => <StatusBadge status={i.isOverdue ? 'overdue' : i.status} /> },
              { key: 'total', header: 'Total', render: (i) => formatMoney(i.grandTotal), className: 'text-right tabular-nums' },
            ]}
            rows={data.recent}
            rowKey={(i) => i.id}
            onRowClick={(i) => navigate(`/portal/invoices/${i.id}`)}
            emptyTitle="No invoices yet"
          />
        </Card>
      </div>
    </>
  )
}
