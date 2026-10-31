import { ArrowRightIcon, PlusIcon, ReceiptIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/useAuth'
import { RevenueChart } from '../components/charts'
import { RunBillingDialog } from '../components/RunBillingDialog'
import { Button, Card, CardHeader, DataTable, ErrorState, LoadingState, MetricStrip, PageHeader, type Column } from '../components/ui'
import { useAsync } from '../hooks/useAsync'
import { formatDate, formatMoney, todayIso } from '../lib/format'
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

interface StaffWorkspace {
  assignedCustomers: number
  activeSubscriptions: number
  openQuotations: number
  upcomingRenewals: number
  overdueInvoices: number
}

const loadWorkspace = () => api.get<StaffWorkspace>('/reports/workspace').then((r) => r.data)

export function DashboardPage() {
  const { user } = useAuth()
  return user?.role === 'staff' ? <StaffDashboard /> : <AdminDashboard />
}

function StaffDashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data, error, loading, reload } = useAsync(loadWorkspace)
  return <>
    <PageHeader title={`Welcome back, ${user?.fullName.split(' ')[0] ?? ''}`}
      description="Manage your assigned customers, quotations and subscription follow-ups."
      actions={<Button icon={<PlusIcon className="h-4 w-4" />} onClick={() => navigate('/app/subscriptions/new')}>New quotation</Button>} />
    {!data ? loading ? <LoadingState /> : <ErrorState description={error ?? undefined} action={<Button onClick={reload}>Try again</Button>} /> : <>
      <MetricStrip items={[
        { label: 'My customers', value: data.assignedCustomers, hint: 'Customers assigned to you', to: '/app/customers' },
        { label: 'Active subscriptions', value: data.activeSubscriptions, hint: 'For your assigned customers', to: '/app/subscriptions?status=active' },
        { label: 'Open quotations', value: data.openQuotations, hint: 'Drafts and sent quotations', to: '/app/quotations' },
        { label: 'Renewals in 30 days', value: data.upcomingRenewals, hint: 'Active or paused subscriptions expiring soon', to: '/app/subscriptions?renewalsDue=true' },
      ]} />
      <Card className="mt-6 p-6">
        <h2 className="text-lg font-semibold text-ink">Follow-ups</h2>
        <Link to="/app/invoices?status=overdue" className="mt-4 flex items-center justify-between gap-4 rounded-control border border-primary/10 p-4 text-sm hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-accent-dark">
          <span><span className="block font-semibold">Overdue invoices: {data.overdueInvoices}</span><span className="mt-1 block text-muted">Review unpaid invoices past their due date for your customers.</span></span>
          <ArrowRightIcon className="h-5 w-5 shrink-0 text-accent-dark" />
        </Link>
        {data.assignedCustomers === 0 && <p className="mt-4 text-sm text-muted">No customers are assigned to you yet. An admin can assign customers from the customer edit form.</p>}
      </Card>
    </>}
  </>
}

function AdminDashboard() {
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
          <Button variant="secondary" icon={<ReceiptIcon className="h-4 w-4" />} onClick={() => setBillingOpen(true)}>
            Run billing
          </Button>
          <Button icon={<PlusIcon className="h-4 w-4" />} onClick={() => navigate('/app/subscriptions/new')}>
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
    { label: 'Renewals in 30 days', value: summary.upcomingRenewals, to: '/app/subscriptions?renewalsDue=true' },
    { label: 'Outstanding balance', value: formatMoney(summary.outstandingBalance), to: '/app/invoices?status=outstanding' },
    { label: 'Draft invoices', value: summary.draftInvoices, to: '/app/invoices?status=draft' },
  ]

  return (
    <>
      {header}
      <MetricStrip
        items={[
          { label: 'Monthly recurring revenue', value: formatMoney(summary.mrr), hint: `ARR ${formatMoney(summary.arr)}`, to: '/app/reports#recurring-revenue' },
          { label: 'Active subscriptions', value: summary.activeSubscriptions, hint: `${summary.pausedSubscriptions} paused`, to: '/app/subscriptions?status=active' },
          { label: 'Collected this month', value: formatMoney(summary.revenueCollected), hint: `${summary.paymentCount} payments`, to: `/app/payments?dateFrom=${todayIso().slice(0, 7)}-01&dateTo=${todayIso()}` },
          {
            label: 'Overdue balance',
            value: <span className={summary.overdueBalance > 0 ? 'text-danger' : ''}>{formatMoney(summary.overdueBalance)}</span>,
            hint: `${summary.overdueCount} invoices past due`,
            to: '/app/invoices?status=overdue',
          },
        ]}
      />

      <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-primary/10 py-5 xl:grid-cols-4">
        {secondary.map((item) => (
          <Link
            key={item.label}
            to={item.to}
            className="group flex min-w-0 items-end justify-between gap-2 transition duration-200 ease-soft hover:opacity-70"
          >
            <span className="min-w-0">
              <span className="block text-xs leading-snug text-muted">{item.label}</span>
              <span className="mt-1 block text-base font-semibold tracking-[-0.025em] text-ink tabular-nums">{item.value}</span>
            </span>
            <ArrowRightIcon className="mb-1 h-4 w-4 shrink-0 text-accent-dark transition-transform duration-200 ease-soft group-hover:translate-x-1" />
          </Link>
        ))}
      </div>

      <p className="mt-3 text-xs text-muted">Outstanding balance is the unpaid amount on confirmed invoices, including invoices that are not overdue yet. Billing runs generate new invoices for due subscription periods.</p>

      <div className="mt-7 grid items-start gap-6 xl:grid-cols-5">
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
