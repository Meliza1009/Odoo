import { ArrowLeftIcon } from '@phosphor-icons/react'
import { useCallback, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, errorMessage } from '../../api/client'
import { LineItemsEditor } from '../../components/LineItemsEditor'
import { Alert, Button, Card, CardHeader, ErrorState, Input, LoadingState, PageHeader, Segmented, Select, Textarea, Totals, useToast } from '../../components/ui'
import { useAsync } from '../../hooks/useAsync'
import { useLookups } from '../../hooks/useLookups'
import { applyServerErrors } from '../../lib/forms'
import { addDaysIso, formatMoney, perInterval, todayIso } from '../../lib/format'
import { lineTotals, newLine, serializeLines, type LineDraft } from '../../lib/lines'
import type { Lookups, SubscriptionDetail } from '../../types'

/** /app/subscriptions/new (from scratch or template) and /app/subscriptions/:id/edit (draft/quotation only). */
export function SubscriptionFormPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const lookups = useLookups()
  const loadExisting = useCallback(() => (id ? api.get<SubscriptionDetail>(`/subscriptions/${id}`).then((r) => r.data) : Promise.resolve(null)), [id])
  const existing = useAsync(loadExisting)
  const [mode, setMode] = useState<'scratch' | 'template'>(params.get('mode') === 'template' && !id ? 'template' : 'scratch')

  const back = id ? `/app/subscriptions/${id}` : '/app/quotations'
  const error = lookups.error ?? existing.error
  if (error) return <ErrorState description={error} />
  if (!lookups.data || existing.loading) return <LoadingState />

  const sub = existing.data
  if (sub && !['draft', 'quotation'].includes(sub.status)) {
    return <ErrorState title="This subscription can no longer be edited" description={`It is ${sub.status}. Only drafts and quotations can be changed.`} />
  }

  return (
    <>
      <Link to={back} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-ink">
        <ArrowLeftIcon className="h-4 w-4" /> Back
      </Link>
      <PageHeader title={sub ? `Edit ${sub.subscriptionNumber}` : 'New quotation'} description="Plan, customer and product lines. Prices default to the catalogue and can be overridden per line." />
      {!sub && (
        <div className="mb-4">
          <Segmented
            label="Start from"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'scratch', label: 'From scratch' },
              { value: 'template', label: 'From template' },
            ]}
          />
        </div>
      )}
      {mode === 'template' && !sub ? <FromTemplateForm lookups={lookups.data} /> : <ScratchForm lookups={lookups.data} existing={sub} />}
    </>
  )
}

interface ScratchFormValues {
  customerId: string
  planId: string
  startDate: string
  expiryDate: string
  paymentTermsDays: number
  quotationValidUntil: string
  notes: string
}

const FIELDS = ['customerId', 'planId', 'startDate', 'expiryDate', 'paymentTermsDays', 'quotationValidUntil', 'notes']

function ScratchForm({ lookups, existing }: { lookups: Lookups; existing: SubscriptionDetail | null }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [params] = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [lines, setLines] = useState<LineDraft[]>(() =>
    existing
      ? existing.lines
          .filter((l) => l.lineType === 'product' && l.productId !== null)
          .map((l) => newLine({ productId: l.productId ?? '', variantId: l.variantId ?? '', quantity: l.quantity, unitPrice: String(l.unitPrice), taxRate: l.taxRate }))
      : [newLine()],
  )
  const {
    register,
    control,
    handleSubmit,
    getValues,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<ScratchFormValues>({
    defaultValues: {
      customerId: existing ? String(existing.customerId) : (params.get('customerId') ?? ''),
      planId: existing ? String(existing.planId) : '',
      startDate: existing?.startDate ?? todayIso(),
      expiryDate: existing?.expiryDate ?? '',
      paymentTermsDays: existing?.paymentTermsDays ?? 30,
      quotationValidUntil: existing?.quotationValidUntil ?? addDaysIso(todayIso(), 30),
      notes: existing?.notes ?? '',
    },
  })
  const [pending, setPending] = useState<'draft' | 'quotation' | null>(null)

  const planId = Number(useWatch({ control, name: 'planId' }))
  const plan = lookups.plans.find((p) => p.id === planId)
  const totals = lineTotals(lookups.products, lines)
  const planFee = plan?.price ?? 0
  const quantity = lines.reduce((sum, l) => sum + (l.quantity || 0), 0)

  const customerOptions = lookups.customers.map((c) => ({ value: c.id, label: c.companyName }))
  if (existing && !lookups.customers.some((c) => c.id === existing.customerId)) customerOptions.unshift({ value: existing.customerId, label: `${existing.customerName} (inactive)` })

  const submit = (status: 'draft' | 'quotation') =>
    handleSubmit(async (values) => {
      setError(null)
      const serialized = serializeLines(lines)
      if ('error' in serialized) return setError(serialized.error)
      if (status === 'quotation' && serialized.lines.length === 0) return setError('Add at least one product line before sending the quotation.')
      const body = { ...values, customerId: Number(values.customerId), planId: Number(values.planId), lines: serialized.lines }
      setPending(status)
      try {
        let saved: SubscriptionDetail
        if (existing) {
          saved = (await api.put<SubscriptionDetail>(`/subscriptions/${existing.id}`, body)).data
          if (status === 'quotation' && saved.status === 'draft') saved = (await api.put<SubscriptionDetail>(`/subscriptions/${existing.id}/status`, { status: 'quotation' })).data
        } else {
          saved = (await api.post<SubscriptionDetail>('/subscriptions', { ...body, status })).data
        }
        toast.success(status === 'quotation' ? `Quotation ${saved.subscriptionNumber} ready to send` : `${saved.subscriptionNumber} saved`)
        navigate(`/app/subscriptions/${saved.id}`, { replace: true })
      } catch (err) {
        if (!applyServerErrors(err, setFieldError, FIELDS)) setError(errorMessage(err))
      } finally {
        setPending(null)
      }
    })

  const primaryStatus = existing?.status === 'quotation' ? 'quotation' : 'draft'

  return (
    <form onSubmit={submit(primaryStatus)} noValidate className="space-y-6">
      {error && <Alert tone="error">{error}</Alert>}
      <Card className="p-5 sm:p-6">
        <h2 className="mb-5 border-b border-primary/10 pb-4 text-lg font-semibold tracking-[-0.025em] text-ink">Customer &amp; plan</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Select label="Customer" required options={customerOptions} placeholder="Choose a customer" error={errors.customerId?.message} {...register('customerId', { required: 'Choose a customer' })} />
          <Select
            label="Plan"
            required
            options={lookups.plans.map((p) => ({ value: p.id, label: `${p.name} (${formatMoney(p.price)} ${perInterval(p.billingInterval)})` }))}
            placeholder="Choose a plan"
            hint={plan && plan.minQuantity > 1 ? `Requires a total quantity of at least ${plan.minQuantity} (currently ${quantity}).` : undefined}
            error={errors.planId?.message}
            {...register('planId', { required: 'Choose a plan' })}
          />
          <Input label="Start date" type="date" required error={errors.startDate?.message} {...register('startDate', { required: 'Start date is required' })} />
          <Input
            label="Expiry date"
            type="date"
            hint="Leave empty for an open-ended subscription."
            error={errors.expiryDate?.message}
            {...register('expiryDate', { validate: (v) => !v || v >= getValues('startDate') || 'Must be on or after the start date' })}
          />
          <Input
            label="Payment terms (days)"
            type="number"
            min={0}
            max={365}
            error={errors.paymentTermsDays?.message}
            {...register('paymentTermsDays', { valueAsNumber: true, min: { value: 0, message: 'Cannot be negative' }, max: { value: 365, message: 'At most 365' } })}
          />
          <Input label="Quotation valid until" type="date" error={errors.quotationValidUntil?.message} {...register('quotationValidUntil')} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Product lines" />
        <div className="p-5 sm:p-6">
          <LineItemsEditor products={lookups.products} lines={lines} onChange={setLines} />
          <div className="mt-6 border-t border-primary/10 pt-5">
            <Totals
              rows={[
                ...(planFee > 0 ? [{ label: `${plan?.name} plan fee`, value: formatMoney(planFee) }] : []),
                { label: 'Products', value: formatMoney(totals.subtotal) },
                { label: 'Tax (estimate)', value: formatMoney(totals.tax) },
                { label: `Total ${plan ? perInterval(plan.billingInterval) : 'per period'}`, value: formatMoney(planFee + totals.total), strong: true },
              ]}
            />
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <Textarea label="Notes / terms" rows={3} hint="Shown on the quotation." error={errors.notes?.message} {...register('notes')} />
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={() => navigate(-1)} disabled={isSubmitting}>
          Cancel
        </Button>
        {(!existing || existing.status === 'draft') && (
          <Button variant="secondary" loading={pending === 'draft'} disabled={isSubmitting} onClick={submit('draft')}>
            Save draft
          </Button>
        )}
        <Button loading={pending === 'quotation'} disabled={isSubmitting} onClick={submit('quotation')}>
          {existing?.status === 'quotation' ? 'Save quotation' : 'Save & mark as sent'}
        </Button>
      </div>
    </form>
  )
}

interface TemplateFormValues {
  templateId: string
  customerId: string
  startDate: string
  notes: string
}

function FromTemplateForm({ lookups }: { lookups: Lookups }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [params] = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    control,
    handleSubmit,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<TemplateFormValues>({
    defaultValues: { templateId: params.get('templateId') ?? '', customerId: params.get('customerId') ?? '', startDate: todayIso(), notes: '' },
  })
  const templateId = Number(useWatch({ control, name: 'templateId' }))
  const template = lookups.templates.find((t) => t.id === templateId)
  const plan = template && lookups.plans.find((p) => p.id === template.planId)

  const onSubmit = handleSubmit(async (values) => {
    setError(null)
    try {
      const { data } = await api.post<SubscriptionDetail>('/subscriptions/from-template', { ...values, templateId: Number(values.templateId), customerId: Number(values.customerId) })
      toast.success(`Quotation ${data.subscriptionNumber} created from template`)
      navigate(`/app/subscriptions/${data.id}`, { replace: true })
    } catch (err) {
      if (!applyServerErrors(err, setFieldError, ['templateId', 'customerId', 'startDate', 'notes'])) setError(errorMessage(err))
    }
  })

  if (lookups.templates.length === 0) return <Alert tone="info">There are no active quotation templates yet. An admin can create one under Quotation templates.</Alert>

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {error && <Alert tone="error">{error}</Alert>}
      <Card className="p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Template"
            required
            options={lookups.templates.map((t) => ({ value: t.id, label: t.name }))}
            placeholder="Choose a template"
            hint={template && plan ? `${plan.name} plan · quotation valid ${template.validityDays} days` : undefined}
            error={errors.templateId?.message}
            {...register('templateId', { required: 'Choose a template' })}
          />
          <Select label="Customer" required options={lookups.customers.map((c) => ({ value: c.id, label: c.companyName }))} placeholder="Choose a customer" error={errors.customerId?.message} {...register('customerId', { required: 'Choose a customer' })} />
          <Input label="Start date" type="date" required error={errors.startDate?.message} {...register('startDate', { required: 'Start date is required' })} />
        </div>
        <div className="mt-4">
          <Textarea label="Notes" rows={2} hint="Leave empty to use the template's notes." {...register('notes')} />
        </div>
      </Card>
      <p className="text-sm text-slate-500">The quotation is created with the template's plan, product lines, payment terms and contract length. You can still edit it afterwards.</p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => navigate(-1)} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Create quotation
        </Button>
      </div>
    </form>
  )
}
