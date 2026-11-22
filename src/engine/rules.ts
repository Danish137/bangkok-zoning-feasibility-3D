// ─── Rules engine: setbacks, sky-exposure planes, road eligibility, envelope & floor stacking ───
// Pure deterministic TypeScript. Clause references: see ./regulations.ts.
// Where Bangkok's Building Control Ordinance B.E. 2544 (BMA) repeats or tightens a Ministerial
// Regulation, the stricter value is used and both references are reported.

import type {
  BuildingClass, BuildingType, EdgeSetback, Envelope, FloorResult, MetricPoint, PlotEdge,
  Polygon, RoadEligibility, SkyPlane, UseCategory,
} from './types';
import { BUILDING_TYPES } from './types';
import { BMA2544, MR33, MR55, YOR9 } from './regulations';
import {
  clipByHalfPlane, edgeInwardNormal, intersectPolygons, minimumWidth, polygonArea, projectedExtent, removeSlab,
  setbackPolygon, signedDistanceToEdgeLine,
} from './polygon';

/** Practical minimum floor plate for a usable storey (design assumption, not law) */
export const MIN_FLOOR_AREA_SQM = 50;
export const MIN_FLOOR_WIDTH_M = 5;
export const MAX_FLOORS = 150;
/** Strict "< 23 m" / "< 10,000 m²" boundaries are implemented with this tolerance */
export const STRICT_EPS = 1e-6;
/** Low-rise buildings must stay below 10,000 m² (MR 33 Cl. 1); 1 m² margin keeps the figure unambiguous */
export const LOW_RISE_MAX_GFA = 9999;

export const CLASS_LABELS: Record<BuildingClass, string> = {
  'low-le9': 'Low-rise ≤ 9 m (MR 55 + BMA 2544)',
  'low-lt23': 'Low-rise < 23 m and < 10,000 m² (MR 55 + BMA 2544)',
  mr33: 'High-rise / extra-large (MR 33 + MR 55 + BMA 2544)',
};

// ── Setbacks ──

/**
 * MR 55 Cl. 41 = BMA 2544 Cl. 50 (identical tiers): setback from the public-road boundary for a building
 * > 2 storeys / > 8 m or a commercial building. The plot edge is assumed to be the road boundary, so a
 * distance "from the road centreline" becomes (distance − width/2).
 */
export function clause41RoadSetback(roadWidthM: number): { distanceM: number; basis: string } {
  const w = roadWidthM;
  if (w < MR55.roadTier1MaxM) {
    const d = Math.max(0, MR55.roadTier1CentrelineM - w / 2);
    return { distanceM: d, basis: `road ${fmt(w)} m < 10 m → ≥ 6 m from centreline = 6 − ${fmt(w / 2)} = ${fmt(d)} m from road line` };
  }
  if (w <= MR55.roadTier2MaxM) {
    const d = w * MR55.roadTier2Fraction;
    return { distanceM: d, basis: `road 10–20 m → ≥ 1/10 × ${fmt(w)} = ${fmt(d)} m from road line` };
  }
  return { distanceM: MR55.roadTier3SetbackM, basis: `road > 20 m → ≥ 2 m from road line` };
}

/** MR 55 Cl. 50 / BMA 2544 Cl. 54: distance from private land for walls with openings */
export function clause50OpeningSetback(cls: BuildingClass): { distanceM: number; basis: string } | null {
  if (cls === 'low-le9') return { distanceM: MR55.openingSetbackLowM, basis: 'MR 55 Cl. 50(1) / BMA 2544 Cl. 54: storeys 1–2, height ≤ 9 m → walls with openings ≥ 2 m from private land' };
  if (cls === 'low-lt23') return { distanceM: MR55.openingSetbackMidM, basis: 'MR 55 Cl. 50(2) / BMA 2544 Cl. 54: height > 9 m → walls with openings ≥ 3 m from private land' };
  return null;
}

export function computeSetbacks(edges: PlotEdge[], cls: BuildingClass): EdgeSetback[] {
  const c50 = clause50OpeningSetback(cls);
  return edges.map((e) => {
    const candidates: { d: number; basis: string; ref: string }[] = [];
    if (cls === 'mr33') {
      candidates.push({ d: MR33.boundarySetbackM, basis: 'MR 33 Cl. 4: outermost part ≥ 6 m from neighbouring land or public road', ref: 'MR 33 Cl. 4' });
    } else if (c50) {
      candidates.push({ d: c50.distanceM, basis: c50.basis, ref: cls === 'low-le9' ? 'MR 55 Cl. 50(1); BMA Cl. 54' : 'MR 55 Cl. 50(2); BMA Cl. 54' });
    }
    if (e.kind === 'road' && e.roadWidthM !== undefined) {
      const r = clause41RoadSetback(e.roadWidthM);
      candidates.push({ d: r.distanceM, basis: `MR 55 Cl. 41 / BMA 2544 Cl. 50: ${r.basis}`, ref: 'MR 55 Cl. 41; BMA Cl. 50' });
    }
    const gov = candidates.reduce((a, b) => (b.d > a.d ? b : a), candidates[0]!);
    const others = candidates.filter((c) => c !== gov).map((c) => `${c.ref} ${fmt(c.d)} m`);
    return {
      edgeIndex: e.index,
      kind: e.kind,
      distanceM: gov.d,
      basis: gov.basis + (others.length ? ` (governs over ${others.join(', ')})` : ''),
      reference: gov.ref,
    };
  });
}

/** BMA 2544 Cl. 54: from the 3rd storey, openings ≥ 3 m from private land (non-road edges). Only tightens the ≤ 9 m class. */
export function upperStoreySetbacks(edges: PlotEdge[], base: EdgeSetback[]): number[] {
  return edges.map((e, i) => (e.kind === 'road' ? base[i]!.distanceM : Math.max(base[i]!.distanceM, BMA2544.openingUpperM)));
}

// ── Sky-exposure planes (MR 55 Cl. 44–46 = BMA 2544 Cl. 49) ──

/**
 * Cl. 44: H(p) ≤ 2 × horizontal distance from p to the opposite boundary of the nearest public road.
 * With several roads every plane applies (equivalent to "nearest road").
 * Cl. 45 (two unequal parallel roads ≤ 60 m apart, building width along the wider road ≤ 60 m) and
 * Cl. 46 (corner of two unequal roads, building length along the narrower road ≤ 60 m) let the wider
 * road govern; the narrower road's plane is then inactive. Building extents are tested on the buildable
 * polygon (a superset of any floor), so relief is only granted when it holds for every possible design.
 * A road edge that is not on the plot's convex hull (inside a notch) governs only the part of the plot
 * in front of its line (`frontOnly`); points behind the line do not face that road.
 */
export function computeSkyPlanes(edges: PlotEdge[], buildable: Polygon): SkyPlane[] {
  const roads = edges.filter((e) => e.kind === 'road' && e.roadWidthM !== undefined);
  if (roads.length === 0) return [];
  const widest = roads.reduce((a, b) => ((b.roadWidthM ?? 0) > (a.roadWidthM ?? 0) ? b : a));
  const wW = widest.roadWidthM!;
  const front = (r: PlotEdge) => !r.onHull;
  const note = (r: PlotEdge) => (r.onHull ? '' : ' Edge lies inside a notch of the plot: applied to the part of the plot in front of the road line.');
  return roads.map((r) => {
    const w = r.roadWidthM!;
    if (r === widest || w >= wW - 1e-9) {
      return { edgeIndex: r.index, roadWidthM: w, active: true, frontOnly: front(r), reason: (roads.length > 1 && r !== widest ? 'Equal-width road: Cl. 44 nearest-road rule applies' : 'Cl. 44: 2:1 plane from the opposite road boundary') + note(r) };
    }
    const dirW = unit(widest.start, widest.end);
    const dirR = unit(r.start, r.end);
    const cos = Math.abs(dirW[0] * dirR[0] + dirW[1] * dirR[1]);
    if (cos > 0.9) {
      const mid: MetricPoint = [(r.start[0] + r.end[0]) / 2, (r.start[1] + r.end[1]) / 2];
      const gap = Math.abs(signedDistanceToEdgeLine(mid, widest.start, widest.end));
      const widthAlongWide = projectedExtent(buildable, dirW);
      if (gap <= MR55.multiRoadReliefM && widthAlongWide <= MR55.multiRoadReliefM) {
        return { edgeIndex: r.index, roadWidthM: w, active: false, frontOnly: front(r), reason: `Cl. 45 relief: roads ${fmt(gap)} m apart (≤ 60 m), building width along ${fmt(wW)} m road ≤ ${fmt(widthAlongWide)} m (≤ 60 m) → wider road governs` };
      }
      return { edgeIndex: r.index, roadWidthM: w, active: true, frontOnly: front(r), reason: `Cl. 45 relief not available (gap ${fmt(gap)} m or width ${fmt(widthAlongWide)} m > 60 m) → Cl. 44 applies` + note(r) };
    }
    const lenAlongNarrow = projectedExtent(buildable, dirR);
    if (lenAlongNarrow <= MR55.multiRoadReliefM) {
      return { edgeIndex: r.index, roadWidthM: w, active: false, frontOnly: front(r), reason: `Cl. 46 corner relief: building length along the ${fmt(w)} m road ≤ ${fmt(lenAlongNarrow)} m (≤ 60 m) → ${fmt(wW)} m road governs` };
    }
    return { edgeIndex: r.index, roadWidthM: w, active: true, frontOnly: front(r), reason: `Cl. 46 relief not available (length along narrower road ${fmt(lenAlongNarrow)} m > 60 m) → Cl. 44 applies` + note(r) };
  });
}

/** Offset (m, inward from the plot road line) required by a plane for a point at height topM */
export function skyPlaneOffset(topM: number, roadWidthM: number): number {
  return topM / MR55.skyPlaneRatio - roadWidthM;
}

/** Apply every active plane at a given top height to a polygon (half-plane clip, or slab removal for notch edges) */
export function applySkyPlanes(
  poly: Polygon, edges: PlotEdge[], planes: SkyPlane[], topM: number,
): { polygon: Polygon; areaSqm: number; clippedBy: number[] } {
  let cur = poly;
  const clippedBy: number[] = [];
  for (const pl of planes) {
    if (!pl.active) continue;
    const t = skyPlaneOffset(topM, pl.roadWidthM);
    if (t <= 0) continue;
    const e = edges[pl.edgeIndex]!;
    const before = polygonArea(cur);
    let r;
    if (pl.frontOnly) {
      r = removeSlab(cur, e.start, e.end, t);
    } else {
      const [nx, ny] = edgeInwardNormal(e.start, e.end);
      r = clipByHalfPlane(cur, [e.start[0] + nx * t, e.start[1] + ny * t], [e.end[0] + nx * t, e.end[1] + ny * t], [nx, ny]);
    }
    cur = r.polygon;
    if (cur.length < 3) return { polygon: [], areaSqm: 0, clippedBy: [...clippedBy, pl.edgeIndex] };
    if (r.areaSqm < before - 1e-6) clippedBy.push(pl.edgeIndex);
  }
  return { polygon: cur, areaSqm: polygonArea(cur), clippedBy };
}

/** Layer 3: allowable polygon of storey `index` at its roof height */
export function allowableAt(env: Envelope, edges: PlotEdge[], index: number, topM: number) {
  const base = env.upperBuildablePolygon && index >= (env.upperFromIndex ?? Infinity) ? env.upperBuildablePolygon : env.buildablePolygon;
  return applySkyPlanes(base, edges, env.skyPlanes, topM);
}

// ── Road eligibility for MR 33 buildings (Clause 2) ──

/**
 * MR 33 Cl. 2: one plot side ≥ 12 m on a public road with reserve ≥ 10 m (≥ 18 m above 30,000 m²),
 * "ยาวต่อเนื่องกันโดยตลอดจนไปเชื่อมต่อกับถนนสาธารณะอื่นที่มีเขตทางกว้างไม่น้อยกว่า 10.00 เมตร":
 * the road must keep that width all the way to another public road of the same width.
 * `accessMinWidthM` (narrowest reserve along that route) carries the continuity evidence.
 */
export function checkRoadEligibility(edges: PlotEdge[]): RoadEligibility {
  const roads = edges.filter((e) => e.kind === 'road');
  const estimated = roads.some((e) => e.roadSource === 'map-estimate' || e.accessSource === 'map-estimate');
  const conf = estimated ? { inputConfidence: 'estimated' as const } : {};
  const routeOk = (e: PlotEdge, minW: number) => e.accessMinWidthM === undefined ? null : e.accessMinWidthM >= minW - 1e-9;
  const q10 = roads.filter((e) => e.lengthM >= MR33.minFrontageM - 1e-9 && (e.roadWidthM ?? 0) >= MR33.minRoadWidthM - 1e-9);
  if (roads.length === 0) {
    return { mr33Allowed: false, mr33MaxGFA: 0, qualifyingEdges: [], continuity: 'unknown', ...conf, reason: 'No public-road frontage declared; MR 33 Cl. 2 requires a ≥ 12 m side on a ≥ 10 m public road' };
  }
  if (q10.length === 0) {
    const best = roads.reduce((a, b) => ((b.roadWidthM ?? 0) > (a.roadWidthM ?? 0) ? b : a));
    const why = (best.roadWidthM ?? 0) < MR33.minRoadWidthM ? `widest road is ${fmt(best.roadWidthM ?? 0)} m (< 10 m)` : `no ≥ 10 m road edge is ≥ 12 m long`;
    return { mr33Allowed: false, mr33MaxGFA: 0, qualifyingEdges: [], continuity: 'unknown', ...conf, reason: `High-rise / extra-large not permitted: MR 33 Cl. 2 needs a plot side ≥ 12 m on a public road ≥ 10 m wide (${why})` };
  }
  const cont10 = q10.filter((e) => routeOk(e, MR33.minRoadWidthM) !== false);
  if (cont10.length === 0) {
    const m = Math.max(...q10.map((e) => e.accessMinWidthM ?? 0));
    return { mr33Allowed: false, mr33MaxGFA: 0, qualifyingEdges: [], continuity: 'fail', ...conf, reason: `High-rise / extra-large not permitted: the ≥ 10 m road narrows to ${fmt(m)} m before reaching another ≥ 10 m public road (MR 33 Cl. 2 continuity)` };
  }
  const known = cont10.some((e) => routeOk(e, MR33.minRoadWidthM) === true);
  const continuity = known ? 'ok' : 'unknown';
  const q18 = cont10.filter((e) => (e.roadWidthM ?? 0) >= MR33.minRoadWidthLargeM - 1e-9 && routeOk(e, MR33.minRoadWidthLargeM) !== false);
  const contNote = known ? '' : '; continuity to another ≥ 10 m road not confirmed';
  if (q18.length > 0) {
    return { mr33Allowed: true, mr33MaxGFA: Infinity, qualifyingEdges: q18.map((e) => e.index), continuity, ...conf, reason: `MR 33 Cl. 2: ≥ 12 m frontage on a ≥ 18 m road → no road-based floor-area cap${contNote}` };
  }
  return { mr33Allowed: true, mr33MaxGFA: MR33.largeAreaSqm, qualifyingEdges: cont10.map((e) => e.index), continuity, ...conf, reason: `MR 33 Cl. 2: ≥ 12 m frontage on a 10–18 m road → total floor area ≤ 30,000 m²${contNote}` };
}

// ── Envelope per building class ──

export interface UseCaps {
  /** Max total floor area allowed by the use rules (Plan Cl. 16) */
  maxGFA: number;
  maxGFARule: string;
  /** Max commercial area (mixed-use podium), Plan Cl. 16 (9) */
  maxCommercial: number;
  maxCommercialRule: string;
}

export function useCaps(buildingType: BuildingType, maxRoadWidthM: number, nearTransit: boolean): UseCaps {
  const cfg = BUILDING_TYPES[buildingType];
  const caps: UseCaps = { maxGFA: Infinity, maxGFARule: '', maxCommercial: Infinity, maxCommercialRule: '' };
  if (cfg.use === 'office' && maxRoadWidthM < YOR9.office.roadM && !nearTransit) {
    caps.maxGFA = YOR9.office.maxAreaSqm;
    caps.maxGFARule = `Plan Cl. 16(10): office > 10,000 m² needs a road ≥ 16 m or a site within 500 m of a station (road ${fmt(maxRoadWidthM)} m)`;
  }
  if (cfg.use === 'mixed' && !nearTransit) {
    if (maxRoadWidthM < YOR9.commerce.tier1RoadM) {
      caps.maxCommercial = YOR9.commerce.tier1AreaSqm;
      caps.maxCommercialRule = `Plan Cl. 16(9): commerce > 5,000 m² needs a road ≥ 12 m or 500 m of a station`;
    } else if (maxRoadWidthM < YOR9.commerce.tier2RoadM) {
      caps.maxCommercial = YOR9.commerce.tier2AreaSqm;
      caps.maxCommercialRule = `Plan Cl. 16(9)(b): commerce > 10,000 m² needs a road ≥ 16 m or 500 m of a station`;
    }
  }
  return caps;
}

export interface EnvelopeContext {
  plot: Polygon;
  plotAreaSqm: number;
  edges: PlotEdge[];
  buildingType: BuildingType;
  roadEligibility: RoadEligibility;
  caps: UseCaps;
}

export function buildEnvelope(ctx: EnvelopeContext, cls: BuildingClass): Envelope {
  const setbacks = computeSetbacks(ctx.edges, cls);
  const piece = setbackPolygon(ctx.plot, setbacks.map((s) => s.distanceM));
  const buildable = piece.polygon;
  const planes = buildable.length >= 3 ? computeSkyPlanes(ctx.edges, buildable) : [];
  const farGFA = ctx.plotAreaSqm * YOR9.maxFAR;
  let maxGFA = farGFA;
  let gfaRule = `Plan Cl. 16: FAR 7:1 × ${fmt(ctx.plotAreaSqm)} m²`;
  const tighten = (v: number, rule: string) => { if (v < maxGFA) { maxGFA = v; gfaRule = rule; } };
  let maxHeightM: number | null = null;
  let heightRule = '';
  let upper: Partial<Envelope> = {};
  if (cls === 'low-le9') {
    maxHeightM = MR55.openingSetbackLowMaxHeightM;
    heightRule = 'Height ≤ 9 m (MR 55 Cl. 50(1) tier with 2 m openings setback)';
    tighten(LOW_RISE_MAX_GFA, 'Total floor area < 10,000 m² (otherwise MR 33 extra-large)');
    const up = upperStoreySetbacks(ctx.edges, setbacks);
    if (up.some((d, i) => d > setbacks[i]!.distanceM)) {
      const p = setbackPolygon(ctx.plot, up);
      upper = { upperBuildablePolygon: p.polygon, upperFromIndex: BMA2544.openingUpperFromStoreyIndex, upperSetbacks: up };
    }
  } else if (cls === 'low-lt23') {
    maxHeightM = MR33.highRiseHeightM - STRICT_EPS;
    heightRule = 'Height < 23 m (MR 33 Cl. 1: ≥ 23 m is a high-rise building)';
    tighten(LOW_RISE_MAX_GFA, 'Total floor area < 10,000 m² (MR 33 Cl. 1: ≥ 10,000 m² is extra-large)');
  } else {
    heightRule = 'No absolute height limit in ย.9; height is bounded by FAR and the 2:1 plane';
    if (Number.isFinite(ctx.roadEligibility.mr33MaxGFA)) tighten(ctx.roadEligibility.mr33MaxGFA, 'MR 33 Cl. 2: ≤ 30,000 m² unless ≥ 12 m frontage on a ≥ 18 m road');
  }
  if (ctx.caps.maxGFA < maxGFA) tighten(ctx.caps.maxGFA, ctx.caps.maxGFARule);
  return {
    buildingClass: cls,
    classLabel: CLASS_LABELS[cls],
    setbacks,
    buildablePolygon: buildable,
    buildableAreaSqm: piece.areaSqm,
    discardedAreaSqm: piece.discardedAreaSqm,
    skyPlanes: planes,
    ...upper,
    maxHeightM,
    heightRule,
    maxGFA,
    gfaRule,
  };
}

// ── Floor stacking ──

export type StopReason =
  | 'gfa-cap'
  | 'height-limit'
  | 'sky-plane'
  | 'max-floors'
  | 'no-buildable-area';

export interface StackResult {
  floors: FloorResult[];
  stopReason: StopReason;
  totalGFA: number;
}

export function floorHeightAt(buildingType: BuildingType, index: number): number {
  const cfg = BUILDING_TYPES[buildingType];
  return index === 0 && cfg.groundFloorHeight ? cfg.groundFloorHeight : cfg.floorToFloor;
}

/**
 * Trim a floor to at most targetSqm by cutting it with a line parallel to edge a→b (moving inward
 * from that edge), i.e. the storey steps back from that side. The result is a subset of the input.
 */
export function trimToArea(poly: Polygon, targetSqm: number, a: MetricPoint, b: MetricPoint): Polygon {
  if (polygonArea(poly) <= targetSqm) return poly;
  const [nx, ny] = edgeInwardNormal(a, b);
  const ds = poly.map((v) => signedDistanceToEdgeLine(v, a, b));
  let lo = Math.min(...ds), hi = Math.max(...ds);
  let best: Polygon = [];
  const cut = (x: number) => clipByHalfPlane(poly, [a[0] + nx * x, a[1] + ny * x], [b[0] + nx * x, b[1] + ny * x], [nx, ny]);
  for (let k = 0; k < 50 && hi - lo > 1e-5; k++) {
    const mid = (lo + hi) / 2;
    const r = cut(mid);
    if (r.areaSqm <= targetSqm) { best = r.polygon; hi = mid; } else { lo = mid; }
  }
  return best.length >= 3 ? best : cut(hi).polygon;
}

/** Ground-floor footprint candidates (layer 4 base): buildable plus an extra uniform setback `s` from the plot boundary */
export interface Footprint {
  base: Polygon;
  /** Footprint for storeys ≥ env.upperFromIndex (BMA 2544 Cl. 54) */
  upper?: Polygon;
  extraSetbackM: number;
}

const footprintMemo = new WeakMap<Envelope, Map<string, Footprint>>();

export function footprintFor(ctx: EnvelopeContext, env: Envelope, extraSetbackM: number, cutDepth?: { a: MetricPoint; b: MetricPoint; depthM: number }): Footprint {
  const s = Math.max(0, extraSetbackM);
  const key = `${s}|${cutDepth ? cutDepth.depthM : ''}`;
  let memo = footprintMemo.get(env);
  if (!memo) { memo = new Map(); footprintMemo.set(env, memo); }
  const hit = memo.get(key);
  if (hit) return hit;
  // Extra uniform setback from the PLOT boundary, kept inside the legal buildable polygon (memoised per s)
  const baseKey = `${s}|`;
  const uncut = memo.get(baseKey) ?? {
    base: s === 0 ? env.buildablePolygon : setbackPolygon(ctx.plot, env.setbacks.map((x) => x.distanceM + s), env.buildablePolygon).polygon,
    upper: env.upperBuildablePolygon
      ? (s === 0 ? env.upperBuildablePolygon : setbackPolygon(ctx.plot, (env.upperSetbacks ?? []).map((d) => d + s), env.upperBuildablePolygon).polygon)
      : undefined,
    extraSetbackM: s,
  };
  if (!cutDepth) {
    if (uncut.upper && uncut.upper.length >= 3 && uncut.base.length >= 3 && s > 0) uncut.upper = intersectPolygons(uncut.upper, uncut.base).polygon;
    memo.set(baseKey, uncut);
    return uncut;
  }
  memo.set(baseKey, uncut);
  let base = uncut.base;
  let upper = uncut.upper;
  if (cutDepth && base.length >= 3) {
    const { a, b, depthM } = cutDepth;
    const [nx, ny] = edgeInwardNormal(a, b);
    // keep 0 ≤ d ≤ depth: clip with the opposite half-plane at `depth`
    const p1: MetricPoint = [a[0] + nx * depthM, a[1] + ny * depthM];
    const p2: MetricPoint = [b[0] + nx * depthM, b[1] + ny * depthM];
    base = clipByHalfPlane(base, p2, p1, [-nx, -ny]).polygon;
    if (upper && upper.length >= 3) upper = clipByHalfPlane(upper, p2, p1, [-nx, -ny]).polygon;
  }
  // the upper footprint must sit inside the base one (storeys nest)
  if (upper && upper.length >= 3 && base.length >= 3 && s > 0) upper = intersectPolygons(upper, base).polygon;
  const out = { base, upper, extraSetbackM: s };
  memo.set(key, out);
  return out;
}

export type AllowCache = Map<number, { polygon: Polygon; areaSqm: number; clippedBy: number[] }>;

/**
 * Stack storeys on a footprint under the envelope's height and floor-area caps.
 * Each storey = footprint(index) ∩ sky planes at its roof; because plane offsets grow with height and the
 * upper footprint is a subset of the base footprint, storeys are nested (each inside the one below).
 * The last storey is trimmed to land exactly on the cap. `trimEdge` sets which side the trim steps back from.
 */
export function stackFloors(
  ctx: EnvelopeContext,
  env: Envelope,
  fp: Footprint,
  cache: AllowCache,
  opts: { gfaCap?: number; trimEdge?: [MetricPoint, MetricPoint] } = {},
): StackResult {
  const cfg = BUILDING_TYPES[ctx.buildingType];
  const floors: FloorResult[] = [];
  if (fp.base.length < 3 || env.buildablePolygon.length < 3) return { floors, stopReason: 'no-buildable-area', totalGFA: 0 };
  const cap = Math.min(env.maxGFA, opts.gfaCap ?? Infinity);
  const trimEdge = opts.trimEdge ?? [ctx.plot[0]!, ctx.plot[1 % ctx.plot.length]!];
  let cum = 0;
  let commercial = 0;
  let elevation = 0;
  let stop: StopReason = 'max-floors';
  let prevFp: Polygon | null = null;
  for (let i = 0; i < MAX_FLOORS; i++) {
    const h = floorHeightAt(ctx.buildingType, i);
    const top = elevation + h;
    if (env.maxHeightM !== null && top > env.maxHeightM + 1e-9) { stop = 'height-limit'; break; }
    let allow = cache.get(i);
    if (!allow) { allow = allowableAt(env, ctx.edges, i, top); cache.set(i, allow); }
    if (allow.polygon.length < 3 || allow.areaSqm < MIN_FLOOR_AREA_SQM) { stop = 'sky-plane'; break; }
    const fpI = fp.upper && fp.upper.length >= 3 && i >= (env.upperFromIndex ?? Infinity) ? fp.upper : fp.base;
    const prev = floors[floors.length - 1];
    // Planes that do not clip the buildable polygon cannot clip the (smaller) footprint either: reuse it.
    // Otherwise storey = footprint ∩ this storey's allowable polygon ∩ the storey below. This keeps every
    // storey inside its own envelope even when a plane splits the plot (e.g. the arms of a U), and nests
    // storeys by construction, so the ground storey is the building's projection.
    let actual: Polygon;
    if (allow.clippedBy.length === 0 && (!prev || prevFp === fpI)) {
      actual = prev && !prev.isPartial && prev.skyPlaneEdges.length === 0 && prevFp === fpI ? prev.polygon : fpI;
    } else {
      actual = intersectPolygons(fpI, allow.polygon).polygon;
      if (prev && actual.length >= 3) actual = intersectPolygons(actual, prev.polygon).polygon;
    }
    prevFp = fpI;
    let area = actual.length >= 3 ? polygonArea(actual) : 0;
    if (actual.length < 3 || area < MIN_FLOOR_AREA_SQM || minimumWidth(actual) < MIN_FLOOR_WIDTH_M) {
      stop = allow.clippedBy.length > 0 ? 'sky-plane' : 'no-buildable-area';
      break;
    }
    let partial = false;
    if (cum + area > cap + 1e-9) {
      const remaining = cap - cum;
      if (remaining < MIN_FLOOR_AREA_SQM) { stop = 'gfa-cap'; break; }
      actual = trimToArea(actual, remaining, trimEdge[0], trimEdge[1]);
      area = polygonArea(actual);
      if (actual.length < 3 || area < MIN_FLOOR_AREA_SQM) { stop = 'gfa-cap'; break; }
      partial = true;
    }
    let use: UseCategory = cfg.use === 'office' ? 'commercial' : 'residential';
    if (cfg.use === 'mixed' && i < (cfg.commercialPodiumFloors ?? 0) && commercial + area <= ctx.caps.maxCommercial) {
      use = 'commercial';
      commercial += area;
    }
    floors.push({
      index: i, elevationM: elevation, heightM: h, topM: top, use,
      allowablePolygon: allow.polygon, allowableAreaSqm: allow.areaSqm,
      polygon: actual, areaSqm: area, isPartial: partial, skyPlaneEdges: allow.clippedBy,
    });
    cum += area;
    elevation = top;
    if (partial) { stop = 'gfa-cap'; break; }
  }
  return { floors, stopReason: stop, totalGFA: cum };
}

// ── helpers ──

function unit(a: MetricPoint, b: MetricPoint): MetricPoint {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l];
}

export function fmt(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return '∞';
  const r = Math.round(v * 10 ** digits) / 10 ** digits;
  return r.toLocaleString('en-US', { maximumFractionDigits: digits });
}
