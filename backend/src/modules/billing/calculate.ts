/**
 * Pure invoice maths (no database access) so pricing rules are easy to unit test.
 * All arithmetic is done in integer paise.
 */
import { toPaise, toRupees } from '../../lib/money.js';

export interface CalcLine {
  lineType: 'plan' | 'product';
  productId: number | null;
  productType: string | null;
  quantity: number;
  unitPrice: number;
  /** Used only when no tax rule matches the line. */
  fallbackTaxRate: number;
}

export interface TaxRule {
  id: number;
  name: string;
  rate: number;
  appliesTo: 'all' | 'product_type' | 'product';
  productType: string | null;
  productId: number | null;
  region: string | null;
}

export interface DiscountRule {
  id: number;
  name: string;
  discountType: 'fixed_amount' | 'percentage';
  value: number;
  minPurchase: number;
  minQuantity: number;
  scope: 'subscription' | 'product';
  productIds: number[];
}

export interface CalculatedLine {
  subtotal: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  taxRuleIds: number[];
}

export interface AppliedDiscount {
  discountId: number;
  name: string;
  amount: number;
}

export interface InvoiceCalculation {
  lines: CalculatedLine[];
  appliedDiscounts: AppliedDiscount[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
}

const LEVEL: Record<TaxRule['appliesTo'], number> = { all: 1, product_type: 2, product: 3 };

/** Most specific matching rules win (product > product type > all; regional > global); their rates add up. */
export function resolveTaxRate(line: Pick<CalcLine, 'productId' | 'productType' | 'fallbackTaxRate'>, rules: TaxRule[], region: string | null) {
  const customerRegion = region?.trim().toLowerCase() ?? null;
  const matching = rules.filter((r) => {
    if (r.region && r.region.trim().toLowerCase() !== customerRegion) return false;
    if (r.appliesTo === 'product') return line.productId !== null && r.productId === line.productId;
    if (r.appliesTo === 'product_type') return line.productType !== null && r.productType === line.productType;
    return true;
  });
  if (matching.length === 0) return { rate: line.fallbackTaxRate, ruleIds: [] as number[] };

  const score = (r: TaxRule) => LEVEL[r.appliesTo] * 2 + (r.region ? 1 : 0);
  const best = Math.max(...matching.map(score));
  const winners = matching.filter((r) => score(r) === best);
  const rate = Math.min(100, Math.round(winners.reduce((sum, r) => sum + r.rate, 0) * 100) / 100);
  return { rate, ruleIds: winners.map((r) => r.id) };
}

/** Splits `amount` across `weights` proportionally; rounding remainder goes to the largest weights. */
export function allocate(amount: number, weights: number[]): number[] {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (amount <= 0 || totalWeight <= 0) return weights.map(() => 0);
  const shares = weights.map((w) => Math.floor((amount * w) / totalWeight));
  // Flooring loses less than 1 paisa per positive weight, so one pass over the largest weights settles the remainder.
  const remainder = amount - shares.reduce((a, b) => a + b, 0);
  const order = weights.map((w, i) => [w, i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < remainder; k += 1) shares[order[k % order.length][1]] += 1;
  return shares;
}

function discountAmount(rule: DiscountRule, base: number) {
  if (base <= 0) return 0;
  const raw = rule.discountType === 'percentage' ? Math.round((base * rule.value) / 100) : toPaise(rule.value);
  return Math.min(raw, base);
}

/**
 * 1. line subtotal = quantity x unit price
 * 2. product-scoped discounts reduce the matching lines
 * 3. subscription-scoped discounts reduce what is left, spread proportionally across all lines
 * 4. tax is charged per line on the discounted amount, using the matching tax rules
 */
export function calculateInvoice(lines: CalcLine[], discounts: DiscountRule[], taxRules: TaxRule[], region: string | null): InvoiceCalculation {
  const subtotals = lines.map((l) => l.quantity * toPaise(l.unitPrice));
  const lineDiscounts = lines.map(() => 0);
  const invoiceSubtotal = subtotals.reduce((a, b) => a + b, 0);
  const totalQuantity = lines.filter((l) => l.lineType === 'product').reduce((sum, l) => sum + l.quantity, 0);
  const applied: AppliedDiscount[] = [];
  const remaining = (i: number) => subtotals[i] - lineDiscounts[i];

  const ordered = [...discounts].sort((a, b) => (a.scope === b.scope ? a.id - b.id : a.scope === 'product' ? -1 : 1));
  for (const rule of ordered) {
    if (invoiceSubtotal < toPaise(rule.minPurchase)) continue;

    const targets =
      rule.scope === 'product'
        ? lines.map((l, i) => (l.lineType === 'product' && l.productId !== null && rule.productIds.includes(l.productId) ? i : -1)).filter((i) => i >= 0)
        : lines.map((_, i) => i);
    if (targets.length === 0) continue;

    const quantity = rule.scope === 'product' ? targets.reduce((sum, i) => sum + lines[i].quantity, 0) : totalQuantity;
    if (quantity < rule.minQuantity) continue;

    const weights = targets.map(remaining);
    const amount = discountAmount(rule, weights.reduce((a, b) => a + b, 0));
    if (amount <= 0) continue;

    allocate(amount, weights).forEach((share, k) => {
      lineDiscounts[targets[k]] += share;
    });
    applied.push({ discountId: rule.id, name: rule.name, amount: toRupees(amount) });
  }

  const calculated = lines.map((line, i) => {
    const { rate, ruleIds } = resolveTaxRate(line, taxRules, region);
    const taxable = remaining(i);
    const tax = Math.round((taxable * rate) / 100);
    return {
      subtotal: toRupees(subtotals[i]),
      discountAmount: toRupees(lineDiscounts[i]),
      taxRate: rate,
      taxAmount: toRupees(tax),
      total: toRupees(taxable + tax),
      taxRuleIds: ruleIds,
    };
  });

  const discountTotal = lineDiscounts.reduce((a, b) => a + b, 0);
  const taxTotal = calculated.reduce((sum, l) => sum + toPaise(l.taxAmount), 0);
  return {
    lines: calculated,
    appliedDiscounts: applied,
    subtotal: toRupees(invoiceSubtotal),
    discountTotal: toRupees(discountTotal),
    taxTotal: toRupees(taxTotal),
    grandTotal: toRupees(invoiceSubtotal - discountTotal + taxTotal),
  };
}
