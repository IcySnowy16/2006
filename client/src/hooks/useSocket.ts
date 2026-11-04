/**
 * Tasks D5, D6, D7: the WebSocket side. One shared connection (same origin, same login cookie). A screen joins a journey room and the
 * server decides whether it may; `useJourneyChannel` reports the driver's position and status changes. Everything degrades: if the
 * socket cannot connect, the screens still work from the normal API (they poll).
 */
import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import type { PickupStatus, Position } from '@campus-hop/shared';

let shared: Socket | null = null;

export function getSocket(): Socket {
  shared ??= io({ transports: ['websocket', 'polling'], withCredentials: true, autoConnect: true, reconnectionDelayMax: 5000 });
  return shared;
}

export function closeSocket(): void {
  shared?.close();
  shared = null;
}

/** Live notifications: refresh the inbox the moment the server pushes one. */
export function useNotificationSocket(enabled: boolean): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const socket = getSocket();
    const onNew = () => void qc.invalidateQueries({ queryKey: ['notifications.list'] });
    socket.on('notification:new', onNew);
    return () => void socket.off('notification:new', onNew);
  }, [enabled, qc]);
}

export interface JourneyChannel {
  joined: boolean;
  error: string | null;
  position: Position | null;
  /** When (browser clock) the last position arrived: staleness is measured from this, not from the phone's own timestamp. */
  positionAt: number | null;
  /** bookingId -> latest pickup status pushed by the server */
  pickups: Record<string, { status: PickupStatus; distanceM: number | null; etaSec: number | null }>;
  noShowOpen: Record<string, boolean>;
  journeyStatus: string | null;
}

export function useJourneyChannel(journeyId: string | undefined, enabled: boolean, retryKey = 0): JourneyChannel & { sendPosition(p: Position): void } {
  const [state, setState] = useState<JourneyChannel>({
    joined: false,
    error: null,
    position: null,
    positionAt: null,
    pickups: {},
    noShowOpen: {},
    journeyStatus: null,
  });
  const joinedFor = useRef<string | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    if (!journeyId || !enabled) return;
    // A different journey (or a fresh start) must not show the previous one's car or pickups.
    setState({ joined: false, error: null, position: null, positionAt: null, pickups: {}, noShowOpen: {}, journeyStatus: null });
    const socket = getSocket();
    const join = () => {
      // Anything pushed while we were disconnected is lost: forget the pushed pickups and re-read the bookings.
      setState((s) => ({ ...s, pickups: {} }));
      void qc.invalidateQueries({ queryKey: ['bookings.forJourney'] });
      void qc.invalidateQueries({ queryKey: ['bookings.get'] });
      void socket.emitWithAck('journey:join', { journeyId }).then((ack: { ok: boolean; code?: string; message?: string }) => {
        joinedFor.current = ack.ok ? journeyId : null;
        setState((s) => ({ ...s, joined: ack.ok, error: ack.ok ? null : (ack.message ?? ack.code ?? 'Cannot follow this trip') }));
      });
    };
    const onLocation = (m: { journeyId: string; position: Position }) =>
      m.journeyId === journeyId && setState((s) => ({ ...s, position: m.position, positionAt: Date.now() }));
    const onPickup = (m: { journeyId: string; bookingId: string; status: PickupStatus; distanceM: number | null; etaSec: number | null }) => {
      if (m.journeyId !== journeyId) return;
      setState((s) => ({ ...s, pickups: { ...s.pickups, [m.bookingId]: { status: m.status, distanceM: m.distanceM, etaSec: m.etaSec } } }));
      void qc.invalidateQueries({ queryKey: ['bookings.forJourney'] });
      void qc.invalidateQueries({ queryKey: ['bookings.get'] });
    };
    const onAppError = (e: { code: string; message: string }) => setState((s) => ({ ...s, error: e.message || e.code }));
    const onNoShow = (m: { journeyId: string; bookingId: string }) =>
      m.journeyId === journeyId && setState((s) => ({ ...s, noShowOpen: { ...s.noShowOpen, [m.bookingId]: true } }));
    const onStatus = (m: { journeyId: string; status: string }) => m.journeyId === journeyId && setState((s) => ({ ...s, journeyStatus: m.status }));
    socket.on('location:update', onLocation);
    socket.on('pickup:status', onPickup);
    socket.on('noshow:open', onNoShow);
    socket.on('journey:status', onStatus);
    socket.on('app:error', onAppError);
    socket.on('connect', join);
    if (socket.connected) join();
    return () => {
      socket.off('location:update', onLocation);
      socket.off('pickup:status', onPickup);
      socket.off('noshow:open', onNoShow);
      socket.off('journey:status', onStatus);
      socket.off('app:error', onAppError);
      socket.off('connect', join);
      if (joinedFor.current === journeyId) void socket.emit('journey:leave', { journeyId });
    };
  }, [journeyId, enabled, retryKey, qc]);

  return {
    ...state,
    sendPosition: (position) => {
      // volatile: a fix that cannot be sent now is dropped, not queued and replayed late as if it were fresh.
      if (journeyId) getSocket().volatile.emit('location:update', { journeyId, position });
    },
  };
}
