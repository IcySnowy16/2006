/**
 * Tasks C7, D7, E2, A5 (screens): Wallet (UC-20), Locked account (UC-13.EX.1), Notifications (FR 8.12, 8.13), My trips and rating
 * (UC-19), Profile and settings (UC-3). Money screens always say SIMULATED (FR 10.11).
 */
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DEFAULTS } from '@campus-hop/shared';
import { isCode } from '../api/client';
import { useApiMutation, useApiQuery, useRefresh } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { LowBalanceNotice } from '../components/LowBalanceNotice';
import { Spinner } from '../components/Spinner';
import {
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  LinkButton,
  Money,
  PageTitle,
  SimulatedNote,
  StarPicker,
  StatusChip,
  dollars,
} from '../components/ui';
import { closeSocket } from '../hooks/useSocket';
import { VehicleForm } from './DriverSetupPages';

const TX_LABEL: Record<string, string> = {
  TOP_UP: 'Top-up',
  HOLD: 'Held for a ride',
  RELEASE: 'Hold released',
  DEDUCT: 'Ride paid',
  CREDIT: 'Fare received',
  PAYOUT: 'Withdrawn',
};

// ------------------------------------------------------------------------------------------------ wallet
function TopUp({ suggested }: { suggested?: number }) {
  const refresh = useRefresh();
  // const [custom, setCustom] = useState(''); // custom amount: commented out for now, fixed amounts only (team note, 25 Oct)
  const topUp = useApiMutation('wallet.topUp', {
    // Re-reading the wallet is also what un-locks the screen: AuthProvider (auth/AuthContext.tsx) watches every wallet read and
    // re-reads `me` when the debt and the lock no longer agree.
    onSuccess: () => refresh('wallet.get', 'wallet.transactions'),
  });
  // A second tap can arrive before React has drawn the disabled buttons, so `pending` alone is not enough: this flips at once.
  const sending = useRef(false);
  const send = (amountCents: number) => {
    if (sending.current) return;
    sending.current = true;
    topUp.mutate({ body: { amountCents } }, { onSettled: () => (sending.current = false) });
  };
  const amounts = suggested ? [suggested, ...DEFAULTS.TOP_UP_PRESETS_CENTS.filter((c) => c !== suggested)] : [...DEFAULTS.TOP_UP_PRESETS_CENTS];
  // const customCents = Math.round(Number(custom) * 100);
  // const customOk = custom !== '' && Number.isFinite(customCents) && customCents >= 100 && customCents <= DEFAULTS.WALLET_CAP_CENTS;
  return (
    <div className="stack">
      <div className="row">
        {amounts.map((c) => (
          <Button
            key={c}
            variant="secondary"
            onClick={() => send(c)}
            disabled={topUp.isPending}
            busy={topUp.isPending && topUp.variables?.body.amountCents === c}
          >
            Top up {dollars(c)}
          </Button>
        ))}
      </div>
      {/* Custom amount box: commented out for now, to be added later.
        <input
          aria-label="Other amount in dollars"
          inputMode="decimal"
          placeholder="Other amount, e.g. 7.50"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          style={{ flex: 1 }}
        />
        <Button disabled={!customOk} onClick={() => topUp.mutate({ body: { amountCents: customCents } })}>
          Top up
        </Button>
      */}
      {topUp.error &&
        (isCode(topUp.error, 'VALIDATION_ERROR') ? (
          <Banner kind="error">A wallet can hold at most {dollars(DEFAULTS.WALLET_CAP_CENTS)}. Choose a smaller amount.</Banner>
        ) : (
          <ErrorBanner error={topUp.error} />
        ))}
      {topUp.isSuccess && <Banner kind="good">Topped up.</Banner>}
    </div>
  );
}

export function WalletPage() {
  const { me } = useAuth();
  const wallet = useApiQuery('wallet.get');
  const tx = useApiQuery('wallet.transactions');
  const refresh = useRefresh();
  const [amount, setAmount] = useState('');
  const withdraw = useApiMutation('wallet.withdraw', { onSuccess: () => refresh('wallet.get', 'wallet.transactions') });
  const w = wallet.data;
  const cents = Math.round(Number(amount) * 100);
  return (
    <>
      <PageTitle>Wallet</PageTitle>
      <SimulatedNote />
      {me?.activeRole === 'PASSENGER' && <LowBalanceNotice showLink={false} />}
      {wallet.isLoading && <Spinner />}
      <ErrorBanner error={wallet.error} />
      {w && (
        <Card title="Balance">
          <span className="big">
            <Money cents={w.balanceCents} />
          </span>
          <div className="kv">
            <span>Held for rides</span>
            <Money cents={w.heldCents} />
          </div>
          <div className="kv">
            <span>Available</span>
            <Money cents={w.availableCents} />
          </div>
          {w.debt && (
            <Banner kind="error">
              You owe <Money cents={w.debt.amountCents} />. <Link to="/locked">What to do</Link>
            </Banner>
          )}
        </Card>
      )}
      <Card title="Top up">
        <TopUp />
      </Card>
      {me?.activeRole === 'DRIVER' && (
        <Card title="Withdraw earnings">
          <div className="row">
            <input
              aria-label="Amount to withdraw in dollars"
              inputMode="decimal"
              placeholder="Amount, e.g. 5.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{ flex: 1 }}
            />
            <Button variant="secondary" disabled={!(cents >= 100)} busy={withdraw.isPending} onClick={() => withdraw.mutate({ body: { amountCents: cents } })}>
              Withdraw
            </Button>
          </div>
          {isCode(withdraw.error, 'INSUFFICIENT_BALANCE') ? (
            <Banner kind="error">You cannot withdraw more than you have available.</Banner>
          ) : (
            <ErrorBanner error={withdraw.error} />
          )}
          <p className="muted small">Pretend payout to PayNow. No real money moves.</p>
        </Card>
      )}
      <h2>History</h2>
      {tx.data?.length === 0 && <EmptyState title="No money movements yet" />}
      <ul className="list">
        {tx.data?.map((t) => (
          <li key={t.id} className="card">
            <div className="kv">
              <span>{TX_LABEL[t.type] ?? t.type}</span>
              <Money cents={t.amountCents} />
            </div>
            <span className="muted small">{new Date(t.timestamp).toLocaleString('en-SG')}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ locked account
export function LockedAccountPage() {
  const { me } = useAuth();
  const wallet = useApiQuery('wallet.get');
  const w = wallet.data;
  const owed = w?.debt?.amountCents ?? 0;
  const shortfall = Math.max(100, owed - (w?.availableCents ?? 0));
  return (
    <>
      <PageTitle
        sub={
          me?.accountStatus === 'LOCKED' ? 'You can still sign in, see your wallet and top up. You cannot request or book rides until this is paid.' : undefined
        }
      >
        {me?.accountStatus === 'LOCKED' ? 'Your account is locked' : 'Your balance'}
      </PageTitle>
      <SimulatedNote />
      {wallet.isLoading && <Spinner />}
      {w && owed > 0 ? (
        <Card title="What you owe" tone="warn">
          <span className="big">
            <Money cents={owed} />
          </span>
          <p className="muted">
            From a ride whose fare your balance could not cover in full. Your available balance is <Money cents={w.availableCents} />.
          </p>
          <p>
            Top up at least <strong>{dollars(shortfall)}</strong> and your account unlocks by itself.
          </p>
          <TopUp suggested={shortfall} />
        </Card>
      ) : (
        w && (
          <Banner kind="good">
            You owe nothing. {me?.accountStatus === 'ACTIVE' ? 'Your account is active.' : ''} <Link to="/">Go home</Link>
          </Banner>
        )
      )}
    </>
  );
}

// ------------------------------------------------------------------------------------------------ notifications
export function PushToggle() {
  const prefs = useApiQuery('notifications.getPrefs');
  const refresh = useRefresh();
  const set = useApiMutation('notifications.setPrefs', { onSuccess: () => refresh('notifications.getPrefs') });
  const features = useApiQuery('system.features', undefined, { staleTime: 5 * 60_000 });
  const on = prefs.data?.push ?? true;
  return (
    <div className="stack">
      <label className="check">
        <input type="checkbox" checked={on} disabled={prefs.isLoading} onChange={(e) => set.mutate({ body: { push: e.target.checked } })} />
        <span>Send me push notifications</span>
      </label>
      {features.data && !features.data.pushNotifications && (
        <p className="muted small">Push is not switched on for this app yet. You will still see everything here in the list.</p>
      )}
      <ErrorBanner error={set.error} />
    </div>
  );
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const refresh = useRefresh();
  const list = useApiQuery('notifications.list', undefined, { refetchInterval: 15_000 });
  const read = useApiMutation('notifications.read', { onSuccess: () => refresh('notifications.list') });
  const readAll = useApiMutation('notifications.readAll', { onSuccess: () => refresh('notifications.list') });
  return (
    <>
      <PageTitle>Notifications</PageTitle>
      {list.isLoading && <Spinner />}
      <ErrorBanner error={list.error} />
      {list.data && list.data.items.length > 0 && (
        <div className="row between">
          <span className="muted">{list.data.unreadCount} unread</span>
          <Button variant="ghost" onClick={() => readAll.mutate({})} disabled={list.data.unreadCount === 0}>
            Mark all as read
          </Button>
        </div>
      )}
      {list.data?.items.length === 0 && <EmptyState title="Nothing yet">Updates about your bookings, trips and wallet appear here.</EmptyState>}
      <ul className="list">
        {list.data?.items.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              className="card"
              style={{
                width: '100%',
                textAlign: 'left',
                font: 'inherit',
                color: 'inherit',
                cursor: 'pointer',
                borderLeft: n.isRead ? undefined : '4px solid var(--hop)',
              }}
              onClick={() => {
                if (!n.isRead) read.mutate({ params: { id: n.id } });
                if (n.link?.startsWith('/')) void navigate(n.link);
              }}
            >
              <span style={{ fontWeight: n.isRead ? 400 : 700 }}>{n.message}</span>
              <span className="muted small">{new Date(n.timestamp).toLocaleString('en-SG')}</span>
            </button>
          </li>
        ))}
      </ul>
      <Card title="Settings">
        <PushToggle />
      </Card>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ history + rating
export function HistoryPage() {
  const history = useApiQuery('history.list');
  const refresh = useRefresh();
  const [rating, setRating] = useState<string | null>(null);
  const [stars, setStars] = useState(0);
  const rate = useApiMutation('ratings.create', {
    onSuccess: async () => {
      setRating(null);
      setStars(0);
      await refresh('history.list');
    },
  });
  return (
    <>
      <PageTitle>My trips</PageTitle>
      {history.isLoading && <Spinner />}
      <ErrorBanner error={history.error} />
      {history.data?.length === 0 && <EmptyState title="No trips yet">Your finished rides and journeys will be listed here.</EmptyState>}
      <ul className="list">
        {history.data?.map((h) => (
          <li key={`${h.kind}-${h.id}`}>
            <Card
              title={
                <>
                  {h.fromName} to {h.toName}
                </>
              }
            >
              <div className="row between">
                <span className="muted small">{new Date(h.date).toLocaleString('en-SG')}</span>
                <StatusChip status={h.status} />
              </div>
              {h.pickupStatus && ['NO_SHOW', 'UNPAID'].includes(h.pickupStatus) && <StatusChip status={h.pickupStatus} />}
              {h.fareCents !== null && (
                <div className="kv">
                  <span>{h.kind === 'JOURNEY' ? 'Earned' : 'Fare'}</span>
                  <Money cents={h.fareCents} />
                </div>
              )}
              {h.paymentOutcome && <Badge tone={h.paymentOutcome === 'UNPAID' ? 'bad' : 'neutral'}>{h.paymentOutcome.replace(/_/g, ' ').toLowerCase()}</Badge>}
              {h.kind === 'BOOKING' && (
                <LinkButton to={`/passenger/booking/${h.id}`} variant="ghost">
                  Details
                </LinkButton>
              )}
              {h.canRate && rating !== h.id && (
                <Button variant="secondary" onClick={() => setRating(h.id)}>
                  Rate this ride
                </Button>
              )}
              {rating === h.id && (
                <div className="stack">
                  <StarPicker value={stars} onChange={setStars} />
                  <ErrorBanner error={rate.error} />
                  <div className="row">
                    <Button disabled={!stars} busy={rate.isPending} onClick={() => rate.mutate({ params: { id: h.id }, body: { stars } })}>
                      Send rating
                    </Button>
                    <Button variant="ghost" onClick={() => setRating(null)}>
                      Not now
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ profile
export function ProfilePage() {
  const { me, logout, setMe } = useAuth();
  const navigate = useNavigate();
  const addRole = useApiMutation('me.addRole', { onSuccess: (m) => setMe(m) });
  if (!me) return null;
  return (
    <>
      <PageTitle>Profile</PageTitle>
      <Card title={me.name}>
        <div className="kv">
          <span>Roles</span>
          <span>{me.roles.map((r) => r.toLowerCase()).join(' and ')}</span>
        </div>
        <div className="kv">
          <span>Account</span>
          <StatusChip status={me.accountStatus} />
        </div>
        {me.roles.length > 1 && (
          <LinkButton to="/choose-role" variant="secondary">
            Switch role
          </LinkButton>
        )}
        {!me.roles.includes('PASSENGER') && (
          <Button variant="secondary" busy={addRole.isPending} onClick={() => addRole.mutate({ body: { add: 'PASSENGER' } })}>
            Also ride as a passenger
          </Button>
        )}
        <ErrorBanner error={addRole.error} />
      </Card>
      <Card title={me.hasDriverProfile ? 'Driver details' : 'Become a driver'}>
        {me.hasDriverProfile ? (
          <p className="muted">Your vehicle details are saved. To change them, save the form again.</p>
        ) : (
          <p>Add your vehicle to start offering seats on journeys you make anyway.</p>
        )}
        <VehicleForm />
      </Card>
      <Card title="Notifications">
        <PushToggle />
      </Card>
      <Button
        variant="secondary"
        onClick={async () => {
          closeSocket();
          await logout();
          void navigate('/login', { replace: true });
        }}
      >
        Sign out
      </Button>
    </>
  );
}
