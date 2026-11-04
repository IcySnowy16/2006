/** Task K9: TanStack Query wrappers over `call`, keyed by endpoint name + input so a mutation can refresh exactly what it changed. */
import { useMutation, useQuery, useQueryClient, type UseMutationOptions, type UseQueryOptions } from '@tanstack/react-query';
import type { EndpointName } from '@campus-hop/shared';
import { call, type CallInput, type Out } from './client';

export function useApiQuery<N extends EndpointName>(name: N, input?: CallInput<N>, options: Partial<UseQueryOptions<Out<N>>> = {}) {
  return useQuery<Out<N>>({ queryKey: [name, input ?? null], queryFn: () => call(name, input), ...options });
}

export function useApiMutation<N extends EndpointName>(name: N, options: UseMutationOptions<Out<N>, Error, CallInput<N>> = {}) {
  return useMutation<Out<N>, Error, CallInput<N>>({ mutationFn: (input) => call(name, input), ...options });
}

/** `const refresh = useRefresh(); refresh('wallet.get', 'bookings.get')` after a mutation. */
export function useRefresh() {
  const qc = useQueryClient();
  return (...names: EndpointName[]) => Promise.all(names.map((n) => qc.invalidateQueries({ queryKey: [n] })));
}
