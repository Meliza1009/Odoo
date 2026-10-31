import { AlertTriangle, CalendarClock, RefreshCcw, Wallet } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { useAuth } from '../../auth/useAuth'
import { Alert, Button, Card, CardHeader, DataTable, ErrorState, LoadingState, PageHeader, StatCard, StatusBadge } from '../../components/ui'
import { useAsync } from '../../hooks/useAsync'
import { formatDate, formatMoney, perInterval } from '../../lib/format'
import type { InvoiceRow, PagedWithSummary, SubscriptionRow, Paged } from '../../types'

const loadPortal = async () => {
  const [subs, open, recent] = await Promise.all([
    api.get<Paged<SubscriptionRow>>('/subscriptions', { params: { pageSize: 100 } }),
    api.get<PagedWithSummary<InvoiceRow, { amountDue: number }>>('/invoices', { params: { status: 'outstanding', pageSize: 100 } }),
    api.get<Paged<InvoiceRow>>('/invoices', { params: { pageSize: 5 } }),
  ])
  return { subs: subs.data.data, open: open.data, recent: recent.data.data }
}

export function PortalDashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data, error, loading, reload } = useAsync(loadPortal)

  if (!data) return loading ? <LoadingState /> : <ErrorState description={error ?? undefined} action={<Button variant="secondary" onClick={reload}>Try again</Button>} />

  const active = data.subs.filter((s) => s.status === 'active')
  const pendingQuotes = data.subs.filter((s) => s.status === 'quotation')
  const overdue = data.open.data.filter((i) => i.isOverdue)
  const overdueTotal = overdue.reduce((sum, i) => sum + i.amountDue, 0)
  const nextBilling = active.map((s) => s.nextBillingDate).filter((d): d is string => !!d).sort()[0]

  return (
    <>
      <PageHeader title={`Hello, ${user?.fullName.split(' ')[0] ?? ''}`} description={user?.customer?.companyName ?? undefined} />

      {overdue.length > 0 && (
        <div className="mb-4">
          <Alert tone="error">
            {overdue.length} invoice{overdue.length === 1 ? ' is' : 's are'} overdue ({formatMoney(overdueTotal)}).{' '}
            <Link to="/portal/invoices?status=overdue" className="font-medium underline">
              View overdue invoices
            </Link>
          </Alert>
        </div>
      )}
      {pendingQuotes.length > 0 && (
        <div className="mb-4">
          <Alert tone="info">
            You have {pendingQuotes.length} quotation{pendingQuotes.length === 1 ? '' : 's'} waiting for your approval. Contact your Brightloop account manager to confirm.
          </Alert>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active subscriptions" value={active.length} icon={<RefreshCcw className="h-5 w-5" />} />
        <StatCard label="Amount due" value={formatMoney(data.open.summary.amountDue)} hint={`${data.open.total} unpaid invoice${data.open.total === 1 ? '' : 's'}`} icon={<Wallet className="h-5 w-5" />} />
        <StatCard label="Overdue" value={formatMoney(overdueTotal)} icon={<AlertTriangle className="h-5 w-5" />} />
        <StatCard label="Next invoice" value={nextBilling ? formatDate(nextBilling) : '-'} icon={<CalendarClock className="h-5 w-5" />} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
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
