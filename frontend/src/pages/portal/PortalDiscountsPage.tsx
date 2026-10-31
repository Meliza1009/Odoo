import { useNavigate } from 'react-router-dom'
import { ListCard } from '../../components/ListCard'
import { PageHeader, type Column } from '../../components/ui'
import { usePagedList } from '../../hooks/usePagedList'
import { formatDate, formatMoney } from '../../lib/format'
import type { PagedWithSummary } from '../../types'
import type { AvailedDiscount } from './portal-types'

const columns: Column<AvailedDiscount>[] = [
  { key: 'name', header: 'Discount', render: (d) => <span className="font-medium text-ink">{d.name}</span> },
  { key: 'invoice', header: 'Invoice', render: (d) => <span className="font-medium text-accent-dark">{d.invoiceNumber}</span> },
  { key: 'subscription', header: 'Subscription', render: (d) => d.subscriptionNumber, hideOnMobile: true },
  { key: 'date', header: 'Applied on', render: (d) => formatDate(d.invoiceDate), hideOnMobile: true },
  { key: 'amount', header: 'Savings', render: (d) => formatMoney(d.amount), className: 'text-right tabular-nums' },
]

export function PortalDiscountsPage() {
  const navigate = useNavigate()
  const list = usePagedList<AvailedDiscount, PagedWithSummary<AvailedDiscount, { totalSavings: number; invoiceCount: number }>>('/portal/discounts')
  return (
    <>
      <PageHeader title="My discounts" description="Discounts applied to your confirmed and paid invoices. Select a row to see the invoice and its savings." />
      <ListCard list={list} columns={columns} rowKey={(d) => `${d.invoiceId}-${d.discountId}`} searchPlaceholder="Search discount, invoice or subscription" onRowClick={(d) => navigate(`/portal/invoices/${d.invoiceId}`)} emptyTitle="No discounts applied yet" emptyDescription="Savings will appear here once a discount is applied to an issued invoice." footer={list.data && list.data.total > 0 ? <div className="flex flex-wrap justify-end gap-5 border-t border-primary/10 px-5 py-4 text-sm text-muted"><span>{list.data.summary.invoiceCount} discounted invoice{list.data.summary.invoiceCount === 1 ? '' : 's'}</span><span>Total savings <strong className="ml-1 text-ink tabular-nums">{formatMoney(list.data.summary.totalSavings)}</strong></span></div> : undefined} />
    </>
  )
}
