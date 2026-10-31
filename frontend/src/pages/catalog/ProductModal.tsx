import { Archive, Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { api, errorMessage } from '../../api/client'
import { Alert, Badge, Button, Checkbox, Input, Modal, Select, Textarea, useToast } from '../../components/ui'
import { applyServerErrors } from '../../lib/forms'
import { formatMoney, titleCase } from '../../lib/format'
import { PRODUCT_TYPES, type Product, type ProductType, type Variant } from '../../types'

interface VariantForm {
  attribute: string
  value: string
  extraPrice: number
}

interface ProductForm {
  name: string
  type: ProductType
  salesPrice: number
  costPrice: number
  notes: string
  isActive: boolean
  variants: VariantForm[]
}

const typeOptions = PRODUCT_TYPES.map((t) => ({ value: t, label: titleCase(t) }))

interface Props {
  product: Product | null
  canEdit: boolean
  onClose: () => void
  onSaved: () => void
}

/** Create a product (with initial variants) or view/edit an existing one; existing variants are saved individually. */
export function ProductModal({ product, canEdit, onClose, onSaved }: Props) {
  const toast = useToast()
  const [current, setCurrent] = useState<Product | null>(product)
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    control,
    handleSubmit,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<ProductForm>({
    defaultValues: {
      name: product?.name ?? '',
      type: product?.type ?? 'software',
      salesPrice: product?.salesPrice ?? 0,
      costPrice: product?.costPrice ?? 0,
      notes: product?.notes ?? '',
      isActive: product?.isActive ?? true,
      variants: [],
    },
  })
  const newVariants = useFieldArray({ control, name: 'variants' })
  const salesPrice = Number(useWatch({ control, name: 'salesPrice' })) || 0

  const onSubmit = handleSubmit(async ({ variants, ...values }) => {
    setError(null)
    try {
      if (current) {
        const { data } = await api.put<Product>(`/products/${current.id}`, values)
        setCurrent(data)
        toast.success('Product saved')
      } else {
        const { data } = await api.post<Product>('/products', { ...values, variants })
        toast.success(`${data.name} created`)
        onClose()
      }
      onSaved()
    } catch (err) {
      if (!applyServerErrors(err, setFieldError)) setError(errorMessage(err))
    }
  })

  return (
    <Modal
      open
      title={current ? current.name : 'New product'}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {canEdit ? 'Cancel' : 'Close'}
          </Button>
          {canEdit && (
            <Button type="submit" form="product-form" loading={isSubmitting}>
              {current ? 'Save product' : 'Create product'}
            </Button>
          )}
        </>
      }
    >
      <form id="product-form" onSubmit={onSubmit} noValidate>
        <fieldset disabled={!canEdit} className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Name" required autoFocus error={errors.name?.message} {...register('name', { required: 'Name is required' })} />
            <Select label="Type" options={typeOptions} error={errors.type?.message} {...register('type')} />
            <Input
              label="Sales price (₹)"
              type="number"
              min={0}
              step="0.01"
              required
              error={errors.salesPrice?.message}
              {...register('salesPrice', { valueAsNumber: true, required: 'Sales price is required', min: { value: 0, message: 'Cannot be negative' } })}
            />
            <Input
              label="Cost price (₹)"
              type="number"
              min={0}
              step="0.01"
              hint="Internal, used for margin. Never shown to customers."
              error={errors.costPrice?.message}
              {...register('costPrice', { valueAsNumber: true, min: { value: 0, message: 'Cannot be negative' } })}
            />
          </div>
          <Textarea label="Notes" rows={2} error={errors.notes?.message} {...register('notes')} />
          {current && <Checkbox label="Active" hint="Archived products cannot be added to new quotations." {...register('isActive')} />}

          {!current && (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink">Variants</h3>
                <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => newVariants.append({ attribute: 'Brand', value: '', extraPrice: 0 })}>
                  Add variant
                </Button>
              </div>
              {newVariants.fields.length === 0 && <p className="text-sm text-slate-500">Optional. E.g. Brand: Odoo adds ₹560 to the base price.</p>}
              <div className="space-y-2">
                {newVariants.fields.map((field, index) => (
                  <div key={field.id} className="grid grid-cols-[1fr_1fr_7rem_auto] items-start gap-2">
                    <Input aria-label="Attribute" placeholder="Attribute" error={errors.variants?.[index]?.attribute?.message} {...register(`variants.${index}.attribute`, { required: 'Required' })} />
                    <Input aria-label="Value" placeholder="Value" error={errors.variants?.[index]?.value?.message} {...register(`variants.${index}.value`, { required: 'Required' })} />
                    <Input aria-label="Extra price" type="number" step="0.01" min={0} placeholder="+ ₹" {...register(`variants.${index}.extraPrice`, { valueAsNumber: true })} />
                    <Button variant="ghost" size="md" aria-label="Remove variant" onClick={() => newVariants.remove(index)}>
                      <Trash2 className="h-4 w-4 text-slate-500" />
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </fieldset>
      </form>

      {current && <VariantsEditor product={current} basePrice={salesPrice} canEdit={canEdit} onChange={(p) => { setCurrent(p); onSaved() }} />}
    </Modal>
  )
}

function VariantsEditor({ product, basePrice, canEdit, onChange }: { product: Product; basePrice: number; canEdit: boolean; onChange: (p: Product) => void }) {
  const toast = useToast()
  const [draft, setDraft] = useState<VariantForm>({ attribute: 'Brand', value: '', extraPrice: 0 })
  const [busyId, setBusyId] = useState<number | 'new' | null>(null)
  const variants = product.variants ?? []

  const call = async (id: number | 'new', request: () => Promise<{ data: Product }>, message: string) => {
    setBusyId(id)
    try {
      const { data } = await request()
      onChange(data)
      toast.success(message)
      return true
    } catch (err) {
      toast.error(errorMessage(err))
      return false
    } finally {
      setBusyId(null)
    }
  }

  const add = async () => {
    if (!draft.attribute.trim() || !draft.value.trim()) return toast.error('Enter an attribute and a value')
    if (await call('new', () => api.post<Product>(`/products/${product.id}/variants`, draft), 'Variant added')) setDraft({ ...draft, value: '', extraPrice: 0 })
  }

  return (
    <section className="mt-6 border-t border-slate-200 pt-4">
      <h3 className="mb-1 text-sm font-semibold text-ink">Variants</h3>
      <p className="mb-3 text-xs text-slate-500">Selecting a variant on a quotation adds its extra price to the base price.</p>
      <div className="space-y-2">
        {variants.length === 0 && <p className="text-sm text-slate-500">No variants.</p>}
        {variants.map((v) => (
          <VariantRow
            key={`${v.id}-${v.extraPrice}-${v.isActive}`}
            variant={v}
            basePrice={basePrice}
            canEdit={canEdit}
            busy={busyId === v.id}
            onSave={(values) => call(v.id, () => api.put<Product>(`/products/${product.id}/variants/${v.id}`, { ...values, isActive: v.isActive }), 'Variant saved')}
            onToggle={() =>
              v.isActive
                ? call(v.id, () => api.delete<Product>(`/products/${product.id}/variants/${v.id}`), 'Variant archived')
                : call(v.id, () => api.put<Product>(`/products/${product.id}/variants/${v.id}`, { attribute: v.attribute, value: v.value, extraPrice: v.extraPrice, isActive: true }), 'Variant restored')
            }
          />
        ))}
      </div>
      {canEdit && (
        <div className="mt-3 grid grid-cols-[1fr_1fr_7rem_auto] items-start gap-2 rounded-lg bg-slate-50 p-2">
          <Input aria-label="New variant attribute" placeholder="Attribute" value={draft.attribute} onChange={(e) => setDraft({ ...draft, attribute: e.target.value })} />
          <Input aria-label="New variant value" placeholder="Value" value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} />
          <Input aria-label="New variant extra price" type="number" min={0} step="0.01" value={draft.extraPrice} onChange={(e) => setDraft({ ...draft, extraPrice: Number(e.target.value) })} />
          <Button variant="secondary" icon={<Plus className="h-4 w-4" />} loading={busyId === 'new'} onClick={add}>
            Add
          </Button>
        </div>
      )}
    </section>
  )
}

function VariantRow({
  variant,
  basePrice,
  canEdit,
  busy,
  onSave,
  onToggle,
}: {
  variant: Variant
  basePrice: number
  canEdit: boolean
  busy: boolean
  onSave: (values: VariantForm) => void
  onToggle: () => void
}) {
  const [values, setValues] = useState<VariantForm>({ attribute: variant.attribute, value: variant.value, extraPrice: variant.extraPrice })
  const dirty = values.attribute !== variant.attribute || values.value !== variant.value || values.extraPrice !== variant.extraPrice

  return (
    <div className={`grid grid-cols-[1fr_1fr_7rem_auto] items-center gap-2 ${variant.isActive ? '' : 'opacity-60'}`}>
      <Input aria-label="Attribute" value={values.attribute} disabled={!canEdit} onChange={(e) => setValues({ ...values, attribute: e.target.value })} />
      <Input aria-label="Value" value={values.value} disabled={!canEdit} onChange={(e) => setValues({ ...values, value: e.target.value })} />
      <Input aria-label="Extra price" type="number" min={0} step="0.01" value={values.extraPrice} disabled={!canEdit} onChange={(e) => setValues({ ...values, extraPrice: Number(e.target.value) })} />
      <div className="flex items-center gap-1">
        <span className="hidden whitespace-nowrap text-xs text-slate-500 sm:inline">= {formatMoney(basePrice + (Number(values.extraPrice) || 0))}</span>
        {!variant.isActive && <Badge>Archived</Badge>}
        {canEdit && dirty && (
          <Button size="sm" variant="ghost" aria-label="Save variant" loading={busy} onClick={() => onSave(values)}>
            <Save className="h-4 w-4" />
          </Button>
        )}
        {canEdit && !dirty && (
          <Button size="sm" variant="ghost" aria-label={variant.isActive ? 'Archive variant' : 'Restore variant'} loading={busy} onClick={onToggle}>
            {variant.isActive ? <Archive className="h-4 w-4 text-slate-500" /> : <RotateCcw className="h-4 w-4 text-slate-500" />}
          </Button>
        )}
      </div>
    </div>
  )
}
