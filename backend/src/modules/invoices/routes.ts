import { Router } from 'express';
import { z } from 'zod';
import { idParamSchema } from '../../lib/validation.js';
import { authenticate, currentUser, requireInternal } from '../../middleware/auth.js';
import { renderInvoiceHtml } from './print.js';
import { listInvoicesQuery, paymentInput, reasonInput } from './schemas.js';
import { cancelInvoice, confirmInvoice, getInvoice, listInvoicePayments, listInvoices, recordPayment, sendInvoice } from './service.js';

export const invoicesRouter = Router();
invoicesRouter.use(authenticate);

invoicesRouter.get('/', async (req, res) => {
  res.json(await listInvoices(currentUser(req), listInvoicesQuery.parse(req.query)));
});

invoicesRouter.get('/:id', async (req, res) => {
  res.json(await getInvoice(idParamSchema.parse(req.params).id, currentUser(req)));
});

/** Print-friendly HTML. `?download=1` serves it as a file attachment. Customers can print their own invoices. */
invoicesRouter.get('/:id/print', async (req, res) => {
  const invoice = await getInvoice(idParamSchema.parse(req.params).id, currentUser(req));
  const { download } = z.object({ download: z.enum(['1', 'true']).optional() }).parse(req.query);
  if (download) res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.html"`);
  res.type('html').send(renderInvoiceHtml(invoice));
});

invoicesRouter.get('/:id/payments', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  await getInvoice(id, currentUser(req));
  res.json({ data: await listInvoicePayments(id) });
});

invoicesRouter.post('/:id/confirm', requireInternal, async (req, res) => {
  res.json(await confirmInvoice(idParamSchema.parse(req.params).id, currentUser(req)));
});

invoicesRouter.post('/:id/cancel', requireInternal, async (req, res) => {
  const { reason } = reasonInput.parse(req.body ?? {});
  res.json(await cancelInvoice(idParamSchema.parse(req.params).id, currentUser(req), reason));
});

invoicesRouter.post('/:id/send', requireInternal, async (req, res) => {
  res.json(await sendInvoice(idParamSchema.parse(req.params).id, currentUser(req)));
});

invoicesRouter.post('/:id/payments', requireInternal, async (req, res) => {
  const result = await recordPayment(idParamSchema.parse(req.params).id, paymentInput.parse(req.body), currentUser(req));
  res.status(201).json(result);
});
