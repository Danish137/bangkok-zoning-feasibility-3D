// ─── Feasibility entry point ───
// The single authoritative calculation used by the browser app AND the Cloudflare Pages Function.

import type { FeasibilityResult, PlotEdge, RoadEdgeInput, SiteInput } from './types';
import { BUILDING_TYPES } from './types';
import { anchorAtCentroid, polygonToMetric, sqmToRaiNganWah } from './geo';
import {
  dedupeVertices, edgeLength, edgeOutwardNormal, isSelfIntersecting, normalizePolygonWinding, polygonArea,
} from './polygon';
import { checkRoadEligibility, useCaps } from './rules';
import { generateDesigns } from './designs';
import { checkJurisdiction } from './zoning';
import { YOR9 } from './regulations';

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
  // Dedupe can shift indices only if duplicates exist; reject road edges in that case conservatively.
  const roadEdges = pts.length === n0 ? input.roadEdges : input.roadEdges.filter((r) => r.edgeIndex < pts.length);
  const norm = normalizePolygonWinding(pts, roadEdges.map((r) => r.edgeIndex));
  return {
    ...input,
    polygonLngLat: norm.vertices,
    roadEdges: roadEdges.map((r) => ({ edgeIndex: norm.remap(r.edgeIndex), widthM: r.widthM })),
  };
}

export function runFeasibility(rawInput: SiteInput): FeasibilityResult {
  const t0 = now();
  const errors: string[] = [];
  const warnings: string[] = [];
  const input = normalizeSiteInput(rawInput);
  const poly = input.polygonLngLat;
  const base: FeasibilityResult = {
    valid: false, errors, warnings, input, anchor: [0, 0], plotPolygon: [], plotAreaSqm: 0, plotAreaThai: '',
    edges: [], jurisdiction: checkJurisdiction(poly.length ? poly : [[0, 0]]),
    roadEligibility: { mr33Allowed: false, mr33MaxGFA: 0, qualifyingEdges: [], reason: '' },
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
  }
  if (errors.length) return { ...base, computeMs: now() - t0 };

  const anchor = anchorAtCentroid(poly);
  const plot = polygonToMetric(anchor, poly);
  const plotAreaSqm = polygonArea(plot);
  if (plotAreaSqm < MIN_PLOT_AREA_SQM) {
    errors.push(`The plot is too small (${plotAreaSqm.toFixed(1)} m²; minimum ${MIN_PLOT_AREA_SQM} m²).`);
    return { ...base, anchor: [anchor.lngDeg, anchor.latDeg], plotPolygon: plot, plotAreaSqm, computeMs: now() - t0 };
  }

  const roadByEdge = new Map<number, RoadEdgeInput>(input.roadEdges.map((r) => [r.edgeIndex, r]));
  // primary road = widest (ties → longest) for side/rear classification
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
    return { index: i, start: p, end: q, lengthM: lengths[i]!, kind, roadWidthM: road?.widthM };
  });
  if (lengths.some((l) => l < 0.5)) warnings.push('Some plot edges are shorter than 0.5 m; check for accidental vertices.');
  if (input.roadEdges.length === 0) warnings.push('No road-facing edge is selected. Road setbacks, the 2:1 plane and high-rise eligibility depend on it.');

  const jurisdiction = checkJurisdiction(poly);
  const roadEligibility = checkRoadEligibility(edges);
  const maxRoad = input.roadEdges.reduce((m, r) => Math.max(m, r.widthM), 0);
  const caps = useCaps(input.buildingType, maxRoad, !!input.nearTransitDeclared);
  const { designA, designB } = generateDesigns({
    plot, plotAreaSqm, edges, buildingType: input.buildingType, roadEligibility, caps,
    jurisdiction, nearTransitDeclared: !!input.nearTransitDeclared,
  });
  if (!designA) warnings.push('No storey fits inside the setbacks on this plot.');

  return {
    valid: true,
    errors,
    warnings,
    input,
    anchor: [anchor.lngDeg, anchor.latDeg],
    plotPolygon: plot,
    plotAreaSqm,
    plotAreaThai: sqmToRaiNganWah(plotAreaSqm).display,
    edges,
    jurisdiction,
    roadEligibility,
    maxFARGFA: plotAreaSqm * YOR9.maxFAR,
    designA,
    designB,
    computeMs: now() - t0,
  };
}
