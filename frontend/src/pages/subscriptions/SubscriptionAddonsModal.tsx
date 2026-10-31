import { PlusIcon, TrashIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { api, errorMessage } from '../../api/client'
import { Alert, Button, Input, LoadingState, Modal, Select, useToast } from '../../components/ui'
import { useAsync } from '../../hooks/useAsync'
import { formatMoney } from '../../lib/format'
import type { Lookups, SubscriptionDetail } from '../../types'

interface Props { open: boolean; subscription: SubscriptionDetail; onClose: () => void; onSaved: () => void }
interface AddonDraft { productId: number | ''; variantId: number | ''; quantity: number; key: number }
const loadProducts = async () => (await api.get<Lookups>('/subscriptions/lookups')).data.products.filter((p) => p.type === 'addon')

export function SubscriptionAddonsModal({ open, ...props }: Props) {
  return open ? <AddonForm {...props} /> : null
}

function AddonForm({ subscription, onClose, onSaved }: Omit<Props, 'open'>) {
  const catalog = useAsync(loadProducts)
  const toast = useToast()
  const existing = subscription.lines.filter((l) => l.productType === 'addon')
  const [lines, setLines] = useState<AddonDraft[]>(() => existing.map((l, index) => ({ key: index, productId: l.productId!, variantId: l.variantId ?? '', quantity: l.quantity })))
  const [nextKey, setNextKey] = useState(existing.length)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const products = catalog.data ?? []
  const update = (key: number, patch: Partial<AddonDraft>) => setLines((current) => current.map((l) => l.key === key ? { ...l, ...patch } : l))
  const save = async () => {
    if (lines.some((l) => !l.productId || !Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > 100000)) {
      setError('Choose an add-on and enter a whole quantity from 1 to 100,000 for every line.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.put(`/subscriptions/${subscription.id}/add-ons`, { lines: lines.map((l) => ({ productId: l.productId, variantId: l.variantId || null, quantity: l.quantity })) })
      toast.success('Add-ons updated for future invoices')
      onSaved()
      onClose()
    } catch (err) { setError(errorMessage(err)) } finally { setSaving(false) }
  }
  const price = (line: AddonDraft, index: number) => {
    const matches = (l: {productId: number | null | ''; variantId: number | null | ''}) => l.productId === line.productId && (l.variantId ?? '') === line.variantId
    const occurrence = lines.slice(0, index + 1).filter(matches).length - 1
    const previous = existing.filter(matches)[occurrence]
    if (previous) return previous.unitPrice
    const product = products.find((p) => p.id === line.productId)
    return (product?.salesPrice ?? 0) + (product?.variants.find((v) => v.id === line.variantId)?.extraPrice ?? 0)
  }
  return (
    <Modal open title="Manage add-ons" onClose={saving ? () => undefined : onClose} size="lg" footer={<>
      <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
      <Button type="submit" form="subscription-addons" loading={saving} disabled={catalog.loading || !!catalog.error}>Save add-ons</Button>
    </>}>
      <form id="subscription-addons" className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save() }}>
        <p className="text-sm text-muted">Changes apply to future invoices, with no prorated charge. Any periods already due are invoiced using the current add-ons before these changes are saved. Existing invoices keep their original amounts.</p>
        <p className="text-sm text-muted">The plan and other product lines stay fixed. Existing add-ons keep their agreed unit price; new add-ons use the current catalog price.</p>
        {(error || catalog.error) && <Alert tone="error">{error ?? catalog.error}</Alert>}
        {catalog.loading ? <LoadingState /> : <>
          {!lines.length && <p className="rounded-control border border-dashed border-primary/20 p-4 text-sm text-muted">No add-ons selected.</p>}
          {lines.map((line, index) => {
            const product = products.find((p) => p.id === line.productId)
            const previous = existing.find((l) => l.productId === line.productId && (l.variantId ?? '') === line.variantId)
            const options = products.map((p) => ({ value: p.id, label: p.name }))
            if (line.productId && !product) options.push({ value: line.productId, label: previous?.description ?? 'Existing add-on (unavailable)' })
            const variants = (product?.variants ?? []).map((v) => ({ value: v.id, label: `${v.attribute}: ${v.value}` }))
            if (line.variantId && !variants.some((v) => v.value === line.variantId)) variants.push({ value: line.variantId, label: 'Existing variant' })
            return <div key={line.key} className="space-y-3 rounded-control bg-canvas/50 p-4 ring-1 ring-primary/10">
              <Select label={`Add-on ${index + 1}`} value={line.productId} placeholder="Choose an add-on" options={options} disabled={saving} onChange={(e) => update(line.key, { productId: e.target.value ? Number(e.target.value) : '', variantId: '' })} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Select label={`Add-on ${index + 1} variant`} value={line.variantId} placeholder="No variant" options={variants} disabled={saving || !variants.length} onChange={(e) => update(line.key, { variantId: e.target.value ? Number(e.target.value) : '' })} />
                <Input label={`Add-on ${index + 1} quantity`} type="number" min={1} max={100000} step={1} value={Number.isNaN(line.quantity) ? '' : line.quantity} disabled={saving} onChange={(e) => update(line.key, { quantity: e.target.valueAsNumber })} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-muted">Unit price {formatMoney(price(line, index))}</p>
                <Button variant="ghost" aria-label={`Remove add-on ${index + 1}`} disabled={saving} onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}><TrashIcon className="h-4 w-4" /> Remove</Button>
              </div>
            </div>
          })}
          <Button variant="secondary" icon={<PlusIcon className="h-4 w-4" />} disabled={saving || !products.length || lines.length >= 50} onClick={() => { setLines((current) => [...current, { key: nextKey, productId: '', variantId: '', quantity: 1 }]); setNextKey((k) => k + 1) }}>Add add-on</Button>
          {!products.length && <p className="text-sm text-muted">No active add-on products are available. Admins can add them in Products.</p>}
        </>}
      </form>
    </Modal>
  )
}
