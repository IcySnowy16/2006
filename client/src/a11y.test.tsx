/**
 * Accessibility smoke test: axe-core (WCAG 2.0/2.1 A and AA rules) on the main screens, rendered the way the app renders them.
 * It finds missing labels, bad roles, duplicate ids, missing names on buttons and links. It cannot judge colour contrast (jsdom has no
 * layout or real styles), reading order or how a screen reader sounds; those still need a person.
 */
import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { campus, driverMe, http, HttpResponse, passengerMe, server } from './test/server';
import { renderAt } from './test/utils';

vi.mock('./hooks/useSocket', () => ({
  useNotificationSocket: () => undefined,
  useJourneyChannel: () => ({
    joined: false,
    error: null,
    position: null,
    positionAt: null,
    pickups: {},
    noShowOpen: {},
    journeyStatus: null,
    sendPosition: () => undefined,
  }),
  closeSocket: () => undefined,
}));

async function violationsIn(container: HTMLElement): Promise<string[]> {
  const result = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: { 'color-contrast': { enabled: false } }, // not computable in jsdom
  });
  return result.violations.map((v) => `${v.id}: ${v.help} -> ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}

describe('accessibility (axe-core, WCAG A and AA)', () => {
  it('sign in', async () => {
    const { container } = renderAt(<App />, { route: '/login' });
    await screen.findByRole('button', { name: 'Sign in' });
    expect(await violationsIn(container)).toEqual([]);
  });

  it('create an account', async () => {
    const { container } = renderAt(<App />, { route: '/register' });
    await screen.findByRole('button', { name: /create account|register/i });
    expect(await violationsIn(container)).toEqual([]);
  });

  it('choose how to use the app', async () => {
    const { container } = renderAt(<App />, { route: '/choose-role', me: { ...driverMe, activeRole: null } });
    await screen.findByText('How do you want to use Campus Hop today?');
    expect(await violationsIn(container)).toEqual([]);
  });

  it('request a hop (passenger)', async () => {
    server.use(http.get('*/api/locations', () => HttpResponse.json(campus)));
    const { container } = renderAt(<App />, { route: '/passenger/request', me: passengerMe });
    await screen.findAllByRole('option', { name: 'Hall A' });
    expect(await violationsIn(container)).toEqual([]);
  });

  it('passenger home', async () => {
    const { container } = renderAt(<App />, { route: '/passenger', me: passengerMe });
    await screen.findByText('Hi Priya');
    expect(await violationsIn(container)).toEqual([]);
  });

  it('driver home', async () => {
    const { container } = renderAt(<App />, { route: '/driver', me: driverMe });
    await screen.findByText(/Hi Dana/);
    expect(await violationsIn(container)).toEqual([]);
  });

  it('the check itself works: an image without a text alternative and an unlabelled field are reported', async () => {
    const { container } = render(
      <main>
        <img src="/x.png" />
        <input type="text" />
      </main>,
    );
    const found = await violationsIn(container);
    expect(found.some((v) => v.startsWith('image-alt'))).toBe(true);
    expect(found.some((v) => v.startsWith('label'))).toBe(true);
  });
});
