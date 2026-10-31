import { describe, expect, it } from 'vitest';
import { allocate, calculateInvoice, resolveTaxRate, type CalcLine, type DiscountRule, type TaxRule } from '../src/modules/billing/calculate.js';

const software: CalcLine = { lineType: 'product', productId: 1, productType: 'software', quantity: 10, unitPrice: 2560, fallbackTaxRate: 0 };
const support: CalcLine = { lineType: 'product', productId: 2, productType: 'service', quantity: 1, unitPrice: 1500, fallbackTaxRate: 0 };
const planFee: CalcLine = { lineType: 'plan', productId: null, productType: null, quantity: 1, unitPrice: 500, fallbackTaxRate: 0 };

const rule = (overrides: Partial<TaxRule>): TaxRule => ({
  id: 1,
  name: 'GST',
  rate: 18,
  appliesTo: 'all',
  productType: null,
  productId: null,
  region: null,
  ...overrides,
});

const discount = (overrides: Partial<DiscountRule>): DiscountRule => ({
  id: 1,
  name: 'Promo',
  discountType: 'percentage',
  value: 10,
  minPurchase: 0,
  minQuantity: 0,
  scope: 'subscription',
  productIds: [],
  ...overrides,
});

describe('resolveTaxRate', () => {
  it('falls back to the line rate when no rule matches', () => {
    expect(resolveTaxRate({ ...software, fallbackTaxRate: 5 }, [], null)).toEqual({ rate: 5, ruleIds: [] });
  });

  it('prefers product rules over product type rules over global rules', () => {
    const rules = [rule({ id: 1, rate: 18 }), rule({ id: 2, rate: 12, appliesTo: 'product_type', productType: 'service' }), rule({ id: 3, rate: 5, appliesTo: 'product', productId: 2 })];
    expect(resolveTaxRate(software, rules, null).rate).toBe(18);
    expect(resolveTaxRate({ ...support, productId: 99 }, rules, null).rate).toBe(12);
    expect(resolveTaxRate(support, rules, null)).toEqual({ rate: 5, ruleIds: [3] });
  });

  it('adds up rules at the same level (CGST + SGST) and applies regional rules only in their region', () => {
    const rules = [rule({ id: 1, name: 'IGST', rate: 18 }), rule({ id: 2, name: 'CGST', rate: 9, region: 'KA' }), rule({ id: 3, name: 'SGST', rate: 9, region: 'ka' })];
    expect(resolveTaxRate(software, rules, 'KA')).toEqual({ rate: 18, ruleIds: [2, 3] });
    expect(resolveTaxRate(software, rules, 'MH')).toEqual({ rate: 18, ruleIds: [1] });
    expect(resolveTaxRate(software, [rules[1]], null).rate).toBe(0);
  });
});

describe('allocate', () => {
  it('splits proportionally and never loses a paisa', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(1000, [3000, 1000])).toEqual([750, 250]);
    expect(allocate(0, [5, 5])).toEqual([0, 0]);
    const shares = allocate(9999, [12345, 6789, 1]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(9999);
  });
});

describe('calculateInvoice', () => {
  it('computes subtotal, tax and grand total from tax rules', () => {
    const result = calculateInvoice([planFee, software], [], [rule({})], null);
    expect(result.subtotal).toBe(26100);
    expect(result.taxTotal).toBe(4698);
    expect(result.grandTotal).toBe(30798);
    expect(result.lines.map((l) => l.taxRate)).toEqual([18, 18]);
  });

  it('applies a percentage discount to the whole subscription before tax', () => {
    const result = calculateInvoice([software, support], [discount({ value: 10 })], [rule({})], null);
    // subtotal 27100, discount 2710, taxable 24390, tax 4390.20
    expect(result).toMatchObject({ subtotal: 27100, discountTotal: 2710, taxTotal: 4390.2, grandTotal: 28780.2 });
    expect(result.appliedDiscounts).toEqual([{ discountId: 1, name: 'Promo', amount: 2710 }]);
    expect(result.lines[0].discountAmount + result.lines[1].discountAmount).toBe(2710);
  });

  it('applies product-scoped discounts only to matching products', () => {
    const result = calculateInvoice([software, support], [discount({ scope: 'product', productIds: [2], discountType: 'fixed_amount', value: 500 })], [], null);
    expect(result.lines[0].discountAmount).toBe(0);
    expect(result.lines[1]).toMatchObject({ discountAmount: 500, total: 1000 });
    expect(result.grandTotal).toBe(26600);
  });

  it('caps fixed discounts at the amount being discounted', () => {
    const result = calculateInvoice([support], [discount({ discountType: 'fixed_amount', value: 99999 })], [], null);
    expect(result.discountTotal).toBe(1500);
    expect(result.grandTotal).toBe(0);
  });

  it('respects minimum purchase and minimum quantity thresholds', () => {
    const minPurchase = discount({ id: 1, minPurchase: 50000 });
    const minQuantity = discount({ id: 2, minQuantity: 12 });
    expect(calculateInvoice([software, support], [minPurchase, minQuantity], [], null).appliedDiscounts).toEqual([]);
    const productQty = discount({ id: 3, scope: 'product', productIds: [1], minQuantity: 10 });
    expect(calculateInvoice([software, support], [productQty], [], null).appliedDiscounts).toHaveLength(1);
  });

  it('stacks product discounts first, then subscription discounts on what is left', () => {
    const product = discount({ id: 2, scope: 'product', productIds: [1], value: 50 });
    const whole = discount({ id: 1, discountType: 'fixed_amount', value: 1000 });
    const result = calculateInvoice([software, support], [whole, product], [], null);
    expect(result.appliedDiscounts.map((d) => d.discountId)).toEqual([2, 1]);
    expect(result.discountTotal).toBe(12800 + 1000);
    expect(result.grandTotal).toBe(27100 - 13800);
  });
});
