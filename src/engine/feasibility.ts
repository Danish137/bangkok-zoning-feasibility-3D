// ─── Feasibility entry point ───
// The single authoritative calculation used by the browser app (Web Worker) AND the Cloudflare Pages Function.

import type { FeasibilityResult, JurisdictionResult, MetricPoint, PlotEdge, RoadEdgeInput, SiteData, SiteInput, TransitResult } from './types';
import { BUILDING_TYPES } from './types';
import { anchorAtCentroid, polygonToMetric, sqmToRaiNganWah } from './geo';
import {
  dedupeVertices, edgeLength, edgeOutwardNormal, isEdgeOnHull, isSelfIntersecting, normalizePolygonWinding, polygonArea,
} from './polygon';
import { checkRoadEligibility, useCaps } from './rules';
import { generateDesigns } from './designs';
import { checkJurisdiction } from './zoning';
import { computeTransit } from './transit';
import { DEFAULT_AVG_UNIT_SIZE_SQM, YOR9 } from './regulations';

export const MIN_PLOT_AREA_SQM = 50;
export const MIN_ROAD_WIDTH_M = 2;
export const MAX_ROAD_WIDTH_M = 120;

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** Normalise an input polygon to CCW and remap road-edge indices accordingly. */
export function normalizeSiteInput(input: SiteInput): SiteInput {
  const pts = dedupeVertices(input.polygonLngLat.map((p) => [p[0], p[1]] as [number, number]), 1e-10);
  const n0 = input.polygonLngLat.length;
  const roadEdges = pts.length === n0 ? input.roadEdges : input.roadEdges.filter((r) => r.edgeIndex < pts.length);
  const norm = normalizePolygonWinding(pts, roadEdges.map((r) => r.edgeIndex));
  return {
    ...input,
    polygonLngLat: norm.vertices,
    roadEdges: roadEdges.map((r) => ({ ...r, edgeIndex: norm.remap(r.edgeIndex) })),
  };
}

// Zone overlay and station distances depend only on the polygon: memoise the last few
const memo = new Map<string, { j: JurisdictionResult; t: TransitResult }>();
function siteLookups(input: SiteInput, data?: SiteData) {
  const key = `${JSON.stringify(input.polygonLngLat)}|${data?.zones?.length ?? 0}|${data?.stations?.length ?? 0}|${input.nearTransitDeclared ? 1 : 0}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const v = {
    j: checkJurisdiction(input.polygonLngLat, data?.zones, data?.zoningSource),
    t: computeTransit(input.polygonLngLat, data?.stations, input.nearTransitDeclared),
  };
  memo.set(key, v);
  if (memo.size > 8) memo.delete(memo.keys().next().value!);
  return v;
}

export function runFeasibility(rawInput: SiteInput, data?: SiteData): FeasibilityResult {
  const t0 = now();
  const errors: string[] = [];
  const warnings: string[] = [];
  const input = normalizeSiteInput(rawInput);
  const poly = input.polygonLngLat;
  const base: FeasibilityResult = {
    valid: false, errors, warnings, input, anchor: [0, 0], plotPolygon: [], plotAreaSqm: 0, plotAreaThai: '',
    edges: [], jurisdiction: { status: 'UNVERIFIED', insideBangkok: true, overlaps: [], message: '' },
    transit: { source: 'none', within500: 'unknown', qualifies: false, message: '' },
    roadEligibility: { mr33Allowed: false, mr33MaxGFA: 0, qualifyingEdges: [], reason: '', continuity: 'unknown' },
    maxFARGFA: 0, designA: null, designB: null, computeMs: 0,
  };
  if (!BUILDING_TYPES[input.buildingType]) errors.push(`Unknown building type "${input.buildingType}"`);
  if (poly.length < 3) errors.push('A plot needs at least three distinct vertices.');
  if (poly.length >= 3 && isSelfIntersecting(poly)) errors.push('The plot boundary crosses itself. Move a vertex so that edges do not intersect.');
  const seen = new Set<number>();
  for (const r of input.roadEdges) {
    if (!Number.isInteger(r.edgeIndex) || r.edgeIndex < 0 || r.edgeIndex >= poly.length) errors.push(`Road edge ${r.edgeIndex + 1} does not exist on this plot.`);
    if (seen.has(r.edgeIndex)) errors.push(`Road edge ${r.edgeIndex + 1} is listed twice.`);
    seen.add(r.edgeIndex);
    if (!(r.widthM >= MIN_ROAD_WIDTH_M && r.widthM <= MAX_ROAD_WIDTH_M)) errors.push(`Road width for edge ${r.edgeIndex + 1} must be ${MIN_ROAD_WIDTH_M}–${MAX_ROAD_WIDTH_M} m.`);
    if (r.accessMinWidthM !== undefined && !(r.accessMinWidthM >= 0 && r.accessMinWidthM <= MAX_ROAD_WIDTH_M)) errors.push(`Access-route width for edge ${r.edgeIndex + 1} must be 0–${MAX_ROAD_WIDTH_M} m.`);
  }
  const avg = input.avgUnitSizeSqm ?? DEFAULT_AVG_UNIT_SIZE_SQM;
  if (!(avg >= 15 && avg <= 500)) errors.push('Average unit size must be 15–500 m².');
  if (errors.length) return { ...base, computeMs: now() - t0 };

  const anchor = anchorAtCentroid(poly);
  const plot = polygonToMetric(anchor, poly);
  const plotAreaSqm = polygonArea(plot);
  if (plotAreaSqm < MIN_PLOT_AREA_SQM) {
    errors.push(`The plot is too small (${plotAreaSqm.toFixed(1)} m²; minimum ${MIN_PLOT_AREA_SQM} m²).`);
    return { ...base, anchor: [anchor.lngDeg, anchor.latDeg], plotPolygon: plot, plotAreaSqm, computeMs: now() - t0 };
  }

  const roadByEdge = new Map<number, RoadEdgeInput>(input.roadEdges.map((r) => [r.edgeIndex, r]));
  const n = plot.length;
  const lengths = plot.map((p, i) => edgeLength(p, plot[(i + 1) % n]!));
  let primary = -1;
  for (const r of input.roadEdges) {
    if (primary < 0) { primary = r.edgeIndex; continue; }
    const cur = roadByEdge.get(primary)!;
    if (r.widthM > cur.widthM || (r.widthM === cur.widthM && lengths[r.edgeIndex]! > lengths[primary]!)) primary = r.edgeIndex;
  }
  const primaryNormal = primary >= 0 ? edgeOutwardNormal(plot[primary]!, plot[(primary + 1) % n]!) : null;
  const edges: PlotEdge[] = plot.map((p, i) => {
    const q = plot[(i + 1) % n]!;
    const road = roadByEdge.get(i);
    let kind: PlotEdge['kind'] = road ? 'road' : 'side';
    if (!road && primaryNormal) {
      const nn = edgeOutwardNormal(p, q);
      if (nn[0] * primaryNormal[0] + nn[1] * primaryNormal[1] < -0.5) kind = 'rear';
    }
    return {
      index: i, start: p, end: q, lengthM: lengths[i]!, kind, onHull: isEdgeOnHull(plot, i, 1e-6),
      roadWidthM: road?.widthM, roadSource: road ? road.source ?? 'user' : undefined,
      accessMinWidthM: road?.accessMinWidthM, accessSource: road?.accessMinWidthM !== undefined ? road.accessSource ?? 'user' : undefined,
    };
  });
  if (lengths.some((l) => l < 0.5)) warnings.push('Some plot edges are shorter than 0.5 m; check for accidental vertices.');
  if (input.roadEdges.length === 0) warnings.push('No road-facing edge is selected. Road setbacks, the 2:1 plane and high-rise eligibility depend on it.');
  for (const e of edges) {
    if (e.kind === 'road' && !e.onHull) warnings.push(`Road edge E${e.index + 1} lies inside a notch of the plot. Its 2:1 plane is applied only in front of the edge; mark every edge that faces the road.`);
  }

  const { j: jurisdiction, t: transit } = siteLookups(input, data);
  const roadEligibility = checkRoadEligibility(edges);
  const maxRoad = input.roadEdges.reduce((m, r) => Math.max(m, r.widthM), 0);
  const caps = useCaps(input.buildingType, maxRoad, transit.qualifies);
  const primaryEdge: [MetricPoint, MetricPoint] = primary >= 0 ? [plot[primary]!, plot[(primary + 1) % n]!] : [plot[0]!, plot[1]!];
  const { designA, designB } = generateDesigns({
    plot, plotAreaSqm, edges, buildingType: input.buildingType, roadEligibility, caps,
    jurisdiction, transit, avgUnitSizeSqm: avg, parkingMode: input.parkingMode ?? 'podium', primaryEdge,
  });
  if (!designA) warnings.push('No storey fits inside the setbacks on this plot.');

  return {
    valid: true, errors, warnings, input, anchor: [anchor.lngDeg, anchor.latDeg], plotPolygon: plot, plotAreaSqm,
    plotAreaThai: sqmToRaiNganWah(plotAreaSqm).display, edges, jurisdiction, transit, roadEligibility,
    maxFARGFA: plotAreaSqm * YOR9.maxFAR, designA, designB, computeMs: now() - t0,
  };
}
