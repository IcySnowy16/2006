/** Tasks C7, D7, E2, A5 (screens): wallet, locked account, notifications, history and profile. */
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { apiError, driverMe, http, HttpResponse, passengerMe, server } from '../test/server';
import { renderAt } from '../test/utils';

vi.mock('../hooks/useSocket', () => ({
  useNotificationSocket: () => undefined,
  useJourneyChannel: () => ({
    joined: false,
    error: null,
    position: null,
    positionAt: null,
    pickups: {},
    noShowOpen: {},
    journeyStatus: null,
    sendPosition: () => undefined,
  }),
  closeSocket: () => undefined,
}));

const wallet = (o: Record<string, unknown> = {}) =>
  http.get('*/api/wallet', () => HttpResponse.json({ balanceCents: 2000, heldCents: 300, availableCents: 1700, debt: null, simulated: true, ...o }));

describe('Wallet (UC-20)', () => {
  it('shows balance, held and available, and says on the screen that the money is simulated', async () => {
    server.use(wallet());
    renderAt(<App />, { route: '/wallet', me: passengerMe });
    expect(await screen.findByText('$20.00')).toBeInTheDocument();
    expect(screen.getByText('$3.00')).toBeInTheDocument();
    expect(screen.getByText('$17.00')).toBeInTheDocument();
    expect(screen.getByText(/SIMULATED money/)).toBeInTheDocument();
  });

  it('a passenger under $3 available sees the warning on the wallet page, with no extra link (they are already there)', async () => {
    server.use(wallet({ balanceCents: 250, heldCents: 0, availableCents: 250 }));
    renderAt(<App />, { route: '/wallet', me: passengerMe });
    expect(await screen.findByText(/getting low \(\$2\.50 available\)/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Top up' })).toBeNull();
  });

  it('a preset top-up sends whole cents; success is confirmed', async () => {
    let body: unknown;
    server.use(
      wallet(),
      http.post(
        '*/api/wallet/top-up',
        async ({ request }) => (
          (body = await request.json()),
          HttpResponse.json({ balanceCents: 2500, heldCents: 300, availableCents: 2200, debt: null, simulated: true })
        ),
      ),
    );
    renderAt(<App />, { route: '/wallet', me: passengerMe });
    fireEvent.click(await screen.findByRole('button', { name: 'Top up $5.00' }));
    expect(await screen.findByText('Topped up.')).toBeInTheDocument();
    expect(body).toEqual({ amountCents: 500 });
  });

  it('offers only the fixed amounts $5, $10, $20, $50 and $100 for now (no typed amount)', async () => {
    server.use(wallet());
    renderAt(<App />, { route: '/wallet', me: passengerMe });
    for (const label of ['Top up $5.00', 'Top up $10.00', 'Top up $20.00', 'Top up $50.00', 'Top up $100.00']) {
      expect(await screen.findByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByLabelText('Other amount in dollars')).not.toBeInTheDocument();
  });

  // Skipped on purpose: the typed amount box is commented out for now (team note, 25 Oct). Turn this back on with the box.
  it.skip('a typed amount becomes cents; the button waits for a sensible amount (at least $1, at most the wallet limit)', async () => {
    let body: unknown;
    server.use(
      wallet(),
      http.post(
        '*/api/wallet/top-up',
        async ({ request }) => (
          (body = await request.json()),
          HttpResponse.json({ balanceCents: 2000, heldCents: 0, availableCents: 2000, debt: null, simulated: true })
        ),
      ),
    );
    renderAt(<App />, { route: '/wallet', me: passengerMe });
    const box = await screen.findByLabelText('Other amount in dollars');
    const go = screen.getAllByRole('button', { name: 'Top up' }).at(-1)!;
    expect(go).toBeDisabled();
    fireEvent.change(box, { target: { value: '0.50' } });
    expect(go).toBeDisabled();
    fireEvent.change(box, { target: { value: '1001' } });
    expect(go).toBeDisabled();
    fireEvent.change(box, { target: { value: '7.50' } });
    expect(go).toBeEnabled();
    fireEvent.click(go);
    await waitFor(() => expect(body).toEqual({ amountCents: 750 }));
  });

  it('going over the wallet limit is explained with the limit', async () => {
    server.use(
      wallet(),
      http.post('*/api/wallet/top-up', () => apiError(400, 'VALIDATION_ERROR', 'invalid')),
    );
    renderAt(<App />, { route: '/wallet', me: passengerMe });
    fireEvent.click(await screen.findByRole('button', { name: 'Top up $5.00' }));
    expect(await screen.findByText(/at most \$100\.00/)).toBeInTheDocument();
  });

  it('a double tap, or a tap on two amounts, sends ONE top-up; the other buttons wait while it is sent', async () => {
    let posts = 0;
    server.use(
      wallet(),
      http.post('*/api/wallet/top-up', async () => {
        posts += 1;
        await new Promise((r) => setTimeout(r, 150));
        return HttpResponse.json({ balanceCents: 2500, heldCents: 300, availableCents: 2200, debt: null, simulated: true });
      }),
    );
    renderAt(<App />, { route: '/wallet', me: passengerMe });
    const five = await screen.findByRole('button', { name: 'Top up $5.00' });
    const ten = screen.getByRole('button', { name: 'Top up $10.00' });
    act(() => {
      five.click();
      five.click();
      ten.click();
    });
    await waitFor(() => expect(ten).toBeDisabled());
    expect(await screen.findByText('Topped up.')).toBeInTheDocument();
    expect(posts).toBe(1);
    expect(screen.getByRole('button', { name: 'Top up $10.00' })).toBeEnabled();
  });

  it('only a driver sees Withdraw earnings; too much is explained', async () => {
    server.use(
      wallet({ balanceCents: 500, heldCents: 0, availableCents: 500 }),
      http.post('*/api/wallet/withdraw', () => apiError(422, 'INSUFFICIENT_BALANCE', 'low')),
    );
    const { unmount } = renderAt(<App />, { route: '/wallet', me: passengerMe });
    await screen.findAllByText('$5.00');
    expect(screen.queryByText('Withdraw earnings')).toBeNull();
    unmount();
    renderAt(<App />, { route: '/wallet', me: driverMe });
    fireEvent.change(await screen.findByLabelText('Amount to withdraw in dollars'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    expect(await screen.findByText(/cannot withdraw more than you have available/)).toBeInTheDocument();
  });

  it('lists the ledger in words, not codes', async () => {
    server.use(
      wallet(),
      http.get('*/api/wallet/transactions', () =>
        HttpResponse.json([
          { id: 't1', type: 'HOLD', amountCents: 300, bookingId: 'b', timestamp: '2026-10-19T08:00:00.000Z' },
          { id: 't2', type: 'TOP_UP', amountCents: 1000, bookingId: null, timestamp: '2026-10-19T07:00:00.000Z' },
        ]),
      ),
    );
    renderAt(<App />, { route: '/wallet', me: passengerMe });
    expect(await screen.findByText('Held for a ride')).toBeInTheDocument();
    expect(screen.getByText('Top-up')).toBeInTheDocument();
  });
});

describe('Locked account (UC-13.EX.1)', () => {
  const locked = { ...passengerMe, accountStatus: 'LOCKED' as const };

  it('shows the exact shortfall and suggests topping up at least that much', async () => {
    server.use(wallet({ balanceCents: 0, heldCents: 0, availableCents: 0, debt: { amountCents: 70, createdAt: '2026-10-18T08:00:00.000Z' } }));
    renderAt(<App />, { route: '/locked', me: locked });
    expect(await screen.findByText('What you owe')).toBeInTheDocument();
    expect(screen.getAllByText('$0.70').length).toBeGreaterThan(0);
    expect(screen.getByText('Your account is locked', { selector: 'h1' })).toBeInTheDocument();
    expect(screen.getByText(/Top up at least/)).toHaveTextContent('$1.00'); // the smallest top-up the system takes
    expect(screen.getAllByText(/SIMULATED money/).length).toBeGreaterThan(0);
  });

  it('the banner on every screen tells a locked passenger why, with a link', async () => {
    server.use(wallet());
    renderAt(<App />, { route: '/wallet', me: locked });
    expect(await screen.findByRole('link', { name: 'See what you owe' })).toHaveAttribute('href', '/locked');
  });

  it('a passenger who owes nothing is told so', async () => {
    server.use(wallet());
    renderAt(<App />, { route: '/locked', me: passengerMe });
    expect(await screen.findByText(/You owe nothing/)).toBeInTheDocument();
  });
});

describe('Notifications (FR 8.12, 8.13)', () => {
  const items = [
    {
      id: 'n1',
      type: 'BOOKING_CONFIRMED',
      message: 'Your driver accepted.',
      timestamp: '2026-10-19T08:05:00.000Z',
      isRead: false,
      link: '/passenger/booking/b1',
    },
    { id: 'n2', type: 'TRIP_STARTED', message: 'Your trip has started.', timestamp: '2026-10-19T08:00:00.000Z', isRead: true, link: null },
  ];

  it('lists them with the unread count; an empty inbox says what will appear', async () => {
    server.use(http.get('*/api/notifications', () => HttpResponse.json({ items, unreadCount: 1 })));
    const { unmount } = renderAt(<App />, { route: '/notifications', me: passengerMe });
    expect(await screen.findByText('Your driver accepted.')).toBeInTheDocument();
    expect(screen.getByText('1 unread')).toBeInTheDocument();
    unmount();
    server.use(http.get('*/api/notifications', () => HttpResponse.json({ items: [], unreadCount: 0 })));
    renderAt(<App />, { route: '/notifications', me: passengerMe });
    expect(await screen.findByText('Nothing yet')).toBeInTheDocument();
  });

  it('tapping one marks it read; "Mark all as read" sends once', async () => {
    const calls: string[] = [];
    server.use(
      http.get('*/api/notifications', () => HttpResponse.json({ items, unreadCount: 1 })),
      http.post('*/api/notifications/n1/read', () => (calls.push('one'), new HttpResponse(null, { status: 204 }))),
      http.post('*/api/notifications/read-all', () => (calls.push('all'), new HttpResponse(null, { status: 204 }))),
      http.get('*/api/bookings/b1', () =>
        HttpResponse.json({
          id: 'b1',
          journeyId: 'j',
          status: 'PENDING',
          pickupStatus: 'WAITING',
          paymentStatus: null,
          bookedOnTrust: false,
          currentFareCents: 300,
          finalFareCents: null,
          pickupPointId: 'p',
          dropoffPointId: 'd',
          counterpartFirstName: null,
        }),
      ),
      http.get('*/api/locations', () => HttpResponse.json([])),
    );
    renderAt(<App />, { route: '/notifications', me: passengerMe });
    fireEvent.click(await screen.findByRole('button', { name: /Mark all as read/ }));
    await waitFor(() => expect(calls).toEqual(['all']));
    fireEvent.click(screen.getByText('Your driver accepted.'));
    await waitFor(() => expect(calls).toEqual(['all', 'one']));
  });

  it('the push setting round-trips and explains when push is off for the whole app', async () => {
    let sent: unknown;
    server.use(http.put('*/api/notifications/preferences', async ({ request }) => ((sent = await request.json()), new HttpResponse(null, { status: 204 }))));
    renderAt(<App />, { route: '/notifications', me: passengerMe });
    const box = await screen.findByLabelText('Send me push notifications');
    await waitFor(() => expect(box).toBeChecked());
    fireEvent.click(box);
    await waitFor(() => expect(sent).toEqual({ push: false }));
    expect(await screen.findByText(/Push is not switched on for this app yet/)).toBeInTheDocument();
  });
});

describe('My trips and rating (UC-19)', () => {
  const entry = (o: Record<string, unknown>) => ({
    kind: 'BOOKING',
    id: 'b1',
    date: '2026-10-19T08:00:00.000Z',
    fromName: 'Hall B',
    toName: 'Main Gate',
    status: 'COMPLETED',
    pickupStatus: 'DROPPED_OFF',
    fareCents: 300,
    paymentOutcome: 'PAID',
    canRate: true,
    ...o,
  });

  it('an empty history is friendly; entries show NO_SHOW and UNPAID outcomes', async () => {
    const { unmount } = renderAt(<App />, { route: '/history', me: passengerMe });
    expect(await screen.findByText('No trips yet')).toBeInTheDocument();
    unmount();
    server.use(
      http.get('*/api/history', () =>
        HttpResponse.json([
          entry({ id: 'b2', pickupStatus: 'NO_SHOW', paymentOutcome: 'NO_CHARGE', canRate: false, fareCents: 0 }),
          entry({ id: 'b3', pickupStatus: 'UNPAID', paymentOutcome: 'UNPAID', canRate: false }),
        ]),
      ),
    );
    renderAt(<App />, { route: '/history', me: passengerMe });
    expect(await screen.findByText('no show')).toBeInTheDocument();
    expect(screen.getAllByText('unpaid').length).toBe(2); // the pickup outcome and the payment outcome
  });

  it('rating is offered only where the server says canRate, needs a star choice, and is sent for that booking', async () => {
    let sent: unknown;
    server.use(
      http.get('*/api/history', () => HttpResponse.json([entry({}), entry({ id: 'b9', canRate: false })])),
      http.post('*/api/bookings/b1/ratings', async ({ request }) => ((sent = await request.json()), new HttpResponse(null, { status: 204 }))),
    );
    renderAt(<App />, { route: '/history', me: passengerMe });
    const rate = await screen.findAllByRole('button', { name: 'Rate this ride' });
    expect(rate).toHaveLength(1);
    fireEvent.click(rate[0]!);
    expect(screen.getByRole('button', { name: 'Send rating' })).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: '5 stars' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send rating' }));
    await waitFor(() => expect(sent).toEqual({ stars: 5 }));
  });
});

describe('Profile (UC-3)', () => {
  it('a passenger can become a driver by adding vehicle details, and the form asks for all three', async () => {
    let body: unknown;
    server.use(
      http.put('*/api/driver/profile', async ({ request }) => ((body = await request.json()), HttpResponse.json({ ...(body as object), dailyPaidTrips: 0 }))),
    );
    renderAt(<App />, { route: '/profile', me: passengerMe });
    expect(await screen.findByText('Become a driver')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save vehicle details' }));
    expect((await screen.findAllByText('Please fill this in')).length).toBe(3);
    fireEvent.change(screen.getByLabelText('Vehicle plate number'), { target: { value: 'SBA1234A' } });
    fireEvent.change(screen.getByLabelText('Vehicle model'), { target: { value: 'Toyota Vios' } });
    fireEvent.change(screen.getByLabelText('PayNow ID'), { target: { value: '91234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save vehicle details' }));
    await waitFor(() => expect(body).toEqual({ vehiclePlate: 'SBA1234A', vehicleModel: 'Toyota Vios', payNowId: '91234567' }));
  });

  it('a driver-only user can add the passenger role; someone with both roles can switch', async () => {
    let added = false;
    server.use(http.post('*/api/me/roles', () => ((added = true), HttpResponse.json({ ...driverMe, roles: ['DRIVER', 'PASSENGER'] }))));
    renderAt(<App />, { route: '/profile', me: { ...driverMe, roles: ['DRIVER'] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Also ride as a passenger' }));
    await waitFor(() => expect(added).toBe(true));
    expect(await screen.findByRole('link', { name: 'Switch role' })).toBeInTheDocument();
  });
});
