export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="spinner" role="status" aria-live="polite">
      <span className="spin" aria-hidden="true" />
      <span>{label}…</span>
    </div>
  );
}
