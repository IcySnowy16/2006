/** Task Q5: the [DEMO] grid follows DEMO_GRID_ORIGIN (default: near the middle of NTU), so the demo works where you are standing. */
import { describe, expect, it } from 'vitest';
import { haversineM } from '../core/geo';
import { DEFAULT_DEMO_ORIGIN, demoGrid, demoGridOrigin } from './demo';

describe('demoGridOrigin', () => {
  it('defaults to near the middle of NTU, not the sea', () => {
    expect(demoGridOrigin({})).toEqual(DEFAULT_DEMO_ORIGIN);
    expect(DEFAULT_DEMO_ORIGIN.lat).toBeGreaterThan(1.3);
    expect(DEFAULT_DEMO_ORIGIN.lat).toBeLessThan(1.4);
    expect(DEFAULT_DEMO_ORIGIN.lng).toBeGreaterThan(103.6);
    expect(DEFAULT_DEMO_ORIGIN.lng).toBeLessThan(103.75);
  });

  it('reads "latitude,longitude" the way Google Maps copies it', () => {
    expect(demoGridOrigin({ DEMO_GRID_ORIGIN: '1.3478, 103.6803' })).toEqual({ lat: 1.3478, lng: 103.6803 });
    expect(demoGridOrigin({ DEMO_GRID_ORIGIN: '1.3478,103.6803' })).toEqual({ lat: 1.3478, lng: 103.6803 });
    expect(demoGridOrigin({ DEMO_GRID_ORIGIN: ' 1.3478 103.6803 ' })).toEqual({ lat: 1.3478, lng: 103.6803 });
    expect(demoGridOrigin({ DEMO_GRID_ORIGIN: '' })).toEqual(DEFAULT_DEMO_ORIGIN);
  });

  it('refuses a value it cannot read instead of silently using another place', () => {
    for (const bad of ['NTU', '1.3478', '1.3478;103.6803', '95,103', '1.3,200']) {
      expect(() => demoGridOrigin({ DEMO_GRID_ORIGIN: bad })).toThrow(/DEMO_GRID_ORIGIN/);
    }
  });
});

describe('demoGrid', () => {
  const origin = { lat: 1.3478, lng: 103.6803 };
  const grid = demoGrid(origin);
  const by = (name: string) => grid.find((p) => p.name === name)!;

  it('has the five labelled places, Hall A exactly at the origin', () => {
    expect(grid.map((p) => p.name)).toEqual(['[DEMO] Hall A', '[DEMO] Hall B', '[DEMO] Library', '[DEMO] Main Gate', '[DEMO] Pioneer Gate']);
    expect(by('[DEMO] Hall A')).toMatchObject({ lat: origin.lat, lng: origin.lng });
    expect(grid.filter((p) => p.isExit).map((p) => p.name)).toEqual(['[DEMO] Main Gate', '[DEMO] Pioneer Gate']);
  });

  it('keeps the same layout: the Main Gate is north of Hall A, Hall B and Pioneer Gate are east', () => {
    const a = by('[DEMO] Hall A');
    expect(by('[DEMO] Main Gate').lat).toBeGreaterThan(a.lat);
    expect(by('[DEMO] Main Gate').lng).toBeCloseTo(a.lng, 6);
    expect(by('[DEMO] Hall B').lng).toBeGreaterThan(a.lng);
    expect(by('[DEMO] Pioneer Gate').lng).toBeGreaterThan(by('[DEMO] Hall B').lng);
  });

  it('puts every place and stop within about a kilometre of the origin, so a driver standing at the origin gets a short route', () => {
    for (const p of grid) {
      expect(haversineM(origin, p)).toBeLessThan(1000);
      for (const s of p.stops) {
        expect(haversineM(p, s)).toBeLessThan(100);
        expect(s.note.startsWith('[DEMO] ')).toBe(true);
      }
    }
    expect(haversineM(origin, by('[DEMO] Main Gate'))).toBeGreaterThan(600);
    expect(haversineM(origin, by('[DEMO] Main Gate'))).toBeLessThan(750);
  });
});
