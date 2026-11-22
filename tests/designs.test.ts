// Engine scenarios + numerical invariants, verified independently of the compliance module.
import { describe, expect, it } from 'vitest';
import type { DesignResult, FeasibilityResult, MetricPoint, Polygon } from '../src/engine/types';
import { differenceArea, polygonArea, polygonSegmentDistance, signedDistanceToEdgeLine } from '../src/engine/polygon';
import { runFeasibility } from '../src/engine/feasibility';
import { PRESET_PLOTS } from '../src/engine/presets';
import { rect, run, toLL } from './helpers';

const TOL_AREA = 0.01; // m²
const TOL_DIST = 1e-3; // m

/** Independent re-verification of a design against the raw geometry */
function verify(r: FeasibilityResult, d: DesignResult) {
  const plot = r.plotPolygon;
  // Σ floors = total floor area
  const sum = d.floors.reduce((s, f) => s + f.areaSqm, 0);
  expect(Math.abs(sum - d.totalGFA)).toBeLessThan(TOL_AREA);
  // each reported area equals its polygon's area
  for (const f of d.floors) expect(Math.abs(polygonArea(f.polygon) - f.areaSqm)).toBeLessThan(TOL_AREA);
  // FAR ≤ 7
  expect(d.totalGFA).toBeLessThanOrEqual(r.plotAreaSqm * 7 + TOL_AREA);
  // floors inside allowable polygon and inside the plot
  for (const f of d.floors) {
    expect(differenceArea(f.polygon, f.allowablePolygon)).toBeLessThan(TOL_AREA);
    expect(differenceArea(f.polygon, plot)).toBeLessThan(TOL_AREA);
  }
  // setbacks measured from geometry
  for (const sb of d.envelope.setbacks) {
    const e = r.edges[sb.edgeIndex]!;
    for (const f of d.floors) {
      expect(polygonSegmentDistance(f.polygon, e.start, e.end)).toBeGreaterThanOrEqual(sb.distanceM - TOL_DIST);
    }
  }
  // 2:1 plane at every vertex of every storey (active planes)
  for (const pl of d.envelope.skyPlanes.filter((p) => p.active)) {
    const e = r.edges[pl.edgeIndex]!;
    for (const f of d.floors) for (const v of f.polygon) {
      expect(f.topM).toBeLessThanOrEqual(2 * (signedDistanceToEdgeLine(v as MetricPoint, e.start, e.end) + pl.roadWidthM) + TOL_DIST);
    }
  }
  // height class consistency
  if (d.envelope.buildingClass !== 'mr33') {
    expect(d.heightM).toBeLessThan(23);
    expect(d.totalGFA).toBeLessThan(10000);
  } else {
    expect(r.roadEligibility.mr33Allowed).toBe(true);
  }
  // open space = plot − footprint, and all applicable requirements met
  expect(Math.abs(d.openSpaceSqm - (r.plotAreaSqm - d.footprintSqm))).toBeLessThan(TOL_AREA);
  for (const q of d.openSpaceRequirements.filter((x) => x.applies)) expect(d.openSpaceSqm + TOL_AREA).toBeGreaterThanOrEqual(q.requiredSqm);
  // every floor lies within the ground footprint projection
  for (const f of d.floors) expect(differenceArea(f.polygon, d.footprintPolygon)).toBeLessThan(TOL_AREA);
  // compliance engine agrees (no FAIL)
  expect(d.checks.filter((c) => c.status === 'FAIL').map((c) => c.id)).toEqual([]);
}

function both(r: FeasibilityResult) {
  expect(r.valid).toBe(true);
  expect(r.designA).not.toBeNull();
  expect(r.designB).not.toBeNull();
  verify(r, r.designA!);
  verify(r, r.designB!);
  return [r.designA!, r.designB!] as const;
}

describe('plot shapes', () => {
  const shapes: Record<string, Polygon> = {
    rectangle: rect(45, 35),
    trapezoid: [[0, 0], [60, 0], [48, 40], [10, 38]],
    'concave L': [[0, 0], [50, 0], [50, 22], [24, 22], [24, 55], [0, 55]],
    irregular: [[0, 0], [38, -6], [66, 14], [52, 48], [30, 34], [6, 46]],
  };
  for (const [name, pts] of Object.entries(shapes)) {
    it(`${name}: both designs satisfy every invariant (12 m road, high-rise condo)`, () => {
      both(run(pts, [{ edgeIndex: 0, widthM: 12 }], 'high-rise-condo'));
    });
  }
  it('clockwise input gives identical results (edge remapping)', () => {
    const pts: Polygon = [[0, 0], [50, 0], [50, 22], [24, 22], [24, 55], [0, 55]];
    const ccw = run(pts, [{ edgeIndex: 0, widthM: 12 }], 'high-rise-condo');
    // reverse vertices: original edge 0 (v0→v1) becomes edge n-2 = 4
    const cw = runFeasibility({ polygonLngLat: toLL([...pts].reverse()), roadEdges: [{ edgeIndex: 4, widthM: 12 }], buildingType: 'high-rise-condo' });
    expect(cw.designA!.totalGFA).toBeCloseTo(ccw.designA!.totalGFA, 6);
    expect(cw.designB!.totalGFA).toBeCloseTo(ccw.designB!.totalGFA, 6);
  });
});

describe('regulatory scenarios', () => {
  it('residential low-rise on an 8 m soi: high-rise refused (MR 33 Cl. 2), stays < 23 m and < 10,000 m²', () => {
    const r = run(rect(60, 50), [{ edgeIndex: 0, widthM: 8 }], 'high-rise-condo');
    const [A] = both(r);
    expect(r.roadEligibility.mr33Allowed).toBe(false);
    expect(A.isHighRise || A.isExtraLarge).toBe(false);
    expect(A.limitingConstraints.join(' ')).toMatch(/10,000|23 m/);
  });

  it('residential high-rise on an 18 m road reaches FAR 7 (FAR-limited)', () => {
    const r = run(rect(50, 50), [{ edgeIndex: 0, widthM: 18 }], 'high-rise-condo');
    const [A] = both(r);
    expect(A.far).toBeCloseTo(7, 2);
    expect(A.isHighRise).toBe(true);
    expect(A.limitingConstraints[0]).toMatch(/FAR 7\.0 reached/);
  });

  it('extra-large on a 12 m road is capped at 30,000 m² (MR 33 Cl. 2)', () => {
    const r = run(rect(80, 70), [{ edgeIndex: 0, widthM: 12 }], 'high-rise-condo');
    const [A] = both(r);
    expect(A.isExtraLarge).toBe(true);
    expect(A.totalGFA).toBeLessThanOrEqual(30000 + TOL_AREA);
    expect(A.totalGFA).toBeGreaterThan(29000);
  });

  it('commercial office on a 12 m road is limited to 10,000 m² by Plan Cl. 16(10); 16 m road lifts it', () => {
    const narrow = run(rect(60, 60), [{ edgeIndex: 0, widthM: 12 }], 'commercial-office');
    expect(narrow.designA!.totalGFA).toBeLessThanOrEqual(10000 + TOL_AREA);
    both(narrow);
    const wide = run(rect(60, 60), [{ edgeIndex: 0, widthM: 16 }], 'commercial-office');
    expect(wide.designA!.totalGFA).toBeGreaterThan(20000);
    both(wide);
    const transit = run(rect(60, 60), [{ edgeIndex: 0, widthM: 12 }], 'commercial-office', { transit: true });
    expect(transit.designA!.totalGFA).toBeGreaterThan(20000);
    expect(transit.designA!.checks.find((c) => c.id === 'permitted-use')!.status).toBe('UNVERIFIED');
  });

  it('mixed-use: retail podium respects the 5,000 m² commerce limit on a 10 m road', () => {
    const r = run(rect(70, 60), [{ edgeIndex: 0, widthM: 10 }], 'mixed-use');
    const [A] = both(r);
    expect(A.commercialGFA).toBeLessThanOrEqual(5000 + TOL_AREA);
    expect(A.residentialGFA).toBeGreaterThan(0);
  });

  it('open-space-limited: at FAR 7 the zoning OSR (4.5 % x 7 = 31.5 % of plot) forces an extra inset (80 x 80, 18 m road)', () => {
    const r = run(rect(80, 80), [{ edgeIndex: 0, widthM: 18 }], 'high-rise-condo');
    const [A] = both(r);
    expect(A.footprintInsetM).toBeGreaterThan(0);
    expect(A.limitingConstraints.join(' ')).toMatch(/Open-space rules governed/);
    const zoning = A.openSpaceRequirements.find((q) => q.id === 'zoning-osr')!;
    const mr33 = A.openSpaceRequirements.find((q) => q.id === 'mr33-6')!;
    expect(zoning.requiredSqm).toBeGreaterThan(mr33.requiredSqm); // zoning OSR governs
    expect(A.openSpaceSqm).toBeCloseTo(zoning.requiredSqm, -1); // footprint shrunk just enough
  });

  it('height-limited: low-rise on a narrow plot stops at < 23 m before FAR or 10,000 m²', () => {
    const r = run(rect(30, 60), [{ edgeIndex: 0, widthM: 8 }], 'low-rise-condo');
    const [A] = both(r);
    expect(A.totalGFA).toBeLessThan(9999);
    expect(A.heightM).toBeLessThan(23);
    expect(A.limitingConstraints.join(' ')).toMatch(/Height < 23 m/);
  });

  it('narrow 4 m soi: 4 m road setback; BMA Cl. 90 keeps the car park under 15 spaces (floor area capped)', () => {
    const r = run(rect(40, 60), [{ edgeIndex: 0, widthM: 4 }], 'low-rise-condo');
    const [A] = both(r);
    expect(A.envelope.setbacks[0]!.distanceM).toBe(4);
    expect(A.parking.requiredSpaces).toBeLessThan(15);
    expect(A.totalGFA).toBeLessThanOrEqual(2000); // stays below the 2,000 m² large-building threshold
    expect(A.limitingConstraints.join(' ')).toMatch(/Cl\. 90/);
  });

  it('changing road width changes setbacks, planes and results without other input changes', () => {
    // 25 x 40 low-rise: 7 storeys (roof 21 m) fit under the 9,999 m2 cap; a 6 m road needs 21/2 - 6 = 4.5 m > 3 m setback
    const a = run(rect(25, 40), [{ edgeIndex: 0, widthM: 6 }], 'low-rise-condo');
    const b = run(rect(25, 40), [{ edgeIndex: 0, widthM: 12 }], 'low-rise-condo');
    expect(a.designA!.envelope.setbacks[0]!.distanceM).toBe(3);
    expect(b.designA!.envelope.setbacks[0]!.distanceM).toBe(3);
    expect(a.designA!.floors.some((f) => f.skyPlaneEdges.length > 0)).toBe(true);
    expect(b.designA!.floors.some((f) => f.skyPlaneEdges.length > 0)).toBe(false);
  });

  it('corner plot 18 m + 12 m: per-edge widths, corner relief, both designs compliant', () => {
    const r = run(rect(55, 50), [{ edgeIndex: 0, widthM: 18 }, { edgeIndex: 1, widthM: 12 }], 'high-rise-condo');
    const [A] = both(r);
    expect(r.edges[0]!.roadWidthM).toBe(18);
    expect(r.edges[1]!.roadWidthM).toBe(12);
    const planes = A.envelope.skyPlanes;
    expect(planes.find((p) => p.edgeIndex === 0)!.active).toBe(true);
    expect(planes.find((p) => p.edgeIndex === 1)!.active).toBe(false);
    expect(A.checks.filter((c) => c.id.startsWith('road-setback-')).length).toBe(2);
  });

  it('no road declared: sky plane & frontage UNVERIFIED, high-rise refused', () => {
    const r = run(rect(40, 40), [], 'high-rise-condo');
    expect(r.roadEligibility.mr33Allowed).toBe(false);
    const A = r.designA!;
    expect(A.checks.find((c) => c.id === 'sky-plane')!.status).toBe('UNVERIFIED');
    expect(A.checks.find((c) => c.id === 'frontage')!.status).toBe('UNVERIFIED');
  });

  it('plot outside Bangkok: jurisdiction FAIL → design is not reported as compliant', () => {
    const r = run(rect(40, 40), [{ edgeIndex: 0, widthM: 12 }], 'high-rise-condo', { at: [101.2, 13.4] });
    expect(r.jurisdiction.status).toBe('FAIL');
    expect(r.designA!.compliant).toBe(false);
    expect(r.designA!.checks.find((c) => c.id === 'zoning-jurisdiction')!.status).toBe('FAIL');
  });

  it('jurisdiction inside Bangkok is UNVERIFIED, never PASS', () => {
    const r = run(rect(40, 40), [{ edgeIndex: 0, widthM: 12 }], 'high-rise-condo');
    expect(r.designA!.checks.find((c) => c.id === 'zoning-jurisdiction')!.status).toBe('UNVERIFIED');
  });
});

describe('Design B objective', () => {
  it('uses ≤ 60–85 % of Design A footprint and provides more open space, independently compliant', () => {
    for (const p of PRESET_PLOTS) {
      const r = runFeasibility({ polygonLngLat: p.polygon, roadEdges: p.roadEdges, buildingType: p.buildingType });
      const [A, B] = both(r);
      expect(B.footprintSqm).toBeLessThanOrEqual(0.85 * A.footprintSqm + 1);
      expect(B.openSpaceSqm).toBeGreaterThan(A.openSpaceSqm);
      expect(B.totalGFA).toBeLessThanOrEqual(A.totalGFA + 0.5); // A is the max-yield design
    }
  });
  it('high-rise: B recovers the yield with height instead of footprint', () => {
    const r = run(rect(60, 60), [{ edgeIndex: 0, widthM: 18 }], 'high-rise-condo');
    const [A, B] = both(r);
    expect(B.totalGFA).toBeCloseTo(A.totalGFA, 0);
    expect(B.heightM).toBeGreaterThan(A.heightM);
  });
});

describe('determinism, multiple sites, invalid input', () => {
  it('same input → identical output', () => {
    const a = run(rect(45, 35), [{ edgeIndex: 0, widthM: 12 }], 'high-rise-condo');
    const b = run(rect(45, 35), [{ edgeIndex: 0, widthM: 12 }], 'high-rise-condo');
    expect(JSON.stringify(a.designA!.floors)).toBe(JSON.stringify(b.designA!.floors));
  });
  it('geographically separate plots of the same shape give the same areas', () => {
    const a = run(rect(45, 35), [{ edgeIndex: 0, widthM: 12 }], 'high-rise-condo', { at: [100.56, 13.74] });
    const b = run(rect(45, 35), [{ edgeIndex: 0, widthM: 12 }], 'high-rise-condo', { at: [100.60, 13.71] });
    // metres -> WGS84 -> re-anchored metres: tolerance 0.01 m2 (projection round-off between anchors)
    expect(a.plotAreaSqm).toBeCloseTo(1575, 2);
    expect(b.plotAreaSqm).toBeCloseTo(1575, 2);
    expect(Math.abs(a.designA!.totalGFA - b.designA!.totalGFA)).toBeLessThan(0.5);
  });
  it('rejects self-intersecting, too-few-vertex and too-small plots', () => {
    expect(runFeasibility({ polygonLngLat: toLL([[0, 0], [30, 30], [30, 0], [0, 30]]), roadEdges: [], buildingType: 'low-rise-condo' }).valid).toBe(false);
    expect(runFeasibility({ polygonLngLat: toLL([[0, 0], [30, 0]]), roadEdges: [], buildingType: 'low-rise-condo' }).valid).toBe(false);
    expect(runFeasibility({ polygonLngLat: toLL(rect(5, 5)), roadEdges: [], buildingType: 'low-rise-condo' }).valid).toBe(false);
    expect(runFeasibility({ polygonLngLat: toLL(rect(30, 30)), roadEdges: [{ edgeIndex: 7, widthM: 10 }], buildingType: 'low-rise-condo' }).valid).toBe(false);
  });
  it('a plot too narrow for setbacks yields no design rather than a fake one', () => {
    const r = run(rect(7, 60), [{ edgeIndex: 0, widthM: 10 }], 'low-rise-condo');
    expect(r.valid).toBe(true);
    expect(r.designA).toBeNull();
  });
  it('performance: a full evaluation of the corner preset stays well under 1 s', () => {
    const p = PRESET_PLOTS[2]!;
    const r = runFeasibility({ polygonLngLat: p.polygon, roadEdges: p.roadEdges, buildingType: p.buildingType });
    expect(r.computeMs).toBeLessThan(1000);
  });
});
