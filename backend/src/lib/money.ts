/** Money is calculated in integer paise to avoid floating point drift, then converted back to rupees. */
export const toPaise = (rupees: number) => Math.round(rupees * 100);
export const toRupees = (paise: number) => paise / 100;

export interface LineAmounts {
  subtotal: number;
  taxAmount: number;
  total: number;
}

export function lineAmounts(quantity: number, unitPrice: number, taxRate: number): LineAmounts {
  const subtotal = quantity * toPaise(unitPrice);
  const tax = Math.round((subtotal * taxRate) / 100);
  return { subtotal: toRupees(subtotal), taxAmount: toRupees(tax), total: toRupees(subtotal + tax) };
}

export function sumAmounts(lines: LineAmounts[]): LineAmounts {
  const subtotal = lines.reduce((sum, l) => sum + toPaise(l.subtotal), 0);
  const tax = lines.reduce((sum, l) => sum + toPaise(l.taxAmount), 0);
  return { subtotal: toRupees(subtotal), taxAmount: toRupees(tax), total: toRupees(subtotal + tax) };
}
