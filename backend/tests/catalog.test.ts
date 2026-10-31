import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, closeDatabase, createUser, resetDatabase, type TestUser } from './helpers.js';

let admin: TestUser;
let staff: TestUser;
let customer: TestUser;

beforeAll(async () => {
  await resetDatabase();
  [admin, staff, customer] = await Promise.all([createUser('admin'), createUser('staff'), createUser('customer')]);
});
afterAll(closeDatabase);

describe('products & variants', () => {
  let productId: number;

  it('lets the admin create a product with an Odoo brand variant that adds 560', async () => {
    const res = await api()
      .post('/api/products')
      .set(admin.auth)
      .send({
        name: 'Business Software',
        type: 'software',
        salesPrice: 2000,
        costPrice: 600,
        notes: 'Per seat',
        variants: [{ attribute: 'Brand', value: 'Odoo', extraPrice: 560 }],
      });
    expect(res.status).toBe(201);
    productId = res.body.id;
    expect(res.body).toMatchObject({ name: 'Business Software', type: 'software', salesPrice: 2000, costPrice: 600, notes: 'Per seat' });
    expect(res.body.variants).toHaveLength(1);
    expect(res.body.variants[0]).toMatchObject({ attribute: 'Brand', value: 'Odoo', extraPrice: 560, finalPrice: 2560 });
  });

  it('adds, updates and archives variants', async () => {
    const added = await api().post(`/api/products/${productId}/variants`).set(admin.auth).send({ attribute: 'Brand', value: 'Standard', extraPrice: 0 });
    expect(added.status).toBe(201);
    const standard = added.body.variants.find((v: { value: string }) => v.value === 'Standard');
    expect(standard.finalPrice).toBe(2000);

    const updated = await api()
      .put(`/api/products/${productId}/variants/${standard.id}`)
      .set(admin.auth)
      .send({ attribute: 'Brand', value: 'Standard', extraPrice: 100 });
    expect(updated.status).toBe(200);
    expect(updated.body.variants.find((v: { id: number }) => v.id === standard.id).finalPrice).toBe(2100);

    const archived = await api().delete(`/api/products/${productId}/variants/${standard.id}`).set(admin.auth);
    expect(archived.body.variants.find((v: { id: number }) => v.id === standard.id).isActive).toBe(false);
  });

  it('rejects duplicate variant values and duplicate product names', async () => {
    const dupVariant = await api().post(`/api/products/${productId}/variants`).set(admin.auth).send({ attribute: 'brand', value: 'odoo', extraPrice: 1 });
    expect(dupVariant.status).toBe(409);
    const dupProduct = await api().post('/api/products').set(admin.auth).send({ name: 'business software', type: 'software', salesPrice: 1 });
    expect(dupProduct.status).toBe(409);
  });

  it('validates prices and product type', async () => {
    const negative = await api().post('/api/products').set(admin.auth).send({ name: 'Bad', type: 'software', salesPrice: -5 });
    expect(negative.status).toBe(400);
    const badType = await api().post('/api/products').set(admin.auth).send({ name: 'Bad', type: 'spaceship', salesPrice: 5 });
    expect(badType.status).toBe(400);
    const missingName = await api().post('/api/products').set(admin.auth).send({ type: 'software', salesPrice: 5 });
    expect(missingName.status).toBe(400);
  });

  it('lets staff read but not change products; blocks customers and anonymous users', async () => {
    expect((await api().get('/api/products').set(staff.auth)).status).toBe(200);
    expect((await api().post('/api/products').set(staff.auth).send({ name: 'X', type: 'addon', salesPrice: 1 })).status).toBe(403);
    expect((await api().get('/api/products').set(customer.auth)).status).toBe(403);
    expect((await api().get('/api/products')).status).toBe(401);
  });

  it('lists with search, pagination and hides archived products by default', async () => {
    await api().post('/api/products').set(admin.auth).send({ name: 'Analytics Add-on', type: 'addon', salesPrice: 750 });
    const temp = await api().post('/api/products').set(admin.auth).send({ name: 'Old Product', type: 'goods', salesPrice: 10 });
    expect((await api().delete(`/api/products/${temp.body.id}`).set(admin.auth)).status).toBe(204);

    const list = await api().get('/api/products?pageSize=10').set(staff.auth);
    expect(list.body.total).toBe(2);
    expect(list.body.data.map((p: { name: string }) => p.name)).not.toContain('Old Product');

    const withInactive = await api().get('/api/products?includeInactive=true').set(staff.auth);
    expect(withInactive.body.total).toBe(3);

    const search = await api().get('/api/products?q=analytics').set(staff.auth);
    expect(search.body.data).toHaveLength(1);
    expect(search.body.data[0].name).toBe('Analytics Add-on');
  });

  it('updates a product', async () => {
    const res = await api()
      .put(`/api/products/${productId}`)
      .set(admin.auth)
      .send({ name: 'Business Software', type: 'software', salesPrice: 2200, costPrice: 600, notes: null });
    expect(res.status).toBe(200);
    expect(res.body.salesPrice).toBe(2200);
    expect(res.body.variants.find((v: { value: string }) => v.value === 'Odoo').finalPrice).toBe(2760);
  });
});

describe('plans', () => {
  const plan = {
    name: 'Starter Monthly',
    billingInterval: 'monthly',
    price: 499,
    minQuantity: 1,
    startDate: '2026-01-01',
    endDate: '2027-12-31',
    autoCloseOnExpiry: true,
    canCloseEarly: false,
    canPause: true,
    canRenew: true,
  };

  it('creates a plan with all behaviour flags', async () => {
    const res = await api().post('/api/plans').set(admin.auth).send(plan);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject(plan);
  });

  it('accepts every billing interval and rejects unknown ones', async () => {
    for (const billingInterval of ['daily', 'weekly', 'yearly']) {
      const res = await api().post('/api/plans').set(admin.auth).send({ name: `Plan ${billingInterval}`, billingInterval, price: 10 });
      expect(res.status).toBe(201);
    }
    const bad = await api().post('/api/plans').set(admin.auth).send({ name: 'Plan hourly', billingInterval: 'hourly', price: 10 });
    expect(bad.status).toBe(400);
  });

  it('rejects an end date before the start date and a zero minimum quantity', async () => {
    const dates = await api().post('/api/plans').set(admin.auth).send({ ...plan, name: 'Bad dates', startDate: '2026-05-01', endDate: '2026-04-01' });
    expect(dates.status).toBe(400);
    expect(dates.body.error).toMatch(/end date/i);
    const minQty = await api().post('/api/plans').set(admin.auth).send({ ...plan, name: 'Bad qty', minQuantity: 0 });
    expect(minQty.status).toBe(400);
  });

  it('filters plans by availability date and interval; only admin can edit', async () => {
    const available = await api().get('/api/plans?availableOn=2028-06-01&pageSize=50').set(staff.auth);
    expect(available.body.data.map((p: { name: string }) => p.name)).not.toContain('Starter Monthly');
    const monthly = await api().get('/api/plans?billingInterval=monthly').set(staff.auth);
    expect(monthly.body.data.every((p: { billingInterval: string }) => p.billingInterval === 'monthly')).toBe(true);
    expect((await api().post('/api/plans').set(staff.auth).send({ ...plan, name: 'Staff plan' })).status).toBe(403);
  });
});

describe('quotation templates', () => {
  it('creates a template with plan, product lines and validity, and estimates the total', async () => {
    const products = await api().get('/api/products?q=business').set(admin.auth);
    const product = await api().get(`/api/products/${products.body.data[0].id}`).set(admin.auth);
    const odoo = product.body.variants.find((v: { value: string }) => v.value === 'Odoo');
    const plans = await api().get('/api/plans?q=starter').set(admin.auth);

    const res = await api()
      .post('/api/quotation-templates')
      .set(admin.auth)
      .send({
        name: 'Odoo Starter Bundle',
        planId: plans.body.data[0].id,
        validityDays: 15,
        contractPeriods: 12,
        lines: [{ productId: product.body.id, variantId: odoo.id, quantity: 2, taxRate: 18 }],
      });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Odoo Starter Bundle', validityDays: 15, contractPeriods: 12, planName: 'Starter Monthly' });
    expect(res.body.lines[0]).toMatchObject({ quantity: 2, effectiveUnitPrice: 2760, variantLabel: 'Brand: Odoo' });
    // 2 x 2760 = 5520 + 18% = 6513.60, plus the 499 plan fee
    expect(res.body.estimatedTotal).toBe(7012.6);
  });

  it('rejects invalid validity and variants that belong to another product', async () => {
    const plans = await api().get('/api/plans?q=starter').set(admin.auth);
    const products = await api().get('/api/products?pageSize=10').set(admin.auth);
    const business = products.body.data.find((p: { name: string }) => p.name === 'Business Software');
    const addon = products.body.data.find((p: { name: string }) => p.name === 'Analytics Add-on');
    const detail = await api().get(`/api/products/${business.id}`).set(admin.auth);

    const badValidity = await api().post('/api/quotation-templates').set(admin.auth).send({ name: 'Bad', planId: plans.body.data[0].id, validityDays: 0 });
    expect(badValidity.status).toBe(400);

    const wrongVariant = await api()
      .post('/api/quotation-templates')
      .set(admin.auth)
      .send({ name: 'Bad variant', planId: plans.body.data[0].id, validityDays: 10, lines: [{ productId: addon.id, variantId: detail.body.variants[0].id, quantity: 1 }] });
    expect(wrongVariant.status).toBe(400);
  });

  it('lets staff read templates but not create them', async () => {
    expect((await api().get('/api/quotation-templates').set(staff.auth)).body.total).toBe(1);
    expect((await api().post('/api/quotation-templates').set(staff.auth).send({ name: 'X', planId: 1, validityDays: 5 })).status).toBe(403);
  });
});
