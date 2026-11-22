// ─── Design generators ───
// Design A — Maximum Yield: the largest legal total floor area over all permissible building classes
//            (low-rise ≤ 9 m, low-rise < 23 m, MR 33 high-rise / extra-large).
// Design B — Open Space Optimised: ground footprint limited to ~60 % of Design A's, then the best legal
//            yield on that smaller footprint (taller where the road allows it).
// For each candidate footprint the generator: (1) shrinks it only as far as the open-space rules
// require, (2) limits its depth if Bangkok's road-face rule (BMA 2544 Cl. 53) needs it, (3) allocates
// the parking the ordinance requires (podium storeys or basements). Every design is then checked
// independently by compliance.ts. Deterministic: same input → same output.

import type {
  BuildingClass, DesignResult, DesignVariant, Envelope, FloorResult, FrontSpaceResult, JurisdictionResult,
  MetricPoint, ParkingMode, ParkingResult, Polygon, TransitResult,
} from './types';
import { BUILDING_TYPES } from './types';
import { BMA2544, MR33, PARKING } from './regulations';
import {
  type AllowCache, buildEnvelope, type EnvelopeContext, fmt, footprintFor, type Footprint, MIN_FLOOR_AREA_SQM,
  stackFloors, type StackResult, STRICT_EPS,
} from './rules';
import { minimumWidth, polygonArea, signedDistanceToEdgeLine } from './polygon';
import { assessEia, computeChecks, frontSpaceAssessment, openSpaceRequirements, summarize } from './compliance';
import { allocatePodiumParking, parkingDemand, storeyCapacity } from './parking';

export interface DesignContext extends EnvelopeContext {
  jurisdiction: JurisdictionResult;
  transit: TransitResult;
  avgUnitSizeSqm: number;
  parkingMode: ParkingMode;
  /** Primary road edge (widest), used for top-storey trimming and depth limits */
  primaryEdge: [MetricPoint, MetricPoint];
}

interface Candidate {
  env: Envelope;
  stack: StackResult;
  floors: FloorResult[];
  basementFloors: FloorResult[];
  extraSetbackM: number;
  depthLimitM?: number;
  footprint: Polygon;
  footprintSqm: number;
  openSpaceSqm: number;
  totalGFA: number;
  largestFloorSqm: number;
  heightM: number;
  isHighRise: boolean;
  isExtraLarge: boolean;
  openOk: boolean;
  front: FrontSpaceResult;
  frontOk: boolean;
  parking: ParkingResult;
  parkingOk: boolean;
  /** BMA 2544 Cl. 90: ≥ 15 spaces need a ≥ 6 m public road */
  accessOk: boolean;
  gfaCap?: number;
  capReason?: 'access' | 'parking';
}

const commercialUse = (ctx: DesignContext) => BUILDING_TYPES[ctx.buildingType].use !== 'residential';

function parkingFor(ctx: DesignContext, stack: StackResult, fp: Footprint, cache: AllowCache, env: Envelope): {
  floors: FloorResult[]; basement: FloorResult[]; stack: StackResult; parking: ParkingResult;
} {
  const avg = ctx.avgUnitSizeSqm;
  if (ctx.parkingMode === 'podium' || stack.floors.length === 0) {
    const r = allocatePodiumParking(stack.floors, ctx.buildingType, avg);
    const parkingStoreys = r.floors.filter((f) => f.use === 'parking').length;
    return {
      floors: r.floors, basement: [], stack,
      parking: {
        mode: 'podium', requiredSpaces: r.demand.spaces, providedSpaces: r.provided, basis: r.demand.basis,
        areaPerSpaceSqm: PARKING.grossSqmPerSpace, parkingAreaSqm: r.parkingSqm, parkingStoreys, basementLevels: 0,
        units: r.demand.units, avgUnitSizeSqm: avg, isLargeBuilding: r.demand.isLargeBuilding, warnings: r.warnings,
      },
    };
  }
  // Basement: levels under the ground storey; they count in total floor area, so the above-ground cap shrinks.
  let levels = 0;
  let cur = stack;
  let demand = parkingDemand({ buildingType: ctx.buildingType, residentialSqm: 0, commercialSqm: 0, totalBuildingSqm: 0, heightM: 0, avgUnitSizeSqm: avg });
  let perLevel = 0, levelArea = 0, levelPoly: Polygon = [];
  for (let it = 0; it < 8; it++) {
    const g = cur.floors[0];
    if (!g) break;
    levelPoly = g.polygon;
    levelArea = g.areaSqm;
    perLevel = storeyCapacity(g).spaces;
    const res = cur.floors.filter((f) => f.use === 'residential').reduce((s, f) => s + f.areaSqm, 0);
    const com = cur.floors.filter((f) => f.use === 'commercial').reduce((s, f) => s + f.areaSqm, 0);
    const heightM = cur.floors[cur.floors.length - 1]!.topM;
    demand = parkingDemand({ buildingType: ctx.buildingType, residentialSqm: res, commercialSqm: com, totalBuildingSqm: cur.totalGFA + levels * levelArea, heightM, avgUnitSizeSqm: avg });
    const need = perLevel > 0 ? Math.ceil(demand.spaces / perLevel) : 0;
    if (need === levels) break;
    levels = need;
    cur = stackFloors(ctx, env, fp, cache, { gfaCap: env.maxGFA - levels * levelArea, trimEdge: ctx.primaryEdge });
  }
  const basement: FloorResult[] = Array.from({ length: levels }, (_, k) => ({
    index: -(k + 1), elevationM: -(k + 1) * 3, heightM: 3, topM: -k * 3, use: 'parking' as const,
    allowablePolygon: env.buildablePolygon, allowableAreaSqm: env.buildableAreaSqm,
    polygon: levelPoly, areaSqm: levelArea, isPartial: false, skyPlaneEdges: [], parkingSpaces: perLevel,
  }));
  return {
    floors: cur.floors, basement, stack: cur,
    parking: {
      mode: 'basement', requiredSpaces: demand.spaces, providedSpaces: levels * perLevel, basis: demand.basis,
      areaPerSpaceSqm: PARKING.grossSqmPerSpace, parkingAreaSqm: levels * levelArea, parkingStoreys: 0, basementLevels: levels,
      units: demand.units, avgUnitSizeSqm: avg, isLargeBuilding: demand.isLargeBuilding,
      warnings: perLevel === 0 && demand.spaces > 0 ? ['The footprint is too narrow for ramped basement parking; mechanical parking would be needed.'] : [],
    },
  };
}

/** Widest road reserve that reaches the plot, limited by the narrowest point of its known access route */
function carAccessWidth(ctx: DesignContext): number {
  return Math.max(0, ...ctx.edges.filter((e) => e.kind === 'road').map((e) => Math.min(e.roadWidthM ?? 0, e.accessMinWidthM ?? Infinity)));
}

function evaluateFootprint(ctx: DesignContext, env: Envelope, s: number, cache: AllowCache, depthM?: number, gfaCap?: number): Candidate {
  const fp = footprintFor(ctx, env, s, depthM !== undefined ? { a: ctx.primaryEdge[0], b: ctx.primaryEdge[1], depthM } : undefined);
  const stack0 = stackFloors(ctx, env, fp, cache, { trimEdge: ctx.primaryEdge, gfaCap });
  const pk = parkingFor(ctx, stack0, fp, cache, env);
  const floors = pk.floors;
  const ground = floors[0];
  // Storeys are nested (each inside the one below), so the ground storey is the building's projection.
  const footprint = ground ? ground.polygon : [];
  const footprintSqm = ground ? ground.areaSqm : 0;
  const above = floors.reduce((a, f) => a + f.areaSqm, 0);
  const below = pk.basement.reduce((a, f) => a + f.areaSqm, 0);
  const totalGFA = above + below;
  const largestFloorSqm = Math.max(0, ...floors.map((f) => f.areaSqm), ...pk.basement.map((f) => f.areaSqm));
  const heightM = floors.length ? floors[floors.length - 1]!.topM : 0;
  const isHighRise = heightM >= MR33.highRiseHeightM - STRICT_EPS;
  const isExtraLarge = totalGFA >= MR33.extraLargeAreaSqm - STRICT_EPS || largestFloorSqm >= MR33.extraLargeAreaSqm - STRICT_EPS;
  const openSpaceSqm = ctx.plotAreaSqm - footprintSqm;
  const reqs = openSpaceRequirements(ctx.buildingType, ctx.plotAreaSqm, totalGFA, largestFloorSqm, isHighRise || isExtraLarge);
  const openOk = reqs.filter((r) => r.applies).every((r) => openSpaceSqm + 1e-6 >= r.requiredSqm);
  const front = frontSpaceAssessment(footprint, ctx.edges, floors.length, heightM, commercialUse(ctx));
  front.depthLimited = depthM !== undefined;
  const frontOk = !front.applies || front.cl53Ok || front.cl526Ok;
  return {
    env, stack: pk.stack, floors, basementFloors: pk.basement, extraSetbackM: s, depthLimitM: depthM,
    footprint, footprintSqm, openSpaceSqm, totalGFA, largestFloorSqm, heightM, isHighRise, isExtraLarge,
    openOk, front, frontOk, parking: pk.parking, parkingOk: pk.parking.providedSpaces >= pk.parking.requiredSpaces,
    accessOk: pk.parking.requiredSpaces < BMA2544.parkingAccessSpaces || carAccessWidth(ctx) >= BMA2544.parkingAccessRoadM - 1e-9,
    gfaCap,
  };
}

const valid = (c: Candidate | null): c is Candidate => !!c && c.floors.length > 0;

/** Largest depth (from the primary road) at which Cl. 53 holds, at a given extra setback */
function limitDepth(ctx: DesignContext, env: Envelope, s: number, cache: AllowCache, base: Candidate): Candidate {
  if (base.frontOk || base.footprint.length < 3) return base;
  const [a, b] = ctx.primaryEdge;
  const ds = base.footprint.map((v) => signedDistanceToEdgeLine(v, a, b));
  let lo = Math.max(0, Math.min(...ds)) + 3, hi = Math.max(...ds);
  let best: Candidate | null = null;
  for (let k = 0; k < 12 && hi - lo > 0.1; k++) {
    const mid = (lo + hi) / 2;
    const c = evaluateFootprint(ctx, env, s, cache, mid, base.gfaCap);
    if (valid(c) && c.frontOk) { best = c; lo = mid; } else { hi = mid; }
  }
  return best ?? base;
}

/**
 * Extra setback s at which the footprint area reaches targetSqm. Footprint area falls monotonically with s;
 * a bracketed secant (regula falsi, Illinois variant) converges in a handful of evaluations.
 */
function setbackForArea(ctx: DesignContext, env: Envelope, targetSqm: number, sLo = 0): number {
  const area = (x: number) => polygonArea(footprintFor(ctx, env, x).base);
  let a = sLo, fa = area(a) - targetSqm;
  if (fa <= 0) return a;
  let b = minimumWidth(env.buildablePolygon) / 2, fb = area(b) - targetSqm;
  if (fb > 0) return b;
  let side = 0;
  for (let k = 0; k < 12 && b - a > 0.01; k++) {
    const x = Math.min(b, Math.max(a, b - (fb * (b - a)) / (fb - fa)));
    const fx = area(x) - targetSqm;
    if (Math.abs(fx) < 0.5) return fx <= 0 ? x : x + 0.01;
    if (fx > 0) { a = x; fa = fx; if (side === -1) fb /= 2; side = -1; } else { b = x; fb = fx; if (side === 1) fa /= 2; side = 1; }
  }
  return b;
}

/** Smallest extra setback that satisfies the open-space rules: aim at the area target, then bisect if needed */
function searchSetback(ctx: DesignContext, env: Envelope, cache: AllowCache, s0: number, first: Candidate): Candidate | null {
  // Every open-space rule caps the footprint: footprint ≤ plot − max(requirements). Requirements barely depend
  // on s (zoning OSR follows total floor area), so aim at that area, then confirm with a full evaluation.
  let c: Candidate = first;
  let s = s0;
  for (let it = 0; it < 4 && valid(c) && !c.openOk; it++) {
    const reqs = openSpaceRequirements(ctx.buildingType, ctx.plotAreaSqm, c.totalGFA, c.largestFloorSqm, c.isHighRise || c.isExtraLarge);
    const need = Math.max(...reqs.filter((r) => r.applies).map((r) => r.requiredSqm));
    const target = ctx.plotAreaSqm - need - 0.5 * (it + 1);
    const next = setbackForArea(ctx, env, target, s);
    s = next > s ? next : s + 0.05;
    c = evaluateFootprint(ctx, env, s, cache);
  }
  if (valid(c) && c.openOk) return c;
  // fallback: plain bisection
  let lo = s0, hi = minimumWidth(env.buildablePolygon) / 2;
  let best: Candidate | null = null;
  for (let k = 0; k < 14 && hi - lo > 0.02; k++) {
    const mid = (lo + hi) / 2;
    const x = evaluateFootprint(ctx, env, mid, cache);
    if (valid(x) && x.openOk) { best = x; hi = mid; } else { lo = mid; }
  }
  return best;
}

const envCache = new WeakMap<DesignContext, Map<BuildingClass, { env: Envelope; cache: AllowCache }>>();
function envelopeFor(ctx: DesignContext, cls: BuildingClass) {
  let m = envCache.get(ctx);
  if (!m) { m = new Map(); envCache.set(ctx, m); }
  let e = m.get(cls);
  if (!e) { e = { env: buildEnvelope(ctx, cls), cache: new Map() }; m.set(cls, e); }
  return e;
}

function maxYieldForClass(ctx: DesignContext, cls: BuildingClass): Candidate | null {
  const { env, cache } = envelopeFor(ctx, cls);
  if (env.buildablePolygon.length < 3 || env.buildableAreaSqm < MIN_FLOOR_AREA_SQM) return null;
  let c: Candidate | null = evaluateFootprint(ctx, env, 0, cache);
  if (!valid(c)) return null;
  if (!c.openOk) c = searchSetback(ctx, env, cache, 0, c);
  if (!valid(c)) return null;
  return capForCarAccess(ctx, env, cache, limitDepth(ctx, env, c.extraSetbackM, cache, c));
}

/** Candidate whose ground footprint is ≤ targetSqm (Design B objective) */
function footprintLimitedForClass(ctx: DesignContext, cls: BuildingClass, targetSqm: number): Candidate | null {
  const { env, cache } = envelopeFor(ctx, cls);
  if (env.buildablePolygon.length < 3 || env.buildableAreaSqm < MIN_FLOOR_AREA_SQM) return null;
  const s = env.buildableAreaSqm > targetSqm ? setbackForArea(ctx, env, targetSqm) : 0;
  let c: Candidate | null = evaluateFootprint(ctx, env, s, cache);
  if (!valid(c)) return null;
  if (!c.openOk) c = searchSetback(ctx, env, cache, s, c);
  if (!valid(c)) return null;
  return capForCarAccess(ctx, env, cache, limitDepth(ctx, env, c.extraSetbackM, cache, c));
}

export function allowedClasses(ctx: DesignContext): BuildingClass[] {
  const classes: BuildingClass[] = ['low-le9', 'low-lt23'];
  if (ctx.roadEligibility.mr33Allowed && !BUILDING_TYPES[ctx.buildingType].lowRiseOnly) classes.push('mr33');
  return classes;
}

const okScore = (c: Candidate) => (c.openOk ? 1 : 0) + (c.frontOk ? 1 : 0) + (c.parkingOk ? 1 : 0) + (c.accessOk ? 1 : 0);
const FULL_SCORE = 4;

/**
 * BMA 2544 Cl. 90 on a road narrower than 6 m: the car park must stay below 15 spaces, so cap the total floor
 * area (largest cap whose parking requirement is < 15; requirement grows monotonically with floor area).
 */
function capForCarAccess(ctx: DesignContext, env: Envelope, cache: AllowCache, c: Candidate): Candidate {
  // Also used when the required parking cannot be fitted (floor plates too narrow for ramps): cap the floor
  // area until the requirement falls to what the building can hold. Both conditions are monotone in floor area.
  if (c.accessOk && c.parkingOk) return c;
  let lo = 0, hi = c.totalGFA;
  let best: Candidate | null = null;
  for (let k = 0; k < 16 && hi - lo > 5; k++) {
    const mid = (lo + hi) / 2;
    const x = evaluateFootprint(ctx, env, c.extraSetbackM, cache, c.depthLimitM, mid);
    if (valid(x) && x.accessOk && x.parkingOk) { best = x; lo = mid; } else { hi = mid; }
  }
  if (best) best.capReason = !c.accessOk ? 'access' : 'parking';
  return best ?? c;
}

function better(a: Candidate | null, b: Candidate | null): Candidate | null {
  if (!a) return b;
  if (!b) return a;
  if (okScore(a) !== okScore(b)) return okScore(b) > okScore(a) ? b : a;
  if (b.totalGFA > a.totalGFA + 0.5) return b;
  if (a.totalGFA > b.totalGFA + 0.5) return a;
  return b.openSpaceSqm > a.openSpaceSqm ? b : a;
}

function limitingConstraints(ctx: DesignContext, c: Candidate, variant: DesignVariant, coverageNote?: string): string[] {
  const out: string[] = [];
  const env = c.env;
  const farGFA = ctx.plotAreaSqm * 7;
  if (variant === 'open-space' && coverageNote) out.push(coverageNote);
  switch (c.stack.stopReason) {
    case 'gfa-cap':
      if (c.gfaCap !== undefined && c.gfaCap < env.maxGFA) break; // explained by the Cl. 90 line
      out.push(env.maxGFA >= farGFA - 1 ? `FAR 7.0 reached (${fmt(farGFA, 0)} m²${c.basementFloors.length ? ', incl. basements' : ''}).` : `Floor-area cap: ${env.gfaRule}.`);
      break;
    case 'height-limit':
      out.push(`${env.heightRule}.`);
      if (env.buildingClass !== 'mr33') {
        if (!ctx.roadEligibility.mr33Allowed) out.push(ctx.roadEligibility.reason + '.');
        else if (BUILDING_TYPES[ctx.buildingType].lowRiseOnly) out.push('This building type is limited to low-rise.');
      }
      break;
    case 'sky-plane':
      out.push(`The 2:1 sky-exposure plane (MR 55 Cl. 44) leaves no usable floor plate above L${c.floors.length}.`);
      break;
    case 'no-buildable-area':
      out.push('The setback footprint is too small or narrow for another storey.');
      break;
    case 'max-floors':
      out.push('Model limit of 150 storeys reached.');
      break;
  }
  if (variant === 'max-yield' && c.extraSetbackM > 0) {
    out.push(`Open-space rules governed the footprint: an extra ${fmt(c.extraSetbackM, 2)} m setback from every boundary was needed.`);
  }
  if (c.gfaCap !== undefined && c.capReason === 'access') {
    out.unshift(`BMA 2544 Cl. 90: the widest access road is ${fmt(carAccessWidth(ctx))} m (< 6 m), so the car park must stay below 15 spaces; total floor area capped at ${fmt(c.totalGFA, 0)} m².`);
  } else if (c.gfaCap !== undefined) {
    out.unshift(`Parking (BMA 2544 Cl. 84): the floor plates are too narrow for ramped parking, so the floor area is capped at ${fmt(c.totalGFA, 0)} m² where the required spaces fit. Mechanical parking would allow more.`);
  }
  if (c.depthLimitM !== undefined) {
    out.push(`BMA 2544 Cl. 53 (road face > 1/8 of the perimeter): the building depth was limited to ${fmt(c.depthLimitM, 1)} m from the main road.`);
  }
  const pk = c.parking;
  if (pk.requiredSpaces > 0) {
    out.push(pk.mode === 'podium'
      ? `Parking: ${pk.requiredSpaces} spaces required → ${pk.parkingStoreys} podium storey${pk.parkingStoreys === 1 ? '' : 's'} (${fmt(pk.parkingAreaSqm, 0)} m² of the total floor area).`
      : `Parking: ${pk.requiredSpaces} spaces required → ${pk.basementLevels} basement level${pk.basementLevels === 1 ? '' : 's'} (${fmt(pk.parkingAreaSqm, 0)} m², counted in FAR).`);
  }
  if (env.discardedAreaSqm > 1) out.push(`Setbacks split the buildable area; a disconnected ${fmt(env.discardedAreaSqm, 0)} m² piece is not used (one building mass is modelled).`);
  if (c.totalGFA < farGFA - 1 && c.stack.stopReason !== 'gfa-cap') out.push(`FAR used ${(c.totalGFA / ctx.plotAreaSqm).toFixed(2)} of 7.00.`);
  return out;
}

function toDesign(ctx: DesignContext, c: Candidate, variant: DesignVariant, coverageNote?: string): DesignResult {
  const floors = c.floors;
  const residentialGFA = floors.filter((f) => f.use === 'residential').reduce((s, f) => s + f.areaSqm, 0);
  const parkingGFA = floors.filter((f) => f.use === 'parking').reduce((s, f) => s + f.areaSqm, 0) + c.basementFloors.reduce((s, f) => s + f.areaSqm, 0);
  const commercialGFA = c.totalGFA - residentialGFA - parkingGFA;
  const mr33Building = c.isHighRise || c.isExtraLarge;
  const reqs = openSpaceRequirements(ctx.buildingType, ctx.plotAreaSqm, c.totalGFA, c.largestFloorSqm, mr33Building);
  const required = Math.max(...reqs.filter((r) => r.applies).map((r) => r.requiredSqm));
  const zoningReq = reqs.find((r) => r.id === 'zoning-osr')!.requiredSqm;
  const permeableRequiredSqm = 0.5 * Math.max(zoningReq, required);
  const eia = assessEia(ctx.buildingType, residentialGFA, c.heightM, c.totalGFA, c.parking.units);
  const checks = computeChecks({
    plot: ctx.plot, plotAreaSqm: ctx.plotAreaSqm, edges: ctx.edges, buildingType: ctx.buildingType,
    jurisdiction: ctx.jurisdiction, transit: ctx.transit, roadEligibility: ctx.roadEligibility, envelope: c.env,
    floors, basementFloors: c.basementFloors, footprint: c.footprint, totalGFA: c.totalGFA, commercialGFA,
    heightM: c.heightM, largestFloorSqm: c.largestFloorSqm, openSpaceSqm: c.openSpaceSqm, openSpaceRequirements: reqs,
    permeableRequiredSqm, isHighRise: c.isHighRise, isExtraLarge: c.isExtraLarge, eia, parking: c.parking, frontSpace: c.front,
  });
  const isA = variant === 'max-yield';
  return {
    variant,
    label: isA ? 'Design A · Maximum Yield' : 'Design B · Open Space Optimised',
    objective: isA ? 'Largest legal total floor area on this plot' : 'Smaller ground footprint (~60 % of Design A) for more landscaped open space',
    description: isA
      ? `${c.env.classLabel}. Uses the buildable footprint and stacks storeys until FAR, height class, floor-area caps or the 2:1 plane stop it; parking as ${c.parking.mode === 'podium' ? 'podium storeys' : 'basements'}.`
      : `${c.env.classLabel}. The footprint keeps an extra ${fmt(c.extraSetbackM, 2)} m from every boundary, and the yield is recovered with extra height where the road allows.`,
    envelope: c.env, floors, basementFloors: c.basementFloors,
    totalGFA: c.totalGFA, residentialGFA, parkingGFA, commercialGFA,
    far: ctx.plotAreaSqm > 0 ? c.totalGFA / ctx.plotAreaSqm : 0,
    heightM: c.heightM, floorCount: floors.length, largestFloorSqm: c.largestFloorSqm,
    footprintSqm: c.footprintSqm, groundCoveragePct: (c.footprintSqm / ctx.plotAreaSqm) * 100,
    openSpaceSqm: c.openSpaceSqm, openSpacePct: (c.openSpaceSqm / ctx.plotAreaSqm) * 100,
    footprintPolygon: c.footprint, footprintInsetM: c.extraSetbackM,
    openSpaceRequirements: reqs, requiredOpenSpaceSqm: required, permeableRequiredSqm,
    isHighRise: c.isHighRise, isExtraLarge: c.isExtraLarge, eia, parking: c.parking, frontSpace: c.front,
    limitingConstraints: limitingConstraints(ctx, c, variant, coverageNote),
    checks, ...summarize(checks),
  };
}

export const DESIGN_B_COVERAGE_RATIOS = [0.6, 0.75, 0.85] as const;

/** Upper bound on the floor area a class can reach (prunes classes that cannot win) */
function classBound(ctx: DesignContext, cls: BuildingClass): number {
  const { env } = envelopeFor(ctx, cls);
  if (cls === 'low-le9') return Math.min(env.maxGFA, 3 * env.buildableAreaSqm);
  return env.maxGFA;
}

/** Evaluate classes from the most permissive down, skipping any whose upper bound cannot beat a fully compliant best */
function bestOver(ctx: DesignContext, classes: BuildingClass[], make: (cls: BuildingClass) => Candidate | null): Candidate | null {
  let best: Candidate | null = null;
  for (const cls of [...classes].reverse()) {
    if (best && okScore(best) === FULL_SCORE && classBound(ctx, cls) <= best.totalGFA + 0.5) continue;
    best = better(best, make(cls));
  }
  return best;
}

export function generateDesigns(ctx: DesignContext): { designA: DesignResult | null; designB: DesignResult | null } {
  const classes = allowedClasses(ctx);
  const bestA = bestOver(ctx, classes, (cls) => maxYieldForClass(ctx, cls));
  if (!bestA) return { designA: null, designB: null };
  const designA = toDesign(ctx, bestA, 'max-yield');

  let bestB: Candidate | null = null;
  let usedRatio = 0;
  for (const ratio of DESIGN_B_COVERAGE_RATIOS) {
    const target = ratio * bestA.footprintSqm;
    bestB = bestOver(ctx, classes, (cls) => {
      const c = footprintLimitedForClass(ctx, cls, target);
      return c && c.footprintSqm <= target + 1 ? c : null;
    });
    if (bestB) { usedRatio = ratio; break; }
  }
  if (!bestB) return { designA, designB: null };
  const note = `Design objective: ground footprint ≤ ${Math.round(usedRatio * 100)} % of Design A (${fmt(bestB.footprintSqm, 0)} m² vs ${fmt(bestA.footprintSqm, 0)} m²), adding ${fmt(bestB.openSpaceSqm - bestA.openSpaceSqm, 0)} m² of open space.`;
  return { designA, designB: toDesign(ctx, bestB, 'open-space', note) };
}
