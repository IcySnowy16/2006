/** Task F9: who is signed in. `me` is null when nobody is; guards below turn that into redirects. */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Navigate, useLocation } from 'react-router-dom';
import type { ActiveRole, Me } from '@campus-hop/shared';
import { ApiError, call } from '../api/client';
import { Spinner } from '../components/Spinner';
import { closeSocket } from '../hooks/useSocket';

interface Auth {
  me: Me | null;
  loading: boolean;
  setMe(me: Me | null): void;
  refresh(): Promise<void>;
  logout(): Promise<void>;
}

const AuthCtx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [me, setMeState] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  // Counts every time sign-in or sign-out told us who we are, so a "who am I" answer that was already on its way can never overwrite it.
  const version = useRef(0);

  const load = useCallback(async () => {
    const started = version.current;
    try {
      const m = await call('auth.me');
      if (started === version.current) setMeState(m);
    } catch (err) {
      if (started !== version.current) return;
      if (err instanceof ApiError && (err.code === 'AUTH_REQUIRED' || err.code === 'INVALID_TOKEN')) setMeState(null);
      // a network failure keeps whatever we knew
    } finally {
      if (started === version.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The shared socket was opened with the old login cookie: a different person (or nobody) must not keep using it.
  const meId = me?.id ?? null;
  const socketOwner = useRef<string | null>(null);
  useEffect(() => {
    if (socketOwner.current !== null && socketOwner.current !== meId) closeSocket();
    socketOwner.current = meId;
  }, [meId]);

  // Keep `me` in step with the server between page loads:
  //  - any call answered "not signed in" (expired cookie, sign-out in another tab) signs this tab out too;
  //  - any call answered ACCOUNT_LOCKED, or a wallet whose debt disagrees with the lock we show, re-reads `me`.
  const lockedNow = me?.accountStatus === 'LOCKED';
  useEffect(() => {
    if (!meId) return;
    const onError = (err: unknown) => {
      if (!(err instanceof ApiError)) return;
      if (err.code === 'AUTH_REQUIRED' || err.code === 'INVALID_TOKEN') {
        version.current += 1;
        qc.clear();
        setMeState(null);
      } else if (err.code === 'ACCOUNT_LOCKED' && !lockedNow) void load();
    };
    const unQuery = qc.getQueryCache().subscribe((e) => {
      if (e.type !== 'updated') return;
      if (e.action.type === 'error') onError(e.action.error);
      if (e.action.type === 'success' && e.query.queryKey[0] === 'wallet.get') {
        const hasDebt = !!(e.action.data as { debt?: unknown } | undefined)?.debt;
        if (hasDebt !== lockedNow) void load();
      }
    });
    const unMutation = qc.getMutationCache().subscribe((e) => {
      if (e.type === 'updated' && e.action.type === 'error') onError(e.action.error);
    });
    return () => {
      unQuery();
      unMutation();
    };
  }, [qc, meId, lockedNow, load]);

  const value: Auth = {
    me,
    loading,
    setMe: (m) => {
      version.current += 1;
      setMeState(m);
      setLoading(false);
    },
    refresh: load,
    logout: async () => {
      await call('auth.logout').catch(() => undefined);
      version.current += 1;
      qc.clear();
      closeSocket();
      setMeState(null);
      setLoading(false);
    },
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): Auth {
  const v = useContext(AuthCtx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}

/** Signed in, or off to /login (remembering where they were going). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth();
  const where = useLocation();
  if (loading) return <Spinner label="Loading" />;
  if (!me) return <Navigate to="/login" replace state={{ from: where.pathname }} />;
  return <>{children}</>;
}

/** Signed in AND acting in `role`: a user who holds both roles but has not chosen goes to /choose-role (UC-2.AC.1). */
export function RequireRole({ role, children }: { role: ActiveRole; children: ReactNode }) {
  const { me } = useAuth();
  if (!me) return <Navigate to="/login" replace />;
  if (me.activeRole === null) return <Navigate to="/choose-role" replace />;
  if (me.activeRole !== role) return <Navigate to="/" replace />;
  return <>{children}</>;
}
