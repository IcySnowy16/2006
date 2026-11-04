/** The account screens are loaded only when opened, to keep the first download small. */
import { lazy, Suspense, type ComponentType } from 'react';
import { Spinner } from '../components/Spinner';

const pick = <K extends string>(name: K) =>
  lazy(async () => {
    const mod = (await import('./AccountPages')) as unknown as Record<K, ComponentType>;
    return { default: mod[name] };
  });

const Wallet = pick('WalletPage');
const Locked = pick('LockedAccountPage');
const Notifications = pick('NotificationsPage');
const History = pick('HistoryPage');
const Profile = pick('ProfilePage');

const wrap = (C: ComponentType) => () => (
  <Suspense fallback={<Spinner />}>
    <C />
  </Suspense>
);

export const AccountPagesLazy = {
  Wallet: wrap(Wallet),
  Locked: wrap(Locked),
  Notifications: wrap(Notifications),
  History: wrap(History),
  Profile: wrap(Profile),
};
