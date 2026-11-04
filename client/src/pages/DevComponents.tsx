/** Task K8: /dev/components shows every building block in one place, so a new screen reuses them instead of inventing its own. */
import { useState } from 'react';
import {
  Badge,
  Banner,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Money,
  PageTitle,
  SimulatedNote,
  StarPicker,
  Stars,
  StatusChip,
} from '../components/ui';
import { Spinner } from '../components/Spinner';
import { TrackingMap } from '../components/TrackingMap';

export function DevComponentsPage() {
  const [open, setOpen] = useState(false);
  const [stars, setStars] = useState(3);
  return (
    <div className="auth-page" style={{ maxWidth: 560 }}>
      <PageTitle sub="Every building block of the app.">Components</PageTitle>
      <Card title="Buttons">
        <div className="row">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="ghost">Ghost</Button>
          <Button disabled>Disabled</Button>
          <Button busy>Busy</Button>
        </div>
      </Card>
      <Card title="Banners">
        <Banner kind="info">Information</Banner>
        <Banner kind="good">It worked</Banner>
        <Banner kind="warn">Careful</Banner>
        <Banner kind="error">Something went wrong</Banner>
      </Card>
      <Card title="Form field">
        <Field label="Label" hint="A hint under the field.">
          {(id, d) => <input id={id} aria-describedby={d} />}
        </Field>
        <Field label="With an error" error="This is wrong">
          {(id, d) => <input id={id} aria-describedby={d} aria-invalid />}
        </Field>
      </Card>
      <Card title="Badges and status">
        <div className="row">
          <Badge>neutral</Badge>
          <Badge tone="good">good</Badge>
          <Badge tone="warn">warn</Badge>
          <Badge tone="bad">bad</Badge>
          <StatusChip status="CONFIRMED" />
          <StatusChip status="PENDING" />
          <StatusChip status="NO_SHOW" />
        </div>
      </Card>
      <Card title="Money, stars">
        <Money cents={300} /> <Money cents={5} />
        <SimulatedNote />
        <Stars value={4.5} /> <Stars value={null} />
        <StarPicker value={stars} onChange={setStars} />
      </Card>
      <Card title="Empty state, spinner">
        <EmptyState title="Nothing here yet">A friendly sentence about what to do.</EmptyState>
        <Spinner />
      </Card>
      <Card title="Dialog">
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Open dialog
        </Button>
        <ConfirmDialog open={open} title="Are you sure?" confirmLabel="Yes" onCancel={() => setOpen(false)} onConfirm={() => setOpen(false)}>
          <p>This is the in-page confirmation.</p>
        </ConfirmDialog>
      </Card>
      <Card title="Map">
        <TrackingMap polyline={null} position={null} />
      </Card>
    </div>
  );
}
