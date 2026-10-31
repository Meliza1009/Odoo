import { PlusIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, errorMessage } from '../../api/client'
import { ListCard } from '../../components/ListCard'
import { Button, Input, PageHeader, Select, useToast, type Column } from '../../components/ui'
import { useLookups } from '../../hooks/useLookups'
import { usePagedList } from '../../hooks/usePagedList'
import { formatDate, formatMoney, paymentMethodLabel } from '../../lib/format'
import { PAYMENT_METHODS, type InvoiceRow, type Paged, type PagedWithSummary, type Payment } from '../../types'
import { RecordPaymentModal } from './RecordPaymentModal'

export function PaymentsPage({ portal = false }: { portal?: boolean }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [params] = useSearchParams()
  const [method, setMethod] = useState(params.get('paymentMethod') ?? '')
  const [planId, setPlanId] = useState(params.get('planId') ?? '')
  const [customerId, setCustomerId] = useState(params.get('customerId') ?? '')
  const [dateFrom, setDateFrom] = useState(params.get('dateFrom') ?? '')
  const [dateTo, setDateTo] = useState(params.get('dateTo') ?? '')
  const [choices, setChoices] = useState<InvoiceRow[] | null>(null)
  const lookups = useLookups(!portal)
  const list = usePagedList<Payment, PagedWithSummary<Payment, { amount: number }>>('/payments', { paymentMethod: method, planId: portal ? '' : planId, customerId: portal ? '' : customerId, dateFrom, dateTo })
  const base = portal ? '/portal' : '/app'

  const openRecord = async () => {
    try {
      const { data } = await api.get<Paged<InvoiceRow>>('/invoices', { params: { status: 'outstanding', pageSize: 100 } })
      setChoices(data.data)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const columns: Column<Payment>[] = [
    { key: 'date', header: 'Date', render: (p) => formatDate(p.paymentDate) },
    { key: 'invoice', header: 'Invoice', render: (p) => <span className="font-medium text-primary">{p.invoiceNumber}</span> },
    ...(portal ? [] : [{ key: 'customer', header: 'Customer', render: (p: Payment) => p.customerName, hideOnMobile: true }]),
    { key: 'method', header: 'Method', render: (p) => paymentMethodLabel(p.paymentMethod), hideOnMobile: true },
    { key: 'ref', header: 'Reference', render: (p) => p.referenceNumber ?? '-', hideOnMobile: true },
    { key: 'amount', header: 'Amount', render: (p) => formatMoney(p.amount), className: 'text-right tabular-nums' },
  ]

  return (
    <>
      <PageHeader
        title={portal ? 'Payment history' : 'Payments'}
        description={portal ? 'Every payment received against your invoices.' : 'Payments recorded against invoices.'}
        actions={
          !portal && (
            <Button icon={<PlusIcon className="h-4 w-4" />} onClick={openRecord}>
              Record payment
            </Button>
          )
        }
      />
      <ListCard
        list={list}
        columns={columns}
        rowKey={(p) => p.id}
        searchPlaceholder={portal ? 'Search invoice or reference' : 'Search invoice, customer or reference'}
        filters={
          <>
            <Select aria-label="Payment method" className="w-40" value={method} onChange={(e) => setMethod(e.target.value)} options={PAYMENT_METHODS.map((m) => ({ value: m, label: paymentMethodLabel(m) }))} placeholder="All methods" />
            {!portal && (
              <Select aria-label="Customer" className="w-48" value={customerId} onChange={(e) => setCustomerId(e.target.value)} options={lookups.data?.customers.map((c) => ({ value: c.id, label: c.companyName })) ?? []} placeholder="All customers" />
            )}
            {!portal && <Select aria-label="Plan" className="w-44" value={planId} onChange={(e) => setPlanId(e.target.value)} options={lookups.data?.plans.map((p) => ({ value: p.id, label: p.name })) ?? []} placeholder="All plans" />}
            <Input aria-label="Paid from" type="date" className="w-40" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <span className="text-sm text-slate-400">to</span>
            <Input aria-label="Paid to" type="date" className="w-40" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </>
        }
        onRowClick={(p) => navigate(`${base}/invoices/${p.invoiceId}`)}
        emptyTitle="No payments yet"
        footer={
          list.data && list.data.total > 0 ? (
            <div className="flex justify-end border-t border-slate-200 px-4 py-3 text-sm text-slate-500">
              Total received <span className="ml-2 font-semibold tabular-nums text-ink">{formatMoney(list.data.summary.amount)}</span>
            </div>
          ) : undefined
        }
      />
      {choices && <RecordPaymentModal choices={choices} onClose={() => setChoices(null)} onSaved={list.reload} />}
    </>
  )
}
