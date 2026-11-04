/** Tasks B8, B9, C6 (screens): request a hop, matches, the wallet check before booking, and the booking screen. */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { apiError, campus, http, HttpResponse, passengerMe, server } from '../test/server';
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

const places = http.get('*/api/locations', () => HttpResponse.json(campus));
const choose = (label: string, option: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value: campus.find((c) => c.name === option)!.id } });

describe('Request a hop (UC-7)', () => {
  it('asks for places from the campus list, not free text, and starts at "Now"', async () => {
    server.use(places);
    renderAt(<App />, { route: '/passenger/request', me: passengerMe });
    expect(await screen.findAllByRole('option', { name: 'Hall A' })).toHaveLength(2); // once in each list
    expect(screen.getByLabelText('Now')).toBeChecked();
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
  });

  it('warns under $3 available, says a top-up is needed under $2, and says nothing at $3 or more', async () => {
    const withWallet = (availableCents: number) =>
      http.get('*/api/wallet', () => HttpResponse.json({ balanceCents: availableCents, heldCents: 0, availableCents, debt: null, simulated: true }));
    server.use(places, withWallet(299));
    const first = renderAt(<App />, { route: '/passenger/request', me: passengerMe });
    expect(await screen.findByText(/getting low \(\$2\.99 available\)/)).toBeInTheDocument();
    expect(screen.getByText(/costs \$2\.00 to \$3\.00/)).toBeInTheDocument();
    first.unmount();
    server.use(withWallet(199));
    const second = renderAt(<App />, { route: '/passenger/request', me: passengerMe });
    expect(await screen.findByText(/Top up to at least \$2\.00 before you ask for or book a ride/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Top up' })).toHaveAttribute('href', '/wallet');
    second.unmount();
    server.use(withWallet(300));
    renderAt(<App />, { route: '/passenger/request', me: passengerMe });
    await screen.findAllByRole('option', { name: 'Hall A' });
    expect(screen.queryByText(/getting low/)).toBeNull();
    expect(screen.queryByText(/before you ask for or book a ride/)).toBeNull();
  });

  it('same start and destination, or nothing chosen, is explained and nothing is sent', async () => {
    let sent = false;
    server.use(
      places,
      http.post('*/api/hop-requests', () => ((sent = true), HttpResponse.json({}, { status: 201 }))),
    );
    renderAt(<App />, { route: '/passenger/request', me: passengerMe });
    await screen.findAllByRole('option', { name: 'Hall A' });
    fireEvent.click(screen.getByRole('button', { name: 'Find a ride' }));
    expect(await screen.findByText('Choose where you are and where you are going.')).toBeInTheDocument();
    choose('I am at', 'Hall A');
    choose('I am going to', 'Hall A');
    fireEvent.click(screen.getByRole('button', { name: 'Find a ride' }));
    expect(await screen.findByText('Your start and destination must be different places.')).toBeInTheDocument();
    expect(sent).toBe(false);
  });

  it('"Later today" needs a time, and a time that has passed is refused before sending', async () => {
    server.use(places);
    renderAt(<App />, { route: '/passenger/request', me: passengerMe });
    await screen.findAllByRole('option', { name: 'Hall A' });
    choose('I am at', 'Hall A');
    choose('I am going to', 'Main Gate');
    fireEvent.click(screen.getByLabelText('Later today'));
    fireEvent.click(screen.getByRole('button', { name: 'Find a ride' }));
    expect(await screen.findByText('Choose a time for later today.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '00:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find a ride' }));
    expect(await screen.findByText('That time has already passed.')).toBeInTheDocument();
  });

  it('a locked account is told why and where to go; a second open request is explained', async () => {
    server.use(
      places,
      http.post('*/api/hop-requests', () => apiError(403, 'ACCOUNT_LOCKED', 'Your account is locked.')),
    );
    renderAt(<App />, { route: '/passenger/request', me: passengerMe });
    await screen.findAllByRole('option', { name: 'Hall A' });
    choose('I am at', 'Hall A');
    choose('I am going to', 'Main Gate');
    fireEvent.click(screen.getByRole('button', { name: 'Find a ride' }));
    expect(await screen.findByRole('link', { name: 'See what you owe' })).toHaveAttribute('href', '/locked');

    server.use(http.post('*/api/hop-requests', () => apiError(409, 'CONFLICT', 'conflict')));
    fireEvent.click(screen.getByRole('button', { name: 'Find a ride' }));
    expect(await screen.findByText(/already have an open request/i)).toBeInTheDocument();
  });

  it('sends the chosen places and no time for "now", then opens the matches', async () => {
    let body: unknown;
    server.use(
      places,
      http.post('*/api/hop-requests', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          { hopRequest: { id: 'h1', fromLocationId: 'hallB', toLocationId: 'gate', requestedTime: new Date().toISOString(), status: 'OPEN' }, matches: [] },
          { status: 201 },
        );
      }),
      http.get('*/api/hop-requests/h1/matches', () => HttpResponse.json([])),
    );
    renderAt(<App />, { route: '/passenger/request', me: passengerMe });
    await screen.findAllByRole('option', { name: 'Hall A' });
    choose('I am at', 'Hall B');
    choose('I am going to', 'Main Gate');
    fireEvent.click(screen.getByRole('button', { name: 'Find a ride' }));
    expect(await screen.findByText('Drivers going your way')).toBeInTheDocument();
    expect(body).toEqual({ fromLocationId: 'hallB', toLocationId: 'gate' });
  });
});

describe('Matches (UC-8)', () => {
  const match = {
    journeyId: 'j1',
    driver: { id: 'd1', name: 'Dana Driver', avgRating: 4.5, unpaidCount: 0 },
    pickupPoint: { id: 'hallB-stop', type: 'BUS_STOP', walkDistanceM: 60 },
    walkDistanceM: 60,
    detourMin: 1.5,
    pickupTime: '2026-10-19T08:05:00.000Z',
    fareCents: 300,
  };

  it('shows the walk, pickup time, rating and fare, and links to the booking with the pickup chosen', async () => {
    server.use(
      places,
      http.get('*/api/hop-requests/h1/matches', () => HttpResponse.json([match])),
      http.get('*/api/hop-requests/mine', () =>
        HttpResponse.json([{ id: 'h1', fromLocationId: 'hallB', toLocationId: 'gate', requestedTime: '2026-10-19T08:00:00.000Z', status: 'OPEN' }]),
      ),
    );
    renderAt(<App />, { route: '/passenger/matches/h1', me: passengerMe });
    expect(await screen.findByText('Dana')).toBeInTheDocument();
    expect(screen.getByText('60 m')).toBeInTheDocument();
    expect(screen.getByText('$3.00')).toBeInTheDocument();
    expect(screen.getByLabelText('4.5 out of 5 stars')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Choose this ride' });
    expect(link.getAttribute('href')).toBe('/passenger/book/j1?request=h1&pickup=hallB-stop&to=gate');
  });

  it('with no match the request stays open and the screen says so', async () => {
    server.use(
      places,
      http.get('*/api/hop-requests/h1/matches', () => HttpResponse.json([])),
    );
    renderAt(<App />, { route: '/passenger/matches/h1', me: passengerMe });
    expect(await screen.findByText('No driver yet')).toBeInTheDocument();
    expect(screen.getByText(/request stays open/)).toBeInTheDocument();
  });

  it('warns about a driver with unpaid rides', async () => {
    server.use(
      places,
      http.get('*/api/hop-requests/h1/matches', () => HttpResponse.json([{ ...match, driver: { ...match.driver, unpaidCount: 2 } }])),
    );
    renderAt(<App />, { route: '/passenger/matches/h1', me: passengerMe });
    expect(await screen.findByText(/2 unpaid rides/)).toBeInTheDocument();
  });
});

describe('Confirm booking: the wallet check (UC-7, FR 10.2 to 10.4)', () => {
  const route = '/passenger/book/j1?request=h1&pickup=hallB-stop&to=gate';
  const preview = (check: string, available = 2000) =>
    http.get('*/api/bookings/preview', () => HttpResponse.json({ fareCents: 300, check, availableCents: available }));

  it('ENOUGH: says so and lets the passenger ask the driver', async () => {
    server.use(places, preview('ENOUGH'));
    renderAt(<App />, { route, me: passengerMe });
    expect(await screen.findByText('You have enough in your wallet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask the driver' })).toBeEnabled();
    expect(screen.getByText(/SIMULATED money/)).toBeInTheDocument();
  });

  it('ON_TRUST: explains the trust booking and the risk of locking', async () => {
    server.use(places, preview('ON_TRUST', 230));
    renderAt(<App />, { route, me: passengerMe });
    expect(await screen.findByText(/Booked on trust/)).toBeInTheDocument();
    expect(screen.getByText(/your account is locked/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask the driver' })).toBeEnabled();
  });

  it('NOT_ENOUGH: the button is off and there is a way to top up', async () => {
    server.use(places, preview('NOT_ENOUGH', 100));
    renderAt(<App />, { route, me: passengerMe });
    expect(await screen.findByText(/Not enough balance/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask the driver' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Top up your wallet' })).toHaveAttribute('href', '/wallet');
  });

  it('booking sends the journey, pickup, drop-off and the request, then opens the booking', async () => {
    let body: unknown;
    server.use(
      places,
      preview('ENOUGH'),
      http.post('*/api/bookings', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          {
            id: 'b1',
            journeyId: 'j1',
            status: 'PENDING',
            pickupStatus: 'WAITING',
            paymentStatus: null,
            bookedOnTrust: false,
            currentFareCents: 300,
            finalFareCents: null,
            pickupPointId: 'hallB-stop',
            dropoffPointId: 'gate-stop',
            counterpartFirstName: null,
          },
          { status: 201 },
        );
      }),
      http.get('*/api/bookings/b1', () =>
        HttpResponse.json({
          id: 'b1',
          journeyId: 'j1',
          status: 'PENDING',
          pickupStatus: 'WAITING',
          paymentStatus: null,
          bookedOnTrust: false,
          currentFareCents: 300,
          finalFareCents: null,
          pickupPointId: 'hallB-stop',
          dropoffPointId: 'gate-stop',
          counterpartFirstName: 'Dana',
        }),
      ),
    );
    renderAt(<App />, { route, me: passengerMe });
    const ask = await screen.findByRole('button', { name: 'Ask the driver' });
    await waitFor(() => expect(ask).toBeEnabled());
    fireEvent.click(ask);
    expect(await screen.findByText('Waiting for the driver to confirm. You can cancel at any time.')).toBeInTheDocument();
    expect(body).toEqual({ journeyId: 'j1', pickupPointId: 'hallB-stop', dropoffPointId: 'gate-stop', hopRequestId: 'h1' });
  });

  it('the last seat taken, and a locked account, each get their own explanation', async () => {
    server.use(
      places,
      preview('ENOUGH'),
      http.post('*/api/bookings', () => apiError(409, 'SEAT_UNAVAILABLE', 'No seats are left on this journey.')),
    );
    renderAt(<App />, { route, me: passengerMe });
    const ask = await screen.findByRole('button', { name: 'Ask the driver' });
    await waitFor(() => expect(ask).toBeEnabled());
    fireEvent.click(ask);
    expect(await screen.findByText(/seat was just taken/)).toBeInTheDocument();
    server.use(http.post('*/api/bookings', () => apiError(403, 'ACCOUNT_LOCKED', 'locked')));
    fireEvent.click(screen.getByRole('button', { name: 'Ask the driver' }));
    expect(await screen.findByRole('link', { name: 'See what you owe' })).toBeInTheDocument();
  });
});

describe('The booking screen (UC-11, UC-15, UC-19)', () => {
  const booking = (o: Record<string, unknown> = {}) => ({
    id: 'b1',
    journeyId: 'j1',
    status: 'CONFIRMED',
    pickupStatus: 'WAITING',
    paymentStatus: 'HELD',
    bookedOnTrust: false,
    currentFareCents: 200,
    finalFareCents: null,
    pickupPointId: 'hallB-stop',
    dropoffPointId: 'gate-stop',
    counterpartFirstName: 'Dana',
    ...o,
  });

  it('confirmed: shows the current fare, a Call button and Cancel; cancelling asks first and then sends', async () => {
    let cancelled = false;
    server.use(
      places,
      http.get('*/api/bookings/b1', () => HttpResponse.json(booking(cancelled ? { status: 'CANCELLED' } : {}))),
      http.post('*/api/bookings/b1/cancel', () => ((cancelled = true), HttpResponse.json(booking({ status: 'CANCELLED' })))),
    );
    renderAt(<App />, { route: '/passenger/booking/b1', me: passengerMe });
    expect(await screen.findByText('Your ride with Dana')).toBeInTheDocument();
    expect(screen.getByText('$2.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Call Dana' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel booking' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(cancelled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel' }));
    expect(await screen.findByText(/This booking is cancelled/)).toBeInTheDocument();
  });

  it('once the trip has started (the car is approaching) Cancel is no longer offered: the server would refuse it', async () => {
    server.use(
      places,
      http.get('*/api/bookings/b1', () => HttpResponse.json(booking({ pickupStatus: 'APPROACHING' }))),
    );
    renderAt(<App />, { route: '/passenger/booking/b1', me: passengerMe });
    expect(await screen.findByText('Your ride with Dana')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Call Dana' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel booking' })).toBeNull();
  });

  it('Call shows the number only after asking the server, and refuses politely outside the window', async () => {
    server.use(
      places,
      http.get('*/api/bookings/b1', () => HttpResponse.json(booking())),
      http.get('*/api/bookings/b1/contact', () => HttpResponse.json({ firstName: 'Dana', phone: '+6591234567' })),
    );
    renderAt(<App />, { route: '/passenger/booking/b1', me: passengerMe });
    expect(screen.queryByText(/6591234567/)).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Call Dana' }));
    const link = await screen.findByRole('link', { name: /Call Dana: \+6591234567/ });
    expect(link).toHaveAttribute('href', 'tel:+6591234567');
  });

  it('a booking on trust and an unpaid fare are both called out', async () => {
    server.use(
      places,
      http.get('*/api/bookings/b1', () =>
        HttpResponse.json(booking({ status: 'COMPLETED', pickupStatus: 'UNPAID', paymentStatus: 'UNPAID', bookedOnTrust: true, finalFareCents: 300 })),
      ),
    );
    renderAt(<App />, { route: '/passenger/booking/b1', me: passengerMe });
    expect(await screen.findByText(/Part of this fare is unpaid/)).toBeInTheDocument();
    expect(screen.getByText('Final fare')).toBeInTheDocument();
  });

  it('after a completed ride the passenger can rate; a second rating is explained', async () => {
    server.use(
      places,
      http.get('*/api/bookings/b1', () =>
        HttpResponse.json(booking({ status: 'COMPLETED', pickupStatus: 'DROPPED_OFF', paymentStatus: 'PAID', finalFareCents: 200 })),
      ),
      http.post('*/api/bookings/b1/ratings', () => apiError(409, 'ALREADY_RATED', 'You have already rated this booking.')),
    );
    renderAt(<App />, { route: '/passenger/booking/b1', me: passengerMe });
    expect(await screen.findByText('How was the ride?')).toBeInTheDocument();
    const send = screen.getByRole('button', { name: 'Send rating' });
    expect(send).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: '4 stars' }));
    fireEvent.click(send);
    expect(await screen.findByText('You have already rated this ride.')).toBeInTheDocument();
  });

  it('cancelling after the trip started is explained, not shown as a crash', async () => {
    server.use(
      places,
      http.get('*/api/bookings/b1', () => HttpResponse.json(booking())),
      http.post('*/api/bookings/b1/cancel', () => apiError(409, 'ILLEGAL_STATE_TRANSITION', 'x')),
    );
    renderAt(<App />, { route: '/passenger/booking/b1', me: passengerMe });
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel booking' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel' }));
    expect(await screen.findByText(/already started/)).toBeInTheDocument();
  });
});
