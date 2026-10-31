import { FilePlus2, Plus } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { api, errorMessage } from '../../api/client'
import { useAuth } from '../../auth/useAuth'
import { LineItemsEditor } from '../../components/LineItemsEditor'
import { ListCard } from '../../components/ListCard'
import { Alert, Button, Checkbox, Input, LoadingState, Modal, PageHeader, Select, StatusBadge, Textarea, useToast, type Column } from '../../components/ui'
import { useLookups } from '../../hooks/useLookups'
import { usePagedList } from '../../hooks/usePagedList'
import { applyServerErrors, numOrNull } from '../../lib/forms'
import { formatMoney, perInterval } from '../../lib/format'
import { newLine, serializeLines, type LineDraft } from '../../lib/lines'
import type { QuotationTemplate } from '../../types'

const columns: Column<QuotationTemplate>[] = [
  { key: 'name', header: 'Template', render: (t) => <span className="font-medium text-primary">{t.name}</span> },
  { key: 'plan', header: 'Plan', render: (t) => `${t.planName} ${perInterval(t.billingInterval)}` },
  { key: 'lines', header: 'Lines', render: (t) => t.lineCount ?? 0, className: 'text-right', hideOnMobile: true },
  { key: 'validity', header: 'Valid for', render: (t) => `${t.validityDays} days`, hideOnMobile: true },
  { key: 'contract', header: 'Contract', render: (t) => (t.contractPeriods ? `${t.contractPeriods} periods` : 'Open-ended'), hideOnMobile: true },
  { key: 'status', header: 'Status', render: (t) => <StatusBadge status={t.isActive ? 'active' : 'inactive'} />, hideOnMobile: true },
]

export function QuotationTemplatesPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const { hasRole } = useAuth()
  const isAdmin = hasRole('admin')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [modal, setModal] = useState<{ template: QuotationTemplate | null } | null>(null)
  const list = usePagedList<QuotationTemplate>('/quotation-templates', { includeInactive })

  const open = async (row: QuotationTemplate) => {
    try {
      setModal({ template: (await api.get<QuotationTemplate>(`/quotation-templates/${row.id}`)).data })
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <>
      <PageHeader
        title="Quotation templates"
        description="Pre-configured plans and product lines, so a quotation takes seconds."
        actions={
          <>
            <Button variant="secondary" icon={<FilePlus2 className="h-4 w-4" />} onClick={() => navigate('/app/subscriptions/new?mode=template')}>
              Quote from template
            </Button>
            {isAdmin && (
              <Button icon={<Plus className="h-4 w-4" />} onClick={() => setModal({ template: null })}>
                New template
              </Button>
            )}
          </>
        }
      />
      <ListCard
        list={list}
        columns={columns}
        rowKey={(t) => t.id}
        searchPlaceholder="Search templates"
        filters={<Checkbox label="Show archived" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />}
        onRowClick={open}
        emptyTitle="No templates yet"
        emptyAction={isAdmin && <Button onClick={() => setModal({ template: null })}>New template</Button>}
      />
      {modal && <TemplateModal template={modal.template} canEdit={isAdmin} onClose={() => setModal(null)} onSaved={list.reload} />}
    </>
  )
}

interface TemplateForm {
  name: string
  planId: string
  validityDays: number
  paymentTermsDays: number
  contractPeriods: number
  notes: string
  isActive: boolean
}

function TemplateModal({ template, canEdit, onClose, onSaved }: { template: QuotationTemplate | null; canEdit: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const navigate = useNavigate()
  const lookups = useLookups()
  const [error, setError] = useState<string | null>(null)
  const [lines, setLines] = useState<LineDraft[]>(() =>
    (template?.lines ?? []).map((l) => newLine({ productId: l.productId, variantId: l.variantId ?? '', quantity: l.quantity, unitPrice: l.unitPrice === null ? '' : String(l.unitPrice), taxRate: l.taxRate })),
  )
  const {
    register,
    handleSubmit,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<TemplateForm>({
    defaultValues: {
      name: template?.name ?? '',
      planId: template ? String(template.planId) : '',
      validityDays: template?.validityDays ?? 30,
      paymentTermsDays: template?.paymentTermsDays ?? 30,
      contractPeriods: template?.contractPeriods ?? Number.NaN,
      notes: template?.notes ?? '',
      isActive: template?.isActive ?? true,
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    setError(null)
    const serialized = serializeLines(lines)
    if ('error' in serialized) return setError(serialized.error)
    const body = { ...values, planId: Number(values.planId), contractPeriods: numOrNull(values.contractPeriods), lines: serialized.lines }
    try {
      if (template) await api.put(`/quotation-templates/${template.id}`, body)
      else await api.post('/quotation-templates', body)
      toast.success(template ? 'Template saved' : `${values.name} created`)
      onSaved()
      onClose()
    } catch (err) {
      if (!applyServerErrors(err, setFieldError, ['name', 'planId', 'validityDays', 'paymentTermsDays', 'contractPeriods', 'notes'])) setError(errorMessage(err))
    }
  })

  const plans = lookups.data?.plans ?? []
  const planOptions = plans.map((p) => ({ value: p.id, label: `${p.name} (${formatMoney(p.price)} ${perInterval(p.billingInterval)})` }))
  // Keep an archived plan selectable when viewing an old template.
  if (template && !plans.some((p) => p.id === template.planId)) planOptions.unshift({ value: template.planId, label: `${template.planName} (archived)` })

  return (
    <Modal
      open
      title={template ? template.name : 'New quotation template'}
      onClose={onClose}
      size="lg"
      footer={
        <>
          {template?.isActive && (
            <Button variant="secondary" className="mr-auto" onClick={() => navigate(`/app/subscriptions/new?mode=template&templateId=${template.id}`)}>
              Use template
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {canEdit ? 'Cancel' : 'Close'}
          </Button>
          {canEdit && (
            <Button type="submit" form="template-form" loading={isSubmitting}>
              {template ? 'Save template' : 'Create template'}
            </Button>
          )}
        </>
      }
    >
      {!lookups.data ? (
        lookups.error ? <Alert tone="error">{lookups.error}</Alert> : <LoadingState />
      ) : (
        <form id="template-form" onSubmit={onSubmit} noValidate>
          <fieldset disabled={!canEdit} className="space-y-4">
            {error && <Alert tone="error">{error}</Alert>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Name" required autoFocus error={errors.name?.message} {...register('name', { required: 'Name is required' })} />
              <Select label="Plan" required options={planOptions} placeholder="Choose a plan" error={errors.planId?.message} {...register('planId', { required: 'Choose a plan' })} />
              <Input
                label="Quotation valid for (days)"
                type="number"
                min={1}
                max={365}
                error={errors.validityDays?.message}
                {...register('validityDays', { valueAsNumber: true, min: { value: 1, message: 'At least 1 day' }, max: { value: 365, message: 'At most 365 days' } })}
              />
              <Input
                label="Payment terms (days)"
                type="number"
                min={0}
                max={365}
                error={errors.paymentTermsDays?.message}
                {...register('paymentTermsDays', { valueAsNumber: true, min: { value: 0, message: 'Cannot be negative' } })}
              />
              <Input
                label="Contract length (periods)"
                type="number"
                min={1}
                max={120}
                hint="Sets the expiry date. Leave empty for open-ended."
                error={errors.contractPeriods?.message}
                {...register('contractPeriods', { valueAsNumber: true })}
              />
            </div>
            <section>
              <h3 className="mb-2 text-sm font-semibold text-ink">Product lines</h3>
              <LineItemsEditor products={lookups.data.products} lines={lines} onChange={setLines} disabled={!canEdit} />
            </section>
            {template?.estimatedTotal !== undefined && (
              <p className="text-sm text-slate-600">
                Saved estimate per period incl. plan fee: <span className="font-semibold text-primary">{formatMoney(template.estimatedTotal)}</span>
              </p>
            )}
            <Textarea label="Notes / terms" rows={2} {...register('notes')} />
            {template && <Checkbox label="Active" {...register('isActive')} />}
          </fieldset>
        </form>
      )}
    </Modal>
  )
}
