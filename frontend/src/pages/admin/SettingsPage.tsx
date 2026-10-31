import { CalendarX2, Plus, Receipt } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { api, errorMessage } from '../../api/client'
import { RunBillingDialog } from '../../components/RunBillingDialog'
import { Alert, Button, Card, CardHeader, Checkbox, ConfirmDialog, DataTable, Input, Modal, PageHeader, Pagination, Segmented, Select, StatusBadge, useToast } from '../../components/ui'
import { useAsync } from '../../hooks/useAsync'
import { useLookups } from '../../hooks/useLookups'
import { usePagedList } from '../../hooks/usePagedList'
import { applyServerErrors, idOrNull } from '../../lib/forms'
import { formatDate, formatDateTime, formatPercent, titleCase } from '../../lib/format'
import { PRODUCT_TYPES, type BillingRun, type ProductType, type TaxRule } from '../../types'

export function SettingsPage() {
  const [tab, setTab] = useState<'taxes' | 'billing'>('taxes')
  return (
    <>
      <PageHeader title="Settings" description="Tax rules and the billing engine." />
      <div className="mb-4">
        <Segmented
          label="Settings section"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'taxes', label: 'Tax rules' },
            { value: 'billing', label: 'Billing' },
          ]}
        />
      </div>
      {tab === 'taxes' ? <TaxRules /> : <Billing />}
    </>
  )
}

function TaxRules() {
  const [includeInactive, setIncludeInactive] = useState(false)
  const load = useCallback(() => api.get<{ data: TaxRule[] }>('/tax-rules', { params: { includeInactive } }).then((r) => r.data.data), [includeInactive])
  const { data, error, loading, reload } = useAsync(load)
  const [modal, setModal] = useState<{ rule: TaxRule | null } | null>(null)

  return (
    <Card>
      <CardHeader
        title="Tax rules"
        actions={
          <div className="flex items-center gap-3">
            <Checkbox label="Show inactive" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setModal({ rule: null })}>
              New rule
            </Button>
          </div>
        }
      />
      <p className="border-b border-slate-200 px-5 py-3 text-sm text-slate-600">
        Applied to invoice lines on billing day. The most specific matching rules win (product, then product type, then all products) and their rates add up. Regional rules only
        apply to customers in that region.
      </p>
      <DataTable
        columns={[
          { key: 'name', header: 'Rule', render: (r) => <span className="font-medium text-primary">{r.name}</span> },
          { key: 'rate', header: 'Rate', render: (r) => formatPercent(r.rate), className: 'text-right tabular-nums' },
          {
            key: 'applies',
            header: 'Applies to',
            render: (r) => (r.appliesTo === 'all' ? 'All products' : r.appliesTo === 'product_type' ? `${titleCase(r.productType ?? '')} products` : r.productName),
          },
          { key: 'region', header: 'Region', render: (r) => r.region ?? 'Everywhere', hideOnMobile: true },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.isActive ? 'active' : 'inactive'} />, hideOnMobile: true },
        ]}
        rows={data}
        rowKey={(r) => r.id}
        loading={loading}
        error={error}
        onRetry={reload}
        onRowClick={(r) => setModal({ rule: r })}
        emptyTitle="No tax rules"
        emptyDescription="Without rules, invoices use each line's fallback tax rate."
      />
      {modal && <TaxRuleModal rule={modal.rule} onClose={() => setModal(null)} onSaved={reload} />}
    </Card>
  )
}

interface TaxForm {
  name: string
  rate: number
  appliesTo: TaxRule['appliesTo']
  productType: ProductType
  productId: string
  region: string
  isActive: boolean
}

function TaxRuleModal({ rule, onClose, onSaved }: { rule: TaxRule | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const lookups = useLookups()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    control,
    handleSubmit,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<TaxForm>({
    defaultValues: {
      name: rule?.name ?? '',
      rate: rule?.rate ?? Number.NaN,
      appliesTo: rule?.appliesTo ?? 'all',
      productType: rule?.productType ?? 'software',
      productId: rule?.productId ? String(rule.productId) : '',
      region: rule?.region ?? '',
      isActive: rule?.isActive ?? true,
    },
  })
  const appliesTo = useWatch({ control, name: 'appliesTo' })

  const onSubmit = handleSubmit(async (values) => {
    setError(null)
    const body = { ...values, productId: idOrNull(values.productId) }
    try {
      if (rule) await api.put(`/tax-rules/${rule.id}`, body)
      else await api.post('/tax-rules', body)
      toast.success(rule ? 'Tax rule saved' : `${values.name} created`)
      onSaved()
      onClose()
    } catch (err) {
      if (!applyServerErrors(err, setFieldError, Object.keys(values))) setError(errorMessage(err))
    }
  })

  const productOptions = lookups.data?.products.map((p) => ({ value: p.id, label: p.name })) ?? []
  if (rule?.productId && !productOptions.some((p) => p.value === rule.productId)) productOptions.unshift({ value: rule.productId, label: `${rule.productName} (archived)` })

  return (
    <Modal
      open
      title={rule ? rule.name : 'New tax rule'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="tax-form" loading={isSubmitting}>
            {rule ? 'Save rule' : 'Create rule'}
          </Button>
        </>
      }
    >
      <form id="tax-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Name" required autoFocus placeholder="GST 18%" error={errors.name?.message} {...register('name', { required: 'Name is required' })} />
          <Input
            label="Rate (%)"
            type="number"
            min={0}
            max={100}
            step="0.01"
            required
            error={errors.rate?.message}
            {...register('rate', { valueAsNumber: true, validate: (v) => (!Number.isNaN(v) && v >= 0 && v <= 100) || 'Enter 0 to 100' })}
          />
          <Select
            label="Applies to"
            options={[
              { value: 'all', label: 'All products' },
              { value: 'product_type', label: 'A product type' },
              { value: 'product', label: 'One product' },
            ]}
            {...register('appliesTo')}
          />
          {appliesTo === 'product_type' && <Select label="Product type" options={PRODUCT_TYPES.map((t) => ({ value: t, label: titleCase(t) }))} error={errors.productType?.message} {...register('productType')} />}
          {appliesTo === 'product' && (
            <Select label="Product" required options={productOptions} placeholder="Choose a product" error={errors.productId?.message} {...register('productId', { required: 'Choose a product' })} />
          )}
          <Input label="Region" placeholder="e.g. Karnataka" hint="Leave empty to apply everywhere." error={errors.region?.message} {...register('region')} />
        </div>
        {rule && <Checkbox label="Active" {...register('isActive')} />}
      </form>
    </Modal>
  )
}

function Billing() {
  const toast = useToast()
  const runs = usePagedList<BillingRun>('/billing/runs', {}, 10)
  const [billingOpen, setBillingOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [busy, setBusy] = useState(false)

  const closeExpired = async () => {
    setBusy(true)
    try {
      const { data } = await api.post<{ closed: number }>('/subscriptions/close-expired')
      toast.success(data.closed ? `${data.closed} expired subscription${data.closed === 1 ? '' : 's'} closed` : 'No expired subscriptions to close')
      setClosing(false)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-semibold text-ink">Billing day</h2>
          <p className="mt-1 text-sm text-slate-600">Generate invoices for every active subscription that is due. Already billed periods are never billed again.</p>
          <Button className="mt-4" variant="accent" icon={<Receipt className="h-4 w-4" />} onClick={() => setBillingOpen(true)}>
            Run billing
          </Button>
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold text-ink">Expired subscriptions</h2>
          <p className="mt-1 text-sm text-slate-600">Close active or paused subscriptions past their expiry date whose plan has auto-close enabled.</p>
          <Button className="mt-4" variant="secondary" icon={<CalendarX2 className="h-4 w-4" />} onClick={() => setClosing(true)}>
            Close expired now
          </Button>
        </Card>
      </div>

      <Card>
        <CardHeader title="Billing run history" />
        <DataTable
          columns={[
            { key: 'date', header: 'Run date', render: (r) => formatDate(r.runDate) },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.errors?.length ? 'failed' : r.status} /> },
            { key: 'checked', header: 'Due subs', render: (r) => r.subscriptionsChecked, className: 'text-right' },
            { key: 'created', header: 'Invoices', render: (r) => r.invoicesCreated, className: 'text-right' },
            { key: 'skipped', header: 'Already billed', render: (r) => r.periodsSkipped, className: 'text-right', hideOnMobile: true },
            {
              key: 'errors',
              header: 'Errors',
              render: (r) => (r.errors?.length ? <span className="text-danger" title={r.errors.map((e) => `#${e.subscriptionId}: ${e.error}`).join('\n')}>{r.errors.length}</span> : 0),
              className: 'text-right',
              hideOnMobile: true,
            },
            { key: 'by', header: 'Triggered', render: (r) => `${formatDateTime(r.startedAt)} · ${r.triggeredBy ?? 'Scheduler'}`, hideOnMobile: true },
          ]}
          rows={runs.data?.data ?? null}
          rowKey={(r) => r.id}
          loading={runs.loading}
          error={runs.error}
          onRetry={runs.reload}
          emptyTitle="Billing has not run yet"
        />
        {runs.data && runs.data.total > 0 && <Pagination page={runs.page} totalPages={runs.data.totalPages} total={runs.data.total} onPageChange={runs.setPage} />}
      </Card>

      <RunBillingDialog open={billingOpen} onClose={() => setBillingOpen(false)} onDone={runs.reload} />
      <ConfirmDialog
        open={closing}
        title="Close expired subscriptions?"
        message="Subscriptions on auto-close plans that are past their expiry date will be closed and stop billing. They can still be renewed afterwards."
        confirmLabel="Close expired"
        tone="primary"
        loading={busy}
        onConfirm={closeExpired}
        onCancel={() => setClosing(false)}
      />
    </div>
  )
}
