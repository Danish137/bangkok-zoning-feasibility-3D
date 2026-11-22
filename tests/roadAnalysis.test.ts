// Road-width and access-route estimation from map geometry (synthetic streets with known answers)
import { describe, expect, it } from 'vitest';
import { analyzeRoads, type Footprint, type RoadLine } from '../src/site/roadAnalysis';
import type { MetricPoint } from '../src/engine/types';
import { rect, toLL } from './helpers';

const line = (pts: MetricPoint[], cls: string, name?: string): RoadLine => ({ coords: toLL(pts), cls, name });
const box = (x0: number, y0: number, x1: number, y1: number): Footprint => ({ ring: toLL([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) });

describe('frontage width estimate', () => {
  // plot 40 × 30 at the origin; a soi centreline 5 m south of edge 0; facades across the street at y = −12
  const plot = toLL(rect(40, 30));
  const soi = line([[-200, -5], [240, -5]], 'minor', 'Soi Test');
  const across = [box(-30, -30, 10, -12), box(12, -30, 60, -12)];

  it('detects the road-facing edge and estimates ≈ 2 × centreline offset, bounded by the facade clearance', () => {
    const r = analyzeRoads(plot, [soi], across);
    const e0 = r.edges.find((e) => e.edgeIndex === 0)!;
    expect(e0.facesRoad).toBe(true);
    expect(e0.centrelineOffsetM).toBeCloseTo(5, 6);
    expect(e0.clearanceM).toBeCloseTo(12, 6);
    expect(e0.estimatedWidthM).toBe(10);
    expect(e0.confidence).toBe('medium');
    expect(r.edges.filter((e) => e.facesRoad).map((e) => e.edgeIndex)).toEqual([0]);
  });

  it('caps the estimate at the building-to-building clearance when facades are closer than 2c', () => {
    const r = analyzeRoads(plot, [soi], [box(-30, -30, 60, -7)]); // facades 7 m from the plot edge
    expect(r.edges[0]!.estimatedWidthM).toBe(7);
  });

  it('ignores roads that are not parallel or too far away', () => {
    const r = analyzeRoads(plot, [line([[20, -100], [20, -60]], 'minor'), line([[-200, -60], [240, -60]], 'minor')], []);
    expect(r.edges.every((e) => !e.facesRoad)).toBe(true);
  });
});

describe('access route bottleneck (MR 33 Cl. 2 continuity)', () => {
  const plot = toLL(rect(40, 30));
  it('follows the soi to the nearest arterial and reports the narrowest segment', () => {
    const soi = line([[-60, -5], [200, -5]], 'minor', 'Soi A');
    const arterial = line([[200, -400], [200, 400]], 'secondary', 'Main Road');
    // a pinch on the soi: facades 3 m either side of the centreline around x = 120
    const pinch = [box(110, -2, 130, 10), box(110, -20, 130, -8)];
    const r = analyzeRoads(plot, [soi, arterial], pinch);
    expect(r.access).toHaveLength(1);
    const a = r.access[0]!;
    expect(a.reachedClass).toBe('secondary');
    expect(a.minWidthM).toBe(6);
    expect(a.viaNames).toContain('Soi A');
    expect(a.lengthM).toBeGreaterThan(150);
  });
  it('a frontage on an arterial needs no route', () => {
    const r = analyzeRoads(plot, [line([[-200, -9], [240, -9]], 'secondary', 'Main')], []);
    expect(r.access[0]!.lengthM).toBe(0);
    expect(r.access[0]!.reachedClass).toBe('secondary');
  });
});
