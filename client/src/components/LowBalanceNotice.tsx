/** A passenger's wallet is getting low (warning) or too low to ask for a ride (stop). The server enforces the same two limits. */
import { Link } from 'react-router-dom';
import { DEFAULTS } from '@campus-hop/shared';
import { useApiQuery } from '../api/hooks';
import { Banner, dollars } from './ui';

export function LowBalanceNotice({ showLink = true }: { showLink?: boolean }) {
  const wallet = useApiQuery('wallet.get');
  const available = wallet.data?.availableCents;
  if (available === undefined || available >= DEFAULTS.LOW_BALANCE_WARN_CENTS) return null;
  const tooLow = available < DEFAULTS.MIN_BALANCE_TO_RIDE_CENTS;
  return (
    <Banner kind={tooLow ? 'error' : 'warn'}>
      {tooLow
        ? `You have ${dollars(available)} available. Top up to at least ${dollars(DEFAULTS.MIN_BALANCE_TO_RIDE_CENTS)} before you ask for or book a ride.`
        : `Your balance is getting low (${dollars(available)} available). A ride costs ${dollars(DEFAULTS.FARE_SHARED_CENTS)} to ${dollars(DEFAULTS.FARE_SOLO_CENTS)}, so top up soon.`}{' '}
      {showLink && <Link to="/wallet">Top up</Link>}
    </Banner>
  );
}
