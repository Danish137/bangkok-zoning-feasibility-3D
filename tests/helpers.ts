// Shared test helpers: build plots in metres and convert to WGS84 around a Sukhumvit anchor.
import { createAnchor, toLngLat } from '../src/engine/geo';
import type { BuildingType, LngLatPolygon, MetricPoint, RoadEdgeInput } from '../src/engine/types';
import { runFeasibility } from '../src/engine/feasibility';

export const SUKHUMVIT: [number, number] = [100.5760, 13.7308];

export function toLL(pts: MetricPoint[], at: [number, number] = SUKHUMVIT): LngLatPolygon {
  const a = createAnchor(at);
  return pts.map((p) => toLngLat(a, p));
}

export const rect = (w: number, h: number): MetricPoint[] => [[0, 0], [w, 0], [w, h], [0, h]];

export function run(pts: MetricPoint[], roads: RoadEdgeInput[], buildingType: BuildingType, opts: { at?: [number, number]; transit?: boolean } = {}) {
  return runFeasibility({ polygonLngLat: toLL(pts, opts.at), roadEdges: roads, buildingType, nearTransitDeclared: opts.transit });
}

// ── Independent design verifier (does not use compliance.ts) ──
import { expect } from 'vitest';
import type { DesignResult, FeasibilityResult, SiteData, StationPoint } from '../src/engine/types';
import { differenceArea, polygonArea, polygonSegmentDistance, signedDistanceToEdgeLine, slabOverlapArea } from '../src/engine/polygon';
import { skyPlaneOffset } from '../src/engine/rules';
import { readFileSync } from 'node:fs';
import { buildZoningIndex } from '../src/engine/zoning';

export const AREA_TOL = 0.001; // m²
export const DIST_TOL = 1e-3; // m

export function verifyDesign(r: FeasibilityResult, d: DesignResult) {
  const all = [...d.basementFloors, ...d.floors];
  expect(Math.abs(all.reduce((s, f) => s + f.areaSqm, 0) - d.totalGFA)).toBeLessThanOrEqual(AREA_TOL);
  for (const f of all) expect(Math.abs(polygonArea(f.polygon) - f.areaSqm)).toBeLessThanOrEqual(AREA_TOL);
  expect(d.totalGFA).toBeLessThanOrEqual(r.plotAreaSqm * 7 + AREA_TOL);
  for (const f of d.floors) {
    expect(differenceArea(f.polygon, f.allowablePolygon)).toBeLessThanOrEqual(AREA_TOL);
    expect(differenceArea(f.polygon, r.plotPolygon)).toBeLessThanOrEqual(AREA_TOL);
    expect(differenceArea(f.polygon, d.footprintPolygon)).toBeLessThanOrEqual(AREA_TOL); // nested under the ground storey
  }
  for (const f of d.basementFloors) expect(differenceArea(f.polygon, d.envelope.buildablePolygon)).toBeLessThanOrEqual(AREA_TOL);
  const upperFrom = d.envelope.upperFromIndex ?? Infinity;
  for (const sb of d.envelope.setbacks) {
    const e = r.edges[sb.edgeIndex]!;
    for (const f of all) {
      const req = f.index >= upperFrom && d.envelope.upperSetbacks ? d.envelope.upperSetbacks[sb.edgeIndex]! : sb.distanceM;
      expect(polygonSegmentDistance(f.polygon, e.start, e.end)).toBeGreaterThanOrEqual(req - DIST_TOL);
    }
  }
  for (const pl of d.envelope.skyPlanes.filter((p) => p.active)) {
    const e = r.edges[pl.edgeIndex]!;
    for (const f of d.floors) {
      for (const v of f.polygon) {
        const dd = signedDistanceToEdgeLine(v, e.start, e.end);
        if (pl.frontOnly && dd < -1e-9) continue;
        expect(f.topM).toBeLessThanOrEqual(2 * (dd + pl.roadWidthM) + DIST_TOL);
      }
      if (pl.frontOnly) expect(slabOverlapArea(f.polygon, e.start, e.end, skyPlaneOffset(f.topM, pl.roadWidthM))).toBeLessThanOrEqual(AREA_TOL);
    }
  }
  if (d.envelope.buildingClass !== 'mr33') { expect(d.heightM).toBeLessThan(23); expect(d.totalGFA).toBeLessThan(10000); }
  expect(Math.abs(d.openSpaceSqm - (r.plotAreaSqm - d.footprintSqm))).toBeLessThanOrEqual(AREA_TOL);
  for (const q of d.openSpaceRequirements.filter((x) => x.applies)) expect(d.openSpaceSqm + AREA_TOL).toBeGreaterThanOrEqual(q.requiredSqm);
  expect(d.parking.providedSpaces).toBeGreaterThanOrEqual(d.parking.requiredSpaces);
}

/** Real bundled reference data (public/data) */
let cached: SiteData | null = null;
export function realData(): SiteData {
  if (cached) return cached;
  const z = JSON.parse(readFileSync('public/data/bkk-zoning-2556.geojson', 'utf8'));
  const st = JSON.parse(readFileSync('public/data/bkk-rail-stations.geojson', 'utf8'));
  cached = {
    zones: buildZoningIndex(z), zoningSource: z.metadata?.source,
    stations: st.features.map((f: { properties: Record<string, string>; geometry: { coordinates: [number, number] } }): StationPoint => ({ name: f.properties.name ?? '', nameEn: f.properties.nameEn ?? '', network: f.properties.network ?? '', lngLat: f.geometry.coordinates })),
  };
  return cached;
}
