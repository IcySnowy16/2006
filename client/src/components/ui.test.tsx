/** Task K8: the building blocks behave and are accessible. */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { TrackingMap } from './TrackingMap';
import { Banner, Button, ConfirmDialog, Field, Money, SimulatedNote, StarPicker, Stars, StatusChip, dollars } from './ui';

describe('Money', () => {
  it.each([
    [0, '$0.00'],
    [5, '$0.05'],
    [300, '$3.00'],
    [230, '$2.30'],
    [100_000, '$1000.00'],
  ])('%i cents is %s', (cents, text) => {
    expect(dollars(cents)).toBe(text);
    render(<Money cents={cents} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('the simulated note says no real payment is made (FR 10.11)', () => {
    render(<SimulatedNote />);
    expect(screen.getByText(/SIMULATED money/)).toBeInTheDocument();
  });
});

describe('Field', () => {
  it('connects the label, the input and the error message for screen readers', () => {
    render(
      <Field label="Phone" error="8 to 15 digits">
        {(id, d) => <input id={id} aria-describedby={d} />}
      </Field>,
    );
    const input = screen.getByLabelText('Phone');
    expect(input).toHaveAccessibleDescription('8 to 15 digits');
    expect(screen.getByRole('alert')).toHaveTextContent('8 to 15 digits');
  });
});

describe('Button', () => {
  it('while busy it is disabled and says to wait, so a double tap cannot send twice', () => {
    const onClick = vi.fn();
    render(
      <Button busy onClick={onClick}>
        Pay
      </Button>,
    );
    const b = screen.getByRole('button');
    expect(b).toBeDisabled();
    expect(b).toHaveTextContent('Please wait');
    fireEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('ConfirmDialog', () => {
  it('is not in the page when closed; Escape and the Go back button cancel; the confirm button confirms', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const { rerender } = render(
      <ConfirmDialog open={false} title="Cancel?" confirmLabel="Yes" onCancel={onCancel} onConfirm={onConfirm}>
        Sure?
      </ConfirmDialog>,
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
    rerender(
      <ConfirmDialog open title="Cancel?" confirmLabel="Yes" onCancel={onCancel} onConfirm={onConfirm}>
        Sure?
      </ConfirmDialog>,
    );
    expect(screen.getByRole('alertdialog', { name: 'Cancel?' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(onCancel).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('Stars and StarPicker', () => {
  it('no ratings yet is said in words, not as 0 stars', () => {
    render(<Stars value={null} />);
    expect(screen.getByText('No ratings yet')).toBeInTheDocument();
  });
  it('a rating is one decimal and readable by a screen reader', () => {
    render(<Stars value={4.5} />);
    expect(screen.getByLabelText('4.5 out of 5 stars')).toBeInTheDocument();
  });
  it('the picker is a radio group and reports the chosen number', () => {
    const onChange = vi.fn();
    render(<StarPicker value={2} onChange={onChange} />);
    expect(screen.getByRole('radio', { name: '2 stars' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: '5 stars' }));
    expect(onChange).toHaveBeenCalledWith(5);
  });
});

describe('StatusChip and Banner', () => {
  it('writes the status as words', () => {
    render(<StatusChip status="NO_SHOW" />);
    expect(screen.getByText('no show')).toBeInTheDocument();
  });
  it('an error banner is announced as an alert, an info banner as status', () => {
    render(
      <>
        <Banner kind="error">Bad</Banner>
        <Banner>Fine</Banner>
      </>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Bad');
    expect(screen.getByRole('status')).toHaveTextContent('Fine');
  });
});

describe('TrackingMap (FR 7.9)', () => {
  const route = 'ysh_@qh|hQiAAiAAiAA'; // any short valid polyline
  const fix = (accuracyM: number) => ({ lat: 1.3, lng: 103.68, accuracyM, ts: new Date().toISOString() });
  const show = (el: React.ReactElement) => render(<MemoryRouter>{el}</MemoryRouter>);

  it('with no route and no position it says the route will appear', () => {
    show(<TrackingMap polyline={null} position={null} />);
    expect(screen.getByText(/route will appear/)).toBeInTheDocument();
  });
  it('a fresh accurate position is called live', () => {
    show(<TrackingMap polyline={route} position={fix(8)} receivedAt={Date.now()} />);
    expect(screen.getByText('Live position')).toBeInTheDocument();
    expect(screen.getByRole('img')).toBeInTheDocument();
  });
  it('a position that arrived 20 seconds ago is flagged as possibly weak signal', () => {
    show(<TrackingMap polyline={route} position={fix(8)} receivedAt={Date.now() - 20_000} />);
    expect(screen.getByText(/Last position 20 s ago/)).toBeInTheDocument();
  });
  it('a broken route string does not crash the screen: the car still shows, without the route line', () => {
    show(<TrackingMap polyline="_p~iF~ps|U_ulLnnqC_mqNvxq`" position={fix(8)} receivedAt={Date.now()} />);
    expect(screen.getByText('Live position')).toBeInTheDocument();
  });
  it('a position worse than 50 m is flagged as approximate', () => {
    show(<TrackingMap polyline={route} position={fix(80)} receivedAt={Date.now()} />);
    expect(screen.getByText(/approximate/)).toBeInTheDocument();
  });
});
