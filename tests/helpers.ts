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
