/** Tasks B6 (screens): Presets list and Preset editor (UC-3), plus the vehicle details form (FR 1.6). */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Account, DEFAULTS } from '@campus-hop/shared';
import type { z } from 'zod';
import { isCode } from '../api/client';
import { useApiMutation, useApiQuery, useRefresh } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { Badge, Banner, Button, Card, ConfirmDialog, EmptyState, ErrorBanner, Field, LinkButton, PageTitle } from '../components/ui';
import { Spinner } from '../components/Spinner';

type Preset = z.infer<typeof Account.Preset>;
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
const TYPE_LABEL = { BUS_STOP: 'Bus stops', CARPARK: 'Carparks' } as const;

export const DECLARATION =
  'I confirm that I would make this journey anyway, whether or not a passenger joins, and that I am not offering a taxi or a paid service.';

// ------------------------------------------------------------------------------------------------ vehicle form
export function VehicleForm({ onSaved }: { onSaved?: () => void }) {
  const { refresh } = useAuth();
  const [v, setV] = useState({ vehiclePlate: '', vehicleModel: '', payNowId: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useApiMutation('driver.saveProfile', {
    onSuccess: async () => {
      await refresh();
      onSaved?.();
    },
  });
  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const parsed = Account.DriverProfileBody.safeParse(v);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), 'Please fill this in'])));
      return;
    }
    setErrors({});
    save.mutate({ body: parsed.data });
  };
  const field = (key: keyof typeof v, label: string, hint?: string) => (
    <Field label={label} hint={hint} error={errors[key]}>
      {(id, d) => <input id={id} aria-describedby={d} value={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.value })} />}
    </Field>
  );
  return (
    <form className="stack" onSubmit={submit} noValidate>
      {field('vehiclePlate', 'Vehicle plate number')}
      {field('vehicleModel', 'Vehicle model')}
      {field('payNowId', 'PayNow ID', 'Where your earnings would be paid out (simulated for now).')}
      <ErrorBanner error={save.error} />
      <Button type="submit" busy={save.isPending}>
        Save vehicle details
      </Button>
    </form>
  );
}

// ------------------------------------------------------------------------------------------------ presets list
export function PresetsPage() {
  const presets = useApiQuery('presets.list');
  const locations = useApiQuery('catalog.locations');
  const refresh = useRefresh();
  const [toDelete, setToDelete] = useState<Preset | null>(null);
  const remove = useApiMutation('presets.delete', {
    onSuccess: async () => {
      setToDelete(null);
      await refresh('presets.list');
    },
  });
  const gateName = (id: string) => locations.data?.find((l) => l.id === id)?.name ?? 'Exit gate';

  return (
    <>
      <PageTitle sub="A preset is a journey you make often. Set it up once, then go live in one tap.">My presets</PageTitle>
      {presets.isLoading && <Spinner />}
      <ErrorBanner error={presets.error} />
      {presets.data?.length === 0 && (
        <EmptyState title="No presets yet" action={<LinkButton to="/driver/presets/new">Create your first preset</LinkButton>}>
          You need one before you can go live.
        </EmptyState>
      )}
      <ul className="list">
        {presets.data?.map((p) => (
          <li key={p.id}>
            <Card
              title={
                <>
                  {p.name} <Badge tone="info">{p.plan === 'SOLO' ? '1 seat' : 'up to 3 seats'}</Badge>
                </>
              }
            >
              <div className="kv">
                <span>Exit</span>
                <span>{gateName(p.exitGateId)}</span>
              </div>
              <div className="kv">
                <span>Pickups</span>
                <span>{p.allowedPickupTypes.map((t) => TYPE_LABEL[t]).join(', ')}</span>
              </div>
              <div className="kv">
                <span>Extra detour you accept</span>
                <span>{p.detourToleranceMin} min</span>
              </div>
              <div className="row">
                <LinkButton to={`/driver/presets/${p.id}`} variant="secondary">
                  Edit
                </LinkButton>
                <Button variant="ghost" onClick={() => setToDelete(p)}>
                  Delete
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      {remove.error && (
        <Banner kind="error">
          {isCode(remove.error, 'PRESET_IN_USE')
            ? 'This preset has a journey that is live or in progress. Finish or cancel that journey first.'
            : 'Could not delete the preset.'}
        </Banner>
      )}
      {(presets.data?.length ?? 0) > 0 && (presets.data?.length ?? 0) < DEFAULTS.MAX_PRESETS_PER_DRIVER && (
        <LinkButton to="/driver/presets/new">New preset</LinkButton>
      )}
      <ConfirmDialog
        open={!!toDelete}
        title="Delete this preset?"
        confirmLabel="Delete"
        danger
        busy={remove.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate({ params: { id: toDelete.id } })}
      >
        <p>“{toDelete?.name}” will be removed. Journeys already finished are not affected.</p>
      </ConfirmDialog>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ preset editor
export function PresetEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { me } = useAuth();
  const refresh = useRefresh();
  const locations = useApiQuery('catalog.locations');
  const presets = useApiQuery('presets.list');
  const existing = id ? presets.data?.find((p) => p.id === id) : undefined;
  const [draft, setDraft] = useState<{
    name?: string;
    exitGateId?: string;
    plan?: 'SOLO' | 'SHARING';
    types?: ('BUS_STOP' | 'CARPARK')[];
    tolerance?: number;
    days?: string[];
    departAt?: string;
    declared?: boolean;
  }>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const gates = locations.data?.filter((l) => l.isExit) ?? [];
  const value = {
    name: draft.name ?? existing?.name ?? '',
    exitGateId: draft.exitGateId ?? existing?.exitGateId ?? gates[0]?.id ?? '',
    plan: draft.plan ?? existing?.plan ?? 'SHARING',
    types: draft.types ?? existing?.allowedPickupTypes ?? (['BUS_STOP', 'CARPARK'] as ('BUS_STOP' | 'CARPARK')[]),
    tolerance: draft.tolerance ?? existing?.detourToleranceMin ?? 3,
    days: draft.days ?? existing?.schedule?.days ?? [],
    departAt: draft.departAt ?? existing?.schedule?.departAt ?? '',
    declared: draft.declared ?? false,
  };
  const set = (patch: typeof draft) => setDraft({ ...draft, ...patch });

  const save = useApiMutation(id ? 'presets.update' : 'presets.create', {
    onSuccess: async () => {
      await refresh('presets.list');
      void navigate('/driver/presets');
    },
  });

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const candidate = {
      name: value.name,
      exitGateId: value.exitGateId,
      plan: value.plan,
      allowedPickupTypes: value.types,
      detourToleranceMin: value.tolerance,
      schedule: value.days.length && value.departAt ? { days: value.days, departAt: value.departAt } : null,
      exemptionConfirmed: value.declared,
    };
    const parsed = Account.PresetBody.safeParse(candidate);
    if (!parsed.success) {
      const map: Record<string, string> = {};
      for (const i of parsed.error.issues)
        map[String(i.path[0])] =
          i.path[0] === 'exemptionConfirmed' ? 'Tick the box to confirm' : i.path[0] === 'allowedPickupTypes' ? 'Choose at least one' : 'Please check this';
      setErrors(map);
      return;
    }
    setErrors({});
    save.mutate({ body: parsed.data, params: id ? { id } : {} } as never);
  };

  if (locations.isLoading || presets.isLoading) return <Spinner />;
  return (
    <>
      <PageTitle sub="Everything about a repeat journey lives here. There is no per-trip form.">{id ? 'Edit preset' : 'New preset'}</PageTitle>
      {!me?.hasDriverProfile && (
        <Card title="First, your vehicle" tone="warn">
          <p>Passengers see who is driving, so we need your vehicle details once.</p>
          <VehicleForm />
        </Card>
      )}
      <form className="stack" onSubmit={submit} noValidate>
        <Field label="Preset name" error={errors.name}>
          {(fid, d) => <input id={fid} aria-describedby={d} value={value.name} onChange={(e) => set({ name: e.target.value })} />}
        </Field>
        <Field
          label="Where do you exit the campus?"
          error={errors.exitGateId}
          hint={gates.length === 0 ? 'No exit gates are loaded yet. Ask the team to seed the campus catalog.' : undefined}
        >
          {(fid, d) => (
            <select id={fid} aria-describedby={d} value={value.exitGateId} onChange={(e) => set({ exitGateId: e.target.value })}>
              {gates.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <fieldset>
          <legend>Seats</legend>
          <label className="check">
            <input type="radio" name="plan" checked={value.plan === 'SOLO'} onChange={() => set({ plan: 'SOLO' })} /> Solo: one passenger
          </label>
          <label className="check">
            <input type="radio" name="plan" checked={value.plan === 'SHARING'} onChange={() => set({ plan: 'SHARING' })} /> Sharing: up to{' '}
            {DEFAULTS.SHARING_SEAT_CAP} passengers
          </label>
        </fieldset>
        <fieldset>
          <legend>Where can you pick people up?</legend>
          {(['BUS_STOP', 'CARPARK'] as const).map((t) => (
            <label key={t} className="check">
              <input
                type="checkbox"
                checked={value.types.includes(t)}
                onChange={(e) => set({ types: e.target.checked ? [...value.types, t] : value.types.filter((x) => x !== t) })}
              />{' '}
              {TYPE_LABEL[t]}
            </label>
          ))}
          {errors.allowedPickupTypes && <p className="field-error">{errors.allowedPickupTypes}</p>}
        </fieldset>
        <Field label="Extra detour you accept (minutes, 0 to 5)" error={errors.detourToleranceMin}>
          {(fid, d) => (
            <select id={fid} aria-describedby={d} value={value.tolerance} onChange={(e) => set({ tolerance: Number(e.target.value) })}>
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} minute{n === 1 ? '' : 's'}
                </option>
              ))}
            </select>
          )}
        </Field>
        <fieldset>
          <legend>Usual days (optional)</legend>
          <div className="row">
            {DAYS.map((d) => (
              <label key={d} className="check">
                <input
                  type="checkbox"
                  checked={value.days.includes(d)}
                  onChange={(e) => set({ days: e.target.checked ? [...value.days, d] : value.days.filter((x) => x !== d) })}
                />{' '}
                {d.slice(0, 1) + d.slice(1).toLowerCase()}
              </label>
            ))}
          </div>
          <Field label="Usual departure time" hint="Used as the departure time when you go live shortly before it.">
            {(fid) => <input id={fid} type="time" value={value.departAt} onChange={(e) => set({ departAt: e.target.value })} />}
          </Field>
        </fieldset>
        <div className="field">
          <label className="check">
            <input type="checkbox" checked={value.declared} onChange={(e) => set({ declared: e.target.checked })} aria-describedby="decl" />
            <span id="decl">{DECLARATION}</span>
          </label>
          {errors.exemptionConfirmed && (
            <p className="field-error" role="alert">
              {errors.exemptionConfirmed}
            </p>
          )}
        </div>
        <ErrorBanner error={save.error} />
        <Button type="submit" busy={save.isPending} disabled={!me?.hasDriverProfile}>
          Save preset
        </Button>
        <LinkButton to="/driver/presets" variant="ghost">
          Cancel
        </LinkButton>
      </form>
    </>
  );
}
