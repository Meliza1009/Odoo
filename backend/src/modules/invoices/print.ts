const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const money = (value: number) => `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface PrintableInvoice {
  invoiceNumber: string;
  subscriptionNumber: string;
  status: string;
  isOverdue: boolean;
  customerName: string;
  customerEmail: string | null;
  billingAddress: string | null;
  taxNumber: string | null;
  invoiceDate: string;
  dueDate: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  amountPaid: number;
  amountDue: number;
  lines: { description: string; quantity: number; unitPrice: number; discountAmount: number; taxRate: number; total: number }[];
  discounts: { name: string; amount: number }[];
}

/** Self-contained, print-friendly HTML invoice (used for Print and Download). */
export function renderInvoiceHtml(inv: PrintableInvoice): string {
  const status = inv.isOverdue ? 'OVERDUE' : inv.status.toUpperCase();
  const rows = inv.lines
    .map(
      (l) => `<tr><td>${escapeHtml(l.description)}</td><td class="r">${l.quantity}</td><td class="r">${money(l.unitPrice)}</td>
      <td class="r">${l.discountAmount ? `-${money(l.discountAmount)}` : '-'}</td><td class="r">${l.taxRate}%</td><td class="r">${money(l.total)}</td></tr>`,
    )
    .join('');
  const discounts = inv.discounts.map((d) => `<div class="muted">${escapeHtml(d.name)}: -${money(d.amount)}</div>`).join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(inv.invoiceNumber)}</title>
<style>
  body { font-family: Inter, system-ui, sans-serif; color: #1f2937; margin: 40px; }
  h1 { color: #14213d; margin: 0; } .accent { color: #00bfa6; } .muted { color: #6b7280; font-size: 13px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
  .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; background: #14213d; color: #fff; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 24px; } th, td { padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: left; }
  th { background: #f6f8fa; font-size: 12px; text-transform: uppercase; color: #6b7280; } .r { text-align: right; }
  .totals { margin-left: auto; width: 320px; margin-top: 16px; } .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
  .grand { font-weight: 700; font-size: 18px; border-top: 2px solid #14213d; margin-top: 6px; padding-top: 8px !important; }
  @media print { body { margin: 16px; } }
</style></head>
<body>
  <div class="head">
    <div><h1>Bright<span class="accent">loop</span></h1><div class="muted">Brightloop Software</div></div>
    <div style="text-align:right"><h2 style="margin:0">Invoice ${escapeHtml(inv.invoiceNumber)}</h2><span class="badge">${status}</span>
      <div class="muted">Subscription ${escapeHtml(inv.subscriptionNumber)}</div></div>
  </div>
  <div class="head">
    <div><strong>Bill to</strong><div>${escapeHtml(inv.customerName)}</div><div class="muted">${escapeHtml(inv.billingAddress)}</div>
      <div class="muted">${escapeHtml(inv.customerEmail)}</div>${inv.taxNumber ? `<div class="muted">Tax no: ${escapeHtml(inv.taxNumber)}</div>` : ''}</div>
    <div style="text-align:right"><div>Invoice date: ${escapeHtml(inv.invoiceDate)}</div><div>Due date: ${escapeHtml(inv.dueDate)}</div>
      <div class="muted">Period: ${escapeHtml(inv.billingPeriodStart)} to ${escapeHtml(inv.billingPeriodEnd)}</div></div>
  </div>
  <table><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Discount</th><th class="r">Tax</th><th class="r">Amount</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <div class="totals">
    <div><span>Subtotal</span><span>${money(inv.subtotal)}</span></div>
    <div><span>Discounts</span><span>-${money(inv.discountTotal)}</span></div>${discounts}
    <div><span>Tax</span><span>${money(inv.taxTotal)}</span></div>
    <div class="grand"><span>Total</span><span>${money(inv.grandTotal)}</span></div>
    <div><span>Paid</span><span>${money(inv.amountPaid)}</span></div>
    <div><strong>Amount due</strong><strong>${money(inv.amountDue)}</strong></div>
  </div>
</body></html>`;
}
