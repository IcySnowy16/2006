/** Task K8: the small set of building blocks every screen uses, so screens look and behave alike. Shown together at /dev/components. */
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../api/client';

export function Button({
  variant = 'primary',
  busy,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; busy?: boolean }) {
  return (
    <button {...rest} className={`btn btn-${variant} ${rest.className ?? ''}`} disabled={rest.disabled || busy} aria-busy={busy || undefined}>
      {busy ? 'Please wait…' : children}
    </button>
  );
}

export function LinkButton({ to, variant = 'primary', children }: { to: string; variant?: 'primary' | 'secondary' | 'ghost'; children: ReactNode }) {
  return (
    <Link to={to} className={`btn btn-${variant}`}>
      {children}
    </Link>
  );
}

export function Card({ title, children, tone }: { title?: ReactNode; children: ReactNode; tone?: 'warn' | 'good' }) {
  return (
    <section className={`card ${tone ? `card-${tone}` : ''}`}>
      {title && <h2 className="card-title">{title}</h2>}
      {children}
    </section>
  );
}

export function Banner({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'error' | 'good'; children: ReactNode }) {
  return (
    <div className={`banner banner-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

/** Shows any thrown error in the standard way. */
export function ErrorBanner({ error }: { error: unknown }) {
  if (!error) return null;
  return <Banner kind="error">{errorMessage(error)}</Banner>;
}

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}) {
  const id = useId();
  const described = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id, described)}
      {hint && !error && (
        <p id={`${id}-hint`} className="hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'info'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export const dollars = (cents: number) => `$${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;

/** Money is always whole cents in the API; this is the only place it becomes text. */
export function Money({ cents }: { cents: number }) {
  return <span className="money">{dollars(cents)}</span>;
}

/** FR 10.11: every screen that shows money says it is not real. */
export function SimulatedNote() {
  return <p className="simulated">SIMULATED money. No real payment is made.</p>;
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Stars({ value, label }: { value: number | null; label?: string }) {
  if (value === null) return <span className="muted">{label ?? 'No ratings yet'}</span>;
  return (
    <span aria-label={`${value} out of 5 stars`}>
      <span aria-hidden="true">★</span> {value.toFixed(1)}
    </span>
  );
}

export function StarPicker({ value, onChange }: { value: number; onChange(n: number): void }) {
  return (
    <div role="radiogroup" aria-label="Stars" className="star-picker">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          className={n <= value ? 'on' : ''}
          onClick={() => onChange(n)}
        >
          ★
        </button>
      ))}
    </div>
  );
}

/** A confirmation inside the page (never window.confirm). Esc and the backdrop cancel. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm(): void;
  onCancel(): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className="backdrop" onClick={onCancel}>
      <div ref={ref} tabIndex={-1} className="dialog" role="alertdialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <div>{children}</div>
        <div className="row end">
          <Button variant="ghost" onClick={onCancel}>
            Go back
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} busy={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <header className="page-title">
      <h1>{children}</h1>
      {sub && <p className="muted">{sub}</p>}
    </header>
  );
}

/** A coloured chip for a journey, booking or pickup status. */
export function StatusChip({ status }: { status: string }) {
  const tone = ['CONFIRMED', 'COMPLETED', 'PICKED_UP', 'DROPPED_OFF', 'PAID', 'OPEN', 'ACTIVE', 'ARRIVED'].includes(status)
    ? 'good'
    : ['CANCELLED', 'EXPIRED', 'NO_SHOW', 'UNPAID', 'LOCKED'].includes(status)
      ? 'bad'
      : ['PENDING', 'WAITING', 'LIVE', 'APPROACHING', 'FULL'].includes(status)
        ? 'warn'
        : 'info';
  return <Badge tone={tone}>{status.replace(/_/g, ' ').toLowerCase()}</Badge>;
}
