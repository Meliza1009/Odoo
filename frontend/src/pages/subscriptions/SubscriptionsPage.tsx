import { FilePlus2, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ListCard } from '../../components/ListCard'
import { Button, PageHeader, Segmented, Select, StatusBadge, type Column } from '../../components/ui'
import { useLookups } from '../../hooks/useLookups'
import { usePagedList } from '../../hooks/usePagedList'
import { formatDate, formatMoney, perInterval } from '../../lib/format'
import type { SubscriptionRow } from '../../types'

interface Props {
  /** Quotations = draft/quotation stage; subscriptions = confirmed onwards. */
  kind: 'quotations' | 'subscriptions'
}

const SEGMENTS = {
  quotations: [
    { value: 'draft,quotation', label: 'All open' },
    { value: 'draft', label: 'Draft' },
    { value: 'quotation', label: 'Sent' },
  ],
  subscriptions: [
    { value: 'confirmed,active,paused,closed,cancelled', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'paused', label: 'Paused' },
    { value: 'closed', label: 'Closed' },
    { value: 'cancelled', label: 'Cancelled' },
  ],
}

export function SubscriptionsPage({ kind }: Props) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const segments = SEGMENTS[kind]
  const initial = segments.find((s) => s.value === params.get('status'))?.value ?? segments[0].value
  const [status, setStatus] = useState(initial)
  const [planId, setPlanId] = useState('')
  const [customerId, setCustomerId] = useState(params.get('customerId') ?? '')
  const lookups = useLookups()
  const list = usePagedList<SubscriptionRow>('/subscriptions', { status, planId, customerId })
  const isQuotes = kind === 'quotations'

  const columns: Column<SubscriptionRow>[] = [
    {
      key: 'number',
      header: 'Number',
      render: (s) => (
        <div>
          <p className="font-medium text-primary">{s.subscriptionNumber}</p>
          <p className="text-xs text-slate-500 md:hidden">{s.customerName}</p>
        </div>
      ),
    },
    { key: 'customer', header: 'Customer', render: (s) => s.customerName, hideOnMobile: true },
    { key: 'plan', header: 'Plan', render: (s) => s.planName, hideOnMobile: true },
    { key: 'status', header: 'Status', render: (s) => <StatusBadge status={s.status} /> },
    isQuotes
      ? { key: 'valid', header: 'Valid until', render: (s) => formatDate(s.quotationValidUntil), hideOnMobile: true }
      : { key: 'next', header: 'Next billing', render: (s) => formatDate(s.nextBillingDate), hideOnMobile: true },
    { key: 'expiry', header: 'Expires', render: (s) => formatDate(s.expiryDate), hideOnMobile: true },
    { key: 'total', header: 'Total', render: (s) => <span className="whitespace-nowrap">{formatMoney(s.total)} <span className="text-xs text-slate-500">{perInterval(s.billingInterval)}</span></span>, className: 'text-right tabular-nums' },
  ]

  return (
    <>
      <PageHeader
        title={isQuotes ? 'Quotations' : 'Subscriptions'}
        description={isQuotes ? 'Drafts and quotations awaiting customer acceptance.' : 'Confirmed, running, paused and finished subscriptions.'}
        actions={
          <>
            <Button variant="secondary" icon={<FilePlus2 className="h-4 w-4" />} onClick={() => navigate('/app/subscriptions/new?mode=template')}>
              From template
            </Button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/app/subscriptions/new')}>
              New quotation
            </Button>
          </>
        }
      />
      <div className="mb-4">
        <Segmented label="Status" value={status} onChange={setStatus} options={segments} />
      </div>
      <ListCard
        list={list}
        columns={columns}
        rowKey={(s) => s.id}
        searchPlaceholder="Search number or customer"
        filters={
          <>
            <Select aria-label="Customer" className="w-48" value={customerId} onChange={(e) => setCustomerId(e.target.value)} options={lookups.data?.customers.map((c) => ({ value: c.id, label: c.companyName })) ?? []} placeholder="All customers" />
            <Select aria-label="Plan" className="w-44" value={planId} onChange={(e) => setPlanId(e.target.value)} options={lookups.data?.plans.map((p) => ({ value: p.id, label: p.name })) ?? []} placeholder="All plans" />
          </>
        }
        onRowClick={(s) => navigate(`/app/subscriptions/${s.id}`)}
        emptyTitle={isQuotes ? 'No open quotations' : 'No subscriptions here'}
        emptyDescription={isQuotes ? 'Create a quotation from scratch or from a template.' : 'Subscriptions appear here once a quotation is confirmed.'}
        emptyAction={<Button onClick={() => navigate('/app/subscriptions/new')}>New quotation</Button>}
      />
    </>
  )
}
