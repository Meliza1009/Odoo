import type { Lookups } from '../types'

export interface LineDraft {
  key: string
  productId: number | ''
  variantId: number | ''
  quantity: number
  /** '' = use the catalogue price (product + variant extra). */
  unitPrice: string
  taxRate: number
}

let counter = 0
export const newLine = (partial: Partial<LineDraft> = {}): LineDraft => {
  counter += 1
  return { key: `line-${counter}`, productId: '', variantId: '', quantity: 1, unitPrice: '', taxRate: 0, ...partial }
}

export type CatalogProducts = Lookups['products']

export function listPrice(products: CatalogProducts, line: Pick<LineDraft, 'productId' | 'variantId'>) {
  const product = products.find((p) => p.id === line.productId)
  if (!product) return 0
  const variant = product.variants.find((v) => v.id === line.variantId)
  return product.salesPrice + (variant?.extraPrice ?? 0)
}

export const effectivePrice = (products: CatalogProducts, line: LineDraft) => (line.unitPrice === '' ? listPrice(products, line) : Number(line.unitPrice))

/** Client-side estimate (the server recalculates authoritative totals on save). */
export function lineTotals(products: CatalogProducts, lines: LineDraft[]) {
  let subtotal = 0
  let tax = 0
  for (const line of lines) {
    const amount = Math.round(effectivePrice(products, line) * (line.quantity || 0) * 100) / 100
    subtotal += amount
    tax += Math.round(amount * (line.taxRate || 0)) / 100
  }
  return { subtotal, tax, total: subtotal + tax }
}

export interface ApiLine {
  productId: number
  variantId: number | null
  quantity: number
  unitPrice: number | null
  taxRate: number
}

/** Converts drafts to the API's line shape, or returns a message for the first incomplete line. */
export function serializeLines(lines: LineDraft[]): { lines: ApiLine[] } | { error: string } {
  for (const [i, line] of lines.entries()) {
    if (line.productId === '') return { error: `Line ${i + 1}: choose a product` }
    if (!Number.isInteger(line.quantity) || line.quantity < 1) return { error: `Line ${i + 1}: quantity must be a whole number of at least 1` }
    if (line.unitPrice !== '' && (Number.isNaN(Number(line.unitPrice)) || Number(line.unitPrice) < 0)) return { error: `Line ${i + 1}: price cannot be negative` }
    if (Number.isNaN(line.taxRate) || line.taxRate < 0 || line.taxRate > 100) return { error: `Line ${i + 1}: tax must be between 0 and 100%` }
  }
  return {
    lines: lines.map((l) => ({
      productId: Number(l.productId),
      variantId: l.variantId === '' ? null : Number(l.variantId),
      quantity: l.quantity,
      unitPrice: l.unitPrice === '' ? null : Number(l.unitPrice),
      taxRate: l.taxRate,
    })),
  }
}
