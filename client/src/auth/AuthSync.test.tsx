/** The signed-in state follows the server between page loads (fullstack review, 19 Oct 2026). */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { apiError, http, HttpResponse, passengerMe, server } from '../test/server';
import { renderAt } from '../test/utils';

const wallet = (debt: { amountCents: number; createdAt: string } | null, balance = 0) =>
  HttpResponse.json({ balanceCents: balance, heldCents: 0, availableCents: balance, debt, simulated: true });

describe('auth state stays in step with the server', () => {
  it('a call answered "not signed in" in the middle of a session sends this tab to the sign-in page', async () => {
    renderAt(<App />, { route: '/wallet', me: passengerMe });
    // the cookie expired, or the user signed out on another device
    server.use(
      http.get('*/api/wallet', () => apiError(401, 'AUTH_REQUIRED', 'Please log in to continue.')),
      http.get('*/api/auth/me', () => apiError(401, 'AUTH_REQUIRED', 'Please log in to continue.')),
    );
    fireEvent.focus(window); // any refetch will do
    await screen.findByRole('button', { name: 'Sign in' }, { timeout: 5000 });
  });

  it('after a top-up that pays the debt, the "account locked" banner goes away without a reload', async () => {
    let unlocked = false;
    renderAt(<App />, { route: '/wallet', me: { ...passengerMe, accountStatus: 'LOCKED' } });
    server.use(
      http.get('*/api/auth/me', () => HttpResponse.json({ ...passengerMe, accountStatus: unlocked ? 'ACTIVE' : 'LOCKED' })),
      http.get('*/api/wallet', () => (unlocked ? wallet(null, 30) : wallet({ amountCents: 70, createdAt: '2026-10-19T08:00:00.000Z' }))),
      http.post('*/api/wallet/top-up', () => ((unlocked = true), wallet(null, 30))),
    );
    expect(await screen.findByText(/Your account is locked/)).toBeInTheDocument();
    fireEvent.click((await screen.findAllByRole('button', { name: /^Top up \$/ }))[0]!);
    await waitFor(() => expect(screen.queryByText(/Your account is locked/)).toBeNull(), { timeout: 5000 });
  });
});
