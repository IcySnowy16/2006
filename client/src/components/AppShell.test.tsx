/** Tasks F9, Q4, D7: the frame around every screen: role, notification count, offline notice, tabs. And the wake lock (Plan risk 10). */
import { act, fireEvent, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { useWakeLock } from '../hooks/useDevice';
import { driverMe, http, HttpResponse, passengerMe, server } from '../test/server';
import { renderAt } from '../test/utils';

vi.mock('../hooks/useSocket', () => ({ useNotificationSocket: () => undefined, useJourneyChannel: () => ({}), closeSocket: () => undefined }));

describe('AppShell', () => {
  it('shows the role in use and the unread count, and the tabs of that role', async () => {
    server.use(http.get('*/api/notifications', () => HttpResponse.json({ items: [], unreadCount: 3 })));
    renderAt(<App />, { route: '/passenger', me: passengerMe });
    expect(await screen.findByRole('button', { name: /Acting as passenger/ })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Notifications, 3 unread' })).toBeInTheDocument();
    const tabs = screen.getByRole('navigation', { name: 'Main' });
    expect([...tabs.querySelectorAll('a')].map((a) => a.textContent)).toEqual(['Home', 'Request', 'Wallet', 'Trips']);
  });

  it('a driver gets the driver tabs', async () => {
    renderAt(<App />, { route: '/driver', me: driverMe });
    await screen.findByText('Hi Dana');
    const tabs = screen.getByRole('navigation', { name: 'Main' });
    expect([...tabs.querySelectorAll('a')].map((a) => a.textContent)).toEqual(['Home', 'Presets', 'Wallet', 'Trips']);
  });

  it('going offline shows a notice that says what still works, and coming back removes it (Q4)', async () => {
    renderAt(<App />, { route: '/passenger', me: passengerMe });
    await screen.findByText('Hi Priya');
    expect(screen.queryByText(/You are offline/)).toBeNull();
    act(() => void window.dispatchEvent(new Event('offline')));
    expect(await screen.findByText(/You are offline/)).toBeInTheDocument();
    act(() => void window.dispatchEvent(new Event('online')));
    await waitFor(() => expect(screen.queryByText(/You are offline/)).toBeNull());
  });

  it('a locked passenger sees the reason on every screen', async () => {
    renderAt(<App />, { route: '/passenger', me: { ...passengerMe, accountStatus: 'LOCKED' } });
    expect(await screen.findByText(/Your account is locked because of an unpaid balance/)).toBeInTheDocument();
  });

  it('the role pill opens the role chooser', async () => {
    renderAt(<App />, { route: '/passenger', me: { ...passengerMe, roles: ['DRIVER', 'PASSENGER'] } });
    fireEvent.click(await screen.findByRole('button', { name: /Acting as passenger/ }));
    expect(await screen.findByText('Switch role')).toBeInTheDocument();
  });
});

describe('useWakeLock (keeps the screen on during a trip)', () => {
  const original = Object.getOwnPropertyDescriptor(navigator, 'wakeLock');
  afterEach(() => {
    if (original) Object.defineProperty(navigator, 'wakeLock', original);
    else delete (navigator as unknown as Record<string, unknown>).wakeLock;
  });

  const fakeLock = () => {
    const listeners: (() => void)[] = [];
    const sentinel = { release: vi.fn(async () => listeners.forEach((l) => l())), addEventListener: (_: string, l: () => void) => listeners.push(l) };
    const request = vi.fn(async () => sentinel);
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
    return { request, sentinel };
  };

  it('asks for a screen lock while active, asks again when the page becomes visible, and lets go afterwards', async () => {
    const { request, sentinel } = fakeLock();
    const { result, unmount } = renderHook(() => useWakeLock(true));
    await waitFor(() => expect(result.current.held).toBe(true));
    expect(request).toHaveBeenCalledWith('screen');
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    unmount();
    expect(sentinel.release).toHaveBeenCalled();
  });

  it('does nothing while inactive, and a browser that refuses is fine', async () => {
    const { request } = fakeLock();
    renderHook(() => useWakeLock(false));
    expect(request).not.toHaveBeenCalled();
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: vi.fn(async () => Promise.reject(new Error('NotAllowedError'))) } });
    const { result } = renderHook(() => useWakeLock(true));
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current.held).toBe(false);
  });

  it('a browser with no wake lock at all is fine too', () => {
    delete (navigator as unknown as Record<string, unknown>).wakeLock;
    const { result } = renderHook(() => useWakeLock(true));
    expect(result.current.held).toBe(false);
  });
});
