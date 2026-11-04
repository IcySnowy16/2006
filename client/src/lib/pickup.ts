import type { PickupStatus } from '@campus-hop/shared';

/** How far along a pickup is. A later status never goes back, so the furthest one known is the true one. */
const RANK: Record<PickupStatus, number> = { WAITING: 0, APPROACHING: 1, ARRIVED: 2, PICKED_UP: 3, DROPPED_OFF: 4, NO_SHOW: 4, UNPAID: 5 };

/**
 * The socket is faster than the 4-second poll, but it can miss a message (a dropped connection). Take whichever of the two is
 * further along, so a missed "picked up" can never leave the screen stuck on "arrived" once the poll has the truth.
 */
export function latestPickup(fromServer: PickupStatus, fromSocket: PickupStatus | undefined): PickupStatus {
  return fromSocket !== undefined && RANK[fromSocket] > RANK[fromServer] ? fromSocket : fromServer;
}
