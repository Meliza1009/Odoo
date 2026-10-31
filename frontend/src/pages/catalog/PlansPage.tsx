import { PlusIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { api, errorMessage } from '../../api/client'
import { useAuth } from '../../auth/useAuth'
import { ListCard } from '../../components/ListCard'
import { Alert, Badge, Button, Checkbox, Input, Modal, PageHeader, Select, StatusBadge, Textarea, useToast, type Column } from '../../components/ui'
import { usePagedList } from '../../hooks/usePagedList'
import { applyServerErrors } from '../../lib/forms'
import { formatDate, formatMoney, perInterval, titleCase } from '../../lib/format'
import { BILLING_INTERVALS, type BillingInterval, type Plan } from '../../types'

const flagBadges = (p: Plan) => (
  <div className="flex flex-wrap gap-1">
    {p.autoCloseOnExpiry && <Badge tone="navy">Auto-close</Badge>}
    {p.canPause && <Badge tone="amber">Pausable</Badge>}
    {p.canRenew && <Badge tone="green">Renewable</Badge>}
    {p.canCloseEarly && <Badge tone="gray">Early close</Badge>}
  </div>
)

const columns: Column<Plan>[] = [
  {
    key: 'name',
    header: 'Plan',
    render: (p) => (
      <div>
        <p className="font-medium text-primary">{p.name}</p>
        {p.description && <p className="max-w-sm truncate text-xs text-slate-500">{p.description}</p>}
      </div>
    ),
  },
  { key: 'price', header: 'Price', render: (p) => `${formatMoney(p.price)} ${perInterval(p.billingInterval)}`, className: 'whitespace-nowrap tabular-nums' },
  { key: 'min', header: 'Min qty', render: (p) => p.minQuantity, className: 'text-right', hideOnMobile: true },
  { key: 'window', header: 'Available', render: (p) => (p.startDate || p.endDate ? `${formatDate(p.startDate)} - ${formatDate(p.endDate)}` : 'Always'), hideOnMobile: true },
  { key: 'rules', header: 'Rules', render: flagBadges, hideOnMobile: true },
  { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.isActive ? 'active' : 'inactive'} />, hideOnMobile: true },
]

export function PlansPage() {
  const { hasRole } = useAuth()
  const isAdmin = hasRole('admin')
  const [interval, setBillingInterval] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [modal, setModal] = useState<{ plan: Plan | null } | null>(null)
  const list = usePagedList<Plan>('/plans', { billingInterval: interval, includeInactive })

  return (
    <>
      <PageHeader
        title="Plans"
        description="Billing intervals, pricing and lifecycle rules for subscriptions."
        actions={
          isAdmin && (
            <Button icon={<PlusIcon className="h-4 w-4" />} onClick={() => setModal({ plan: null })}>
              New plan
            </Button>
          )
        }
      />
      <ListCard
        list={list}
        columns={columns}
        rowKey={(p) => p.id}
        searchPlaceholder="Search plans"
        filters={
          <>
            <Select aria-label="Billing interval" className="w-40" value={interval} onChange={(e) => setBillingInterval(e.target.value)} options={BILLING_INTERVALS.map((i) => ({ value: i, label: titleCase(i) }))} placeholder="All intervals" />
            <Checkbox label="Show archived" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
          </>
        }
        onRowClick={(p) => setModal({ plan: p })}
        emptyTitle="No plans yet"
        emptyAction={isAdmin && <Button onClick={() => setModal({ plan: null })}>New plan</Button>}
      />
      {modal && <PlanModal plan={modal.plan} canEdit={isAdmin} onClose={() => setModal(null)} onSaved={list.reload} />}
    </>
  )
}

interface PlanForm {
  name: string
  description: string
  billingInterval: BillingInterval
  price: number
  minQuantity: number
  startDate: string
  endDate: string
  autoCloseOnExpiry: boolean
  canCloseEarly: boolean
  canPause: boolean
  canRenew: boolean
  isActive: boolean
}

function PlanModal({ plan, canEdit, onClose, onSaved }: { plan: Plan | null; canEdit: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    getValues,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<PlanForm>({
    defaultValues: {
      name: plan?.name ?? '',
      description: plan?.description ?? '',
      billingInterval: plan?.billingInterval ?? 'monthly',
      price: plan?.price ?? 0,
      minQuantity: plan?.minQuantity ?? 1,
      startDate: plan?.startDate ?? '',
      endDate: plan?.endDate ?? '',
      autoCloseOnExpiry: plan?.autoCloseOnExpiry ?? false,
      canCloseEarly: plan?.canCloseEarly ?? true,
      canPause: plan?.canPause ?? true,
      canRenew: plan?.canRenew ?? true,
      isActive: plan?.isActive ?? true,
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    setError(null)
    try {
      if (plan) await api.put(`/plans/${plan.id}`, values)
      else await api.post('/plans', values)
      toast.success(plan ? 'Plan saved' : `${values.name} created`)
      onSaved()
      onClose()
    } catch (err) {
      if (!applyServerErrors(err, setFieldError)) setError(errorMessage(err))
    }
  })

  return (
    <Modal
      open
      title={plan ? plan.name : 'New plan'}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {canEdit ? 'Cancel' : 'Close'}
          </Button>
          {canEdit && (
            <Button type="submit" form="plan-form" loading={isSubmitting}>
              {plan ? 'Save plan' : 'Create plan'}
            </Button>
          )}
        </>
      }
    >
      <form id="plan-form" onSubmit={onSubmit} noValidate>
        <fieldset disabled={!canEdit} className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Name" required autoFocus error={errors.name?.message} {...register('name', { required: 'Name is required' })} />
            <Select label="Billing interval" options={BILLING_INTERVALS.map((i) => ({ value: i, label: titleCase(i) }))} error={errors.billingInterval?.message} {...register('billingInterval')} />
            <Input
              label="Price per period (₹)"
              type="number"
              min={0}
              step="0.01"
              required
              hint="Recurring plan fee, added to the product lines. Use 0 if you only bill products."
              error={errors.price?.message}
              {...register('price', { valueAsNumber: true, required: 'Price is required', min: { value: 0, message: 'Cannot be negative' } })}
            />
            <Input
              label="Minimum quantity"
              type="number"
              min={1}
              step={1}
              hint="Total product quantity a subscription needs."
              error={errors.minQuantity?.message}
              {...register('minQuantity', { valueAsNumber: true, min: { value: 1, message: 'At least 1' } })}
            />
            <Input label="Available from" type="date" error={errors.startDate?.message} {...register('startDate')} />
            <Input
              label="Available until"
              type="date"
              error={errors.endDate?.message}
              {...register('endDate', { validate: (v) => !v || !getValues('startDate') || v >= getValues('startDate') || 'Must be on or after the start date' })}
            />
          </div>
          <Textarea label="Description" rows={2} error={errors.description?.message} {...register('description')} />
          <div className="grid gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-2">
            <Checkbox label="Auto-close on expiry" hint="Closes subscriptions automatically once their expiry date passes." {...register('autoCloseOnExpiry')} />
            <Checkbox label="Can close early" hint="Allow closing before the expiry date." {...register('canCloseEarly')} />
            <Checkbox label="Can pause" hint="Paused periods are not billed." {...register('canPause')} />
            <Checkbox label="Can renew" hint="Extend the expiry date by more periods." {...register('canRenew')} />
            {plan && <Checkbox label="Active" hint="Archived plans cannot be used for new quotations." {...register('isActive')} />}
          </div>
        </fieldset>
      </form>
    </Modal>
  )
}
