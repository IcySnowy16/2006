import { useMemo } from 'react';
import { useApiQuery } from '../api/hooks';

/** Catalog lookups: place names and a readable label for each pickup point (stored as the pickup point's note). */
export function useCatalog() {
  const q = useApiQuery('catalog.locations', undefined, { staleTime: 5 * 60_000 });
  return useMemo(() => {
    const places = q.data ?? [];
    const placeName = (id: string) => places.find((p) => p.id === id)?.name ?? 'Campus place';
    const pickup = (id: string) => {
      for (const p of places) {
        const stop = p.pickupPoints.find((s) => s.id === id);
        if (stop)
          return {
            place: p.name,
            label: stop.accessNote?.split(':')[0] ?? (stop.type === 'BUS_STOP' ? 'Bus stop' : 'Carpark'),
            type: stop.type,
            walkDistanceM: stop.walkDistanceM,
          };
      }
      return { place: 'Campus', label: 'Pickup point', type: 'BUS_STOP' as const, walkDistanceM: 0 };
    };
    return { loading: q.isLoading, error: q.error, places, placeName, pickup };
  }, [q.data, q.isLoading, q.error]);
}
