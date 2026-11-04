import { describe, expect, it } from 'vitest';
import { decodePolyline, encodePolyline } from './polyline';

describe('polyline (one copy for the server and the phone app)', () => {
  it('round-trips (and the textbook example decodes)', () => {
    const decoded = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(decoded[0]).toEqual({ lat: 38.5, lng: -120.2 });
    expect(decoded[2]).toEqual({ lat: 43.252, lng: -126.453 });
    const pts = [
      { lat: 1.34831, lng: 103.68312 },
      { lat: 1.35, lng: 103.69 },
      { lat: 1.3512, lng: 103.6955 },
    ];
    expect(decodePolyline(encodePolyline(pts))).toEqual(pts);
    expect(() => decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`')).toThrow(RangeError);
  });
});
