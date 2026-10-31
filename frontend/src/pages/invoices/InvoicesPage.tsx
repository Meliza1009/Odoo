import { Receipt } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { RunBillingDialog } from '../../components/RunBillingDialog'
import { ListCard } from '../../components/ListCard'
import { Button, Input, PageHeader, Segmented, Select, StatusBadge, type Column } from '../../components/ui'
import { useLookups } from '../../hooks/useLookups'
import { usePagedList } from '../../hooks/usePagedList'
import { formatDate, formatMoney } from '../../lib/format'
import type { InvoiceRow, PagedWithSummary } from '../../types'

const STATUSES = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'outstanding', label: 'Outstanding' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'paid', label: 'Paid' },
  { value: 'cancelled', label: 'Cancelled' },
]

const invoiceStatus = (i: InvoiceRow) => (i.isOverdue ? 'overdue' : i.status === 'confirmed' ? (i.amountPaid > 0 ? 'outstanding' : 'confirmed') : i.status)

export function InvoicesPage({ portal = false }: { portal?: boolean }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const segments = portal ? STATUSES.filter((s) => s.value !== 'draft') : STATUSES
  const [status, setStatus] = useState(segments.find((s) => s.value === params.get('status'))?.value ?? '')
  const [customerId, setCustomerId] = useState(params.get('customerId') ?? '')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [billingOpen, setBillingOpen] = useState(false)
  const lookups = useLookups(!portal)
  const list = usePagedList<InvoiceRow, PagedWithSummary<InvoiceRow, { grandTotal: number; amountDue: number }>>('/invoices', {
    status,
    customerId: portal ? '' : customerId,
    dateFrom,
    dateTo,
  })
  const base = portal ? '/portal' : '/app'

  const columns: Column<InvoiceRow>[] = [
    {
      key: 'number',
      header: 'Invoice',
      render: (i) => (
        <div>
          <p className="font-medium text-primary">{i.invoiceNumber}</p>
          <p className="text-xs text-slate-500">{i.subscriptionNumber}</p>
        </div>
      ),
    },
    ...(portal ? [] : [{ key: 'customer', header: 'Customer', render: (i: InvoiceRow) => i.customerName, hideOnMobile: true }]),
    { key: 'date', header: 'Date', render: (i) => formatDate(i.invoiceDate), hideOnMobile: true },
    { key: 'due', header: 'Due', render: (i) => <span className={i.isOverdue ? 'font-medium text-danger' : ''}>{formatDate(i.dueDate)}</span>, hideOnMobile: true },
    { key: 'status', header: 'Status', render: (i) => <StatusBadge status={invoiceStatus(i)} /> },
    { key: 'total', header: 'Total', render: (i) => formatMoney(i.grandTotal), className: 'text-right tabular-nums' },
    { key: 'amountDue', header: 'Due amount', render: (i) => formatMoney(i.amountDue), className: 'text-right tabular-nums', hideOnMobile: true },
  ]

  const summary = list.data?.summary
  return (
    <>
      <PageHeader
        title={portal ? 'My invoices' : 'Invoices'}
        description={portal ? 'Download invoices and see what is still due.' : 'Generated on billing day with taxes and discounts applied.'}
        actions={
          !portal && (
            <Button variant="secondary" icon={<Receipt className="h-4 w-4" />} onClick={() => setBillingOpen(true)}>
              Run billing
            </Button>
          )
        }
      />
      <div className="mb-4">
        <Segmented label="Invoice status" value={status} onChange={setStatus} options={segments} />
      </div>
      <ListCard
        list={list}
        columns={columns}
        rowKey={(i) => i.id}
        searchPlaceholder={portal ? 'Search invoice number' : 'Search invoice, customer or subscription'}
        filters={
          <>
            {!portal && (
              <Select aria-label="Customer" className="w-48" value={customerId} onChange={(e) => setCustomerId(e.target.value)} options={lookups.data?.customers.map((c) => ({ value: c.id, label: c.companyName })) ?? []} placeholder="All customers" />
            )}
            <Input aria-label="Invoice date from" type="date" className="w-40" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <span className="text-sm text-slate-400">to</span>
            <Input aria-label="Invoice date to" type="date" className="w-40" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </>
        }
        onRowClick={(i) => navigate(`${base}/invoices/${i.id}`)}
        emptyTitle="No invoices"
        emptyDescription={portal ? 'Your invoices will appear here.' : 'Run billing to generate invoices for due subscriptions.'}
        footer={
          summary && list.data && list.data.total > 0 ? (
            <div className="flex flex-wrap justify-end gap-6 border-t border-slate-200 px-4 py-3 text-sm">
              <span className="text-slate-500">
                Total <span className="font-semibold tabular-nums text-ink">{formatMoney(summary.grandTotal)}</span>
              </span>
              <span className="text-slate-500">
                Due <span className="font-semibold tabular-nums text-ink">{formatMoney(summary.amountDue)}</span>
              </span>
            </div>
          ) : undefined
        }
      />
      {!portal && <RunBillingDialog open={billingOpen} onClose={() => setBillingOpen(false)} onDone={list.reload} />}
    </>
  )
}
