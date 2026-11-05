/**
 * Tasks B7, C5, D5 (screens): Driver home, Go Live (UC-4, the route of UC-6 is shown once it is calculated), the live journey with request cards (UC-10, UC-5), the Active Trip (UC-12,
 * UC-13, UC-15) and Trip Complete with ratings (UC-14, UC-19). The server decides every rule; these screens only show the state
 * and send the driver's buttons.
 */
import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import type { Hop } from '@campus-hop/shared';
import type { z } from 'zod';
import { call, errorMessage, isCode } from '../api/client';
import { useApiMutation, useApiQuery, useRefresh } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { Spinner } from '../components/Spinner';
import { TrackingMap } from '../components/TrackingMap';
import {
  Badge,
  Banner,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  LinkButton,
  Money,
  PageTitle,
  SimulatedNote,
  StarPicker,
  Stars,
  StatusChip,
} from '../components/ui';
import { useCatalog } from '../hooks/useCatalog';
import { geoProblem, getFix, useLocationReporter, useWakeLock } from '../hooks/useDevice';
import { latestPickup } from '../lib/pickup';
import { useJourneyChannel } from '../hooks/useSocket';

type Journey = z.infer<typeof Hop.Journey>;
const ACTIVE = ['LIVE', 'OPEN', 'FULL', 'IN_PROGRESS'];

export function useMyJourney(id: string | undefined, pollMs = 5000) {
  const q = useApiQuery('journeys.mine', undefined, { refetchInterval: pollMs });
  return { ...q, journey: q.data?.find((j) => j.id === id) as Journey | undefined };
}

// ------------------------------------------------------------------------------------------------ home
export function DriverHomePage() {
  const { me } = useAuth();
  const journeys = useApiQuery('journeys.mine');
  const presets = useApiQuery('presets.list');
  const active = journeys.data?.find((j) => ACTIVE.includes(j.status));
  return (
    <>
      <PageTitle sub="Offer the seats on a journey you are making anyway.">Hi {me?.name.split(' ')[0]}</PageTitle>
      {!me?.hasDriverProfile && <Banner kind="warn">Add your vehicle details in your preset before you go live.</Banner>}
      {active ? (
        <Card title="Your journey" tone="good">
          <div className="row between">
            <StatusChip status={active.status} />
            <span className="muted">
              {active.seatsAvailable} seat{active.seatsAvailable === 1 ? '' : 's'} free
            </span>
          </div>
          <LinkButton to={active.status === 'IN_PROGRESS' ? `/driver/trip/${active.id}` : `/driver/journey/${active.id}`}>
            {active.status === 'IN_PROGRESS' ? 'Open the trip' : 'See requests'}
          </LinkButton>
        </Card>
      ) : presets.data?.length ? (
        <Card title="Ready to go?">
          <p>Pick a preset, share your location, and passengers going your way can ask to join.</p>
          <LinkButton to="/driver/go-live">Go live</LinkButton>
        </Card>
      ) : (
        <EmptyState title="Set up your first preset" action={<LinkButton to="/driver/presets/new">Create a preset</LinkButton>}>
          A preset is a journey you make often, such as halls to the gate.
        </EmptyState>
      )}
      {journeys.isLoading && <Spinner />}
    </>
  );
}

// ------------------------------------------------------------------------------------------------ go live
export function GoLivePage() {
  const navigate = useNavigate();
  const presets = useApiQuery('presets.list');
  const [presetId, setPresetId] = useState('');
  const [geo, setGeo] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const refresh = useRefresh();
  // Refresh the journey list first: the journey page reads it, and a stale copy says "This journey was not found." until its next poll.
  const goLive = useApiMutation('journeys.goLive', {
    onSuccess: async (j) => {
      await refresh('journeys.mine');
      void navigate(`/driver/journey/${j.id}`, { replace: true });
    },
  });
  const chosen = presetId || presets.data?.[0]?.id || '';

  const go = async () => {
    setGeo(null);
    setAsking(true);
    const fix = await getFix();
    setAsking(false);
    if (!fix.ok) return setGeo(geoProblem(fix));
    goLive.mutate({ body: { presetId: chosen, position: fix.position, locationPermission: true } });
  };

  if (presets.isLoading) return <Spinner />;
  if (!presets.data?.length) return <Navigate to="/driver/presets/new" replace />;
  const err = goLive.error;
  return (
    <>
      <PageTitle sub="Your phone shares its location so the route can be worked out and passengers can be matched.">Go live</PageTitle>
      <div className="field">
        <label htmlFor="preset">Preset</label>
        <select id="preset" value={chosen} onChange={(e) => setPresetId(e.target.value)}>
          {presets.data.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.plan === 'SOLO' ? '1 seat' : `${3} seats`})
            </option>
          ))}
        </select>
      </div>
      <Banner kind="info">
        You confirmed when you saved this preset that you would make this journey anyway. Campus Hop is for sharing, not for a paid taxi service.
      </Banner>
      {geo && <Banner kind="error">{geo}</Banner>}
      {isCode(err, 'DAILY_TRIP_LIMIT_REACHED') && <Banner kind="warn">You have already done two paid trips today. Try again tomorrow.</Banner>}
      {isCode(err, 'EXTERNAL_SERVICE_UNAVAILABLE') && <Banner kind="warn">The route could not be worked out right now. Please try again in a moment.</Banner>}
      {err && !isCode(err, 'DAILY_TRIP_LIMIT_REACHED', 'EXTERNAL_SERVICE_UNAVAILABLE') && <ErrorBanner error={err} />}
      <Button onClick={() => void go()} busy={asking || goLive.isPending} disabled={!chosen}>
        Share my location and go live
      </Button>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ live journey: request cards
export function DriverJourneyPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const catalog = useCatalog();
  const refresh = useRefresh();
  const { journey, isLoading } = useMyJourney(id);
  const live = !!journey && ['LIVE', 'OPEN', 'FULL'].includes(journey.status);
  const cards = useApiQuery('journeys.requests', { params: { id } }, { enabled: live, refetchInterval: 5000 });
  const bookings = useApiQuery('bookings.forJourney', { params: { id } }, { enabled: !!journey, refetchInterval: 5000 });
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // Before the trip starts the phone reports its position about every 5 s so the server can cancel the journey if the driver leaves campus.
  const position = useApiMutation('journeys.position');
  const { problem, lastFix } = useLocationReporter(live, 5000, (p) => position.mutate({ params: { id }, body: p }));

  const accept = useApiMutation('bookings.accept', { onSettled: () => refresh('journeys.requests', 'bookings.forJourney', 'journeys.mine') });
  const decline = useApiMutation('bookings.decline', { onSettled: () => refresh('journeys.requests', 'bookings.forJourney') });
  const cancel = useApiMutation('journeys.cancel', {
    onSuccess: async () => {
      await refresh('journeys.mine');
      void navigate('/driver', { replace: true });
    },
  });

  if (isLoading) return <Spinner />;
  if (!journey) return <Banner kind="error">This journey was not found.</Banner>;
  if (journey.status === 'IN_PROGRESS') return <Navigate to={`/driver/trip/${id}`} replace />;
  if (journey.status === 'COMPLETED') return <Navigate to={`/driver/complete/${id}`} replace />;

  const confirmed = bookings.data?.filter((b) => b.status === 'CONFIRMED') ?? [];
  const start = async () => {
    setStartError(null);
    setStarting(true);
    const fix = await getFix();
    if (!fix.ok) {
      setStarting(false);
      return setStartError(geoProblem(fix));
    }
    try {
      await call('journeys.start', { params: { id }, body: { locationPermission: true, position: fix.position } });
      await refresh('journeys.mine');
      void navigate(`/driver/trip/${id}`, { replace: true });
    } catch (e) {
      setStartError(isCode(e, 'DAILY_TRIP_LIMIT_REACHED') ? 'You have already done two paid trips today.' : errorMessage(e));
    } finally {
      setStarting(false);
    }
  };

  return (
    <>
      <PageTitle
        sub={
          journey.route
            ? `Route: ${(journey.route.distanceM / 1000).toFixed(1)} km, about ${Math.max(1, Math.round(journey.route.durationSec / 60))} min`
            : undefined
        }
      >
        Your journey
      </PageTitle>
      <div className="row between">
        <StatusChip status={journey.status} />
        <span className="muted">
          {journey.seatsAvailable} seat{journey.seatsAvailable === 1 ? '' : 's'} free
        </span>
      </div>
      {['CANCELLED', 'EXPIRED'].includes(journey.status) ? (
        <>
          <Banner kind={journey.status === 'EXPIRED' ? 'warn' : 'error'}>
            {journey.status === 'EXPIRED'
              ? 'Nobody booked in time, so this journey ended.'
              : journey.cancelReason === 'GEOFENCE'
                ? 'This journey was cancelled because you left the campus before starting.'
                : 'This journey was cancelled.'}
          </Banner>
          <LinkButton to="/driver">Back home</LinkButton>
        </>
      ) : (
        <>
          <TrackingMap polyline={journey.route?.polyline ?? null} position={lastFix} receivedAt={lastFix ? Date.now() : null} />
          {problem && <Banner kind="warn">{problem}</Banner>}
          <h2>Requests</h2>
          <ErrorBanner error={accept.error ?? decline.error} />
          {cards.data?.length === 0 && <EmptyState title="No requests yet">Passengers going your way will appear here. Keep this screen open.</EmptyState>}
          <ul className="list">
            {cards.data?.map((c) => (
              <li key={c.bookingId ?? c.hopRequestId}>
                <Card
                  title={
                    <>
                      {c.passenger.firstName} <Stars value={c.passenger.avgRating} />
                    </>
                  }
                >
                  <div className="kv">
                    <span>Pickup</span>
                    <span>{catalog.pickup(c.pickupPoint.id).label}</span>
                  </div>
                  <div className="kv">
                    <span>Extra detour</span>
                    <span>{c.detourMin.toFixed(1)} min</span>
                  </div>
                  <div className="kv">
                    <span>Fare if you accept</span>
                    <Money cents={c.fareCentsIfAccepted} />
                  </div>
                  {c.passenger.unpaidCount > 0 && (
                    <Badge tone="warn">
                      {c.passenger.unpaidCount} unpaid ride{c.passenger.unpaidCount > 1 ? 's' : ''}
                    </Badge>
                  )}
                  {c.bookingId ? (
                    <div className="row">
                      <Button
                        onClick={() => accept.mutate({ params: { id: c.bookingId! } })}
                        busy={accept.isPending && accept.variables?.params?.id === c.bookingId}
                      >
                        Accept
                      </Button>
                      <Button variant="secondary" onClick={() => decline.mutate({ params: { id: c.bookingId! } })}>
                        Decline
                      </Button>
                    </div>
                  ) : (
                    <p className="muted small">Asked for a ride nearby. They will book you if you suit them.</p>
                  )}
                </Card>
              </li>
            ))}
          </ul>
          {confirmed.length > 0 && (
            <Card title={`Confirmed riders (${confirmed.length})`}>
              {confirmed.map((b) => (
                <div key={b.id} className="kv">
                  <span>{b.counterpartFirstName}</span>
                  <span>{catalog.pickup(b.pickupPointId).label}</span>
                </div>
              ))}
            </Card>
          )}
          {startError && <Banner kind="error">{startError}</Banner>}
          <Button onClick={() => void start()} disabled={confirmed.length === 0} busy={starting}>
            Start trip
          </Button>
          {confirmed.length === 0 && <p className="muted small">You can start once at least one passenger is confirmed.</p>}
          <Button variant="danger" onClick={() => setConfirmCancel(true)}>
            Cancel journey
          </Button>
          <ConfirmDialog
            open={confirmCancel}
            title="Cancel this journey?"
            confirmLabel="Yes, cancel it"
            danger
            busy={cancel.isPending}
            onCancel={() => setConfirmCancel(false)}
            onConfirm={() => cancel.mutate({ params: { id } })}
          >
            <p>Every passenger is told and any money on hold is released.</p>
          </ConfirmDialog>
          <ErrorBanner error={cancel.error} />
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------------------------------------------ active trip
export function CallButton({ bookingId, name }: { bookingId: string; name: string | null }) {
  const [shown, setShown] = useState<{ firstName: string; phone: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="stack">
      {!shown && (
        <Button
          variant="secondary"
          onClick={() =>
            void call('bookings.contact', { params: { id: bookingId } })
              .then((c) => setShown(c))
              .catch((e) => setError(errorMessage(e)))
          }
        >
          Call {name ?? 'rider'}
        </Button>
      )}
      {shown && (
        <a className="btn btn-secondary" href={`tel:${shown.phone}`}>
          Call {shown.firstName}: {shown.phone}
        </a>
      )}
      {error && <Banner kind="error">{error}</Banner>}
    </div>
  );
}

export function DriverTripPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const catalog = useCatalog();
  const refresh = useRefresh();
  const { journey, isLoading } = useMyJourney(id, 4000);
  const running = journey?.status === 'IN_PROGRESS';
  const bookings = useApiQuery('bookings.forJourney', { params: { id } }, { enabled: !!journey, refetchInterval: 4000 });
  const channel = useJourneyChannel(id, running);
  const { held } = useWakeLock(!!running);
  const { problem, lastFix } = useLocationReporter(!!running, 5000, (p) => channel.sendPosition(p));
  const mark = useApiMutation('bookings.pickupStatus', { onSettled: () => refresh('bookings.forJourney') });
  const complete = useApiMutation('journeys.complete', {
    onSuccess: async () => {
      await refresh('journeys.mine', 'bookings.forJourney', 'wallet.get', 'history.list');
      void navigate(`/driver/complete/${id}`, { replace: true });
    },
  });

  if (isLoading) return <Spinner />;
  if (!journey) return <Banner kind="error">This trip was not found.</Banner>;
  if (journey.status === 'COMPLETED') return <Navigate to={`/driver/complete/${id}`} replace />;
  if (!running) return <Navigate to={`/driver/journey/${id}`} replace />;

  const riders = bookings.data?.filter((b) => b.status === 'CONFIRMED') ?? [];
  const statusOf = (b: (typeof riders)[number]) => latestPickup(b.pickupStatus, channel.pickups[b.id]?.status);
  const unresolved = riders.some((b) => !['DROPPED_OFF', 'NO_SHOW', 'UNPAID'].includes(statusOf(b)));

  return (
    <>
      <PageTitle sub={held ? 'Your screen stays on during the trip.' : 'Keep this screen open: browsers cannot track you in the background.'}>
        Trip in progress
      </PageTitle>
      <TrackingMap polyline={journey.route?.polyline ?? null} position={lastFix} receivedAt={lastFix ? Date.now() : null} />
      {problem && <Banner kind="warn">{problem}</Banner>}
      {channel.error && <Banner kind="warn">Live sharing: {channel.error}</Banner>}
      <ErrorBanner error={mark.error ?? complete.error} />
      <ul className="list">
        {riders.map((b) => {
          const s = statusOf(b);
          const live = channel.pickups[b.id];
          return (
            <li key={b.id}>
              <Card
                title={
                  <>
                    {b.counterpartFirstName ?? 'Rider'} <StatusChip status={s} />
                  </>
                }
              >
                <div className="kv">
                  <span>Pickup</span>
                  <span>{catalog.pickup(b.pickupPointId).label}</span>
                </div>
                {typeof live?.distanceM === 'number' && s !== 'ARRIVED' && (
                  <div className="kv">
                    <span>Distance</span>
                    <span>
                      {live.distanceM} m {typeof live.etaSec === 'number' && `(about ${Math.max(1, Math.round(live.etaSec / 60))} min)`}
                    </span>
                  </div>
                )}
                {['WAITING', 'APPROACHING', 'ARRIVED'].includes(s) && (
                  <div className="row">
                    {s !== 'ARRIVED' && (
                      // GPS normally says this; the button covers a weak fix, so a rider who never comes can still be marked no-show.
                      <Button variant="secondary" busy={mark.isPending} onClick={() => mark.mutate({ params: { id: b.id }, body: { status: 'ARRIVED' } })}>
                        I have arrived
                      </Button>
                    )}
                    <Button busy={mark.isPending} onClick={() => mark.mutate({ params: { id: b.id }, body: { status: 'PICKED_UP' } })}>
                      Picked up
                    </Button>
                    {s === 'ARRIVED' && (
                      <Button variant="secondary" busy={mark.isPending} onClick={() => mark.mutate({ params: { id: b.id }, body: { status: 'NO_SHOW' } })}>
                        No-show
                      </Button>
                    )}
                  </div>
                )}
                {s === 'ARRIVED' && (
                  <p className="muted small">{channel.noShowOpen[b.id] ? 'You can mark a no-show now.' : 'No-show is allowed 3 minutes after you arrive.'}</p>
                )}
                {s === 'PICKED_UP' && (
                  <Button busy={mark.isPending} onClick={() => mark.mutate({ params: { id: b.id }, body: { status: 'DROPPED_OFF' } })}>
                    Dropped off
                  </Button>
                )}
                <CallButton bookingId={b.id} name={b.counterpartFirstName} />
              </Card>
            </li>
          );
        })}
      </ul>
      <Button onClick={() => complete.mutate({ params: { id } })} disabled={unresolved || riders.length === 0} busy={complete.isPending}>
        Complete trip
      </Button>
      {unresolved && <p className="muted small">Mark every rider dropped off or no-show first.</p>}
    </>
  );
}

// ------------------------------------------------------------------------------------------------ trip complete + rate riders
export function TripCompletePage() {
  const { id = '' } = useParams();
  // always ask again: the copy cached on the trip screen was taken before the fares were settled
  const bookings = useApiQuery('bookings.forJourney', { params: { id } }, { refetchOnMount: 'always' });
  const [rated, setRated] = useState<Record<string, boolean>>({});
  const [stars, setStars] = useState<Record<string, number>>({});
  const rate = useApiMutation('ratings.create', { onSuccess: (_r, v) => setRated((r) => ({ ...r, [(v as { params: { id: string } }).params.id]: true })) });

  const ledger = useApiQuery('wallet.transactions', {}, { refetchOnMount: 'always' });
  const carried = bookings.data?.filter((b) => b.status === 'COMPLETED' && b.pickupStatus !== 'NO_SHOW') ?? [];
  // Earned = what reached the wallet for these riders (CREDIT rows), so this matches the wallet and the history, including a
  // part-payment from a rider who could not pay in full.
  const ids = new Set(carried.map((b) => b.id));
  const earned = (ledger.data ?? []).filter((t) => t.type === 'CREDIT' && t.bookingId !== null && ids.has(t.bookingId)).reduce((s, t) => s + t.amountCents, 0);
  const owed = carried.some((b) => b.paymentStatus === 'UNPAID');
  return (
    <>
      <PageTitle sub="Fares go straight into your wallet.">Trip complete</PageTitle>
      {bookings.isLoading && <Spinner />}
      <Card title="You earned" tone="good">
        <span className="big">
          <Money cents={earned} />
        </span>
        <SimulatedNote />
        {owed && <Banner kind="warn">A rider could not pay in full. This is what you have received so far; the rest is added when they top up.</Banner>}
      </Card>
      <h2>Rate your riders</h2>
      <ul className="list">
        {carried.map((b) => (
          <li key={b.id}>
            <Card title={b.counterpartFirstName ?? 'Rider'}>
              {rated[b.id] ? (
                <Badge tone="good">Thanks, rated</Badge>
              ) : (
                <>
                  <StarPicker value={stars[b.id] ?? 0} onChange={(n) => setStars({ ...stars, [b.id]: n })} />
                  <Button
                    variant="secondary"
                    disabled={!stars[b.id]}
                    busy={rate.isPending}
                    onClick={() => rate.mutate({ params: { id: b.id }, body: { stars: stars[b.id]! } })}
                  >
                    Send rating
                  </Button>
                </>
              )}
            </Card>
          </li>
        ))}
      </ul>
      <ErrorBanner error={rate.error} />
      <LinkButton to="/driver">Back home</LinkButton>
      <LinkButton to="/history" variant="ghost">
        See my trips
      </LinkButton>
    </>
  );
}
