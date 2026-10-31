import { ArrowLeftIcon, CheckCircleIcon, DownloadSimpleIcon, EnvelopeSimpleIcon, MoneyIcon, PrinterIcon, XCircleIcon } from '@phosphor-icons/react'
import { useCallback, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, errorMessage } from '../../api/client'
import { openInvoicePrint } from '../../api/print'
import { Alert, Button, Card, CardHeader, DataTable, DetailList, ErrorState, LoadingState, Modal, PageHeader, StatusBadge, Textarea, Totals, useToast } from '../../components/ui'
import { useAsync } from '../../hooks/useAsync'
import { formatDate, formatDateTime, formatMoney, formatPercent, paymentMethodLabel } from '../../lib/format'
import type { InvoiceDetail } from '../../types'
import { RecordPaymentModal } from './RecordPaymentModal'

export function InvoiceDetailPage({ portal = false }: { portal?: boolean }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const base = portal ? '/portal' : '/app'
  const load = useCallback(() => api.get<InvoiceDetail>(`/invoices/${id}`).then((r) => r.data), [id])
  const { data: invoice, error, loading, setData } = useAsync(load)
  const [busy, setBusy] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  if (!invoice) return loading ? <LoadingState /> : <ErrorState description={error ?? undefined} action={<Button variant="secondary" onClick={() => navigate(`${base}/invoices`)}>Back to invoices</Button>} />

  const act = async (key: string, request: () => Promise<{ data: InvoiceDetail }>, message: string) => {
    setBusy(key)
    try {
      const { data } = await request()
      setData(data)
      toast.success(message)
      return true
    } catch (err) {
      toast.error(errorMessage(err))
      return false
    } finally {
      setBusy(null)
    }
  }

  const print = async (download: boolean) => {
    setBusy(download ? 'download' : 'print')
    try {
      await openInvoicePrint(invoice.id, invoice.invoiceNumber, download)
    } catch (err) {
      toast.error(errorMessage(err, 'Could not open the invoice'))
    } finally {
      setBusy(null)
    }
  }

  const status = invoice.isOverdue ? 'overdue' : invoice.status
  const canPay = !portal && invoice.status === 'confirmed' && invoice.amountDue > 0
  const canCancel = !portal && ['draft', 'confirmed'].includes(invoice.status) && invoice.amountPaid === 0

  return (
    <>
      <Link to={`${base}/invoices`} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-ink">
        <ArrowLeftIcon className="h-4 w-4" /> {portal ? 'My invoices' : 'Invoices'}
      </Link>
      <PageHeader
        title={invoice.invoiceNumber}
        description={`${invoice.customerName} · ${formatDate(invoice.billingPeriodStart)} - ${formatDate(invoice.billingPeriodEnd)}`}
        actions={
          <>
            <Button variant="secondary" icon={<PrinterIcon className="h-4 w-4" />} loading={busy === 'print'} onClick={() => print(false)}>
              Print
            </Button>
            <Button variant="secondary" icon={<DownloadSimpleIcon className="h-4 w-4" />} loading={busy === 'download'} onClick={() => print(true)}>
              Download
            </Button>
            {!portal && invoice.status === 'draft' && (
              <Button icon={<CheckCircleIcon className="h-4 w-4" />} loading={busy === 'confirm'} onClick={() => act('confirm', () => api.post(`/invoices/${invoice.id}/confirm`), 'Invoice confirmed')}>
                Confirm
              </Button>
            )}
            {!portal && ['confirmed', 'paid'].includes(invoice.status) && (
              <Button
                variant="secondary"
                icon={<EnvelopeSimpleIcon className="h-4 w-4" />}
                loading={busy === 'send'}
                disabled={!invoice.customerEmail}
                title={invoice.customerEmail ? undefined : 'The customer has no email address'}
                onClick={() => act('send', () => api.post(`/invoices/${invoice.id}/send`), `Invoice emailed to ${invoice.customerEmail}`)}
              >
                {invoice.sentAt ? 'Resend' : 'Send'}
              </Button>
            )}
            {canPay && (
              <Button variant="accent" icon={<MoneyIcon className="h-4 w-4" />} onClick={() => setPaying(true)}>
                Record payment
              </Button>
            )}
            {canCancel && (
              <Button variant="ghost" className="text-danger" icon={<XCircleIcon className="h-4 w-4" />} onClick={() => setCancelling(true)}>
                Cancel
              </Button>
            )}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={status} />
        {invoice.sentAt && <span className="text-xs text-slate-500">Sent {formatDateTime(invoice.sentAt)}</span>}
      </div>

      {invoice.isOverdue && (
        <div className="mb-4">
          <Alert tone="error">
            {formatMoney(invoice.amountDue)} is {invoice.daysOverdue} day{invoice.daysOverdue === 1 ? '' : 's'} overdue (due {formatDate(invoice.dueDate)}).
          </Alert>
        </div>
      )}
      {invoice.status === 'draft' && !portal && (
        <div className="mb-4">
          <Alert tone="info">Draft invoices are not visible to the customer. Review the lines, then confirm to make it payable.</Alert>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Lines" />
            <DataTable
              columns={[
                { key: 'desc', header: 'Description', render: (l) => l.description },
                { key: 'qty', header: 'Qty', render: (l) => l.quantity, className: 'text-right' },
                { key: 'price', header: 'Unit price', render: (l) => formatMoney(l.unitPrice), className: 'text-right tabular-nums', hideOnMobile: true },
                { key: 'disc', header: 'Discount', render: (l) => (l.discountAmount ? `− ${formatMoney(l.discountAmount)}` : '-'), className: 'text-right tabular-nums', hideOnMobile: true },
                { key: 'tax', header: 'Tax', render: (l) => `${formatPercent(l.taxRate)} · ${formatMoney(l.taxAmount)}`, className: 'text-right tabular-nums whitespace-nowrap', hideOnMobile: true },
                { key: 'total', header: 'Amount', render: (l) => formatMoney(l.total), className: 'text-right tabular-nums' },
              ]}
              rows={invoice.lines}
              rowKey={(l) => l.id}
            />
            <div className="border-t border-slate-200 p-5">
              <Totals
                rows={[
                  { label: 'Subtotal', value: formatMoney(invoice.subtotal) },
                  ...invoice.discounts.map((d) => ({ label: d.name, value: `− ${formatMoney(d.amount)}` })),
                  { label: 'Tax', value: formatMoney(invoice.taxTotal) },
                  { label: 'Total', value: formatMoney(invoice.grandTotal), strong: true },
                  { label: 'Paid', value: formatMoney(invoice.amountPaid) },
                  { label: 'Amount due', value: formatMoney(invoice.amountDue), strong: true },
                ]}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Payments" />
            <DataTable
              columns={[
                { key: 'date', header: 'Date', render: (p) => formatDate(p.paymentDate) },
                { key: 'method', header: 'Method', render: (p) => paymentMethodLabel(p.paymentMethod) },
                { key: 'ref', header: 'Reference', render: (p) => p.referenceNumber ?? '-', hideOnMobile: true },
                ...(portal ? [] : [{ key: 'by', header: 'Recorded by', render: (p: InvoiceDetail['payments'][number]) => p.recordedBy ?? '-', hideOnMobile: true }]),
                { key: 'amount', header: 'Amount', render: (p) => formatMoney(p.amount), className: 'text-right tabular-nums' },
              ]}
              rows={invoice.payments}
              rowKey={(p) => p.id}
              emptyTitle="No payments yet"
              emptyAction={canPay && <Button size="sm" onClick={() => setPaying(true)}>Record payment</Button>}
            />
          </Card>
        </div>

        <Card className="h-fit p-5">
          <h2 className="mb-4 font-semibold text-ink">Bill to</h2>
          <DetailList columns={1}
            items={[
              { label: 'Customer', value: portal ? invoice.customerName : <Link className="text-accent-dark hover:underline" to={`/app/customers/${invoice.customerId}`}>{invoice.customerName}</Link> },
              { label: 'Email', value: invoice.customerEmail },
              { label: 'Tax number', value: invoice.taxNumber },
              { label: 'Address', value: invoice.billingAddress && <span className="whitespace-pre-line">{invoice.billingAddress}</span> },
              { label: 'Subscription', value: <Link className="text-accent-dark hover:underline" to={`${base}/subscriptions/${invoice.subscriptionId}`}>{invoice.subscriptionNumber}</Link> },
              { label: 'Invoice date', value: formatDate(invoice.invoiceDate) },
              { label: 'Due date', value: formatDate(invoice.dueDate) },
              ...(invoice.paidAt ? [{ label: 'Paid on', value: formatDateTime(invoice.paidAt) }] : []),
              ...(invoice.cancelledAt ? [{ label: 'Cancelled on', value: formatDateTime(invoice.cancelledAt) }] : []),
            ]}
          />
        </Card>
      </div>

      {paying && <RecordPaymentModal invoice={invoice} onClose={() => setPaying(false)} onSaved={setData} />}
      {cancelling && (
        <CancelInvoiceDialog
          busy={busy === 'cancel'}
          onClose={() => setCancelling(false)}
          onConfirm={async (reason) => {
            if (await act('cancel', () => api.post(`/invoices/${invoice.id}/cancel`, { reason: reason || null }), 'Invoice cancelled')) setCancelling(false)
          }}
        />
      )}
    </>
  )
}

function CancelInvoiceDialog({ busy, onClose, onConfirm }: { busy: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  return (
    <Modal
      open
      title="Cancel invoice?"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Back
          </Button>
          <Button variant="danger" loading={busy} onClick={() => onConfirm(reason.trim())}>
            Cancel invoice
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">The invoice stops being payable and any discount uses it consumed are returned. This cannot be undone.</p>
        <Textarea label="Reason" rows={2} maxLength={500} placeholder="Optional" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </Modal>
  )
}
