// Regulatory reference cases. Expected values are hand-derived from the clause text quoted in
// docs/regulatory-research.md (Bangkok Plan 2556 Cl. 16, MR 55 Cl. 33/41/44-46/50, MR 33 Cl. 1-6, EIA items 27/31).
import { describe, expect, it } from 'vitest';
import {
  checkRoadEligibility, clause41RoadSetback, computeSetbacks, computeSkyPlanes, skyPlaneOffset, useCaps, LOW_RISE_MAX_GFA,
} from '../src/engine/rules';
import { assessEia, openSpaceRequirements } from '../src/engine/compliance';
import { checkJurisdiction } from '../src/engine/zoning';
import type { PlotEdge } from '../src/engine/types';
import { MR33, YOR9 } from '../src/engine/regulations';
import { rect } from './helpers';

function edgesOf(pts: [number, number][], roads: Record<number, number>): PlotEdge[] {
  return pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length]!;
    return { index: i, start: p, end: q, lengthM: Math.hypot(q[0] - p[0], q[1] - p[1]), onHull: true, kind: roads[i] !== undefined ? 'road' : 'side', roadWidthM: roads[i] };
  });
}

describe('Bangkok Plan B.E. 2556 Cl. 16 (Yor.9)', () => {
  it('FAR 7 and OSR 4.5 % of total floor area', () => {
    expect(YOR9.maxFAR).toBe(7);
    const req = openSpaceRequirements('high-rise-condo', 2000, 14000, 1200, true);
    expect(req.find((r) => r.id === 'zoning-osr')!.requiredSqm).toBeCloseTo(630, 9);
  });
  it('office > 10,000 m2 needs a >= 16 m road or station proximity (Cl. 16(10))', () => {
    expect(useCaps('commercial-office', 12, false).maxGFA).toBe(10000);
    expect(useCaps('commercial-office', 16, false).maxGFA).toBe(Infinity);
    expect(useCaps('commercial-office', 12, true).maxGFA).toBe(Infinity);
    expect(useCaps('high-rise-condo', 6, false).maxGFA).toBe(Infinity); // no condo road limit in Yor.9
  });
  it('commerce tiers 5,000 / 10,000 m2 by 12 / 16 m roads (Cl. 16(9))', () => {
    expect(useCaps('mixed-use', 10, false).maxCommercial).toBe(5000);
    expect(useCaps('mixed-use', 12, false).maxCommercial).toBe(10000);
    expect(useCaps('mixed-use', 16, false).maxCommercial).toBe(Infinity);
  });
  it('jurisdiction is never auto-verified; outside Bangkok fails', () => {
    expect(checkJurisdiction([[100.576, 13.73], [100.577, 13.73], [100.577, 13.731]]).status).toBe('UNVERIFIED');
    expect(checkJurisdiction([[100.98, 13.73], [100.99, 13.73], [100.99, 13.74]]).status).toBe('FAIL');
    // straddles the Bangkok bounding box -> at least partly outside -> FAIL
    expect(checkJurisdiction([[100.93, 13.73], [100.95, 13.73], [100.95, 13.74]]).status).toBe('FAIL');
  });
});

describe('MR 55 Cl. 41 - road setbacks (plot edge = road boundary)', () => {
  it.each([
    [4, 4], [6, 3], [8, 2], [9.9, 1.05], // < 10 m: 6 m from centreline - w/2
    [10, 1], [12, 1.2], [18, 1.8], [20, 2], // 10-20 m: w/10
    [20.5, 2], [30, 2], // > 20 m: 2 m
  ])('road %s m -> %s m', (w, d) => {
    expect(clause41RoadSetback(w).distanceM).toBeCloseTo(d, 9);
  });
});

describe('MR 55 Cl. 50 / MR 33 Cl. 4 - boundary setbacks by class', () => {
  const pts = rect(40, 30) as [number, number][];
  it('<= 9 m: 2 m; road edge = max(Cl. 41, Cl. 50)', () => {
    const s = computeSetbacks(edgesOf(pts, { 0: 6 }), 'low-le9');
    expect(s.map((x) => x.distanceM)).toEqual([3, 2, 2, 2]);
  });
  it('9-23 m: 3 m on every boundary incl. road side', () => {
    const s = computeSetbacks(edgesOf(pts, { 0: 18 }), 'low-lt23');
    expect(s.map((x) => x.distanceM)).toEqual([3, 3, 3, 3]); // Cl. 50 (3) governs over Cl. 41 (1.8)
  });
  it('narrow 4 m soi: Cl. 41 governs (4 m)', () => {
    expect(computeSetbacks(edgesOf(pts, { 0: 4 }), 'low-lt23')[0]!.distanceM).toBe(4);
  });
  it('MR 33: 6 m from neighbours and the public road, at every level', () => {
    const s = computeSetbacks(edgesOf(pts, { 0: 30 }), 'mr33');
    expect(s.every((x) => x.distanceM === 6)).toBe(true);
  });
});

describe('MR 55 Cl. 44-46 - 2:1 sky-exposure plane', () => {
  it('required inward offset = H/2 - road width (H <= 2 x distance to opposite boundary)', () => {
    expect(skyPlaneOffset(30, 8)).toBe(7);
    expect(skyPlaneOffset(16, 8)).toBe(0);
    expect(skyPlaneOffset(21, 12)).toBeLessThan(0);
  });
  it('corner of unequal roads: wider road governs when length along the narrower road <= 60 m (Cl. 46)', () => {
    const pts = rect(50, 50) as [number, number][];
    const planes = computeSkyPlanes(edgesOf(pts, { 0: 18, 1: 12 }), [[6, 6], [44, 6], [44, 44], [6, 44]]);
    expect(planes.find((p) => p.edgeIndex === 0)!.active).toBe(true);
    expect(planes.find((p) => p.edgeIndex === 1)!.active).toBe(false);
  });
  it('corner relief lost when the building is > 60 m along the narrower road', () => {
    const pts = rect(100, 100) as [number, number][];
    const planes = computeSkyPlanes(edgesOf(pts, { 0: 18, 1: 12 }), [[6, 6], [94, 6], [94, 94], [6, 94]]);
    expect(planes.every((p) => p.active)).toBe(true);
  });
  it('parallel roads <= 60 m apart: wider road governs (Cl. 45)', () => {
    const pts = rect(40, 50) as [number, number][];
    const planes = computeSkyPlanes(edgesOf(pts, { 0: 20, 2: 8 }), [[6, 6], [34, 6], [34, 44], [6, 44]]);
    expect(planes.find((p) => p.edgeIndex === 2)!.active).toBe(false);
  });
  it('equal roads: every plane applies (nearest-road rule)', () => {
    const planes = computeSkyPlanes(edgesOf(rect(40, 40) as [number, number][], { 0: 10, 1: 10 }), [[6, 6], [34, 6], [34, 34], [6, 34]]);
    expect(planes.every((p) => p.active)).toBe(true);
  });
});

describe('MR 33 Cl. 1-2 - high-rise / extra-large thresholds and road access', () => {
  it('thresholds are inclusive (>= 23 m, >= 10,000 m2); low-rise cap stays below', () => {
    expect(MR33.highRiseHeightM).toBe(23);
    expect(MR33.extraLargeAreaSqm).toBe(10000);
    expect(LOW_RISE_MAX_GFA).toBeLessThan(10000);
  });
  const pts = rect(30, 40) as [number, number][];
  it('needs a >= 12 m side on a >= 10 m road', () => {
    expect(checkRoadEligibility(edgesOf(pts, { 0: 10 })).mr33Allowed).toBe(true);
    expect(checkRoadEligibility(edgesOf(pts, { 0: 9.9 })).mr33Allowed).toBe(false);
    const short = [[0, 0], [11.9, 0], [11.9, 40], [0, 40]] as [number, number][];
    expect(checkRoadEligibility(edgesOf(short, { 0: 30 })).mr33Allowed).toBe(false);
  });
  it('> 30,000 m2 needs an 18 m road', () => {
    expect(checkRoadEligibility(edgesOf(pts, { 0: 12 })).mr33MaxGFA).toBe(30000);
    expect(checkRoadEligibility(edgesOf(pts, { 0: 18 })).mr33MaxGFA).toBe(Infinity);
  });
});

describe('Open space: three separate rules with different bases', () => {
  it('MR 55 Cl. 33 = 30 % of the LARGEST FLOOR (residential), 10 % non-residential', () => {
    const res = openSpaceRequirements('low-rise-condo', 1000, 5000, 600, false);
    expect(res.find((r) => r.id === 'mr55-33')!.requiredSqm).toBeCloseTo(180, 9);
    const off = openSpaceRequirements('commercial-office', 1000, 5000, 600, false);
    expect(off.find((r) => r.id === 'mr55-33')!.requiredSqm).toBeCloseTo(60, 9);
  });
  it('MR 33 Cl. 6 = 30 % of the PLOT, only for high-rise / extra-large', () => {
    const lo = openSpaceRequirements('high-rise-condo', 1000, 5000, 600, false);
    expect(lo.find((r) => r.id === 'mr33-6')!.applies).toBe(false);
    const hi = openSpaceRequirements('high-rise-condo', 1000, 7000, 600, true);
    expect(hi.find((r) => r.id === 'mr33-6')).toMatchObject({ applies: true, requiredSqm: 300 });
  });
  it('mixed use with housing takes residential rates', () => {
    const mx = openSpaceRequirements('mixed-use', 1000, 5000, 600, true);
    expect(mx.find((r) => r.id === 'mr33-6')!.requiredSqm).toBe(300);
  });
});

describe('EIA (MNRE notification items 27, 31)', () => {
  it('condo: >= 80 units OR >= 4,000 m2 usable area', () => {
    expect(assessEia('high-rise-condo', 3999, 21, 3999).status).toBe('likely-not-required'); // 79 units
    expect(assessEia('high-rise-condo', 4000, 21, 4000).status).toBe('required');
  });
  it('height >= 23 m alone does NOT trigger EIA for a condominium', () => {
    expect(assessEia('high-rise-condo', 3000, 40, 3000).status).toBe('likely-not-required');
  });
  it('office: >= 23 m or >= 10,000 m2', () => {
    expect(assessEia('commercial-office', 0, 22.9, 9000).status).toBe('likely-not-required');
    expect(assessEia('commercial-office', 0, 23, 9000).status).toBe('required');
    expect(assessEia('commercial-office', 0, 15, 10000).status).toBe('required');
  });
});
