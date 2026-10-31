import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { api, errorMessage } from '../../api/client'
import { ListCard } from '../../components/ListCard'
import { Alert, Badge, Button, Checkbox, Input, LoadingState, Modal, PageHeader, Select, StatusBadge, useToast, type Column } from '../../components/ui'
import { useAsync } from '../../hooks/useAsync'
import { useLookups } from '../../hooks/useLookups'
import { usePagedList } from '../../hooks/usePagedList'
import { applyServerErrors, numOrNull } from '../../lib/forms'
import { formatDate, formatMoney, formatPercent } from '../../lib/format'
import type { Discount, Paged, SubscriptionRow } from '../../types'

const describe = (d: Discount) => (d.discountType === 'percentage' ? `${formatPercent(d.value)} off` : `${formatMoney(d.value)} off`)

const columns: Column<Discount>[] = [
  {
    key: 'name',
    header: 'Discount',
    render: (d) => (
      <div>
        <p className="font-medium text-primary">{d.name}</p>
        <p className="text-xs text-slate-500">{describe(d)}</p>
      </div>
    ),
  },
  {
    key: 'scope',
    header: 'Applies to',
    render: (d) => (
      <div className="flex flex-wrap gap-1">
        <Badge tone="indigo">{d.scope === 'product' ? `${d.productIds.length} product${d.productIds.length === 1 ? '' : 's'}` : 'Whole subscription'}</Badge>
        {d.subscriptionIds.length > 0 && <Badge tone="amber">{d.subscriptionIds.length} subscription(s) only</Badge>}
      </div>
    ),
    hideOnMobile: true,
  },
  {
    key: 'conditions',
    header: 'Conditions',
    render: (d) =>
      [d.minPurchase > 0 && `Min ${formatMoney(d.minPurchase)}`, d.minQuantity > 0 && `Min qty ${d.minQuantity}`].filter(Boolean).join(' · ') || 'None',
    hideOnMobile: true,
  },
  { key: 'dates', header: 'Valid', render: (d) => (d.startDate || d.endDate ? `${formatDate(d.startDate)} – ${formatDate(d.endDate)}` : 'Always'), hideOnMobile: true },
  { key: 'usage', header: 'Used', render: (d) => `${d.usageCount}${d.usageLimit ? ` / ${d.usageLimit}` : ''}`, className: 'text-right tabular-nums' },
  { key: 'state', header: 'State', render: (d) => <StatusBadge status={d.state} /> },
]

export function DiscountsPage() {
  const [includeInactive, setIncludeInactive] = useState(false)
  const [modal, setModal] = useState<{ discount: Discount | null } | null>(null)
  const list = usePagedList<Discount>('/discounts', { includeInactive })

  return (
    <>
      <PageHeader
        title="Discounts"
        description="Applied automatically on every invoice while valid, until they expire or reach their usage limit."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setModal({ discount: null })}>
            New discount
          </Button>
        }
      />
      <ListCard
        list={list}
        columns={columns}
        rowKey={(d) => d.id}
        searchPlaceholder="Search discounts"
        filters={<Checkbox label="Show inactive" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />}
        onRowClick={(d) => setModal({ discount: d })}
        emptyTitle="No discounts yet"
        emptyAction={<Button onClick={() => setModal({ discount: null })}>New discount</Button>}
      />
      {modal && <DiscountModal discount={modal.discount} onClose={() => setModal(null)} onSaved={list.reload} />}
    </>
  )
}

interface DiscountForm {
  name: string
  discountType: 'fixed_amount' | 'percentage'
  value: number
  minPurchase: number
  minQuantity: number
  startDate: string
  endDate: string
  usageLimit: number
  scope: 'subscription' | 'product'
  isActive: boolean
}

const loadSubscriptions = () => api.get<Paged<SubscriptionRow>>('/subscriptions', { params: { status: 'active,paused,confirmed', pageSize: 100 } }).then((r) => r.data.data)

function DiscountModal({ discount, onClose, onSaved }: { discount: Discount | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const lookups = useLookups()
  const subscriptions = useAsync(loadSubscriptions)
  const [error, setError] = useState<string | null>(null)
  const [productIds, setProductIds] = useState<number[]>(discount?.productIds ?? [])
  const [subscriptionIds, setSubscriptionIds] = useState<number[]>(discount?.subscriptionIds ?? [])
  const {
    register,
    control,
    handleSubmit,
    getValues,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<DiscountForm>({
    defaultValues: {
      name: discount?.name ?? '',
      discountType: discount?.discountType ?? 'percentage',
      value: discount?.value ?? Number.NaN,
      minPurchase: discount?.minPurchase ?? 0,
      minQuantity: discount?.minQuantity ?? 0,
      startDate: discount?.startDate ?? '',
      endDate: discount?.endDate ?? '',
      usageLimit: discount?.usageLimit ?? Number.NaN,
      scope: discount?.scope ?? 'subscription',
      isActive: discount?.isActive ?? true,
    },
  })
  const [type, scope] = useWatch({ control, name: ['discountType', 'scope'] })

  const toggle = (list: number[], set: (v: number[]) => void, id: number) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  const onSubmit = handleSubmit(async (values) => {
    setError(null)
    if (values.scope === 'product' && productIds.length === 0) return setError('Choose at least one product for a product discount.')
    const body = { ...values, usageLimit: numOrNull(values.usageLimit), productIds: values.scope === 'product' ? productIds : [], subscriptionIds }
    try {
      if (discount) await api.put(`/discounts/${discount.id}`, body)
      else await api.post('/discounts', body)
      toast.success(discount ? 'Discount saved' : `${values.name} created`)
      onSaved()
      onClose()
    } catch (err) {
      if (!applyServerErrors(err, setFieldError, Object.keys(values))) setError(errorMessage(err))
    }
  })

  // Keep already-linked subscriptions visible even if they are no longer active.
  const subOptions = subscriptions.data ?? []
  const missing = subscriptionIds.filter((id) => !subOptions.some((s) => s.id === id))

  return (
    <Modal
      open
      title={discount ? discount.name : 'New discount'}
      onClose={onClose}
      size="lg"
      footer={
        <>
          {discount && discount.isActive && (
            <Button
              variant="ghost"
              className="mr-auto text-danger"
              disabled={isSubmitting}
              onClick={async () => {
                try {
                  await api.delete(`/discounts/${discount.id}`)
                  toast.success('Discount deactivated')
                  onSaved()
                  onClose()
                } catch (err) {
                  setError(errorMessage(err))
                }
              }}
            >
              Deactivate
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="discount-form" loading={isSubmitting}>
            {discount ? 'Save discount' : 'Create discount'}
          </Button>
        </>
      }
    >
      {!lookups.data ? (
        <LoadingState />
      ) : (
        <form id="discount-form" onSubmit={onSubmit} className="space-y-4" noValidate>
          {error && <Alert tone="error">{error}</Alert>}
          {discount && (
            <p className="text-sm text-slate-600">
              Used {discount.usageCount} time{discount.usageCount === 1 ? '' : 's'} so far · currently <StatusBadge status={discount.state} />
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Name" required autoFocus error={errors.name?.message} {...register('name', { required: 'Name is required' })} />
            <div className="grid grid-cols-2 gap-2">
              <Select
                label="Type"
                options={[
                  { value: 'percentage', label: 'Percentage' },
                  { value: 'fixed_amount', label: 'Fixed amount' },
                ]}
                {...register('discountType')}
              />
              <Input
                label={type === 'percentage' ? 'Value (%)' : 'Value (₹)'}
                type="number"
                min={0.01}
                step="0.01"
                required
                error={errors.value?.message}
                {...register('value', {
                  valueAsNumber: true,
                  validate: (v) => (Number.isNaN(v) || v <= 0 ? 'Must be greater than 0' : getValues('discountType') === 'percentage' && v > 100 ? 'At most 100%' : true),
                })}
              />
            </div>
            <Input label="Minimum purchase (₹)" type="number" min={0} step="0.01" hint="Invoice subtotal needed." error={errors.minPurchase?.message} {...register('minPurchase', { valueAsNumber: true })} />
            <Input label="Minimum quantity" type="number" min={0} step={1} hint="Total quantity needed (of the chosen products, for product discounts)." error={errors.minQuantity?.message} {...register('minQuantity', { valueAsNumber: true })} />
            <Input label="Valid from" type="date" error={errors.startDate?.message} {...register('startDate')} />
            <Input
              label="Valid until"
              type="date"
              error={errors.endDate?.message}
              {...register('endDate', { validate: (v) => !v || !getValues('startDate') || v >= getValues('startDate') || 'Must be on or after the start date' })}
            />
            <Input label="Usage limit" type="number" min={1} step={1} hint="Invoices it can apply to. Empty = unlimited." error={errors.usageLimit?.message} {...register('usageLimit', { valueAsNumber: true })} />
            <Select
              label="Applies to"
              options={[
                { value: 'subscription', label: 'Whole subscription' },
                { value: 'product', label: 'Specific products' },
              ]}
              {...register('scope')}
            />
          </div>

          {scope === 'product' && (
            <fieldset className="rounded-lg border border-slate-200 p-3">
              <legend className="px-1 text-sm font-medium text-ink">Products</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {lookups.data.products.map((p) => (
                  <Checkbox key={p.id} label={p.name} hint={formatMoney(p.salesPrice)} checked={productIds.includes(p.id)} onChange={() => toggle(productIds, setProductIds, p.id)} />
                ))}
              </div>
            </fieldset>
          )}

          <details className="rounded-lg border border-slate-200 p-3" open={subscriptionIds.length > 0}>
            <summary className="cursor-pointer text-sm font-medium text-ink">Limit to specific subscriptions ({subscriptionIds.length || 'all'})</summary>
            <p className="mt-2 text-xs text-slate-500">Leave all unchecked to apply to every subscription that meets the conditions.</p>
            <div className="mt-2 grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">
              {subOptions.map((s) => (
                <Checkbox key={s.id} label={s.subscriptionNumber} hint={s.customerName} checked={subscriptionIds.includes(s.id)} onChange={() => toggle(subscriptionIds, setSubscriptionIds, s.id)} />
              ))}
              {missing.map((id) => (
                <Checkbox key={id} label={`Subscription #${id}`} hint="No longer active" checked onChange={() => toggle(subscriptionIds, setSubscriptionIds, id)} />
              ))}
            </div>
          </details>

          {discount && <Checkbox label="Active" {...register('isActive')} />}
        </form>
      )}
    </Modal>
  )
}
