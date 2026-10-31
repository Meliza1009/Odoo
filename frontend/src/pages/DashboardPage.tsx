import { AlertTriangle, ArrowRight, Banknote, Plus, Receipt, RefreshCcw, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/useAuth'
import { RevenueChart } from '../components/charts'
import { RunBillingDialog } from '../components/RunBillingDialog'
import { Button, Card, CardHeader, DataTable, ErrorState, LoadingState, PageHeader, StatCard, type Column } from '../components/ui'
import { useAsync } from '../hooks/useAsync'
import { formatDate, formatMoney } from '../lib/format'
import type { InvoiceRow, PagedWithSummary, ReportSummary, RevenueReport } from '../types'

interface DashboardData {
  summary: ReportSummary
  revenue: RevenueReport
  overdue: PagedWithSummary<InvoiceRow, { amountDue: number }>
}

const loadDashboard = async (): Promise<DashboardData> => {
  const [summary, revenue, overdue] = await Promise.all([
    api.get<ReportSummary>('/reports/summary'),
    api.get<RevenueReport>('/reports/revenue'),
    api.get<DashboardData['overdue']>('/reports/overdue', { params: { pageSize: 5 } }),
  ])
  return { summary: summary.data, revenue: revenue.data, overdue: overdue.data }
}

const overdueColumns: Column<InvoiceRow>[] = [
  {
    key: 'number',
    header: 'Invoice',
    render: (i) => (
      <div className="whitespace-nowrap">
        <p className="font-medium text-primary">{i.invoiceNumber}</p>
        <p className="text-xs text-slate-500" title={`Due ${formatDate(i.dueDate)}`}>
          {i.customerName}
        </p>
      </div>
    ),
  },
  { key: 'days', header: 'Overdue', render: (i) => <span className="whitespace-nowrap text-danger">{i.daysOverdue} days</span> },
  { key: 'amount', header: 'Amount due', render: (i) => formatMoney(i.amountDue), className: 'whitespace-nowrap text-right tabular-nums' },
]

export function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [billingOpen, setBillingOpen] = useState(false)
  const { data, error, loading, reload } = useAsync(loadDashboard)

  const header = (
    <PageHeader
      title={`Welcome back, ${user?.fullName.split(' ')[0] ?? ''}`}
      description="Subscriptions, recurring revenue and collections at a glance."
      actions={
        <>
          <Button variant="secondary" icon={<Receipt className="h-4 w-4" />} onClick={() => setBillingOpen(true)}>
            Run billing
          </Button>
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/app/subscriptions/new')}>
            New quotation
          </Button>
        </>
      }
    />
  )

  if (!data) {
    return (
      <>
        {header}
        {loading ? <LoadingState /> : <ErrorState description={error ?? undefined} action={<Button variant="secondary" onClick={reload}>Try again</Button>} />}
      </>
    )
  }

  const { summary, revenue, overdue } = data
  const secondary = [
    { label: 'Open quotations', value: summary.openQuotations, to: '/app/quotations' },
    { label: 'Renewals in 30 days', value: summary.upcomingRenewals, to: '/app/subscriptions?status=active' },
    { label: 'Outstanding balance', value: formatMoney(summary.outstandingBalance), to: '/app/invoices?status=outstanding' },
    { label: 'Draft invoices', value: summary.draftInvoices, to: '/app/invoices?status=draft' },
  ]

  return (
    <>
      {header}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active subscriptions" value={summary.activeSubscriptions} hint={`${summary.pausedSubscriptions} paused`} icon={<RefreshCcw className="h-5 w-5" />} />
        <StatCard label="Monthly recurring revenue" value={formatMoney(summary.mrr)} hint={`ARR ${formatMoney(summary.arr)}`} icon={<TrendingUp className="h-5 w-5" />} />
        <StatCard label="Collected this month" value={formatMoney(summary.revenueCollected)} hint={`${summary.paymentCount} payments`} icon={<Banknote className="h-5 w-5" />} />
        <StatCard label="Overdue balance" value={formatMoney(summary.overdueBalance)} hint={`${summary.overdueCount} invoices past due`} icon={<AlertTriangle className="h-5 w-5" />} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {secondary.map((item) => (
          <Link key={item.label} to={item.to} className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 hover:border-accent">
            <div>
              <p className="text-xs text-slate-500">{item.label}</p>
              <p className="font-semibold text-primary">{item.value}</p>
            </div>
            <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-accent-dark" />
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="Revenue, last 12 months" actions={<Link to="/app/reports" className="text-sm font-medium text-accent-dark hover:underline">Reports</Link>} />
          <div className="p-4">
            <RevenueChart data={revenue.byMonth} />
          </div>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader
            title={`Overdue invoices (${overdue.total})`}
            actions={<Link to="/app/invoices?status=overdue" className="text-sm font-medium text-accent-dark hover:underline">View all</Link>}
          />
          <DataTable
            columns={overdueColumns}
            rows={overdue.data}
            rowKey={(i) => i.id}
            onRowClick={(i) => navigate(`/app/invoices/${i.id}`)}
            emptyTitle="Nothing overdue"
            emptyDescription="Every confirmed invoice is within its payment terms."
          />
        </Card>
      </div>

      <RunBillingDialog open={billingOpen} onClose={() => setBillingOpen(false)} onDone={reload} />
    </>
  )
}
