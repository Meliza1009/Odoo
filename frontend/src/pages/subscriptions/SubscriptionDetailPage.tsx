import { ArrowLeft, CalendarPlus, CheckCircle2, Pause, Pencil, Play, Receipt, Send, Undo2, XCircle } from 'lucide-react'
import { useCallback, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, errorMessage } from '../../api/client'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  DetailList,
  ErrorState,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  StatusBadge,
  Textarea,
  Totals,
  useToast,
} from '../../components/ui'
import { useAsync } from '../../hooks/useAsync'
import { formatDate, formatDateTime, formatMoney, formatPercent, perInterval, titleCase, todayIso } from '../../lib/format'
import type { InvoiceRow, Paged, SubscriptionDetail, SubscriptionStatus } from '../../types'

type DialogKind = 'pause' | 'close' | 'cancel' | 'renew'

/** Staff view (actions + history) at /app/subscriptions/:id; read-only portal view at /portal/subscriptions/:id. */
export function SubscriptionDetailPage({ portal = false }: { portal?: boolean }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const base = portal ? '/portal' : '/app'
  const load = useCallback(async () => {
    const [sub, invoices] = await Promise.all([
      api.get<SubscriptionDetail>(`/subscriptions/${id}`),
      api.get<Paged<InvoiceRow>>('/invoices', { params: { subscriptionId: id, pageSize: 50 } }),
    ])
    return { sub: sub.data, invoices: invoices.data.data }
  }, [id])
  const { data, error, loading, reload, setData } = useAsync(load)
  const [busy, setBusy] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogKind | null>(null)

  if (!data) return loading ? <LoadingState /> : <ErrorState description={error ?? undefined} action={<Button variant="secondary" onClick={() => navigate(`${base}/subscriptions`)}>Back</Button>} />
  const { sub, invoices } = data
  const today = todayIso()
  const can = (to: SubscriptionStatus) => sub.allowedTransitions.includes(to)

  const run = async (key: string, request: () => Promise<{ data: SubscriptionDetail }>, message: string) => {
    setBusy(key)
    try {
      const { data: updated } = await request()
      setData({ sub: updated, invoices })
      toast.success(message)
      setDialog(null)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }
  const move = (status: SubscriptionStatus, message: string) => run(status, () => api.put<SubscriptionDetail>(`/subscriptions/${sub.id}/status`, { status }), message)

  const generateInvoice = async () => {
    setBusy('invoice')
    try {
      const { data: result } = await api.post<{ invoiceIds: number[] }>(`/billing/subscriptions/${sub.id}/generate`, { autoConfirm: false })
      toast.success(`${result.invoiceIds.length} draft invoice${result.invoiceIds.length === 1 ? '' : 's'} created`)
      if (result.invoiceIds.length === 1) navigate(`/app/invoices/${result.invoiceIds[0]}`)
      else reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const quotationExpired = sub.status === 'quotation' && !!sub.quotationValidUntil && sub.quotationValidUntil < today
  const billingDue = sub.status === 'active' && !!sub.nextBillingDate && sub.nextBillingDate <= today
  const closingEarly = !sub.expiryDate || today < sub.expiryDate
  const canClose = can('closed') && (!closingEarly || sub.plan.canCloseEarly)
  const canRenew = sub.plan.canRenew && !!sub.expiryDate && (['active', 'paused'].includes(sub.status) || (sub.status === 'closed' && sub.closeReason === 'expired'))

  const actions: ReactNode[] = []
  if (!portal) {
    if (sub.status === 'draft' || sub.status === 'quotation')
      actions.push(<Button key="edit" variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => navigate(`/app/subscriptions/${sub.id}/edit`)}>Edit</Button>)
    if (can('draft')) actions.push(<Button key="draft" variant="secondary" icon={<Undo2 className="h-4 w-4" />} loading={busy === 'draft'} onClick={() => move('draft', 'Moved back to draft')}>Back to draft</Button>)
    if (can('quotation')) actions.push(<Button key="send" icon={<Send className="h-4 w-4" />} loading={busy === 'quotation'} onClick={() => move('quotation', 'Quotation marked as sent')}>Send quotation</Button>)
    if (can('confirmed'))
      actions.push(<Button key="confirm" icon={<CheckCircle2 className="h-4 w-4" />} loading={busy === 'confirmed'} disabled={quotationExpired} onClick={() => move('confirmed', 'Quotation confirmed')}>Confirm order</Button>)
    if (sub.status === 'confirmed') actions.push(<Button key="activate" variant="accent" icon={<Play className="h-4 w-4" />} loading={busy === 'active'} onClick={() => move('active', 'Subscription activated')}>Activate</Button>)
    if (billingDue) actions.push(<Button key="invoice" variant="accent" icon={<Receipt className="h-4 w-4" />} loading={busy === 'invoice'} onClick={generateInvoice}>Generate invoice</Button>)
    if (sub.status === 'paused') actions.push(<Button key="resume" variant="accent" icon={<Play className="h-4 w-4" />} loading={busy === 'resume'} onClick={() => run('resume', () => api.post(`/subscriptions/${sub.id}/resume`), 'Subscription resumed')}>Resume</Button>)
    if (can('paused') && sub.plan.canPause) actions.push(<Button key="pause" variant="secondary" icon={<Pause className="h-4 w-4" />} onClick={() => setDialog('pause')}>Pause</Button>)
    if (canRenew) actions.push(<Button key="renew" variant="secondary" icon={<CalendarPlus className="h-4 w-4" />} onClick={() => setDialog('renew')}>Renew</Button>)
    if (canClose) actions.push(<Button key="close" variant="secondary" icon={<XCircle className="h-4 w-4" />} onClick={() => setDialog('close')}>{closingEarly ? 'Close early' : 'Close'}</Button>)
    if (can('cancelled')) actions.push(<Button key="cancel" variant="ghost" className="text-danger" onClick={() => setDialog('cancel')}>Cancel</Button>)
  }

  const planLine = sub.lines.find((l) => l.lineType === 'plan')
  const isQuote = sub.status === 'draft' || sub.status === 'quotation'
  const back = portal ? { to: '/portal/subscriptions', label: 'My subscriptions' } : isQuote ? { to: '/app/quotations', label: 'Quotations' } : { to: '/app/subscriptions', label: 'Subscriptions' }

  return (
    <>
      <Link to={back.to} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> {back.label}
      </Link>
      <PageHeader
        title={sub.subscriptionNumber}
        description={`${sub.customerName} · ${sub.planName} ${perInterval(sub.billingInterval)}`}
        actions={actions.length ? actions : undefined}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={sub.status} />
        {sub.templateId && <Badge tone="indigo">From template</Badge>}
        {sub.closeReason && <Badge>{titleCase(sub.closeReason)}</Badge>}
      </div>

      {quotationExpired && !portal && (
        <div className="mb-4">
          <Alert tone="warning">This quotation expired on {formatDate(sub.quotationValidUntil)}. Move it back to draft and resend it before confirming.</Alert>
        </div>
      )}
      {billingDue && !portal && (
        <div className="mb-4">
          <Alert tone="info">Billing is due since {formatDate(sub.nextBillingDate)}. Generate the invoice now, or wait for the next billing run.</Alert>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Order lines" />
            <DataTable
              columns={[
                { key: 'desc', header: 'Description', render: (l) => <span className={l.lineType === 'plan' ? 'font-medium' : ''}>{l.description}</span> },
                { key: 'qty', header: 'Qty', render: (l) => l.quantity, className: 'text-right' },
                { key: 'price', header: 'Unit price', render: (l) => formatMoney(l.unitPrice), className: 'text-right tabular-nums', hideOnMobile: true },
                { key: 'tax', header: 'Tax', render: (l) => formatPercent(l.taxRate), className: 'text-right', hideOnMobile: true },
                { key: 'total', header: 'Amount', render: (l) => formatMoney(l.total), className: 'text-right tabular-nums' },
              ]}
              rows={sub.lines}
              rowKey={(l) => l.id}
              emptyTitle="No lines yet"
            />
            <div className="border-t border-slate-200 p-5">
              <Totals
                rows={[
                  { label: 'Subtotal', value: formatMoney(sub.subtotal) },
                  { label: 'Tax', value: formatMoney(sub.taxTotal) },
                  { label: `Total ${perInterval(sub.billingInterval)}`, value: formatMoney(sub.total), strong: true },
                ]}
              />
              <p className="mt-3 text-right text-xs text-slate-500">Invoices apply current tax rules and any eligible discounts on billing day.</p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Invoices" />
            <DataTable
              columns={[
                { key: 'number', header: 'Invoice', render: (i) => <span className="font-medium text-primary">{i.invoiceNumber}</span> },
                { key: 'period', header: 'Period', render: (i) => `${formatDate(i.billingPeriodStart)} – ${formatDate(i.billingPeriodEnd)}`, hideOnMobile: true },
                { key: 'status', header: 'Status', render: (i) => <StatusBadge status={i.isOverdue ? 'overdue' : i.status} /> },
                { key: 'total', header: 'Total', render: (i) => formatMoney(i.grandTotal), className: 'text-right tabular-nums' },
                { key: 'due', header: 'Due', render: (i) => formatMoney(i.amountDue), className: 'text-right tabular-nums', hideOnMobile: true },
              ]}
              rows={invoices}
              rowKey={(i) => i.id}
              onRowClick={(i) => navigate(`${base}/invoices/${i.id}`)}
              emptyTitle="No invoices yet"
              emptyDescription={sub.status === 'active' ? `The first invoice is generated on ${formatDate(sub.nextBillingDate)}.` : 'Invoices are generated once the subscription is active.'}
            />
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-4 font-semibold text-ink">Details</h2>
            <DetailList
              items={[
                { label: 'Customer', value: portal ? sub.customerName : <Link className="text-accent-dark hover:underline" to={`/app/customers/${sub.customerId}`}>{sub.customerName}</Link> },
                { label: 'Plan', value: `${sub.planName}${planLine ? ` · ${formatMoney(planLine.unitPrice)}` : ''} ${perInterval(sub.billingInterval)}` },
                { label: 'Start date', value: formatDate(sub.startDate) },
                { label: 'Expiry date', value: sub.expiryDate ? formatDate(sub.expiryDate) : 'Open-ended' },
                { label: 'Next billing', value: formatDate(sub.nextBillingDate) },
                { label: 'Payment terms', value: `${sub.paymentTermsDays} days` },
                ...(isQuote ? [{ label: 'Quotation valid until', value: formatDate(sub.quotationValidUntil) }] : []),
                ...(sub.activatedAt ? [{ label: 'Activated', value: formatDateTime(sub.activatedAt) }] : []),
                ...(sub.closedAt ? [{ label: 'Closed', value: formatDateTime(sub.closedAt) }] : []),
              ]}
            />
            {sub.notes && (
              <div className="mt-4 border-t border-slate-200 pt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Notes</p>
                <p className="mt-1 whitespace-pre-line text-sm text-ink">{sub.notes}</p>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 font-semibold text-ink">Plan rules</h2>
            <ul className="space-y-1.5 text-sm text-slate-600">
              <Rule ok={sub.plan.canPause}>Can be paused</Rule>
              <Rule ok={sub.plan.canRenew}>Can be renewed</Rule>
              <Rule ok={sub.plan.canCloseEarly}>Can close before expiry</Rule>
              <Rule ok={sub.plan.autoCloseOnExpiry}>Closes automatically on expiry</Rule>
              {sub.plan.minQuantity > 1 && <li className="pl-5">Minimum quantity {sub.plan.minQuantity}</li>}
            </ul>
          </Card>

          {!portal && sub.history.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 font-semibold text-ink">History</h2>
              <ol className="space-y-3 border-l border-slate-200 pl-4">
                {sub.history.map((h) => (
                  <li key={h.id} className="relative">
                    <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-accent" />
                    <p className="text-sm font-medium text-ink">{titleCase(h.action.replace('subscription.', ''))}</p>
                    <p className="text-xs text-slate-500">
                      {formatDateTime(h.createdAt)}
                      {h.actorName ? ` · ${h.actorName}` : ' · System'}
                    </p>
                    {typeof h.details?.reason === 'string' && <p className="mt-0.5 text-xs text-slate-600">“{h.details.reason}”</p>}
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>
      </div>

      {dialog && dialog !== 'renew' && (
        <ReasonDialog
          kind={dialog}
          early={closingEarly}
          busy={!!busy}
          onClose={() => setDialog(null)}
          onConfirm={(reason) => {
            const path = { pause: 'pause', close: 'close', cancel: 'cancel' }[dialog]
            const message = { pause: 'Subscription paused', close: 'Subscription closed', cancel: 'Cancelled' }[dialog]
            return run(dialog, () => api.post(`/subscriptions/${sub.id}/${path}`, { reason: reason || null }), message)
          }}
        />
      )}
      {dialog === 'renew' && (
        <RenewDialog
          sub={sub}
          busy={busy === 'renew'}
          onClose={() => setDialog(null)}
          onConfirm={(periods) => run('renew', () => api.post(`/subscriptions/${sub.id}/renew`, { periods }), `Renewed for ${periods} more period${periods === 1 ? '' : 's'}`)}
        />
      )}
    </>
  )
}

function Rule({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className={`flex items-center gap-2 ${ok ? '' : 'text-slate-400 line-through'}`}>
      {ok ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <XCircle className="h-3.5 w-3.5" />}
      {children}
    </li>
  )
}

const REASON_COPY = {
  pause: { title: 'Pause subscription', text: 'Billing stops while paused. Nothing is charged for the paused period, and billing restarts from the day you resume.', confirm: 'Pause' },
  close: { title: 'Close subscription', text: 'Closing stops all future billing. Existing invoices stay as they are.', confirm: 'Close subscription' },
  cancel: { title: 'Cancel', text: 'This cannot be undone. A new quotation is needed to start again.', confirm: 'Cancel it' },
}

function ReasonDialog({ kind, early, busy, onClose, onConfirm }: { kind: 'pause' | 'close' | 'cancel'; early: boolean; busy: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  const copy = REASON_COPY[kind]
  return (
    <Modal
      open
      title={kind === 'close' && early ? 'Close subscription early' : copy.title}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Back
          </Button>
          <Button variant={kind === 'pause' ? 'primary' : 'danger'} loading={busy} onClick={() => onConfirm(reason.trim())}>
            {copy.confirm}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">{copy.text}</p>
        <Textarea label="Reason" rows={2} maxLength={500} placeholder="Optional, kept in the history" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </Modal>
  )
}

function RenewDialog({ sub, busy, onClose, onConfirm }: { sub: SubscriptionDetail; busy: boolean; onClose: () => void; onConfirm: (periods: number) => void }) {
  const [periods, setPeriods] = useState(1)
  const valid = Number.isInteger(periods) && periods >= 1 && periods <= 120
  return (
    <Modal
      open
      title="Renew subscription"
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Back
          </Button>
          <Button loading={busy} disabled={!valid} onClick={() => onConfirm(periods)}>
            Renew
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Extends the expiry date (currently {formatDate(sub.expiryDate)}) by whole billing periods.
          {sub.status === 'closed' && ' This subscription closed because it expired; renewing re-opens it and billing restarts today.'}
        </p>
        <Input
          label={`Periods (${sub.billingInterval})`}
          type="number"
          min={1}
          max={120}
          value={Number.isNaN(periods) ? '' : periods}
          error={valid ? undefined : 'Enter 1 to 120'}
          onChange={(e) => setPeriods(e.target.valueAsNumber)}
        />
      </div>
    </Modal>
  )
}
