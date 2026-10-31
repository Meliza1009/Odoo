import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListCard } from '../../components/ListCard'
import { Badge, Button, Checkbox, PageHeader, StatusBadge, type Column } from '../../components/ui'
import { usePagedList } from '../../hooks/usePagedList'
import { formatMoney } from '../../lib/format'
import type { CustomerRow } from '../../types'
import { CustomerFormModal } from './CustomerFormModal'

const columns: Column<CustomerRow>[] = [
  {
    key: 'company',
    header: 'Customer',
    render: (c) => (
      <div className="min-w-0">
        <p className="font-medium text-primary">{c.companyName}</p>
        <p className="truncate text-xs text-slate-500">{[c.contactName, c.email].filter(Boolean).join(' · ') || 'No contact details'}</p>
      </div>
    ),
  },
  { key: 'phone', header: 'Phone', render: (c) => c.phone ?? '-', hideOnMobile: true },
  { key: 'portal', header: 'Portal', render: (c) => (c.userId ? <Badge tone="teal">Has login</Badge> : <Badge>No login</Badge>), hideOnMobile: true },
  { key: 'subs', header: 'Active subs', render: (c) => c.activeSubscriptions, className: 'text-right', hideOnMobile: true },
  { key: 'balance', header: 'Outstanding', render: (c) => formatMoney(c.outstandingBalance), className: 'text-right tabular-nums' },
  { key: 'status', header: 'Status', render: (c) => <StatusBadge status={c.isActive ? 'active' : 'inactive'} />, hideOnMobile: true },
]

export function CustomersPage() {
  const navigate = useNavigate()
  const [includeInactive, setIncludeInactive] = useState(false)
  const [creating, setCreating] = useState(false)
  const list = usePagedList<CustomerRow>('/customers', { includeInactive })

  return (
    <>
      <PageHeader
        title="Customers"
        description="Companies you bill, their contacts and balances."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
            New customer
          </Button>
        }
      />
      <ListCard
        list={list}
        columns={columns}
        rowKey={(c) => c.id}
        searchPlaceholder="Search name, contact or email"
        filters={<Checkbox label="Show inactive" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />}
        onRowClick={(c) => navigate(`/app/customers/${c.id}`)}
        emptyTitle="No customers yet"
        emptyDescription="Add your first customer to start sending quotations."
        emptyAction={<Button onClick={() => setCreating(true)}>New customer</Button>}
      />
      <CustomerFormModal open={creating} onClose={() => setCreating(false)} onSaved={(c) => navigate(`/app/customers/${c.id}`)} />
    </>
  )
}
