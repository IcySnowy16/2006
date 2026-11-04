/**
 * Task Q2, method 1 (Lab 4 white-box, basis-path testing): `TripService.updatePickupStatus` (the driver's PICKED_UP / DROPPED_OFF /
 * NO_SHOW buttons, FR 6.5 to 6.8). The control flow graph, V(G) and the node numbers on each path are in docs/tests/basis-path.md.
 *
 * Nodes (decision nodes are marked D):
 *   1 start   2 D: booking found?   3 D: caller is the journey's driver?   4 D: journey IN_PROGRESS?   5 D: next is NO_SHOW?
 *   6 D: rider is ARRIVED?   7 D: 3 minutes have passed since ARRIVED?   8 D: booking is CONFIRMED?   9 D: state machine allows the move?
 *   10 write the new status   11 D: next is NO_SHOW (second test)?   12 release hold, free the seat, re-tier   13 publish event, return
 *   plus the exit nodes for each refusal (NOT_FOUND, FORBIDDEN, ILLEGAL_STATE_TRANSITION).
 * Nine decision nodes, so V(G) = 9 + 1 = 10 independent paths. Path P10 (decision 11 flipped on its own) cannot be executed because
 * node 11 repeats node 5's condition; it is listed in the document and has no test.
 */
import { describe, expect, it } from 'vitest';
import { minutes } from '../core/clock';
import { prisma } from '../core/prisma';
import { makeBooking, makeCatalog, makeDriver, makeJourney, makePassenger } from '../../test/helpers';
import { makeTestApp } from '../../test/helpers/app';
import { TripService } from './TripService';

async function setup(
  o: { journey?: 'IN_PROGRESS' | 'OPEN'; pickup?: 'WAITING' | 'ARRIVED' | 'PICKED_UP'; booking?: 'CONFIRMED' | 'CANCELLED'; arrivedAgoMs?: number } = {},
) {
  const t = makeTestApp();
  const cat = await makeCatalog();
  const driver = await makeDriver();
  const journey = await makeJourney(driver.id, { status: o.journey ?? 'IN_PROGRESS', departureTime: t.clock.now(), seatsAvailable: 2 }); // 3 seats, one taken by the booking below
  const rider = await makePassenger({ balanceCents: 1000, heldCents: 300 });
  const booking = await makeBooking(journey.id, rider.id, cat.pickup.hallABus.id, cat.pickup.gateBus.id, {
    status: o.booking ?? 'CONFIRMED',
    pickupStatus: o.pickup ?? 'WAITING',
    heldCents: 300,
    currentFareCents: 300,
  });
  if (o.arrivedAgoMs !== undefined)
    await prisma().booking.update({ where: { id: booking.id }, data: { arrivedAt: new Date(t.clock.now().getTime() - o.arrivedAgoMs) } });
  const service = new TripService(t.ctx);
  const press = (next: 'PICKED_UP' | 'DROPPED_OFF' | 'NO_SHOW', who = driver.id, id = booking.id) => service.updatePickupStatus(who, id, next);
  return { t, cat, driver, journey, rider, booking, press };
}

describe('Q2 method 1: TripService.updatePickupStatus, V(G) = 10', () => {
  it('P1 (2 false): unknown booking -> NOT_FOUND', async () => {
    const s = await setup();
    await expect(s.press('PICKED_UP', s.driver.id, 'no-such-booking')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('P2 (3 false): another driver -> FORBIDDEN', async () => {
    const s = await setup();
    await expect(s.press('PICKED_UP', (await makeDriver()).id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('P3 (4 false): the journey is not IN_PROGRESS -> ILLEGAL_STATE_TRANSITION', async () => {
    const s = await setup({ journey: 'OPEN' });
    await expect(s.press('PICKED_UP')).rejects.toMatchObject({ code: 'ILLEGAL_STATE_TRANSITION' });
  });

  it('P4 (5 true, 6 false): NO_SHOW on a rider who has not ARRIVED -> ILLEGAL_STATE_TRANSITION', async () => {
    const s = await setup({ pickup: 'WAITING' });
    await expect(s.press('NO_SHOW')).rejects.toMatchObject({ code: 'ILLEGAL_STATE_TRANSITION' });
  });

  it('P5 (5 true, 6 true, 7 false): NO_SHOW 2:59 after ARRIVED -> ILLEGAL_STATE_TRANSITION', async () => {
    const s = await setup({ pickup: 'ARRIVED', arrivedAgoMs: minutes(3) - 1000 });
    await expect(s.press('NO_SHOW')).rejects.toMatchObject({ code: 'ILLEGAL_STATE_TRANSITION' });
    expect((await prisma().booking.findUniqueOrThrow({ where: { id: s.booking.id } })).pickupStatus).toBe('ARRIVED');
  });

  it('P6 (8 false): a booking that is not CONFIRMED has no pickup status to change -> ILLEGAL_STATE_TRANSITION', async () => {
    const s = await setup({ booking: 'CANCELLED' });
    await expect(s.press('PICKED_UP')).rejects.toMatchObject({ code: 'ILLEGAL_STATE_TRANSITION' });
  });

  it('P7 (9 false): a move the state machine forbids (WAITING -> DROPPED_OFF) -> ILLEGAL_STATE_TRANSITION', async () => {
    const s = await setup({ pickup: 'WAITING' });
    await expect(s.press('DROPPED_OFF')).rejects.toMatchObject({ code: 'ILLEGAL_STATE_TRANSITION' });
    expect((await prisma().booking.findUniqueOrThrow({ where: { id: s.booking.id } })).pickupStatus).toBe('WAITING');
  });

  it('P8 baseline (every check passes, next is not NO_SHOW): PICKED_UP is recorded and the event is published', async () => {
    const s = await setup({ pickup: 'WAITING' });
    const events: string[] = [];
    s.t.ctx.bus.on('PickupStatusChanged', (e) => void events.push(e.status));
    const row = await s.press('PICKED_UP');
    expect(row.pickupStatus).toBe('PICKED_UP');
    expect(events).toEqual(['PICKED_UP']);
    expect((await prisma().wallet.findUniqueOrThrow({ where: { userId: s.rider.id } })).heldCents).toBe(300); // nothing released
  });

  it('P9 (5 true, 6 true, 7 true, 11 true): NO_SHOW exactly 3:00 after ARRIVED releases the hold, frees the seat and re-tiers', async () => {
    const s = await setup({ pickup: 'ARRIVED', arrivedAgoMs: minutes(3) });
    const seatsBefore = (await prisma().journey.findUniqueOrThrow({ where: { id: s.journey.id } })).seatsAvailable;
    const row = await s.press('NO_SHOW');
    expect(row.pickupStatus).toBe('NO_SHOW');
    expect((await prisma().wallet.findUniqueOrThrow({ where: { userId: s.rider.id } })).heldCents).toBe(0);
    expect((await prisma().journey.findUniqueOrThrow({ where: { id: s.journey.id } })).seatsAvailable).toBe(seatsBefore + 1);
  });
});
