/** Task K9: the pretend API for client tests (MSW). Each test installs the answers it needs with `server.use(...)`. */
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type { Me } from '@campus-hop/shared';

export const server = setupServer();
export { http, HttpResponse };

export const passengerMe: Me = {
  id: 'u1',
  name: 'Priya Rider',
  roles: ['PASSENGER'],
  activeRole: 'PASSENGER',
  accountStatus: 'ACTIVE',
  wallet: { balanceCents: 2000, heldCents: 0 },
  hasDriverProfile: false,
};
export const driverMe: Me = {
  id: 'u2',
  name: 'Dana Driver',
  roles: ['DRIVER', 'PASSENGER'],
  activeRole: 'DRIVER',
  accountStatus: 'ACTIVE',
  wallet: { balanceCents: 0, heldCents: 0 },
  hasDriverProfile: true,
};

/** The standard error body every failed answer has. */
export const apiError = (status: number, code: string, message: string) => HttpResponse.json({ code, message, requestId: 'test' }, { status });

export const signedInAs = (me: Me | null) =>
  http.get('*/api/auth/me', () => (me ? HttpResponse.json(me) : apiError(401, 'AUTH_REQUIRED', 'Please log in to continue.')));

/** Quiet answers for the reads every signed-in screen makes (the bell, the wallet strip), so a test only describes what it is about. */
export const quietHandlers = [
  http.get('*/api/notifications', () => HttpResponse.json({ items: [], unreadCount: 0 })),
  http.get('*/api/notifications/preferences', () => HttpResponse.json({ push: true })),
  http.get('*/api/features', () =>
    HttpResponse.json({
      scheduledGoLive: false,
      scheduledRequests: true,
      reorderPickups: false,
      contactCall: true,
      pushNotifications: false,
      withdrawals: true,
      offlineShell: true,
    }),
  ),
  http.get('*/api/wallet', () => HttpResponse.json({ balanceCents: 2000, heldCents: 0, availableCents: 2000, debt: null, simulated: true })),
  http.get('*/api/wallet/transactions', () => HttpResponse.json([])),
  http.get('*/api/history', () => HttpResponse.json([])),
  http.get('*/api/hop-requests/mine', () => HttpResponse.json([])),
  http.get('*/api/journeys/mine', () => HttpResponse.json([])),
  http.get('*/api/presets', () => HttpResponse.json([])),
  http.get('*/api/locations', () => HttpResponse.json([])),
];

/** A tiny campus: two halls and one gate, each with one pickup point. */
export const campus = [
  {
    id: 'hallA',
    name: 'Hall A',
    zone: 'HALLS',
    isExit: false,
    position: { lat: 1, lng: 103 },
    pickupPoints: [{ id: 'hallA-stop', type: 'BUS_STOP', walkDistanceM: 80, accessNote: 'Hall A bus stop' }],
  },
  {
    id: 'hallB',
    name: 'Hall B',
    zone: 'HALLS',
    isExit: false,
    position: { lat: 1, lng: 103.002 },
    pickupPoints: [{ id: 'hallB-stop', type: 'BUS_STOP', walkDistanceM: 60, accessNote: 'Hall B bus stop' }],
  },
  {
    id: 'gate',
    name: 'Main Gate',
    zone: 'GATE',
    isExit: true,
    position: { lat: 1.006, lng: 103 },
    pickupPoints: [{ id: 'gate-stop', type: 'BUS_STOP', walkDistanceM: 40, accessNote: 'Main Gate bus stop' }],
  },
];

/** A sign-in that works like the real one: after it, "who am I" answers with that user (the cookie is now set). */
export const loginAs = (me: Me) =>
  http.post('*/api/auth/login', () => {
    server.use(signedInAs(me));
    return HttpResponse.json(me);
  });
