import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { quietHandlers, server } from './server';

// Node's fetch needs absolute URLs; the app calls relative ones ('/api/...'), so point them at a pretend host that MSW answers.
const realFetch = globalThis.fetch;
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
  realFetch(typeof input === 'string' && input.startsWith('/') ? `http://localhost${input}` : input, init)) as typeof fetch;

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
  server.resetHandlers(...quietHandlers); // the base answers; a test's own server.use(...) wins over them
});
afterEach(() => {
  cleanup();
  server.resetHandlers(...quietHandlers);
});
afterAll(() => server.close());

// jsdom has no layout, geolocation or wake lock: tests that need them define their own.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    onchange: null,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}
