/**
 * Tasks B8, B9, C6, C7, D6 (screens): Passenger home, Request a hop (UC-7), ranked Matches (UC-8), Confirm booking with the wallet check
 * (UC-7, UC-21), and the Booking screen: waiting, confirmed, tracking, cancel (UC-11), call the driver (UC-15), rate (UC-19).
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { DEFAULTS } from '@campus-hop/shared';
import { errorMessage, isCode } from '../api/client';
import { useApiMutation, useApiQuery, useRefresh } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { LowBalanceNotice } from '../components/LowBalanceNotice';
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
  Field,
  LinkButton,
  Money,
  PageTitle,
  SimulatedNote,
  StarPicker,
  Stars,
  StatusChip,
} from '../components/ui';
import { useCatalog } from '../hooks/useCatalog';
import { useWakeLock } from '../hooks/useDevice';
import { useJourneyChannel } from '../hooks/useSocket';
import { latestPickup } from '../lib/pickup';
import { CallButton } from './DriverTripPages';

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' });

// ------------------------------------------------------------------------------------------------ home
export function PassengerHomePage() {
  const { me } = useAuth();
  const wallet = useApiQuery('wallet.get');
  const history = useApiQuery('history.list');
  const open = useApiQuery('hops.mine');
  const refreshHome = useRefresh();
  const withdraw = useApiMutation('hops.cancel', { onSuccess: () => refreshHome('hops.mine') });
  const active = history.data?.find((h) => h.kind === 'BOOKING' && ['PENDING', 'CONFIRMED'].includes(h.status));
  return (
    <>
      <PageTitle sub="Share a ride across campus.">Hi {me?.name.split(' ')[0]}</PageTitle>
      {active ? (
        <Card title="Your booking" tone="good">
          <div className="row between">
            <span>
              {active.fromName} to {active.toName}
            </span>
            <StatusChip status={active.status} />
          </div>
          <LinkButton to={`/passenger/booking/${active.id}`}>Open</LinkButton>
        </Card>
      ) : open.data?.[0] ? (
        <Card title="Your request is open" tone="good">
          <p>We will tell you when a driver going your way goes live.</p>
          <div className="row">
            <LinkButton to={`/passenger/matches/${open.data[0].id}`}>See matches</LinkButton>
            <Button variant="secondary" busy={withdraw.isPending} onClick={() => withdraw.mutate({ params: { id: open.data![0]!.id } })}>
              Withdraw request
            </Button>
          </div>
          <ErrorBanner error={withdraw.error} />
        </Card>
      ) : (
        <Card title="Where to?">
          <p>Tell us where you are and where you are going. We match you with drivers already heading that way.</p>
          <LinkButton to="/passenger/request">Request a hop</LinkButton>
        </Card>
      )}
      <Card title="Wallet">
        {wallet.data ? (
          <>
            <span className="big">
              <Money cents={wallet.data.availableCents} />
            </span>
            <span className="muted small">available</span>
            <SimulatedNote />
            <LinkButton to="/wallet" variant="secondary">
              Top up
            </LinkButton>
          </>
        ) : (
          <Spinner />
        )}
      </Card>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ request a hop
export function RequestHopPage() {
  const navigate = useNavigate();
  const catalog = useCatalog();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [later, setLater] = useState(false);
  const [clock, setClock] = useState('');
  const existing = useApiQuery('hops.mine');
  const refresh = useRefresh();
  const create = useApiMutation('hops.create', {
    onSuccess: async (r) => {
      await refresh('hops.mine');
      void navigate(`/passenger/matches/${r.hopRequest.id}`);
    },
  });
  const [problem, setProblem] = useState<string | null>(null);

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setProblem(null);
    if (!from || !to) return setProblem('Choose where you are and where you are going.');
    if (from === to) return setProblem('Your start and destination must be different places.');
    let requestedTime: string | undefined;
    if (later) {
      if (!clock) return setProblem('Choose a time for later today.');
      const [h, m] = clock.split(':').map(Number);
      const t = new Date();
      t.setHours(h!, m!, 0, 0);
      if (t.getTime() < Date.now()) return setProblem('That time has already passed.');
      requestedTime = t.toISOString();
    }
    create.mutate({ body: { fromLocationId: from, toLocationId: to, ...(requestedTime ? { requestedTime } : {}) } });
  };

  const open = existing.data?.[0];
  const options = catalog.places.map((p) => (
    <option key={p.id} value={p.id}>
      {p.name}
    </option>
  ));
  return (
    <>
      <PageTitle sub="Pick places from the campus list.">Request a hop</PageTitle>
      <LowBalanceNotice />
      {open && (
        <Banner kind="info">
          You already have an open request. <Link to={`/passenger/matches/${open.id}`}>See its matches</Link>
        </Banner>
      )}
      {catalog.loading ? (
        <Spinner />
      ) : (
        <form className="stack" onSubmit={submit} noValidate>
          <Field label="I am at">
            {(id) => (
              <select id={id} value={from} onChange={(e) => setFrom(e.target.value)}>
                <option value="">Choose…</option>
                {options}
              </select>
            )}
          </Field>
          <Field label="I am going to">
            {(id) => (
              <select id={id} value={to} onChange={(e) => setTo(e.target.value)}>
                <option value="">Choose…</option>
                {options}
              </select>
            )}
          </Field>
          <fieldset>
            <legend>When</legend>
            <label className="check">
              <input type="radio" name="when" checked={!later} onChange={() => setLater(false)} /> Now
            </label>
            <label className="check">
              <input type="radio" name="when" checked={later} onChange={() => setLater(true)} /> Later today
            </label>
            {later && <Field label="Time">{(id) => <input id={id} type="time" value={clock} onChange={(e) => setClock(e.target.value)} />}</Field>}
          </fieldset>
          {problem && <Banner kind="error">{problem}</Banner>}
          {isCode(create.error, 'ACCOUNT_LOCKED') && (
            <Banner kind="error">
              Your account is locked. <Link to="/locked">See what you owe</Link>
            </Banner>
          )}
          {isCode(create.error, 'CONFLICT') && <Banner kind="warn">You already have an open request. Wait for it to end first.</Banner>}
          {create.error && !isCode(create.error, 'ACCOUNT_LOCKED', 'CONFLICT') && <ErrorBanner error={create.error} />}
          <Button type="submit" busy={create.isPending}>
            Find a ride
          </Button>
        </form>
      )}
    </>
  );
}

// ------------------------------------------------------------------------------------------------ matches
export function MatchesPage() {
  const { id = '' } = useParams();
  const catalog = useCatalog();
  const matches = useApiQuery('hops.matches', { params: { id } }, { refetchInterval: 10_000 });
  const mine = useApiQuery('hops.mine');
  const request = mine.data?.find((r) => r.id === id);
  return (
    <>
      <PageTitle sub={request ? `${catalog.placeName(request.fromLocationId)} to ${catalog.placeName(request.toLocationId)}` : undefined}>
        Drivers going your way
      </PageTitle>
      {matches.isLoading && <Spinner />}
      <ErrorBanner error={matches.error} />
      {matches.data?.length === 0 && (
        <EmptyState title="No driver yet">Your request stays open. We will notify you as soon as a driver going your way goes live.</EmptyState>
      )}
      <ul className="list">
        {matches.data?.map((m) => (
          <li key={m.journeyId}>
            <Card
              title={
                <>
                  {m.driver.name.split(' ')[0]} <Stars value={m.driver.avgRating} />
                </>
              }
            >
              <div className="kv">
                <span>Pickup</span>
                <span>{catalog.pickup(m.pickupPoint.id).label}</span>
              </div>
              <div className="kv">
                <span>Walk</span>
                <span>{Math.round(m.walkDistanceM)} m</span>
              </div>
              <div className="kv">
                <span>Pickup time</span>
                <span>{time(m.pickupTime)}</span>
              </div>
              <div className="kv">
                <span>Fare</span>
                <Money cents={m.fareCents} />
              </div>
              {m.driver.unpaidCount > 0 && (
                <Badge tone="warn">
                  Driver has {m.driver.unpaidCount} unpaid ride{m.driver.unpaidCount > 1 ? 's' : ''}
                </Badge>
              )}
              <LinkButton to={`/passenger/book/${m.journeyId}?request=${id}&pickup=${m.pickupPoint.id}${request ? `&to=${request.toLocationId}` : ''}`}>
                Choose this ride
              </LinkButton>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ confirm booking (wallet check)
export function BookConfirmPage() {
  const { journeyId = '' } = useParams();
  const [params] = useSearchParams();
  const requestId = params.get('request') ?? undefined;
  const pickup = params.get('pickup') ?? '';
  const navigate = useNavigate();
  const catalog = useCatalog();
  const preview = useApiQuery('bookings.preview', { query: { journeyId } });
  const mine = useApiQuery('hops.mine');
  const request = mine.data?.find((r) => r.id === requestId);
  const destination = catalog.places.find((p) => p.id === (params.get('to') ?? request?.toLocationId));
  const [dropoff, setDropoff] = useState('');
  const dropoffId = dropoff || destination?.pickupPoints[0]?.id || '';
  const book = useApiMutation('bookings.create', { onSuccess: (b) => navigate(`/passenger/booking/${b.id}`, { replace: true }) });

  if (preview.isLoading) return <Spinner />;
  const p = preview.data;
  const err = book.error;
  return (
    <>
      <PageTitle sub="The driver confirms your seat. Money is only held once they say yes.">Confirm your booking</PageTitle>
      <ErrorBanner error={preview.error} />
      {p && (
        <Card title="Fare">
          <span className="big">
            <Money cents={p.fareCents} />
          </span>
          <div className="kv">
            <span>Your available balance</span>
            <Money cents={p.availableCents} />
          </div>
          <SimulatedNote />
          {p.check === 'ENOUGH' && <Banner kind="good">You have enough in your wallet.</Banner>}
          {p.check === 'ON_TRUST' && (
            <Banner kind="warn">
              Booked on trust: your balance is a little short, but you have completed {DEFAULTS.TRUST_MIN_COMPLETED_RIDES}+ rides. Top up before the trip ends
              or your account is locked.
            </Banner>
          )}
          {p.check === 'NOT_ENOUGH' && (
            <Banner kind="error">
              Not enough balance for this ride. <Link to="/wallet">Top up your wallet</Link>
            </Banner>
          )}
        </Card>
      )}
      <div className="field">
        <label htmlFor="dropoff">Where should we drop you?</label>
        <select id="dropoff" value={dropoffId} onChange={(e) => setDropoff(e.target.value)} disabled={!destination}>
          {destination?.pickupPoints.map((s) => (
            <option key={s.id} value={s.id}>
              {destination.name}: {catalog.pickup(s.id).label}
            </option>
          )) ?? <option value="">Open your request first</option>}
        </select>
      </div>
      {isCode(err, 'SEAT_UNAVAILABLE') && (
        <Banner kind="warn">
          That seat was just taken. <Link to={requestId ? `/passenger/matches/${requestId}` : '/passenger/request'}>Choose another ride</Link>
        </Banner>
      )}
      {isCode(err, 'ACCOUNT_LOCKED') && (
        <Banner kind="error">
          Your account is locked. <Link to="/locked">See what you owe</Link>
        </Banner>
      )}
      {isCode(err, 'INSUFFICIENT_BALANCE') && (
        <Banner kind="error">
          Your balance is too low. <Link to="/wallet">Top up</Link>
        </Banner>
      )}
      {err && !isCode(err, 'SEAT_UNAVAILABLE', 'ACCOUNT_LOCKED', 'INSUFFICIENT_BALANCE') && <ErrorBanner error={err} />}
      <Button
        busy={book.isPending}
        disabled={!p || p.check === 'NOT_ENOUGH' || !dropoffId || !pickup}
        onClick={() =>
          book.mutate({ body: { journeyId, pickupPointId: pickup, dropoffPointId: dropoffId, ...(requestId ? { hopRequestId: requestId } : {}) } })
        }
      >
        Ask the driver
      </Button>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ the booking: waiting, confirmed, tracking, done
export function BookingPage() {
  const { id = '' } = useParams();
  const catalog = useCatalog();
  const refresh = useRefresh();
  const booking = useApiQuery('bookings.get', { params: { id } }, { refetchInterval: 4000 });
  const b = booking.data;
  // Follow the car only while still waiting for it or riding: after drop-off or a no-show the server refuses anyway (FR 7.10).
  const confirmed = b?.status === 'CONFIRMED' && !['DROPPED_OFF', 'NO_SHOW', 'UNPAID'].includes(b.pickupStatus);
  const [retry, setRetry] = useState(0);
  const channel = useJourneyChannel(b?.journeyId, confirmed, retry);
  // The trip may not have started yet; try to follow it again every 5 s until the server lets us in.
  useEffect(() => {
    if (!confirmed || channel.joined) return;
    const t = setInterval(() => setRetry((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, [confirmed, channel.joined]);
  useWakeLock(confirmed && channel.joined);

  const [askCancel, setAskCancel] = useState(false);
  const cancel = useApiMutation('bookings.cancel', {
    onSuccess: async () => {
      setAskCancel(false);
      await refresh('bookings.get', 'history.list', 'wallet.get');
    },
  });
  const [stars, setStars] = useState(0);
  const [rated, setRated] = useState(false);
  const rate = useApiMutation('ratings.create', { onSuccess: () => setRated(true) });

  if (booking.isLoading) return <Spinner />;
  if (!b) return <ErrorBanner error={booking.error} />;
  const live = channel.pickups[b.id];
  const status = latestPickup(b.pickupStatus, live?.status);
  const done = b.status === 'COMPLETED';

  return (
    <>
      <PageTitle sub={`${catalog.pickup(b.pickupPointId).label} to ${catalog.pickup(b.dropoffPointId).label}`}>
        Your ride{b.counterpartFirstName ? ` with ${b.counterpartFirstName}` : ''}
      </PageTitle>
      <div className="row between">
        <StatusChip status={b.status} />
        {confirmed && <StatusChip status={status} />}
      </div>
      {b.status === 'PENDING' && <Banner kind="info">Waiting for the driver to confirm. You can cancel at any time.</Banner>}
      {b.status === 'CANCELLED' && <Banner kind="warn">This booking is cancelled. Any money on hold has been released.</Banner>}
      {b.bookedOnTrust && b.status !== 'CANCELLED' && <Banner kind="warn">Booked on trust: top up before the trip ends.</Banner>}
      <Card title="Fare">
        <span className="big">
          <Money cents={b.finalFareCents ?? b.currentFareCents} />
        </span>
        <span className="muted small">{b.finalFareCents === null ? 'Current fare: it drops if another rider joins.' : 'Final fare'}</span>
        <SimulatedNote />
        {b.paymentStatus === 'UNPAID' && (
          <Banner kind="error">
            Part of this fare is unpaid. <Link to="/locked">Top up to unlock your account</Link>
          </Banner>
        )}
      </Card>
      {confirmed && (
        <>
          <TrackingMap polyline={null} position={channel.position} receivedAt={channel.positionAt} />
          {typeof live?.distanceM === 'number' && status !== 'ARRIVED' && (
            <Banner kind="info">
              Driver is {live.distanceM} m away{typeof live.etaSec === 'number' && `, about ${Math.max(1, Math.round(live.etaSec / 60))} min`}.
            </Banner>
          )}
          {status === 'ARRIVED' && <Banner kind="good">Your driver has arrived.</Banner>}
          {!channel.joined && <p className="muted small">Live tracking starts when the driver begins the trip.</p>}
          <CallButton bookingId={b.id} name={b.counterpartFirstName} />
        </>
      )}
      {done && b.pickupStatus !== 'NO_SHOW' && (
        <Card title="How was the ride?">
          {rated ? (
            <Badge tone="good">Thanks for rating</Badge>
          ) : (
            <>
              <StarPicker value={stars} onChange={setStars} />
              <Button disabled={!stars} busy={rate.isPending} onClick={() => rate.mutate({ params: { id: b.id }, body: { stars } })}>
                Send rating
              </Button>
              {isCode(rate.error, 'ALREADY_RATED') ? <Banner kind="info">You have already rated this ride.</Banner> : <ErrorBanner error={rate.error} />}
            </>
          )}
        </Card>
      )}
      {/* Not once the trip has started (UC-11.EX.1): only then can we follow the car, or has the pickup moved past WAITING. */}
      {['PENDING', 'CONFIRMED'].includes(b.status) && !channel.joined && b.pickupStatus === 'WAITING' && (
        <>
          <Button variant="danger" onClick={() => setAskCancel(true)}>
            Cancel booking
          </Button>
          {cancel.error && (
            <Banner kind="error">
              {isCode(cancel.error, 'ILLEGAL_STATE_TRANSITION')
                ? 'The trip has already started, so it can no longer be cancelled.'
                : errorMessage(cancel.error)}
            </Banner>
          )}
        </>
      )}
      <ConfirmDialog
        open={askCancel}
        title="Cancel this booking?"
        confirmLabel="Yes, cancel"
        danger
        busy={cancel.isPending}
        onCancel={() => setAskCancel(false)}
        onConfirm={() => cancel.mutate({ params: { id: b.id } })}
      >
        <p>The driver is told and any money held for this ride is released.</p>
      </ConfirmDialog>
      <LinkButton to="/passenger" variant="ghost">
        Back home
      </LinkButton>
    </>
  );
}
