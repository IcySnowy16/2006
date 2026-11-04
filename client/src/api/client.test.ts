/** Task K9: the API layer turns every answer into data or an ApiError with a catalog code. */
import { describe, expect, it } from 'vitest';
import { apiError, http, HttpResponse, server } from '../test/server';
import { ApiError, call, errorMessage, isCode } from './client';

describe('call()', () => {
  it('builds the path from :params, sends the JSON body and returns the parsed answer', async () => {
    let seen: { url: string; body: unknown; method: string } | null = null;
    server.use(
      http.post('*/api/bookings/:id/accept', async ({ request, params }) => {
        seen = { url: new URL(request.url).pathname, body: await request.text(), method: request.method };
        return HttpResponse.json({ id: params.id });
      }),
    );
    const out = await call('bookings.accept', { params: { id: 'b 1' } });
    expect(out).toEqual({ id: 'b 1' });
    expect(seen).toMatchObject({ url: '/api/bookings/b%201/accept', method: 'POST' });
  });

  it('puts the query in the URL for a GET', async () => {
    let search = '';
    server.use(
      http.get(
        '*/api/bookings/preview',
        ({ request }) => ((search = new URL(request.url).search), HttpResponse.json({ fareCents: 300, check: 'ENOUGH', availableCents: 900 })),
      ),
    );
    await call('bookings.preview', { query: { journeyId: 'j1' } });
    expect(search).toBe('?journeyId=j1');
  });

  it('a 204 answer is undefined, not a parse error', async () => {
    server.use(http.post('*/api/auth/logout', () => new HttpResponse(null, { status: 204 })));
    expect(await call('auth.logout')).toBeUndefined();
  });

  it('a failed answer is an ApiError with the code, message and request id from the standard body', async () => {
    server.use(http.post('*/api/bookings', () => apiError(409, 'SEAT_UNAVAILABLE', 'No seats are left on this journey.')));
    const err = await call('bookings.create', { body: { journeyId: 'j', pickupPointId: 'p', dropoffPointId: 'd' } }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: 'SEAT_UNAVAILABLE', status: 409, requestId: 'test', message: 'No seats are left on this journey.' });
    expect(isCode(err, 'SEAT_UNAVAILABLE')).toBe(true);
    expect(isCode(err, 'FORBIDDEN')).toBe(false);
    expect(errorMessage(err)).toBe('No seats are left on this journey.');
  });

  it('an answer that is not the standard error shape becomes INTERNAL_ERROR with a safe message', async () => {
    server.use(http.get('*/api/wallet', () => new HttpResponse('<html>bad gateway</html>', { status: 502 })));
    const err = await call('wallet.get').catch((e) => e);
    expect(err).toMatchObject({ code: 'INTERNAL_ERROR', status: 502 });
    expect(err.message).not.toContain('html');
  });

  it('no connection is NETWORK_ERROR with a plain message', async () => {
    server.use(http.get('*/api/wallet', () => HttpResponse.error()));
    const err = await call('wallet.get').catch((e) => e);
    expect(err).toMatchObject({ code: 'NETWORK_ERROR', status: 0 });
    expect(errorMessage(err)).toMatch(/Cannot reach the server/);
  });

  it('a missing path parameter is a programming error, caught before any request is sent', async () => {
    await expect(call('bookings.accept', {} as never)).rejects.toThrow(/Missing path parameter "id"/);
  });

  it('errorMessage never shows a raw error to a person', () => {
    expect(errorMessage(new Error('TypeError: x is undefined at line 4'))).toBe('Something went wrong. Please try again.');
  });
});
