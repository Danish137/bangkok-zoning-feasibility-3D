// Bangkok-specific rules (BMA Building Control Ordinance B.E. 2544, MR 7 parking, MR 33 Cl. 2 continuity),
// automatic zone / station detection, notch roads, invariants on hard shapes, timing.
// Expected numbers are hand-derived from the clause text in docs/regulatory-research.md.
import { describe, expect, it } from 'vitest';
import { runFeasibility } from '../src/engine/feasibility';
import { parkingDemand } from '../src/engine/parking';
import { frontSpaceAssessment } from '../src/engine/compliance';
import { buildEnvelope, checkRoadEligibility } from '../src/engine/rules';
import { checkJurisdiction } from '../src/engine/zoning';
import { computeTransit } from '../src/engine/transit';
import { PRESET_PLOTS } from '../src/engine/presets';
import type { LngLat, PlotEdge, Polygon, ZoneFeature } from '../src/engine/types';
import { realData, rect, run, toLL, verifyDesign } from './helpers';

const edgesOf = (pts: [number, number][], roads: Record<number, number>, access: Record<number, number> = {}): PlotEdge[] =>
  pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length]!;
    return {
      index: i, start: p, end: q, lengthM: Math.hypot(q[0] - p[0], q[1] - p[1]), onHull: true,
      kind: roads[i] !== undefined ? 'road' : 'side', roadWidthM: roads[i], accessMinWidthM: access[i],
    };
  });

describe('BMA 2544 Cl. 52(1): open space ≥ 30 % of the LAND for every residential building', () => {
  it('applies to a low-rise condo (not only MR 33 buildings)', () => {
    const r = run(rect(40, 50), [{ edgeIndex: 0, widthM: 10 }], 'low-rise-condo');
    const A = r.designA!;
    const req = A.openSpaceRequirements.find((q) => q.id === 'bco-52')!;
    expect(req.applies).toBe(true);
    expect(req.requiredSqm).toBeCloseTo(0.3 * 2000, 1); // plot re-projected from lat/lng: 1,999.998 m²
    expect(A.openSpaceSqm).toBeGreaterThanOrEqual(req.requiredSqm - 1e-3);
    verifyDesign(r, A);
  });
  it('offices: 10 % of the land', () => {
    const r = run(rect(40, 50), [{ edgeIndex: 0, widthM: 16 }], 'commercial-office');
    expect(r.designA!.openSpaceRequirements.find((q) => q.id === 'bco-52')!.requiredSqm).toBeCloseTo(200, 1);
  });
});

describe('BMA 2544 Cl. 54: openings 3 m from private land from the 3rd storey', () => {
  it('the ≤ 9 m class gets a stricter upper polygon from storey index 2 on non-road edges', () => {
    const pts = rect(40, 30) as [number, number][];
    const env = buildEnvelope({ plot: pts, plotAreaSqm: 1200, edges: edgesOf(pts, { 0: 12 }), buildingType: 'low-rise-condo', roadEligibility: checkRoadEligibility(edgesOf(pts, { 0: 12 })), caps: { maxGFA: Infinity, maxGFARule: '', maxCommercial: Infinity, maxCommercialRule: '' } }, 'low-le9');
    expect(env.upperFromIndex).toBe(2);
    expect(env.upperSetbacks).toEqual([2, 3, 3, 3]); // road edge keeps max(Cl. 41 1.2, Cl. 50 2) = 2 m
  });
});

describe('BMA 2544 Cl. 52(6) / 53: front space vs road face ("L/6 – L/8")', () => {
  const road = edgesOf(rect(30, 100) as [number, number][], { 0: 12 });
  it('a square building facing the road satisfies Cl. 53 (face > ⅛ perimeter, within 20 m)', () => {
    const fs = frontSpaceAssessment([[6, 6], [24, 6], [24, 24], [6, 24]], road, 8, 24, false);
    expect(fs.roadFaceM).toBeCloseTo(18, 6);
    expect(fs.perimeterM).toBeCloseTo(72, 6);
    expect(fs.cl53Ok).toBe(true);
  });
  it('a deep narrow building fails Cl. 53 (face 18 m ≤ 186/8) and has no 12 m front space', () => {
    const fs = frontSpaceAssessment([[6, 6], [24, 6], [24, 81], [6, 81]], road, 8, 24, false);
    expect(fs.cl53Ok).toBe(false);
    expect(fs.cl526Ok).toBe(false);
  });
  it('the generator limits the depth of a deep narrow plot so the design complies', () => {
    const r = run(rect(30, 110), [{ edgeIndex: 0, widthM: 18 }], 'high-rise-condo');
    const A = r.designA!;
    expect(A.frontSpace.cl53Ok || A.frontSpace.cl526Ok).toBe(true);
    expect(A.frontSpace.depthLimited).toBe(true);
    expect(A.checks.find((c) => c.id === 'front-space')!.status).toBe('PASS');
    verifyDesign(r, A);
  });
});

describe('Parking: BMA 2544 Cl. 83–85, MR 7 Cl. 3(1)', () => {
  it('small-unit condo in a large building: 1 space / 120 m² of building area (incl. parking floors)', () => {
    const d = parkingDemand({ buildingType: 'high-rise-condo', residentialSqm: 9000, commercialSqm: 0, totalBuildingSqm: 12000, heightM: 40, avgUnitSizeSqm: 35 });
    expect(d.spaces).toBe(100); // ceil(12,000 / 120); units < 60 m² → no per-unit requirement
    expect(d.isLargeBuilding).toBe(true);
  });
  it('units ≥ 60 m²: greater of 1 per unit and 1 / 120 m²', () => {
    const d = parkingDemand({ buildingType: 'high-rise-condo', residentialSqm: 9000, commercialSqm: 0, totalBuildingSqm: 12000, heightM: 40, avgUnitSizeSqm: 70 });
    expect(d.units).toBe(90); // floor(9,000 × 0.7 / 70)
    expect(d.spaces).toBe(100);
    const big = parkingDemand({ buildingType: 'high-rise-condo', residentialSqm: 9000, commercialSqm: 0, totalBuildingSqm: 9500, heightM: 40, avgUnitSizeSqm: 60 });
    expect(big.spaces).toBe(105); // 105 units > ceil(9,500 / 120) = 80
  });
  it('office: 1 space / 60 m²; mixed use: retail 1 / 60 m²', () => {
    expect(parkingDemand({ buildingType: 'commercial-office', residentialSqm: 0, commercialSqm: 9000, totalBuildingSqm: 9000, heightM: 30, avgUnitSizeSqm: 35 }).spaces).toBe(150);
    expect(parkingDemand({ buildingType: 'mixed-use', residentialSqm: 5000, commercialSqm: 1000, totalBuildingSqm: 6000, heightM: 30, avgUnitSizeSqm: 35 }).spaces).toBe(50); // max(17, 6,000/120)
  });
  it('small building (≤ 2,000 m², < 15 m) with small units needs no parking', () => {
    expect(parkingDemand({ buildingType: 'low-rise-condo', residentialSqm: 1900, commercialSqm: 0, totalBuildingSqm: 1900, heightM: 12, avgUnitSizeSqm: 35 }).spaces).toBe(0);
  });
  it('podium mode: parking storeys at the bottom provide what is required; total floor area unchanged', () => {
    const r = run(rect(50, 50), [{ edgeIndex: 0, widthM: 18 }], 'high-rise-condo');
    const A = r.designA!;
    expect(A.parking.mode).toBe('podium');
    expect(A.parking.providedSpaces).toBeGreaterThanOrEqual(A.parking.requiredSpaces);
    const pIdx = A.floors.filter((f) => f.use === 'parking').map((f) => f.index);
    expect(pIdx).toEqual(pIdx.map((_, k) => k)); // contiguous from the ground storey
    expect(A.far).toBeCloseTo(7, 2);
    expect(A.parkingGFA + A.residentialGFA + A.commercialGFA).toBeCloseTo(A.totalGFA, 6);
    verifyDesign(r, A);
  });
  it('basement mode: basements count in FAR; no parking storeys above ground', () => {
    const r = runFeasibility({ polygonLngLat: toLL(rect(50, 50)), roadEdges: [{ edgeIndex: 0, widthM: 18 }], buildingType: 'high-rise-condo', parkingMode: 'basement' });
    const A = r.designA!;
    expect(A.basementFloors.length).toBeGreaterThan(0);
    expect(A.floors.some((f) => f.use === 'parking')).toBe(false);
    expect(A.totalGFA).toBeLessThanOrEqual(r.plotAreaSqm * 7 + 1e-3);
    verifyDesign(r, A);
  });
});

describe('MR 33 Cl. 2 continuity: the ≥ 10 m road must reach another ≥ 10 m road', () => {
  const pts = rect(40, 40) as [number, number][];
  it('a route that narrows to 8 m refuses high-rise', () => {
    const e = checkRoadEligibility(edgesOf(pts, { 0: 12 }, { 0: 8 }));
    expect(e.mr33Allowed).toBe(false);
    expect(e.continuity).toBe('fail');
  });
  it('known continuous route → allowed; unknown → allowed but the check is UNVERIFIED', () => {
    expect(checkRoadEligibility(edgesOf(pts, { 0: 12 }, { 0: 12 })).continuity).toBe('ok');
    const r = run(rect(60, 60), [{ edgeIndex: 0, widthM: 18 }], 'high-rise-condo');
    expect(r.roadEligibility.continuity).toBe('unknown');
    expect(r.designA!.checks.find((c) => c.id === 'road-width')!.status).toBe('UNVERIFIED');
    const known = runFeasibility({ polygonLngLat: toLL(rect(60, 60)), roadEdges: [{ edgeIndex: 0, widthM: 18, accessMinWidthM: 18 }], buildingType: 'high-rise-condo' });
    expect(known.designA!.checks.find((c) => c.id === 'road-width')!.status).toBe('PASS');
  });
  it('estimated widths flag the dependent checks', () => {
    const r = runFeasibility({ polygonLngLat: toLL(rect(60, 60)), roadEdges: [{ edgeIndex: 0, widthM: 18, source: 'map-estimate', accessMinWidthM: 18, accessSource: 'map-estimate' }], buildingType: 'high-rise-condo' });
    const est = r.designA!.checks.filter((c) => c.inputConfidence === 'estimated').map((c) => c.id);
    expect(est).toEqual(expect.arrayContaining(['road-setback-0', 'sky-plane', 'road-width']));
  });
});

describe('hard shapes: every invariant at 0.001 m² for both designs', () => {
  const U: Polygon = [[0, 0], [60, 0], [60, 50], [42, 50], [42, 18], [18, 18], [18, 50], [0, 50]];
  const cases: [string, Polygon, { edgeIndex: number; widthM: number; accessMinWidthM?: number }[]][] = [
    ['U-shape, road on the outer edge', U, [{ edgeIndex: 0, widthM: 12, accessMinWidthM: 12 }]],
    ['U-shape, road inside the notch (2:1 plane applies in front of it only)', U, [{ edgeIndex: 4, widthM: 8 }]],
    ['acute 15° wedge', [[0, 0], [90, 0], [90 * Math.cos(0.26), 90 * Math.sin(0.26)]], [{ edgeIndex: 0, widthM: 12 }]],
    ['sliver triangle', [[0, 0], [120, 0], [60, 14]], [{ edgeIndex: 0, widthM: 18 }]],
    ['three roads 18/12/6', rect(50, 40), [{ edgeIndex: 0, widthM: 18, accessMinWidthM: 18 }, { edgeIndex: 1, widthM: 12 }, { edgeIndex: 2, widthM: 6 }]],
    ['irregular 9-gon, two roads', [[0, 0], [25, -4], [52, 3], [64, 22], [55, 44], [33, 52], [12, 47], [-4, 30], [-6, 12]], [{ edgeIndex: 0, widthM: 10 }, { edgeIndex: 2, widthM: 20 }]],
  ];
  for (const [name, pts, roads] of cases) {
    for (const bt of ['low-rise-condo', 'high-rise-condo', 'mixed-use'] as const) {
      it(`${name} · ${bt}`, () => {
        const r = run(pts, roads, bt);
        expect(r.designA).not.toBeNull();
        verifyDesign(r, r.designA!);
        if (r.designB) verifyDesign(r, r.designB);
        for (const d of [r.designA!, r.designB].filter(Boolean)) {
          expect(d!.checks.find((c) => c.id === 'floors-in-envelope')!.status).toBe('PASS');
          expect(d!.checks.find((c) => c.id === 'gfa-reconciliation')!.status).toBe('PASS');
          expect(d!.checks.find((c) => c.id === 'sky-plane')!.status).not.toBe('FAIL');
        }
      });
    }
  }
  it('the notch road is reported as front-only', () => {
    const r = run(U, [{ edgeIndex: 4, widthM: 8 }], 'low-rise-condo');
    expect(r.edges[4]!.onHull).toBe(false);
    expect(r.designA!.envelope.skyPlanes[0]!.frontOnly).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/notch/);
  });
});

describe('zone detection (BMA GIS layer of the 2013 plan)', () => {
  // synthetic zones: a 1 km ย.9 square with a ย.10 square to its east
  const sq = (x0: number, y0: number, x1: number, y1: number): LngLat[] => toLL([[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]);
  const zone = (z: string, ring: LngLat[]): ZoneFeature => ({ zone: z, polygons: [[ring]], bbox: [Math.min(...ring.map((p) => p[0])), Math.min(...ring.map((p) => p[1])), Math.max(...ring.map((p) => p[0])), Math.max(...ring.map((p) => p[1]))] });
  const zones = [zone('ย.9', sq(-500, -500, 500, 500)), zone('ย.10', sq(500, -500, 1500, 500))];
  it('fully inside, far from the boundary → PASS', () => {
    const j = checkJurisdiction(toLL(rect(40, 40)), zones);
    expect(j.status).toBe('PASS');
    expect(j.zone).toBe('ย.9');
    expect(j.boundaryMarginM!).toBeGreaterThan(400);
  });
  it('inside but within 10 m of the boundary → UNVERIFIED', () => {
    const j = checkJurisdiction(toLL([[455, 0], [495, 0], [495, 40], [455, 40]]), zones);
    expect(j.status).toBe('UNVERIFIED');
    expect(j.boundaryMarginM!).toBeCloseTo(5, 1);
  });
  it('straddling ย.9 / ย.10 → FAIL with both shares', () => {
    const j = checkJurisdiction(toLL([[480, 0], [520, 0], [520, 40], [480, 40]]), zones);
    expect(j.status).toBe('FAIL');
    expect(j.overlaps.map((o) => o.zone).sort()).toEqual(['ย.10', 'ย.9']);
    expect(j.overlaps[0]!.fraction).toBeCloseTo(0.5, 2);
  });
  it('real data: the bundled presets are inside ย.9; the old "Sukhumvit Yor.9" presets are in ย.10', () => {
    const data = realData();
    for (const p of PRESET_PLOTS) {
      const j = checkJurisdiction(p.polygon, data.zones, data.zoningSource);
      expect(j.status, p.id).toBe('PASS');
      expect(j.zone).toBe('ย.9');
    }
    const oldThonglor: LngLat[] = [[100.5790, 13.7316], [100.5794, 13.7316], [100.5794, 13.7320], [100.5790, 13.7320]];
    const j = checkJurisdiction(oldThonglor, data.zones);
    expect(j.status).toBe('FAIL');
    expect(j.zone).toBe('ย.10');
  });
  it('real data: Siam is commercial พ.5', () => {
    const j = checkJurisdiction([[100.5345, 13.7458], [100.5350, 13.7458], [100.5350, 13.7462], [100.5345, 13.7462]], realData().zones);
    expect(j.zone).toBe('พ.5');
  });
});

describe('mass-transit proximity (stations from OpenStreetMap)', () => {
  const st = (x: number, y: number) => ({ name: 'S', nameEn: 'Station', network: 'BTS', lngLat: toLL([[x, y]])[0]! });
  it('whole plot within 500 m → qualifies', () => {
    const t = computeTransit(toLL(rect(40, 40)), [st(20, -300)]);
    expect(t.within500).toBe('all');
    expect(t.qualifies).toBe(true);
    expect(t.nearest!.minDistanceM).toBeCloseTo(300, 0);
  });
  it('only part within 500 m → does not qualify (conservative)', () => {
    const t = computeTransit(toLL(rect(40, 40)), [st(20, -490)]);
    expect(t.within500).toBe('part');
    expect(t.qualifies).toBe(false);
  });
  it('a large office on a 12 m road next to a station is permitted (Plan Cl. 16(10))', () => {
    const r = runFeasibility({ polygonLngLat: toLL(rect(60, 60)), roadEdges: [{ edgeIndex: 0, widthM: 12, accessMinWidthM: 12 }], buildingType: 'commercial-office' }, { stations: [st(30, -150)] });
    expect(r.transit.qualifies).toBe(true);
    expect(r.designA!.totalGFA).toBeGreaterThan(10000);
    expect(r.designA!.checks.find((c) => c.id === 'permitted-use')!.status).toBe('PASS');
  });
  it('real data: a plot by Asok is within 500 m of a station', () => {
    const t = computeTransit([[100.5600, 13.7372], [100.5606, 13.7372], [100.5606, 13.7377], [100.5600, 13.7377]], realData().stations);
    expect(t.qualifies).toBe(true);
  });
});

describe('presets with the real reference data', () => {
  for (const p of PRESET_PLOTS) {
    it(`${p.id}: zone PASS, both designs satisfy every invariant, engine < 200 ms`, () => {
      const data = realData();
      runFeasibility({ polygonLngLat: p.polygon, roadEdges: p.roadEdges, buildingType: p.buildingType }, data); // warm the zone memo
      const r = runFeasibility({ polygonLngLat: p.polygon, roadEdges: p.roadEdges, buildingType: p.buildingType }, data);
      expect(r.jurisdiction.status).toBe('PASS');
      verifyDesign(r, r.designA!);
      verifyDesign(r, r.designB!);
      expect(r.computeMs).toBeLessThan(200);
    });
  }
});
