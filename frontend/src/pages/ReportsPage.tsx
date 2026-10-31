import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { BreakdownPie, RevenueChart } from '../components/charts'
import { Alert, Button, Card, CardHeader, DataTable, Input, LoadingState, PageHeader, Pagination, Select, StatCard, StatusBadge, type Column } from '../components/ui'
import { useAsync } from '../hooks/useAsync'
import { useLookups } from '../hooks/useLookups'
import { usePagedList } from '../hooks/usePagedList'
import { addDaysIso, formatDate, formatMoney, perInterval, paymentMethodLabel, todayIso } from '../lib/format'
import { PAYMENT_METHODS, type InvoiceRow, type PagedWithSummary, type ReportSummary, type RevenueReport, type SubscriptionReport } from '../types'

interface Filters {
  dateFrom: string
  dateTo: string
  customerId: string
  planId: string
  paymentMethod: string
}

const today = todayIso()
const PRESETS = [
  { label: 'This month', from: `${today.slice(0, 7)}-01`, to: today },
  { label: 'Last 90 days', from: addDaysIso(today, -89), to: today },
  { label: 'Last 12 months', from: `${addDaysIso(today, -365).slice(0, 7)}-01`, to: today },
  { label: 'Year to date', from: `${today.slice(0, 4)}-01-01`, to: today },
]

const clean = (f: Filters) => Object.fromEntries(Object.entries(f).filter(([, v]) => v))

const overdueColumns: Column<InvoiceRow>[] = [
  { key: 'number', header: 'Invoice', render: (i) => <span className="font-medium text-primary">{i.invoiceNumber}</span> },
  { key: 'customer', header: 'Customer', render: (i) => i.customerName },
  { key: 'due', header: 'Due date', render: (i) => formatDate(i.dueDate), hideOnMobile: true },
  { key: 'days', header: 'Days overdue', render: (i) => <span className="font-medium text-danger">{i.daysOverdue}</span> },
  { key: 'amount', header: 'Amount due', render: (i) => formatMoney(i.amountDue), className: 'text-right tabular-nums' },
]

export function ReportsPage() {
  const navigate = useNavigate()
  const lookups = useLookups()
  const [filters, setFilters] = useState<Filters>({ dateFrom: PRESETS[2].from, dateTo: today, customerId: '', planId: '', paymentMethod: '' })
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }))
  const invalidRange = filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo

  const key = JSON.stringify(clean(filters))
  const load = useCallback(async () => {
    const params = JSON.parse(key) as Record<string, string>
    const [summary, revenue, subs] = await Promise.all([
      api.get<ReportSummary>('/reports/summary', { params }),
      api.get<RevenueReport>('/reports/revenue', { params }),
      api.get<SubscriptionReport>('/reports/subscriptions', { params: { customerId: params.customerId, planId: params.planId } }),
    ])
    return { summary: summary.data, revenue: revenue.data, subs: subs.data }
  }, [key])
  const report = useAsync(invalidRange ? noop : load)
  const overdue = usePagedList<InvoiceRow, PagedWithSummary<InvoiceRow, { amountDue: number }>>('/reports/overdue', { customerId: filters.customerId, planId: filters.planId }, 10)

  const customers = lookups.data?.customers.map((c) => ({ value: c.id, label: c.companyName })) ?? []
  const plans = lookups.data?.plans.map((p) => ({ value: p.id, label: p.name })) ?? []
  const data = report.data

  return (
    <>
      <PageHeader title="Reports" description="Revenue, collections, subscriptions and overdue balances for any period." />

      <Card className="mb-6 p-4">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button key={p.label} size="sm" variant={filters.dateFrom === p.from && filters.dateTo === p.to ? 'primary' : 'secondary'} onClick={() => set({ dateFrom: p.from, dateTo: p.to })}>
              {p.label}
            </Button>
          ))}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Input label="From" type="date" value={filters.dateFrom} max={today} onChange={(e) => set({ dateFrom: e.target.value })} />
          <Input label="To" type="date" value={filters.dateTo} max={today} onChange={(e) => set({ dateTo: e.target.value })} error={invalidRange ? 'Must be after the start date' : undefined} />
          <Select label="Customer" value={filters.customerId} onChange={(e) => set({ customerId: e.target.value })} options={customers} placeholder="All customers" />
          <Select label="Plan" value={filters.planId} onChange={(e) => set({ planId: e.target.value })} options={plans} placeholder="All plans" />
          <Select
            label="Payment method"
            value={filters.paymentMethod}
            onChange={(e) => set({ paymentMethod: e.target.value })}
            options={PAYMENT_METHODS.map((m) => ({ value: m, label: paymentMethodLabel(m) }))}
            placeholder="All methods"
          />
        </div>
      </Card>

      {report.error && <Alert tone="error">{report.error}</Alert>}
      {!data && report.loading && <LoadingState />}

      {data && (
        <div className={report.loading ? 'opacity-60 transition-opacity' : ''}>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Revenue collected" value={formatMoney(data.summary.revenueCollected)} hint={`${data.summary.paymentCount} payments in period`} />
            <StatCard label="Invoiced" value={formatMoney(data.summary.invoicedTotal)} hint={`${data.summary.invoiceCount} invoices in period`} />
            <StatCard label="MRR (current)" value={formatMoney(data.summary.mrr)} hint={`ARR ${formatMoney(data.summary.arr)}`} />
            <StatCard label="Overdue (today)" value={formatMoney(data.summary.overdueBalance)} hint={`${data.summary.overdueCount} invoices`} />
            <StatCard label="Active subscriptions" value={data.summary.activeSubscriptions} hint={`${data.summary.pausedSubscriptions} paused`} />
            <StatCard label="Outstanding balance" value={formatMoney(data.summary.outstandingBalance)} hint={`${data.summary.outstandingCount} unpaid invoices`} />
            <StatCard label="Closed / cancelled" value={data.summary.cancelledSubscriptions} hint="in period" />
            <StatCard label="Renewals due" value={data.summary.upcomingRenewals} hint="next 30 days" />
          </div>

          <Card className="mt-6">
            <CardHeader title="Invoiced vs collected by month" />
            <div className="p-4">
              <RevenueChart data={data.revenue.byMonth} height={320} />
            </div>
          </Card>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Collected by payment method" />
              <div className="p-4">
                <BreakdownPie data={data.revenue.byMethod} nameKey="paymentMethod" valueKey="amount" />
              </div>
            </Card>
            <Card>
              <CardHeader title="Collected by plan" />
              <DataTable
                columns={[
                  { key: 'plan', header: 'Plan', render: (r) => r.planName },
                  { key: 'subs', header: 'Subscriptions', render: (r) => r.subscriptions, className: 'text-right' },
                  { key: 'collected', header: 'Collected', render: (r) => formatMoney(r.collected), className: 'text-right tabular-nums' },
                ]}
                rows={data.revenue.byPlan}
                rowKey={(r) => r.planId}
                emptyTitle="No payments in this period"
              />
            </Card>
            <Card>
              <CardHeader title="Subscriptions by status" />
              <DataTable
                columns={[
                  { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                  { key: 'count', header: 'Count', render: (r) => r.count, className: 'text-right' },
                ]}
                rows={data.subs.byStatus}
                rowKey={(r) => r.status}
                emptyTitle="No subscriptions yet"
              />
            </Card>
            <Card>
              <CardHeader title="Recurring revenue by plan" />
              <DataTable
                columns={[
                  { key: 'plan', header: 'Plan', render: (r) => `${r.planName} ${perInterval(r.billingInterval)}` },
                  { key: 'active', header: 'Active', render: (r) => `${r.active} / ${r.total}`, className: 'text-right' },
                  { key: 'mrr', header: 'MRR', render: (r) => formatMoney(r.mrr), className: 'text-right tabular-nums' },
                ]}
                rows={data.subs.byPlan}
                rowKey={(r) => r.planId}
                emptyTitle="No subscriptions yet"
              />
            </Card>
          </div>
        </div>
      )}

      <Card className="mt-6">
        <CardHeader title={`Overdue invoices${overdue.data ? ` · ${formatMoney(overdue.data.summary.amountDue)}` : ''}`} />
        <DataTable
          columns={overdueColumns}
          rows={overdue.data?.data ?? null}
          rowKey={(i) => i.id}
          loading={overdue.loading}
          error={overdue.error}
          onRetry={overdue.reload}
          onRowClick={(i) => navigate(`/app/invoices/${i.id}`)}
          emptyTitle="Nothing overdue"
        />
        {overdue.data && overdue.data.total > 0 && <Pagination page={overdue.page} totalPages={overdue.data.totalPages} total={overdue.data.total} onPageChange={overdue.setPage} />}
      </Card>
    </>
  )
}

const noop = () => new Promise<never>(() => undefined)
