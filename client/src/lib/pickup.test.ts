import { describe, expect, it } from 'vitest';
import { latestPickup } from './pickup';

describe('latestPickup', () => {
  it('uses the socket when it is ahead of the last poll (it is faster)', () => {
    expect(latestPickup('WAITING', 'ARRIVED')).toBe('ARRIVED');
  });
  it('uses the poll when the socket missed a later change (the driver tapped Picked up while the socket was down)', () => {
    expect(latestPickup('PICKED_UP', 'ARRIVED')).toBe('PICKED_UP');
  });
  it('uses the poll when the socket has nothing', () => {
    expect(latestPickup('DROPPED_OFF', undefined)).toBe('DROPPED_OFF');
  });
  it('an unpaid ride (after drop-off) is never shown as merely dropped off', () => {
    expect(latestPickup('UNPAID', 'DROPPED_OFF')).toBe('UNPAID');
  });
});
