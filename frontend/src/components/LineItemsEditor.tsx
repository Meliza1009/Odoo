import { PlusIcon, TrashIcon } from '@phosphor-icons/react'
import { formatMoney } from '../lib/format'
import { effectivePrice, listPrice, newLine, type CatalogProducts, type LineDraft } from '../lib/lines'
import { Button, Input, Select } from './ui'

interface Props {
  products: CatalogProducts
  lines: LineDraft[]
  onChange: (lines: LineDraft[]) => void
  disabled?: boolean
}

export function LineItemsEditor({ products, lines, onChange, disabled }: Props) {
  const update = (key: string, patch: Partial<LineDraft>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const productOptions = products.map((p) => ({ value: p.id, label: p.name }))

  return (
    <div>
      <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_5rem_7rem_5.5rem_6.5rem_2.5rem] gap-2 px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:grid">
        <span>Product</span>
        <span>Variant</span>
        <span>Qty</span>
        <span>Unit price</span>
        <span title="Used only when no tax rule matches the product">Tax %*</span>
        <span className="text-right">Amount</span>
        <span />
      </div>
      <div className="space-y-3 lg:space-y-2">
        {lines.map((line, index) => {
          const product = products.find((p) => p.id === line.productId)
          const price = effectivePrice(products, line)
          return (
            <div
              key={line.key}
              className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_5rem_7rem_5.5rem_6.5rem_2.5rem] lg:items-center lg:border-0 lg:p-0"
            >
              <Select
                aria-label={`Line ${index + 1} product`}
                className="col-span-2 lg:col-span-1"
                value={line.productId}
                disabled={disabled}
                options={productOptions}
                placeholder="Choose product"
                onChange={(e) => update(line.key, { productId: e.target.value ? Number(e.target.value) : '', variantId: '' })}
              />
              <Select
                aria-label={`Line ${index + 1} variant`}
                className="col-span-2 lg:col-span-1"
                value={line.variantId}
                disabled={disabled || !product?.variants.length}
                options={(product?.variants ?? []).map((v) => ({ value: v.id, label: `${v.attribute}: ${v.value}${v.extraPrice ? ` (+${formatMoney(v.extraPrice)})` : ''}` }))}
                placeholder={product?.variants.length ? 'No variant' : 'No variants'}
                onChange={(e) => update(line.key, { variantId: e.target.value ? Number(e.target.value) : '' })}
              />
              <Input
                aria-label={`Line ${index + 1} quantity`}
                type="number"
                min={1}
                step={1}
                value={Number.isNaN(line.quantity) ? '' : line.quantity}
                disabled={disabled}
                onChange={(e) => update(line.key, { quantity: e.target.valueAsNumber })}
              />
              <Input
                aria-label={`Line ${index + 1} unit price`}
                type="number"
                min={0}
                step="0.01"
                value={line.unitPrice}
                placeholder={product ? String(listPrice(products, line)) : 'Price'}
                disabled={disabled}
                onChange={(e) => update(line.key, { unitPrice: e.target.value })}
              />
              <Input
                aria-label={`Line ${index + 1} fallback tax rate`}
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={Number.isNaN(line.taxRate) ? '' : line.taxRate}
                disabled={disabled}
                onChange={(e) => update(line.key, { taxRate: e.target.value === '' ? 0 : e.target.valueAsNumber })}
              />
              <p className="self-center text-right text-sm font-medium tabular-nums text-ink">{formatMoney(price * (line.quantity || 0))}</p>
              {!disabled && (
                <Button variant="ghost" aria-label={`Remove line ${index + 1}`} className="justify-self-end" onClick={() => onChange(lines.filter((l) => l.key !== line.key))}>
                  <TrashIcon className="h-4 w-4 text-slate-500" />
                </Button>
              )}
            </div>
          )
        })}
      </div>
      {lines.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">No product lines yet.</p>}
      {!disabled && (
        <Button variant="secondary" size="sm" className="mt-3" icon={<PlusIcon className="h-4 w-4" />} onClick={() => onChange([...lines, newLine()])}>
          Add line
        </Button>
      )}
      <p className="mt-2 text-xs text-slate-500">
        * Invoices apply the configured tax rules automatically; the line rate is only used when no rule matches. Leave unit price empty to use the catalogue price.
      </p>
    </div>
  )
}
