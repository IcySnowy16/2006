/** Tasks A4 and A5 (screens): Login (UC-2), Register (UC-1), Verify e-mail (UC-1), Choose role (UC-2.AC.1). */
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Account, type Me } from '@campus-hop/shared';
import type { z } from 'zod';
import { errorMessage, isCode } from '../api/client';
import { useApiMutation } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { Spinner } from '../components/Spinner';
import { Banner, Button, ErrorBanner, Field, LinkButton, PageTitle } from '../components/ui';

function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-page">
      <div className="auth-logo">
        <img src="/icon.svg" alt="" width="40" height="40" /> Campus Hop
      </div>
      {children}
    </div>
  );
}

/** Where to go after signing in: back where they were going, the role chooser, or their home. */
export const landingFor = (me: Me, from?: string): string =>
  me.activeRole === null ? '/choose-role' : from && from !== '/login' ? from : me.activeRole === 'DRIVER' ? '/driver' : '/passenger';

// ------------------------------------------------------------------------------------------------ login
export function LoginPage() {
  const { me, setMe } = useAuth();
  const navigate = useNavigate();
  const where = useLocation();
  const from = (where.state as { from?: string } | null)?.from;
  const form = useForm<z.input<typeof Account.LoginBody>>({ resolver: zodResolver(Account.LoginBody) });
  const login = useApiMutation('auth.login', {
    onSuccess: (m) => {
      setMe(m);
      void navigate(landingFor(m, from), { replace: true });
    },
  });
  if (me) return <Navigate to={landingFor(me, from)} replace />;
  const unverified = isCode(login.error, 'EMAIL_NOT_VERIFIED');

  return (
    <AuthFrame>
      <PageTitle sub="Sign in with your NTU e-mail.">Welcome back</PageTitle>
      <form className="stack" noValidate onSubmit={form.handleSubmit((body) => login.mutate({ body }))}>
        <Field label="NTU e-mail" error={form.formState.errors.ntuEmail?.message}>
          {(id, d) => <input id={id} type="email" autoComplete="username" inputMode="email" aria-describedby={d} {...form.register('ntuEmail')} />}
        </Field>
        <Field label="Password" error={form.formState.errors.password?.message}>
          {(id, d) => <input id={id} type="password" autoComplete="current-password" aria-describedby={d} {...form.register('password')} />}
        </Field>
        {login.error && !unverified && <ErrorBanner error={login.error} />}
        {unverified && (
          <Banner kind="warn">
            Your e-mail is not verified yet. <Link to={`/verify?email=${encodeURIComponent(form.getValues('ntuEmail'))}`}>Enter your code</Link>
          </Banner>
        )}
        <Button type="submit" busy={login.isPending} className="btn-block">
          Sign in
        </Button>
      </form>
      <p className="muted">New here?</p>
      <LinkButton to="/register" variant="secondary">
        Create an account
      </LinkButton>
    </AuthFrame>
  );
}

// ------------------------------------------------------------------------------------------------ register
const ROLE_LABEL = { PASSENGER: 'Passenger: I want rides', DRIVER: 'Driver: I give rides', BOTH: 'Both' } as const;

export function RegisterPage() {
  const navigate = useNavigate();
  const form = useForm<z.input<typeof Account.RegisterBody>>({ resolver: zodResolver(Account.RegisterBody), defaultValues: { role: 'PASSENGER' } });
  const register = useApiMutation('auth.register', {
    onSuccess: (_r, vars) => navigate(`/verify?email=${encodeURIComponent((vars as { body: { ntuEmail: string } }).body.ntuEmail)}`),
  });
  const e = form.formState.errors;
  return (
    <AuthFrame>
      <PageTitle sub="Only NTU e-mail addresses (@e.ntu.edu.sg or @ntu.edu.sg) can join.">Create your account</PageTitle>
      <form className="stack" noValidate onSubmit={form.handleSubmit((body) => register.mutate({ body }))}>
        <Field label="Full name" error={e.name?.message}>
          {(id, d) => <input id={id} autoComplete="name" aria-describedby={d} {...form.register('name')} />}
        </Field>
        <Field label="NTU e-mail" error={e.ntuEmail?.message}>
          {(id, d) => <input id={id} type="email" autoComplete="username" inputMode="email" aria-describedby={d} {...form.register('ntuEmail')} />}
        </Field>
        <Field label="Mobile number" hint="Shared only with the driver or passenger you ride with, to call each other." error={e.phone?.message}>
          {(id, d) => <input id={id} type="tel" autoComplete="tel" inputMode="tel" aria-describedby={d} {...form.register('phone')} />}
        </Field>
        <Field label="Password" hint="At least 8 characters." error={e.password?.message}>
          {(id, d) => <input id={id} type="password" autoComplete="new-password" aria-describedby={d} {...form.register('password')} />}
        </Field>
        <fieldset>
          <legend>I will use Campus Hop as</legend>
          {(Object.keys(ROLE_LABEL) as (keyof typeof ROLE_LABEL)[]).map((r) => (
            <label key={r} className="check">
              <input type="radio" value={r} {...form.register('role')} /> {ROLE_LABEL[r]}
            </label>
          ))}
        </fieldset>
        {register.error && (
          <Banner kind="error">
            {errorMessage(register.error)} {isCode(register.error, 'EMAIL_TAKEN') && <Link to="/login">Sign in instead</Link>}
          </Banner>
        )}
        <Button type="submit" busy={register.isPending} className="btn-block">
          Create account
        </Button>
      </form>
      <p className="muted">
        Already registered? <Link to="/login">Sign in</Link>
      </p>
    </AuthFrame>
  );
}

// ------------------------------------------------------------------------------------------------ verify
export function VerifyPage() {
  const [params] = useSearchParams();
  const email = params.get('email') ?? '';
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [resent, setResent] = useState(false);
  const verify = useApiMutation('auth.verify', { onSuccess: () => navigate('/login', { replace: true, state: {} }) });
  const resend = useApiMutation('auth.resend', { onSuccess: () => setResent(true) });
  const valid = /^\d{6}$/.test(code);
  return (
    <AuthFrame>
      <PageTitle sub={email ? `We sent a 6-digit code to ${email}. It works for 10 minutes.` : 'Enter the 6-digit code from your e-mail.'}>
        Check your e-mail
      </PageTitle>
      <form
        className="stack"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (valid) verify.mutate({ body: { ntuEmail: email.toLowerCase(), code } });
        }}
      >
        <Field label="Verification code" error={code && !valid ? 'The code has 6 digits' : undefined}>
          {(id, d) => (
            <input
              id={id}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              aria-describedby={d}
              value={code}
              onChange={(ev) => setCode(ev.target.value.replace(/\D/g, ''))}
            />
          )}
        </Field>
        {verify.error && <ErrorBanner error={verify.error} />}
        {isCode(verify.error, 'CODE_ATTEMPTS_EXCEEDED') && <Banner kind="warn">Too many wrong codes. Ask for a new one below.</Banner>}
        <Button type="submit" disabled={!valid} busy={verify.isPending} className="btn-block">
          Verify
        </Button>
      </form>
      <div className="stack">
        {resent && <Banner kind="good">A new code is on its way.</Banner>}
        {resend.error && <ErrorBanner error={resend.error} />}
        <Button variant="secondary" busy={resend.isPending} disabled={!email} onClick={() => resend.mutate({ body: { ntuEmail: email.toLowerCase() } })}>
          Send a new code
        </Button>
      </div>
    </AuthFrame>
  );
}

// ------------------------------------------------------------------------------------------------ choose role / switch role
export function ChooseRolePage() {
  const { me, setMe, loading } = useAuth();
  const navigate = useNavigate();
  const choose = useApiMutation('me.activeRole', {
    onSuccess: (m) => {
      setMe(m);
      void navigate(m.activeRole === 'DRIVER' ? '/driver' : '/passenger', { replace: true });
    },
  });
  if (loading) return <Spinner label="Loading" />;
  if (!me) return <Navigate to="/login" replace />;
  return (
    <AuthFrame>
      <PageTitle sub="You can switch later from the top bar, when you are not in the middle of a trip.">
        {me.activeRole ? 'Switch role' : 'How do you want to use Campus Hop today?'}
      </PageTitle>
      <div className="stack">
        {choose.error && <ErrorBanner error={choose.error} />}
        {me.roles.includes('PASSENGER') && (
          <Button onClick={() => choose.mutate({ body: { role: 'PASSENGER' } })} busy={choose.isPending} className="btn-block">
            I need a ride (passenger)
          </Button>
        )}
        {me.roles.includes('DRIVER') && (
          <Button onClick={() => choose.mutate({ body: { role: 'DRIVER' } })} busy={choose.isPending} className="btn-block">
            I am driving (driver)
          </Button>
        )}
        {me.activeRole && (
          <Button variant="ghost" onClick={() => navigate(-1)}>
            Stay as {me.activeRole.toLowerCase()}
          </Button>
        )}
      </div>
    </AuthFrame>
  );
}
