/**
 * Tasks A2 and A3: registration, verification and login, with the rule each test proves in its name (UC-1, UC-2).
 * Real PostgreSQL, fake e-mail, a FakeClock. These are the "Test Input / Expected / Actual" rows for X4.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { minutes } from '../src/core/clock';
import { prisma } from '../src/core/prisma';
import { SESSION_COOKIE } from '../src/auth/session';
import { expectError, makeUser, registerBody, TEST_PASSWORD } from './helpers';
import { makeTestApp } from './helpers/app';

async function register(t: ReturnType<typeof makeTestApp>, over = {}) {
  const body = registerBody(over);
  const res = await request(t.app).post('/api/auth/register').send(body);
  return { body, res };
}

describe('UC-1 Register and verify', () => {
  it('registers, e-mails a 6-digit code, and the account is inactive until the code is entered', async () => {
    const t = makeTestApp();
    const { body, res } = await register(t);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ userId: expect.any(String) });
    const user = await prisma().user.findUniqueOrThrow({ where: { ntuEmail: body.ntuEmail } });
    expect(user.accountStatus).toBe('PENDING_VERIFICATION');
    expect(t.adapters.email.lastCodeFor(body.ntuEmail)).toMatch(/^\d{6}$/);
    const login = await request(t.app).post('/api/auth/login').send({ ntuEmail: body.ntuEmail, password: body.password });
    expectError(login, 'EMAIL_NOT_VERIFIED');
  });

  it('UC-1.EX.1: a non-NTU domain is EMAIL_DOMAIN_NOT_ALLOWED and no account is created', async () => {
    const t = makeTestApp();
    const { res } = await register(t, { ntuEmail: 'someone@gmail.com' });
    expectError(res, 'EMAIL_DOMAIN_NOT_ALLOWED');
    expect(await prisma().user.count()).toBe(0);
    expect(t.adapters.email.sent).toHaveLength(0);
  });

  it('both NTU domains are accepted', async () => {
    const t = makeTestApp();
    expect((await register(t, { ntuEmail: 'a1@e.ntu.edu.sg' })).res.status).toBe(201);
    expect((await register(t, { ntuEmail: 'a2@ntu.edu.sg' })).res.status).toBe(201);
  });

  it('UC-1.AC.1: a duplicate e-mail is EMAIL_TAKEN', async () => {
    const t = makeTestApp();
    const first = await register(t);
    const second = await register(t, { ntuEmail: first.body.ntuEmail });
    expectError(second.res, 'EMAIL_TAKEN');
  });

  it('the e-mail is matched case-insensitively (stored lower case)', async () => {
    const t = makeTestApp();
    await register(t, { ntuEmail: 'Mixed.Case@E.NTU.EDU.SG' });
    expect(await prisma().user.count({ where: { ntuEmail: 'mixed.case@e.ntu.edu.sg' } })).toBe(1);
  });

  it('a phone number typed with spaces and a plus is accepted and stored without them (grill Q5)', async () => {
    const t = makeTestApp();
    const { body, res } = await register(t, { phone: '+65 9123-4567' });
    expect(res.status).toBe(201);
    expect((await prisma().user.findUniqueOrThrow({ where: { ntuEmail: body.ntuEmail } })).phone).toBe('+6591234567');
  });

  it('FR 1.5: role BOTH holds both roles; DRIVER only the driver role; every user gets a wallet with balance 0', async () => {
    const t = makeTestApp();
    const both = await register(t, { role: 'BOTH' });
    const driver = await register(t, { role: 'DRIVER' });
    const u1 = await prisma().user.findUniqueOrThrow({ where: { ntuEmail: both.body.ntuEmail }, include: { wallet: true } });
    const u2 = await prisma().user.findUniqueOrThrow({ where: { ntuEmail: driver.body.ntuEmail }, include: { wallet: true } });
    expect([u1.isDriver, u1.isPassenger]).toEqual([true, true]);
    expect([u2.isDriver, u2.isPassenger]).toEqual([true, false]);
    expect(u1.wallet).toMatchObject({ balanceCents: 0, heldCents: 0 });
    expect(u2.wallet).not.toBeNull();
  });

  it('the password is stored as a bcrypt hash, the code as a hash, and nothing in the response reveals either', async () => {
    const t = makeTestApp();
    const { body, res } = await register(t);
    const user = await prisma().user.findUniqueOrThrow({ where: { ntuEmail: body.ntuEmail }, include: { verifications: true } });
    expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(user.passwordHash).not.toContain(body.password);
    const code = t.adapters.email.lastCodeFor(body.ntuEmail)!;
    expect(user.verifications[0]?.codeHash).not.toContain(code);
    expect(JSON.stringify(res.body)).not.toMatch(/hash|code|password/i);
  });

  it('FR 1.2: if the e-mail cannot be sent the answer is EXTERNAL_SERVICE_UNAVAILABLE, and a resend works afterwards', async () => {
    const t = makeTestApp();
    t.adapters.email.failNext();
    const { body, res } = await register(t);
    expectError(res, 'EXTERNAL_SERVICE_UNAVAILABLE');
    const resend = await request(t.app).post('/api/auth/resend').send({ ntuEmail: body.ntuEmail });
    expect(resend.status).toBe(204);
    expect(t.adapters.email.lastCodeFor(body.ntuEmail)).toMatch(/^\d{6}$/);
  });

  it('FR 1.3: the right code activates the account and the user can log in', async () => {
    const t = makeTestApp();
    const { body } = await register(t);
    const verify = await request(t.app)
      .post('/api/auth/verify')
      .send({ ntuEmail: body.ntuEmail, code: t.adapters.email.lastCodeFor(body.ntuEmail) });
    expect(verify.status).toBe(204);
    expect((await prisma().user.findUniqueOrThrow({ where: { ntuEmail: body.ntuEmail } })).accountStatus).toBe('ACTIVE');
    const login = await request(t.app).post('/api/auth/login').send({ ntuEmail: body.ntuEmail, password: body.password });
    expect(login.status).toBe(200);
    expect(login.body.accountStatus).toBe('ACTIVE');
  });

  it('UC-1.EX.2: wrong code 1, 2, 3 times gives INVALID, INVALID, then ATTEMPTS_EXCEEDED; the right code is then refused until a resend', async () => {
    const t = makeTestApp();
    const { body } = await register(t);
    const good = t.adapters.email.lastCodeFor(body.ntuEmail)!;
    const wrong = good === '000000' ? '111111' : '000000';
    const attempt = (code: string) => request(t.app).post('/api/auth/verify').send({ ntuEmail: body.ntuEmail, code });
    expectError(await attempt(wrong), 'VERIFICATION_CODE_INVALID');
    expectError(await attempt(wrong), 'VERIFICATION_CODE_INVALID');
    expectError(await attempt(wrong), 'CODE_ATTEMPTS_EXCEEDED');
    expectError(await attempt(good), 'CODE_ATTEMPTS_EXCEEDED'); // even the right one
    await request(t.app).post('/api/auth/resend').send({ ntuEmail: body.ntuEmail });
    const fresh = t.adapters.email.lastCodeFor(body.ntuEmail)!;
    expect((await attempt(fresh)).status).toBe(204);
  });

  it('UC-1.EX.2: guesses sent in parallel are still capped at 3 (the attempt is spent before the comparison)', async () => {
    const t = makeTestApp();
    const { body } = await register(t);
    const good = t.adapters.email.lastCodeFor(body.ntuEmail)!;
    const wrong = good === '000000' ? '111111' : '000000';
    const rs = await Promise.all(Array.from({ length: 8 }, () => request(t.app).post('/api/auth/verify').send({ ntuEmail: body.ntuEmail, code: wrong })));
    const codes = rs.map((r) => r.body?.code);
    // Exactly 3 guesses were compared (before the fix all 8 were); which of those 3 says "exceeded" depends on timing.
    expect(codes.filter((c) => c === 'VERIFICATION_CODE_INVALID').length).toBeLessThanOrEqual(3);
    expect(codes.filter((c) => c === 'CODE_ATTEMPTS_EXCEEDED').length).toBeGreaterThanOrEqual(5);
    expect(codes.every((c) => c === 'VERIFICATION_CODE_INVALID' || c === 'CODE_ATTEMPTS_EXCEEDED')).toBe(true);
    expectError(await request(t.app).post('/api/auth/verify').send({ ntuEmail: body.ntuEmail, code: good }), 'CODE_ATTEMPTS_EXCEEDED');
  });

  it('UC-1.EX.2: a code older than 10 minutes is refused (FakeClock +11 min), and one at 9 minutes is not', async () => {
    const t = makeTestApp();
    const a = await register(t);
    t.clock.advance(minutes(9));
    expect(
      (
        await request(t.app)
          .post('/api/auth/verify')
          .send({ ntuEmail: a.body.ntuEmail, code: t.adapters.email.lastCodeFor(a.body.ntuEmail) })
      ).status,
    ).toBe(204);
    const b = await register(t);
    t.clock.advance(minutes(11));
    expectError(
      await request(t.app)
        .post('/api/auth/verify')
        .send({ ntuEmail: b.body.ntuEmail, code: t.adapters.email.lastCodeFor(b.body.ntuEmail) }),
      'VERIFICATION_CODE_INVALID',
    );
  });

  it('a resend invalidates the old code', async () => {
    const t = makeTestApp();
    const { body } = await register(t);
    const old = t.adapters.email.lastCodeFor(body.ntuEmail)!;
    await request(t.app).post('/api/auth/resend').send({ ntuEmail: body.ntuEmail });
    const fresh = t.adapters.email.lastCodeFor(body.ntuEmail)!;
    if (old !== fresh) expectError(await request(t.app).post('/api/auth/verify').send({ ntuEmail: body.ntuEmail, code: old }), 'VERIFICATION_CODE_INVALID');
    expect((await request(t.app).post('/api/auth/verify').send({ ntuEmail: body.ntuEmail, code: fresh })).status).toBe(204);
  });

  it('verify and resend for an unknown address are NOT_FOUND; for an already verified user they do nothing', async () => {
    const t = makeTestApp();
    expectError(await request(t.app).post('/api/auth/verify').send({ ntuEmail: 'nobody@e.ntu.edu.sg', code: '123456' }), 'NOT_FOUND');
    expectError(await request(t.app).post('/api/auth/resend').send({ ntuEmail: 'nobody@e.ntu.edu.sg' }), 'NOT_FOUND');
    const u = await makeUser();
    expect((await request(t.app).post('/api/auth/resend').send({ ntuEmail: u.ntuEmail })).status).toBe(204);
    expect(t.adapters.email.sent).toHaveLength(0);
  });

  it('a malformed code is a VALIDATION_ERROR listing the field', async () => {
    const t = makeTestApp();
    const res = await request(t.app).post('/api/auth/verify').send({ ntuEmail: 'a@e.ntu.edu.sg', code: '12' });
    expect(expectError(res, 'VALIDATION_ERROR').details).toEqual([expect.objectContaining({ path: 'code' })]);
  });
});

describe('UC-2 Login', () => {
  it('sets an httpOnly, SameSite session cookie and returns me', async () => {
    const t = makeTestApp();
    const u = await makeUser({ isPassenger: true });
    const res = await request(t.app).post('/api/auth/login').send({ ntuEmail: u.ntuEmail, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(res.body).toMatchObject({ id: u.id, roles: ['PASSENGER'], activeRole: 'PASSENGER', wallet: { balanceCents: 0, heldCents: 0 } });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|ntuEmail/);
  });

  it('Secure and SameSite come from the configuration', async () => {
    const t = makeTestApp({ COOKIE_SECURE: 'true', COOKIE_SAMESITE: 'strict' });
    const u = await makeUser();
    const res = await request(t.app).post('/api/auth/login').send({ ntuEmail: u.ntuEmail, password: TEST_PASSWORD });
    expect(String(res.headers['set-cookie'])).toMatch(/Secure/i);
    expect(String(res.headers['set-cookie'])).toMatch(/SameSite=Strict/i);
  });

  it('UC-2.EX.1: a wrong password and an unknown e-mail give the SAME error', async () => {
    const t = makeTestApp();
    const u = await makeUser();
    const wrongPw = await request(t.app).post('/api/auth/login').send({ ntuEmail: u.ntuEmail, password: 'nope-nope-nope' });
    const unknown = await request(t.app).post('/api/auth/login').send({ ntuEmail: 'nobody@e.ntu.edu.sg', password: 'nope-nope-nope' });
    expectError(wrongPw, 'INVALID_CREDENTIALS');
    expectError(unknown, 'INVALID_CREDENTIALS');
    expect(wrongPw.body.message).toBe(unknown.body.message);
  });

  it('a LOCKED account can log in and sees LOCKED in me (UC-2)', async () => {
    const t = makeTestApp();
    const u = await makeUser({ accountStatus: 'LOCKED' });
    const res = await request(t.app).post('/api/auth/login').send({ ntuEmail: u.ntuEmail, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.accountStatus).toBe('LOCKED');
  });

  it('a single-role user acts in that role at once; a both-role user has none until a choice is remembered (UC-2.AC.1)', async () => {
    const t = makeTestApp();
    const driver = await makeUser({ isDriver: true, isPassenger: false });
    const both = await makeUser({ isDriver: true, isPassenger: true });
    const rememberedBoth = await makeUser({ isDriver: true, isPassenger: true, lastActiveRole: 'DRIVER' });
    const login = async (u: { ntuEmail: string }) =>
      (await request(t.app).post('/api/auth/login').send({ ntuEmail: u.ntuEmail, password: TEST_PASSWORD })).body;
    expect((await login(driver)).activeRole).toBe('DRIVER');
    expect((await login(both)).activeRole).toBeNull();
    expect((await login(rememberedBoth)).activeRole).toBe('DRIVER');
    expect((await login(both)).roles).toEqual(['DRIVER', 'PASSENGER']);
  });

  it('me works with the cookie from login; logout clears the cookie', async () => {
    const t = makeTestApp();
    const u = await makeUser();
    const agent = request.agent(t.app);
    await agent.post('/api/auth/login').send({ ntuEmail: u.ntuEmail, password: TEST_PASSWORD }).expect(200);
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.id).toBe(u.id);
    const out = await agent.post('/api/auth/logout');
    expect(out.status).toBe(204);
    expect(String(out.headers['set-cookie'])).toMatch(new RegExp(`${SESSION_COOKIE}=;`));
    expectError(await agent.get('/api/auth/me'), 'AUTH_REQUIRED');
  });

  it('no cookie is AUTH_REQUIRED; a tampered cookie is INVALID_TOKEN; an expired one is INVALID_TOKEN', async () => {
    const t = makeTestApp();
    const u = await makeUser();
    expectError(await request(t.app).get('/api/auth/me'), 'AUTH_REQUIRED');
    const good = t.cookieFor(u);
    expect((await request(t.app).get('/api/auth/me').set('Cookie', good)).status).toBe(200);
    expectError(
      await request(t.app)
        .get('/api/auth/me')
        .set('Cookie', good.slice(0, -3) + 'abc'),
      'INVALID_TOKEN',
    );
    t.clock.advance(minutes(60 * 24 * 7 + 1)); // 7 days and a minute
    expectError(await request(t.app).get('/api/auth/me').set('Cookie', good), 'INVALID_TOKEN');
  });

  it('a token for a user who no longer exists is INVALID_TOKEN', async () => {
    const t = makeTestApp();
    const u = await makeUser();
    const cookie = t.cookieFor(u);
    await prisma().user.delete({ where: { id: u.id } });
    expectError(await request(t.app).get('/api/auth/me').set('Cookie', cookie), 'INVALID_TOKEN');
  });
});

describe('NFR-2.1: rate limits (K11)', () => {
  it('the 11th login attempt within a minute is TOO_MANY_REQUESTS', async () => {
    const t = makeTestApp();
    const u = await makeUser();
    for (let i = 0; i < 10; i++) {
      const r = await request(t.app).post('/api/auth/login').send({ ntuEmail: u.ntuEmail, password: 'wrong-wrong' });
      expect(r.status).toBe(401);
    }
    expectError(await request(t.app).post('/api/auth/login').send({ ntuEmail: u.ntuEmail, password: 'wrong-wrong' }), 'TOO_MANY_REQUESTS');
  });

  it('resend allows 5 a minute', async () => {
    const t = makeTestApp();
    const u = await makeUser({ accountStatus: 'PENDING_VERIFICATION' });
    for (let i = 0; i < 5; i++) expect((await request(t.app).post('/api/auth/resend').send({ ntuEmail: u.ntuEmail })).status).toBe(204);
    expectError(await request(t.app).post('/api/auth/resend').send({ ntuEmail: u.ntuEmail }), 'TOO_MANY_REQUESTS');
  });
});

describe('K11: security headers and CORS', () => {
  it('sends helmet headers and answers the web app origin with credentials', async () => {
    const t = makeTestApp();
    const res = await request(t.app).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('only ever names the web app origin: never * and never another site (the browser blocks the rest)', async () => {
    const t = makeTestApp();
    const res = await request(t.app).get('/api/health').set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).not.toBe('*');
    expect(res.headers['access-control-allow-origin']).not.toBe('https://evil.example');
  });
});
