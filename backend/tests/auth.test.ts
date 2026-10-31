import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { outbox } from '../src/lib/mailer.js';
import { api, closeDatabase, createCustomer, resetDatabase } from './helpers.js';

const PASSWORD = 'Str0ng!Pass';

beforeAll(resetDatabase);
afterAll(closeDatabase);

describe('registration', () => {
  it('creates a customer account with a linked customer record and returns a session', async () => {
    const res = await api().post('/api/auth/register').send({
      fullName: 'Priya Nair',
      email: 'Priya@Example.com',
      password: PASSWORD,
      companyName: 'Green Leaf Store',
      phone: '+91 98450 11001',
    });
    expect(res.status).toBe(201);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user).toMatchObject({ email: 'priya@example.com', fullName: 'Priya Nair', role: 'customer', isActive: true });
    expect(res.body.user.customer).toMatchObject({ companyName: 'Green Leaf Store', contactName: 'Priya Nair', email: 'priya@example.com' });

    const me = await api().get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(res.body.user.id);
  });

  it('claims a customer record staff created earlier with the same email', async () => {
    const customerId = await createCustomer('Apex Manufacturing');
    await pool.query(`UPDATE customers SET email = 'apex@example.com' WHERE id = $1`, [customerId]);
    const res = await api().post('/api/auth/register').send({ fullName: 'Rahul Mehta', email: 'apex@example.com', password: PASSWORD });
    expect(res.status).toBe(201);
    expect(res.body.user.customer.id).toBe(customerId);
    expect(res.body.user.customer.companyName).toBe('Apex Manufacturing');
  });

  it('rejects duplicate emails and weak passwords', async () => {
    const dup = await api().post('/api/auth/register').send({ fullName: 'Again', email: 'priya@example.com', password: PASSWORD });
    expect(dup.status).toBe(409);
    const weak = await api().post('/api/auth/register').send({ fullName: 'Weak', email: 'weak@example.com', password: 'password' });
    expect(weak.status).toBe(400);
    expect(weak.body.error).toMatch(/at least 9 characters/);
  });
});

describe('login', () => {
  it('signs in with the right password, case-insensitively on email', async () => {
    const res = await api().post('/api/auth/login').send({ email: 'PRIYA@example.com', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('priya@example.com');
  });

  it('uses one generic message for a wrong password and an unknown email', async () => {
    const wrong = await api().post('/api/auth/login').send({ email: 'priya@example.com', password: 'Wrong!Pass1' });
    const unknown = await api().post('/api/auth/login').send({ email: 'nobody@example.com', password: PASSWORD });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toBe(unknown.body.error);
  });

  it('blocks deactivated accounts and rejects their existing tokens', async () => {
    const login = await api().post('/api/auth/login').send({ email: 'priya@example.com', password: PASSWORD });
    await pool.query(`UPDATE users SET is_active = FALSE WHERE email = 'priya@example.com'`);
    const blocked = await api().post('/api/auth/login').send({ email: 'priya@example.com', password: PASSWORD });
    expect(blocked.status).toBe(401);
    expect(blocked.body.error).toMatch(/deactivated/);
    const me = await api().get('/api/auth/me').set('Authorization', `Bearer ${login.body.token}`);
    expect(me.status).toBe(401);
    await pool.query(`UPDATE users SET is_active = TRUE WHERE email = 'priya@example.com'`);
  });

  it('rate-limits repeated failed attempts for the same account', async () => {
    let last = 0;
    for (let i = 0; i < 11; i += 1) {
      last = (await api().post('/api/auth/login').send({ email: 'limited@example.com', password: 'Wrong!Pass1' })).status;
    }
    expect(last).toBe(429);
  });
});

describe('profile & password', () => {
  let token: string;

  beforeAll(async () => {
    token = (await api().post('/api/auth/login').send({ email: 'priya@example.com', password: PASSWORD })).body.token;
  });

  it('updates the account name and customer details', async () => {
    const res = await api()
      .put('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Priya N.', companyName: 'Green Leaf Stores Pvt Ltd', phone: '+91 1', billingAddress: '12 MG Road', taxNumber: 'GST123' });
    expect(res.status).toBe(200);
    expect(res.body.user.fullName).toBe('Priya N.');
    expect(res.body.user.customer).toMatchObject({ companyName: 'Green Leaf Stores Pvt Ltd', billingAddress: '12 MG Road', taxNumber: 'GST123' });
  });

  it('changes the password only when the current one is correct', async () => {
    const bad = await api().put('/api/auth/me/password').set('Authorization', `Bearer ${token}`).send({ currentPassword: 'nope', newPassword: 'N3w!Passw0rd' });
    expect(bad.status).toBe(400);
    const ok = await api().put('/api/auth/me/password').set('Authorization', `Bearer ${token}`).send({ currentPassword: PASSWORD, newPassword: 'N3w!Passw0rd' });
    expect(ok.status).toBe(204);
    expect((await api().post('/api/auth/login').send({ email: 'priya@example.com', password: 'N3w!Passw0rd' })).status).toBe(200);
  });

  it('logs out', async () => {
    expect((await api().post('/api/auth/logout').set('Authorization', `Bearer ${token}`)).status).toBe(204);
  });
});

describe('password reset', () => {
  it('emails a one-time link, answers the same for unknown emails, and lets the link be used once', async () => {
    const before = outbox.length;
    const unknown = await api().post('/api/auth/forgot-password').send({ email: 'ghost@example.com' });
    expect(unknown.status).toBe(202);
    expect(outbox.length).toBe(before);

    const known = await api().post('/api/auth/forgot-password').send({ email: 'apex@example.com' });
    expect(known.status).toBe(202);
    expect(known.body.message).toBe(unknown.body.message);
    const mail = outbox.at(-1)!;
    expect(mail.to).toBe('apex@example.com');
    const token = /token=([a-f0-9]+)/.exec(mail.text)![1];

    const reset = await api().post('/api/auth/reset-password').send({ token, password: 'Res3t!Passw0rd' });
    expect(reset.status).toBe(200);
    expect(reset.body.user.email).toBe('apex@example.com');
    expect((await api().post('/api/auth/login').send({ email: 'apex@example.com', password: 'Res3t!Passw0rd' })).status).toBe(200);

    const reuse = await api().post('/api/auth/reset-password').send({ token, password: 'An0ther!Pass' });
    expect(reuse.status).toBe(400);
  });

  it('rejects expired links', async () => {
    await api().post('/api/auth/forgot-password').send({ email: 'apex@example.com' });
    const token = /token=([a-f0-9]+)/.exec(outbox.at(-1)!.text)![1];
    await pool.query(`UPDATE password_reset_tokens SET expires_at = now() - interval '1 minute' WHERE used_at IS NULL`);
    const res = await api().post('/api/auth/reset-password').send({ token, password: 'An0ther!Pass' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/);
  });
});
