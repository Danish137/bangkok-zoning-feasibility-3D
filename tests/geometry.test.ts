// Geometry: projection, winding, setbacks on concave plots, clipping, validation
import { describe, expect, it } from 'vitest';
import { createAnchor, sqmToRaiNganWah, toLngLat, toMetric } from '../src/engine/geo';
import {
  capsule, ensureCCW, insetPolygon, isSelfIntersecting, normalizePolygonWinding, pathSegmentCrosses, pointInPolygon,
  pointSegmentDistance, polygonArea, setbackPolygon, signedArea, unionArea,
} from '../src/engine/polygon';
import type { MetricPoint, Polygon } from '../src/engine/types';
import { rect } from './helpers';

const L: Polygon = [[0, 0], [40, 0], [40, 20], [20, 20], [20, 40], [0, 40]];

describe('projection', () => {
  it('round-trips WGS84 ↔ metric', () => {
    const a = createAnchor([100.576, 13.7308]);
    const p: [number, number] = [100.5772, 13.7319];
    const back = toLngLat(a, toMetric(a, p));
    expect(back[0]).toBeCloseTo(p[0], 10);
    expect(back[1]).toBeCloseTo(p[1], 10);
  });
  it('0.001° latitude ≈ 111 m', () => {
    const a = createAnchor([100.576, 13.7308]);
    expect(toMetric(a, [100.576, 13.7318])[1]).toBeCloseTo(111.3, 0);
  });
  it('Thai area units (1 rai = 1,600 m², 1 ngan = 400 m², 1 wah² = 4 m²)', () => {
    expect(sqmToRaiNganWah(1600)).toMatchObject({ rai: 1, ngan: 0 });
    const r = sqmToRaiNganWah(2004);
    expect([r.rai, r.ngan, Math.round(r.wah)]).toEqual([1, 1, 1]);
  });
});

describe('winding & edge remapping', () => {
  it('keeps road edges attached to the same physical segment after reversal', () => {
    const cw: [number, number][] = [[0, 0], [0, 30], [50, 30], [50, 0]]; // clockwise
    expect(signedArea(cw)).toBeLessThan(0);
    const roadSeg = [cw[1]!, cw[2]!]; // edge 1: (0,30)→(50,30)
    const n = normalizePolygonWinding(cw, [1]);
    expect(n.wasReversed).toBe(true);
    const e = n.roadEdges[0]!;
    const seg = [n.vertices[e]!, n.vertices[(e + 1) % 4]!];
    const same = (a: number[], b: number[]) => a[0] === b[0] && a[1] === b[1];
    expect((same(seg[0]!, roadSeg[1]!) && same(seg[1]!, roadSeg[0]!))).toBe(true);
  });
  it('remap is identity for CCW input', () => {
    const n = normalizePolygonWinding(rect(10, 10) as [number, number][], [2]);
    expect(n.wasReversed).toBe(false);
    expect(n.roadEdges).toEqual([2]);
  });
});

describe('validation', () => {
  it('detects a bow-tie', () => {
    expect(isSelfIntersecting([[0, 0], [10, 10], [10, 0], [0, 10]])).toBe(true);
  });
  it('accepts concave L-shapes', () => {
    expect(isSelfIntersecting(L)).toBe(false);
  });
  it('detects a vertex touching a non-adjacent edge', () => {
    expect(isSelfIntersecting([[0, 0], [10, 0], [10, 10], [5, 0], [0, 10]])).toBe(true);
  });
  it('flags a crossing draft segment before it is added', () => {
    const path = [[0, 0], [10, 0], [10, 10]];
    expect(pathSegmentCrosses(path, [5, -5])).toBe(true);
    expect(pathSegmentCrosses(path, [0, 10])).toBe(false);
  });
});

describe('distance setbacks (concave-safe)', () => {
  it('capsule contains the exact buffer (never encroaches)', () => {
    const cap = capsule([0, 0], [10, 0], 3);
    for (let k = 0; k < 360; k += 7) {
      const t = (k * Math.PI) / 180;
      expect(pointInPolygon([10 + 2.999 * Math.cos(t), 2.999 * Math.sin(t)], cap)).toBe(true);
      expect(pointInPolygon([0 + 2.999 * Math.cos(t), 2.999 * Math.sin(t)], cap)).toBe(true);
    }
    expect(pointInPolygon([5, 3.01], cap)).toBe(false); // straight sides are exact
  });

  it('keeps both arms of an L-shaped plot (half-plane offsets would delete one)', () => {
    const r = insetPolygon(L, 2);
    expect(pointInPolygon([10, 30], r.polygon)).toBe(true); // upper arm
    expect(pointInPolygon([30, 10], r.polygon)).toBe(true); // right arm
    // exact Minkowski inset area = 896 + (2² − π·2²/4) = 896.858; arc polygon is conservative (smaller)
    expect(r.areaSqm).toBeGreaterThan(896.5);
    expect(r.areaSqm).toBeLessThanOrEqual(896 + 4 - Math.PI + 1e-6);
  });

  it('applies different distances per edge', () => {
    const r = setbackPolygon(rect(40, 30), [6, 3, 3, 3]); // road on edge 0
    expect(r.areaSqm).toBeCloseTo(34 * 21, 6);
    const ys = r.polygon.map((p) => p[1]);
    expect(Math.min(...ys)).toBeCloseTo(6, 9);
  });

  it('every vertex of the buildable polygon respects every edge distance', () => {
    const plot: Polygon = [[0, 0], [60, 5], [55, 40], [30, 25], [5, 45]]; // irregular concave
    const d = [6, 3, 4, 3, 5];
    const r = setbackPolygon(ensureCCW(plot), d);
    const P = ensureCCW(plot);
    for (const v of r.polygon) {
      P.forEach((p, i) => {
        expect(pointSegmentDistance(v as MetricPoint, p, P[(i + 1) % P.length]!)).toBeGreaterThanOrEqual(d[i]! - 1e-6);
      });
    }
  });

  it('reports disconnected pieces after setbacks', () => {
    // dumbbell: two 20×20 squares joined by a 3 m neck → 2 m setback severs the neck
    const db: Polygon = [[0, 0], [20, 0], [20, 8], [30, 8], [30, 0], [50, 0], [50, 20], [30, 20], [30, 11], [20, 11], [20, 20], [0, 20]];
    const r = insetPolygon(db, 2);
    expect(r.pieceCount).toBe(2);
    expect(r.discardedAreaSqm).toBeGreaterThan(200);
  });

  it('union area of nested floors equals the largest floor', () => {
    expect(unionArea([rect(20, 20), [[2, 2], [18, 2], [18, 18], [2, 18]]])).toBeCloseTo(400, 6);
  });

  it('plot area is unchanged by setbacks', () => {
    const plot = rect(40, 30);
    setbackPolygon(plot, [6, 6, 6, 6]);
    expect(polygonArea(plot)).toBe(1200);
  });
});
