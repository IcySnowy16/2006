/** Tasks B6, B7, C5, D5 (screens): presets, go live, request cards, the active trip, trip complete. */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { apiError, campus, driverMe, http, HttpResponse, server } from '../test/server';
import { renderAt } from '../test/utils';

const channel = {
  joined: true,
  error: null,
  position: null,
  positionAt: null,
  pickups: {} as Record<string, unknown>,
  noShowOpen: {} as Record<string, boolean>,
  journeyStatus: null,
  sendPosition: vi.fn(),
};
vi.mock('../hooks/useSocket', () => ({ useNotificationSocket: () => undefined, useJourneyChannel: () => channel, closeSocket: () => undefined }));

// jsdom has no geolocation: a fix at Hall A, and a wake lock that does nothing.
const fix = { coords: { latitude: 1, longitude: 103, accuracy: 8 }, timestamp: Date.now() };
beforeEach(() => {
  channel.pickups = {};
  channel.noShowOpen = {};
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (ok: (p: unknown) => void) => ok(fix) } });
});

const places = http.get('*/api/locations', () => HttpResponse.json(campus));
const preset = {
  id: 'p1',
  name: 'To the gate',
  exitGateId: 'gate',
  plan: 'SHARING',
  allowedPickupTypes: ['BUS_STOP', 'CARPARK'],
  detourToleranceMin: 3,
  schedule: null,
  exemptionConfirmed: true,
  exemptionConfirmedAt: '2026-10-19T08:00:00.000Z',
};
const journey = (o: Record<string, unknown> = {}) => ({
  id: 'j1',
  presetId: 'p1',
  status: 'OPEN',
  cancelReason: null,
  plan: 'SHARING',
  seatsAvailable: 2,
  departureTime: '2026-10-19T08:00:00.000Z',
  route: { polyline: 'ysh_@qh|hQiAAiAAiAA', durationSec: 300, distanceM: 1200 },
  ...o,
});
const booking = (o: Record<string, unknown> = {}) => ({
  id: 'b1',
  journeyId: 'j1',
  status: 'CONFIRMED',
  pickupStatus: 'WAITING',
  paymentStatus: 'HELD',
  bookedOnTrust: false,
  currentFareCents: 300,
  finalFareCents: null,
  pickupPointId: 'hallB-stop',
  dropoffPointId: 'gate-stop',
  counterpartFirstName: 'Priya',
  ...o,
});

describe('Presets (UC-3)', () => {
  it('an empty list invites the first preset; a preset shows its exit, seats and detour', async () => {
    const { unmount } = renderAt(<App />, { route: '/driver/presets', me: driverMe });
    expect(await screen.findByText('No presets yet')).toBeInTheDocument();
    unmount();
    server.use(
      places,
      http.get('*/api/presets', () => HttpResponse.json([preset])),
    );
    renderAt(<App />, { route: '/driver/presets', me: driverMe });
    expect(await screen.findByText('To the gate')).toBeInTheDocument();
    expect(await screen.findByText('Main Gate')).toBeInTheDocument();
    expect(screen.getByText('up to 3 seats')).toBeInTheDocument();
    expect(screen.getByText('3 min')).toBeInTheDocument();
  });

  it('deleting asks first; a preset with a live journey is refused with the reason', async () => {
    server.use(
      places,
      http.get('*/api/presets', () => HttpResponse.json([preset])),
      http.delete('*/api/presets/p1', () => apiError(409, 'PRESET_IN_USE', 'in use')),
    );
    renderAt(<App />, { route: '/driver/presets', me: driverMe });
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('alertdialog', { name: 'Delete this preset?' })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText(/live or in progress/)).toBeInTheDocument();
  });
});

describe('Preset editor (UC-3, FR 3.1.x)', () => {
  it('offers only exit gates, tolerance 0 to 5, and Save is refused until the declaration is ticked', async () => {
    let sent = false;
    server.use(
      places,
      http.post('*/api/presets', () => ((sent = true), HttpResponse.json(preset, { status: 201 }))),
    );
    renderAt(<App />, { route: '/driver/presets/new', me: driverMe });
    const gate = await screen.findByLabelText('Where do you exit the campus?');
    expect([...gate.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['Main Gate']);
    const tolerance = screen.getByLabelText(/Extra detour you accept/);
    expect([...tolerance.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      '0 minutes',
      '1 minute',
      '2 minutes',
      '3 minutes',
      '4 minutes',
      '5 minutes',
    ]);
    fireEvent.change(screen.getByLabelText('Preset name'), { target: { value: 'To the gate' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save preset' }));
    expect(await screen.findByText('Tick the box to confirm')).toBeInTheDocument();
    expect(sent).toBe(false);
  });

  it('with the declaration ticked it sends the preset and returns to the list', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      places,
      http.post(
        '*/api/presets',
        async ({ request }) => ((body = (await request.json()) as Record<string, unknown>), HttpResponse.json(preset, { status: 201 })),
      ),
    );
    renderAt(<App />, { route: '/driver/presets/new', me: driverMe });
    await screen.findByLabelText('Preset name');
    fireEvent.change(screen.getByLabelText('Preset name'), { target: { value: 'To the gate' } });
    fireEvent.click(screen.getByLabelText(/I confirm that I would make this journey anyway/));
    await waitFor(() => expect(screen.getByLabelText('Preset name')).toHaveValue('To the gate'));
    fireEvent.click(screen.getByRole('button', { name: 'Save preset' }));
    expect(await screen.findByText('My presets')).toBeInTheDocument();
    expect(body).toMatchObject({ name: 'To the gate', exitGateId: 'gate', plan: 'SHARING', detourToleranceMin: 3, exemptionConfirmed: true, schedule: null });
  });

  it('a driver with no vehicle is asked for it first, and cannot save a preset yet', async () => {
    server.use(places);
    renderAt(<App />, { route: '/driver/presets/new', me: { ...driverMe, hasDriverProfile: false } });
    expect(await screen.findByText('First, your vehicle')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save preset' })).toBeDisabled();
  });
});

describe('Go live (UC-4)', () => {
  it('with no preset it sends the driver to make one', async () => {
    renderAt(<App />, { route: '/driver/go-live', me: driverMe });
    expect(await screen.findByText('New preset')).toBeInTheDocument();
  });

  it('shares the phone location with the choice of preset and opens the live journey', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      places,
      http.get('*/api/presets', () => HttpResponse.json([preset])),
      http.post(
        '*/api/journeys',
        async ({ request }) => ((body = (await request.json()) as Record<string, unknown>), HttpResponse.json(journey({ status: 'LIVE' }), { status: 201 })),
      ),
      http.get('*/api/journeys/mine', () => HttpResponse.json([journey({ status: 'LIVE' })])),
      http.get('*/api/journeys/j1/requests', () => HttpResponse.json([])),
      http.get('*/api/journeys/j1/bookings', () => HttpResponse.json([])),
      http.post('*/api/journeys/j1/position', () => new HttpResponse(null, { status: 204 })),
    );
    renderAt(<App />, { route: '/driver/go-live', me: driverMe });
    fireEvent.click(await screen.findByRole('button', { name: 'Share my location and go live' }));
    expect(await screen.findByText('Your journey')).toBeInTheDocument();
    expect(body).toMatchObject({ presetId: 'p1', locationPermission: true, position: { lat: 1, lng: 103, accuracyM: 8 } });
  });

  it('a refused location permission is explained and nothing is sent', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (_ok: unknown, bad: (e: unknown) => void) => bad({ code: 1, PERMISSION_DENIED: 1, TIMEOUT: 3 }) },
    });
    let sent = false;
    server.use(
      places,
      http.get('*/api/presets', () => HttpResponse.json([preset])),
      http.post('*/api/journeys', () => ((sent = true), HttpResponse.json(journey(), { status: 201 }))),
    );
    renderAt(<App />, { route: '/driver/go-live', me: driverMe });
    fireEvent.click(await screen.findByRole('button', { name: 'Share my location and go live' }));
    expect(await screen.findByText(/Location access is blocked/)).toBeInTheDocument();
    expect(sent).toBe(false);
  });

  it('the daily limit and an unavailable route service each get a plain sentence', async () => {
    server.use(
      places,
      http.get('*/api/presets', () => HttpResponse.json([preset])),
      http.post('*/api/journeys', () => apiError(403, 'DAILY_TRIP_LIMIT_REACHED', 'limit')),
    );
    renderAt(<App />, { route: '/driver/go-live', me: driverMe });
    fireEvent.click(await screen.findByRole('button', { name: 'Share my location and go live' }));
    expect(await screen.findByText(/two paid trips today/)).toBeInTheDocument();
    server.use(http.post('*/api/journeys', () => apiError(502, 'EXTERNAL_SERVICE_UNAVAILABLE', 'down')));
    fireEvent.click(screen.getByRole('button', { name: 'Share my location and go live' }));
    expect(await screen.findByText(/route could not be worked out/)).toBeInTheDocument();
  });
});

describe('The live journey and request cards (UC-10, UC-5)', () => {
  const card = {
    bookingId: 'b1',
    hopRequestId: null,
    passenger: { id: 'u1', firstName: 'Priya', avgRating: 4.5, unpaidCount: 0 },
    pickupPoint: { id: 'hallB-stop', type: 'BUS_STOP', walkDistanceM: 60 },
    detourMin: 1.5,
    fareCentsIfAccepted: 300,
  };
  const base = (cards: unknown[] = [card], bookings: unknown[] = []) => [
    places,
    http.get('*/api/journeys/mine', () => HttpResponse.json([journey({ status: 'LIVE', seatsAvailable: 3 })])),
    http.get('*/api/journeys/j1/requests', () => HttpResponse.json(cards)),
    http.get('*/api/journeys/j1/bookings', () => HttpResponse.json(bookings)),
    http.post('*/api/journeys/j1/position', () => new HttpResponse(null, { status: 204 })),
  ];

  it('a pending request is a card with the rider, pickup, detour and the fare if accepted; Accept sends the booking id', async () => {
    let accepted = '';
    server.use(
      ...base(),
      http.post('*/api/bookings/b1/accept', () => ((accepted = 'b1'), HttpResponse.json(booking()))),
    );
    renderAt(<App />, { route: '/driver/journey/j1', me: driverMe });
    expect(await screen.findByText('Priya')).toBeInTheDocument();
    expect(screen.getByText('Hall B bus stop')).toBeInTheDocument();
    expect(screen.getByText('1.5 min')).toBeInTheDocument();
    expect(screen.getByText('$3.00')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(accepted).toBe('b1'));
  });

  it('a seat taken meanwhile is explained when accepting fails', async () => {
    server.use(
      ...base(),
      http.post('*/api/bookings/b1/accept', () => apiError(409, 'SEAT_UNAVAILABLE', 'No seats are left on this journey.')),
    );
    renderAt(<App />, { route: '/driver/journey/j1', me: driverMe });
    fireEvent.click(await screen.findByRole('button', { name: 'Accept' }));
    expect(await screen.findByText('No seats are left on this journey.')).toBeInTheDocument();
  });

  it('an open request that nobody booked yet has no Accept button (the passenger books)', async () => {
    server.use(...base([{ ...card, bookingId: null, hopRequestId: 'h1' }]));
    renderAt(<App />, { route: '/driver/journey/j1', me: driverMe });
    expect(await screen.findByText(/They will book you if you suit them/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
  });

  it('Start trip needs a confirmed rider; with one it sends the permission and a fix, then opens the trip', async () => {
    let body: Record<string, unknown> = {};
    server.use(...base([], []));
    const { unmount } = renderAt(<App />, { route: '/driver/journey/j1', me: driverMe });
    expect(await screen.findByText(/at least one passenger is confirmed/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start trip' })).toBeDisabled();
    unmount();

    let started = false;
    server.use(
      http.post(
        '*/api/journeys/j1/start',
        async ({ request }) => (
          (body = (await request.json()) as Record<string, unknown>),
          (started = true),
          HttpResponse.json(journey({ status: 'IN_PROGRESS' }))
        ),
      ),
      http.get('*/api/journeys/mine', () => HttpResponse.json([journey({ status: started ? 'IN_PROGRESS' : 'LIVE' })])), // first handler wins
      ...base([], [booking()]),
    );
    renderAt(<App />, { route: '/driver/journey/j1', me: driverMe });
    const start = await screen.findByRole('button', { name: 'Start trip' });
    await waitFor(() => expect(start).toBeEnabled());
    fireEvent.click(start);
    expect(await screen.findByText('Trip in progress')).toBeInTheDocument();
    expect(body).toMatchObject({ locationPermission: true, position: { lat: 1, lng: 103 } });
  });

  it('cancelling the journey asks first and says every passenger is told', async () => {
    let cancelled = false;
    server.use(
      ...base(),
      http.post('*/api/journeys/j1/cancel', () => ((cancelled = true), HttpResponse.json(journey({ status: 'CANCELLED', cancelReason: 'DRIVER' })))),
    );
    renderAt(<App />, { route: '/driver/journey/j1', me: driverMe });
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel journey' }));
    expect(screen.getByText(/Every passenger is told/)).toBeInTheDocument();
    expect(cancelled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel it' }));
    await waitFor(() => expect(cancelled).toBe(true));
  });

  it('an expired or geofence-cancelled journey says why', async () => {
    server.use(
      places,
      http.get('*/api/journeys/mine', () => HttpResponse.json([journey({ status: 'CANCELLED', cancelReason: 'GEOFENCE' })])),
      http.get('*/api/journeys/j1/bookings', () => HttpResponse.json([])),
    );
    renderAt(<App />, { route: '/driver/journey/j1', me: driverMe });
    expect(await screen.findByText(/left the campus before starting/)).toBeInTheDocument();
  });
});

describe('The active trip (UC-12, UC-13, UC-15)', () => {
  const trip = (bookings: unknown[]) => [
    places,
    http.get('*/api/journeys/mine', () => HttpResponse.json([journey({ status: 'IN_PROGRESS' })])),
    http.get('*/api/journeys/j1/bookings', () => HttpResponse.json(bookings)),
  ];

  it('each rider shows their pickup and status with the next button only: Picked up, then Dropped off', async () => {
    server.use(...trip([booking({ pickupStatus: 'WAITING' }), booking({ id: 'b2', counterpartFirstName: 'Wei', pickupStatus: 'PICKED_UP' })]));
    renderAt(<App />, { route: '/driver/trip/j1', me: driverMe });
    expect(await screen.findByText('Priya')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Picked up' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Dropped off' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'No-show' })).toBeNull();
  });

  it('No-show appears only once the rider has ARRIVED and explains the 3-minute wait; the pushed arrival is used', async () => {
    channel.pickups = { b1: { status: 'ARRIVED', distanceM: 5, etaSec: 1 } };
    server.use(...trip([booking({ pickupStatus: 'WAITING' })]));
    renderAt(<App />, { route: '/driver/trip/j1', me: driverMe });
    expect(await screen.findByRole('button', { name: 'No-show' })).toBeInTheDocument();
    expect(screen.getByText(/3 minutes after you arrive/)).toBeInTheDocument();
    channel.noShowOpen = { b1: true };
  });

  it("a refused No-show shows the server's reason", async () => {
    channel.pickups = { b1: { status: 'ARRIVED', distanceM: 5, etaSec: 1 } };
    server.use(
      ...trip([booking()]),
      http.post('*/api/bookings/b1/pickup-status', () => apiError(409, 'ILLEGAL_STATE_TRANSITION', 'Wait 3 minutes after arriving before marking a no-show.')),
    );
    renderAt(<App />, { route: '/driver/trip/j1', me: driverMe });
    fireEvent.click(await screen.findByRole('button', { name: 'No-show' }));
    expect(await screen.findByText('Wait 3 minutes after arriving before marking a no-show.')).toBeInTheDocument();
  });

  it('Complete trip is off while a rider is unresolved and on once everyone is dropped off or no-show', async () => {
    server.use(...trip([booking({ pickupStatus: 'PICKED_UP' })]));
    const { unmount } = renderAt(<App />, { route: '/driver/trip/j1', me: driverMe });
    // The button is rendered (disabled) before the riders arrive, so wait for the hint that only the loaded list shows.
    expect(await screen.findByText(/Mark every rider dropped off or no-show first/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Complete trip' })).toBeDisabled();
    unmount();
    server.use(...trip([booking({ pickupStatus: 'DROPPED_OFF' }), booking({ id: 'b2', pickupStatus: 'NO_SHOW' })]));
    renderAt(<App />, { route: '/driver/trip/j1', me: driverMe });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Complete trip' })).toBeEnabled());
  });

  it('Call shows the number only after the server allows it; outside the window the reason is shown', async () => {
    server.use(
      ...trip([booking()]),
      http.get('*/api/bookings/b1/contact', () => apiError(403, 'FORBIDDEN', 'You cannot see contact details for this trip.')),
    );
    renderAt(<App />, { route: '/driver/trip/j1', me: driverMe });
    fireEvent.click(await screen.findByRole('button', { name: 'Call Priya' }));
    expect(await screen.findByText('You cannot see contact details for this trip.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Call Priya:/ })).toBeNull();
  });
});

describe('Trip complete (UC-14, UC-19)', () => {
  it('shows what the driver earned, says it is simulated, and offers a rating for each rider who was carried', async () => {
    let sent: unknown;
    server.use(
      http.get('*/api/journeys/j1/bookings', () =>
        HttpResponse.json([
          booking({ status: 'COMPLETED', pickupStatus: 'DROPPED_OFF', paymentStatus: 'PAID', finalFareCents: 200 }),
          booking({ id: 'b2', counterpartFirstName: 'Wei', status: 'COMPLETED', pickupStatus: 'DROPPED_OFF', paymentStatus: 'PAID', finalFareCents: 200 }),
          booking({ id: 'b3', counterpartFirstName: 'Sam', status: 'COMPLETED', pickupStatus: 'NO_SHOW', finalFareCents: 0 }),
        ]),
      ),
      http.post('*/api/bookings/b1/ratings', async ({ request }) => ((sent = await request.json()), new HttpResponse(null, { status: 204 }))),
      // earned = what reached the wallet for these riders; a credit for another journey must not be counted
      http.get('*/api/wallet/transactions', () =>
        HttpResponse.json([
          { id: 't1', type: 'CREDIT', amountCents: 200, bookingId: 'b1', timestamp: '2026-10-19T02:00:00.000Z' },
          { id: 't2', type: 'CREDIT', amountCents: 200, bookingId: 'b2', timestamp: '2026-10-19T02:00:00.000Z' },
          { id: 't3', type: 'CREDIT', amountCents: 300, bookingId: 'other-journey', timestamp: '2026-10-18T02:00:00.000Z' },
        ]),
      ),
    );
    renderAt(<App />, { route: '/driver/complete/j1', me: driverMe });
    expect(await screen.findByText('$4.00')).toBeInTheDocument();
    expect(screen.getByText(/SIMULATED money/)).toBeInTheDocument();
    expect(screen.getByText('Priya')).toBeInTheDocument();
    expect(screen.getByText('Wei')).toBeInTheDocument();
    expect(screen.queryByText('Sam')).toBeNull(); // a no-show is not rated
    fireEvent.click(screen.getAllByRole('radio', { name: '5 stars' })[0]!);
    fireEvent.click(screen.getAllByRole('button', { name: 'Send rating' })[0]!);
    expect(await screen.findByText('Thanks, rated')).toBeInTheDocument();
    expect(sent).toEqual({ stars: 5 });
  });

  it('a rider who could not pay in full: what they did pay is counted, and the rest is said to come later', async () => {
    server.use(
      http.get('*/api/journeys/j1/bookings', () =>
        HttpResponse.json([booking({ status: 'COMPLETED', pickupStatus: 'UNPAID', paymentStatus: 'UNPAID', finalFareCents: 300 })]),
      ),
      http.get('*/api/wallet/transactions', () =>
        HttpResponse.json([{ id: 't1', type: 'CREDIT', amountCents: 100, bookingId: 'b1', timestamp: '2026-10-19T02:00:00.000Z' }]),
      ),
    );
    renderAt(<App />, { route: '/driver/complete/j1', me: driverMe });
    expect(await screen.findByText(/could not pay in full/)).toBeInTheDocument();
    expect(await screen.findByText('$1.00')).toBeInTheDocument(); // the part-payment that reached the wallet, as in the wallet itself
  });
});
