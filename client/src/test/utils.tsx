import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Me } from '@campus-hop/shared';
import { AuthProvider } from '../auth/AuthContext';
import { server, signedInAs } from './server';

/** Renders `ui` as the app does: query cache, router at `route`, and the signed-in user (null = signed out). */
export function renderAt(ui: ReactNode, { route = '/', me = null as Me | null } = {}) {
  server.use(signedInAs(me));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>{ui}</AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
