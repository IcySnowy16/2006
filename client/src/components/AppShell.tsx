/** Task K8: the frame around every signed-in screen: top bar (role, notifications), the offline notice, the page, and the bottom tabs. */
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useApiQuery } from '../api/hooks';
import { useNotificationSocket } from '../hooks/useSocket';
import { Banner } from './ui';

const DRIVER_TABS = [
  { to: '/driver', label: 'Home', end: true },
  { to: '/driver/presets', label: 'Presets' },
  { to: '/wallet', label: 'Wallet' },
  { to: '/history', label: 'Trips' },
];
const PASSENGER_TABS = [
  { to: '/passenger', label: 'Home', end: true },
  { to: '/passenger/request', label: 'Request' },
  { to: '/wallet', label: 'Wallet' },
  { to: '/history', label: 'Trips' },
];

export function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const online = useOnline();
  const navigate = useNavigate();
  const notifications = useApiQuery('notifications.list', undefined, { enabled: !!me, refetchInterval: 30_000 });
  useNotificationSocket(!!me);
  const tabs = me?.activeRole === 'DRIVER' ? DRIVER_TABS : PASSENGER_TABS;
  const unread = notifications.data?.unreadCount ?? 0;

  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand">
          Campus Hop
        </Link>
        <div className="topbar-right">
          {me?.activeRole && (
            <button
              type="button"
              className="role-pill"
              onClick={() => navigate('/choose-role')}
              aria-label={`Acting as ${me.activeRole.toLowerCase()}. Switch role`}
            >
              {me.activeRole === 'DRIVER' ? 'Driver' : 'Passenger'}
            </button>
          )}
          <Link to="/notifications" className="bell" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}>
            <span aria-hidden="true">🔔</span>
            {unread > 0 && <span className="bell-count">{unread > 9 ? '9+' : unread}</span>}
          </Link>
          <Link to="/profile" className="avatar" aria-label="Profile">
            {me?.name.slice(0, 1).toUpperCase()}
          </Link>
        </div>
      </header>
      {!online && <Banner kind="warn">You are offline. The app will reconnect on its own; booking and trip actions need a connection.</Banner>}
      {me?.accountStatus === 'LOCKED' && (
        <Banner kind="error">
          Your account is locked because of an unpaid balance. <Link to="/locked">See what you owe</Link>
        </Banner>
      )}
      <main className="page">{children}</main>
      <nav className="tabs" aria-label="Main">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
