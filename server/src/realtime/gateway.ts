/**
 * Tasks K7 and D2: the Socket.IO gateway (SRS Q14 default: WebSocket).
 *
 * A socket must carry the same login cookie as the HTTP API; without a valid one the connection is refused (AUTH_REQUIRED). Every
 * socket joins its own room `user:<id>` (notifications). A journey room `journey:<id>` is joined only after the server has checked that
 * the caller is the journey's driver or a CONFIRMED passenger (LocationService.assertCanJoin): the room name is never trusted.
 *
 *   client -> server  journey:join { journeyId }   journey:leave { journeyId }   location:update { journeyId, position }
 *   server -> client  location:update   pickup:status   journey:status   notification:new   app:error { code, message }
 *
 * The gateway also listens to the domain events and turns them into `pickup:status` and `journey:status` for the room, and takes a
 * rider out of the room when their booking ends (FR 7.10).
 */
import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { ClientEvents, roomFor } from '@campus-hop/shared';
import { sessionTokenFromHeader, verifySession } from '../auth/session';
import type { AppContext, Realtime } from '../context';
import { AppError, isAppError, type ErrorCode } from '../errors/AppError';
import { normalizeError } from '../middleware/errorHandler';
import { LocationService } from './LocationService';

interface SocketUser {
  id: string;
}

export interface Gateway {
  io: Server;
  locations: LocationService;
  close(): Promise<void>;
}

type Ack = (result: { ok: true } | { ok: false; code: ErrorCode; message: string }) => void;

export function attachRealtime(httpServer: HttpServer, ctx: AppContext): Gateway {
  const io = new Server(httpServer, {
    cors: { origin: ctx.config.CLIENT_ORIGIN, credentials: true },
    // The page and the socket share one origin in the demo; the path is fixed so a proxy can route it.
    path: '/socket.io',
  });
  const locations = new LocationService(ctx);

  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- every path inside ends in next(), so no rejection can escape
  io.use(async (socket, next) => {
    try {
      const token = sessionTokenFromHeader(socket.handshake.headers.cookie);
      if (!token) throw new AppError('AUTH_REQUIRED');
      const claims = verifySession(token, ctx.config, ctx.clock);
      const user = await ctx.db().user.findUnique({ where: { id: claims.sub }, select: { id: true, accountStatus: true, sessionVersion: true } });
      if (!user || user.sessionVersion !== claims.sv) throw new AppError('INVALID_TOKEN');
      (socket.data as { user: SocketUser }).user = { id: user.id };
      next();
    } catch (err) {
      next(Object.assign(new Error(isAppError(err) ? err.code : 'AUTH_REQUIRED'), { data: { code: isAppError(err) ? err.code : 'AUTH_REQUIRED' } }));
    }
  });

  io.on('connection', (socket) => {
    const user = (socket.data as { user: SocketUser }).user;
    void socket.join(roomFor.user(user.id));

    const guard = (handler: (raw: unknown) => Promise<void>) => async (raw: unknown, ack?: Ack) => {
      try {
        await handler(raw);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        const app = normalizeError(err).appError; // a malformed payload (ZodError) becomes VALIDATION_ERROR, like over HTTP
        if (app.statusCode >= 500) ctx.logger.error({ userId: user.id, err: String(err) }, 'socket handler failed');
        const failure = { code: app.code, message: app.statusCode >= 500 ? 'Something went wrong.' : app.message };
        socket.emit('app:error', failure);
        if (typeof ack === 'function') ack({ ok: false, ...failure });
      }
    };

    socket.on(
      'journey:join',
      guard(async (raw) => {
        const { journeyId } = ClientEvents['journey:join'].parse(raw);
        await locations.assertCanJoin(user.id, journeyId);
        await socket.join(roomFor.journey(journeyId));
      }),
    );

    socket.on(
      'journey:leave',
      guard(async (raw) => {
        const { journeyId } = ClientEvents['journey:leave'].parse(raw);
        await socket.leave(roomFor.journey(journeyId));
      }),
    );

    socket.on(
      'location:update',
      guard(async (raw) => {
        const { journeyId, position } = ClientEvents['location:update'].parse(raw);
        await locations.handleUpdate(user.id, journeyId, position);
      }),
    );
  });

  const realtime: Realtime = {
    emitToUser: (userId, event, payload) => void io.to(roomFor.user(userId)).emit(event, payload),
    emitToJourney: (journeyId, event, payload) => void io.to(roomFor.journey(journeyId)).emit(event, payload),
    closeJourney: (journeyId) => void io.in(roomFor.journey(journeyId)).socketsLeave(roomFor.journey(journeyId)),
    removeFromJourney: (userId, journeyId) => void io.in(roomFor.user(userId)).socketsLeave(roomFor.journey(journeyId)),
  };
  ctx.realtime = realtime;
  wireEvents(ctx, realtime);

  return {
    io,
    locations,
    close: () =>
      new Promise<void>((resolve) => {
        void io.close(() => resolve());
      }),
  };
}

/** Domain events -> what the people in a journey room see. */
function wireEvents(ctx: AppContext, realtime: Realtime): void {
  const at = () => ctx.clock.now().toISOString();
  ctx.bus.on('TripStarted', (e) => realtime.emitToJourney(e.journeyId, 'journey:status', { journeyId: e.journeyId, status: 'IN_PROGRESS', at: at() }));
  ctx.bus.on('TripCompleted', (e) => realtime.emitToJourney(e.journeyId, 'journey:status', { journeyId: e.journeyId, status: 'COMPLETED', at: at() }));
  ctx.bus.on('JourneyCancelled', (e) => {
    realtime.emitToJourney(e.journeyId, 'journey:status', { journeyId: e.journeyId, status: 'CANCELLED', at: at() });
    realtime.closeJourney?.(e.journeyId); // sharing stops at once on cancel
  });
  ctx.bus.on('NoShowWindowOpened', (e) => realtime.emitToJourney(e.journeyId, 'noshow:open', { journeyId: e.journeyId, bookingId: e.bookingId }));
  ctx.bus.on('PickupStatusChanged', (e) => {
    realtime.emitToJourney(e.journeyId, 'pickup:status', {
      journeyId: e.journeyId,
      bookingId: e.bookingId,
      status: e.status,
      distanceM: e.distanceM,
      etaSec: e.etaSec,
    });
    if (['DROPPED_OFF', 'NO_SHOW', 'UNPAID'].includes(e.status)) realtime.removeFromJourney?.(e.passengerId, e.journeyId); // FR 7.10
  });
}

export type { Socket };
