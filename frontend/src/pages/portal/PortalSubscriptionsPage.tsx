import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ListCard } from '../../components/ListCard'
import { PageHeader, Segmented, StatusBadge, type Column } from '../../components/ui'
import { usePagedList } from '../../hooks/usePagedList'
import { formatDate, formatMoney, perInterval } from '../../lib/format'
import type { SubscriptionRow } from '../../types'

const columns: Column<SubscriptionRow>[] = [
  { key: 'number', header: 'Subscription', render: (s) => <span className="font-medium text-primary">{s.subscriptionNumber}</span> },
  { key: 'plan', header: 'Plan', render: (s) => s.planName, hideOnMobile: true },
  { key: 'status', header: 'Status', render: (s) => <StatusBadge status={s.status} /> },
  { key: 'start', header: 'Started', render: (s) => formatDate(s.startDate), hideOnMobile: true },
  { key: 'next', header: 'Next invoice', render: (s) => formatDate(s.nextBillingDate), hideOnMobile: true },
  { key: 'expiry', header: 'Expires', render: (s) => (s.expiryDate ? formatDate(s.expiryDate) : 'Open-ended'), hideOnMobile: true },
  { key: 'total', header: 'Amount', render: (s) => `${formatMoney(s.total)} ${perInterval(s.billingInterval)}`, className: 'text-right tabular-nums whitespace-nowrap' },
]

export function PortalSubscriptionsPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const options = [
    { value: '', label: 'All' },
    { value: 'quotation', label: 'Quotations' },
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'active', label: 'Active' },
    { value: 'paused', label: 'Paused' },
    { value: 'closed', label: 'Closed' },
    { value: 'cancelled', label: 'Cancelled' },
  ]
  const [status, setStatus] = useState(options.find((o) => o.value === params.get('status'))?.value ?? '')
  const list = usePagedList<SubscriptionRow>('/subscriptions', { status })
  return (
    <>
      <PageHeader title="My subscriptions" description="Your plans, quotations and renewal dates." actions={<Link to="/portal/catalog" className="inline-flex min-h-10 items-center rounded-control px-4 text-sm font-semibold text-accent-dark ring-1 ring-primary/15 hover:bg-primary/5">Explore plans & products</Link>} />
      <div className="mb-4"><Segmented label="Subscription status" value={status} onChange={setStatus} options={options} /></div>
      <ListCard
        list={list}
        columns={columns}
        rowKey={(s) => s.id}
        searchPlaceholder="Search subscription number"
        onRowClick={(s) => navigate(`/portal/subscriptions/${s.id}`)}
        emptyTitle="No subscriptions yet"
        emptyDescription="Once you accept a quotation from Brightloop it will appear here."
      />
    </>
  )
}
