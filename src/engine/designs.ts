// ─── Design generators ───
// Design A — Maximum Yield: the largest legal total floor area over all permissible building
//            classes (low-rise ≤ 9 m, low-rise < 23 m, MR 33 high-rise/extra-large).
// Design B — Open Space Optimised: deliberately limits the ground footprint to ~60 % of
//            Design A's, then takes the best legal yield on that smaller footprint (taller where
//            the road allows it). It is checked independently against every rule.
// Both are deterministic: same input → same output.

import type { BuildingClass, DesignResult, DesignVariant, Envelope, Polygon } from './types';
import { BUILDING_TYPES } from './types';
import { MR33 } from './regulations';
import {
  buildEnvelope, type EnvelopeContext, fmt, MIN_FLOOR_AREA_SQM, stackFloors, type StackResult, STRICT_EPS,
} from './rules';
import { insetPolygon, minimumWidth, unionLargest } from './polygon';
import { assessEia, computeChecks, openSpaceRequirements, summarize } from './compliance';
import type { JurisdictionResult } from './types';

export interface DesignContext extends EnvelopeContext {
  jurisdiction: JurisdictionResult;
  nearTransitDeclared: boolean;
}

interface Candidate {
  env: Envelope;
  stack: StackResult;
  inset: number;
  footprint: Polygon;
  footprintSqm: number;
  openSpaceSqm: number;
  totalGFA: number;
  largestFloorSqm: number;
  heightM: number;
  isHighRise: boolean;
  isExtraLarge: boolean;
  openOk: boolean;
}

type AllowCache = Map<number, { polygon: Polygon; areaSqm: number; clippedBy: number[] }>;

function evaluateInset(ctx: DesignContext, env: Envelope, inset: number, cache: AllowCache): Candidate {
  const fp = inset <= 0 ? env.buildablePolygon : insetPolygon(env.buildablePolygon, inset).polygon;
  const stack = stackFloors(ctx, env, fp, cache);
  const floors = stack.floors;
  const proj = unionLargest(floors.map((f) => f.polygon));
  const footprintSqm = floors.length ? proj.areaSqm : 0;
  const totalGFA = stack.totalGFA;
  const largestFloorSqm = floors.reduce((m, f) => Math.max(m, f.areaSqm), 0);
  const heightM = floors.length ? floors[floors.length - 1]!.topM : 0;
  const isHighRise = heightM >= MR33.highRiseHeightM - STRICT_EPS;
  const isExtraLarge = totalGFA >= MR33.extraLargeAreaSqm - STRICT_EPS || largestFloorSqm >= MR33.extraLargeAreaSqm - STRICT_EPS;
  const openSpaceSqm = ctx.plotAreaSqm - footprintSqm;
  const reqs = openSpaceRequirements(ctx.buildingType, ctx.plotAreaSqm, totalGFA, largestFloorSqm, isHighRise || isExtraLarge);
  const openOk = reqs.filter((r) => r.applies).every((r) => openSpaceSqm + 1e-6 >= r.requiredSqm);
  return {
    env, stack, inset, footprint: floors.length ? proj.polygon : [], footprintSqm, openSpaceSqm, totalGFA,
    largestFloorSqm, heightM, isHighRise, isExtraLarge, openOk,
  };
}

/** Max-yield candidate for one class: shrink the footprint only as far as open-space rules require. */
function maxYieldForClass(ctx: DesignContext, cls: BuildingClass): Candidate | null {
  const env = buildEnvelope(ctx, cls);
  if (env.buildablePolygon.length < 3 || env.buildableAreaSqm < MIN_FLOOR_AREA_SQM) return null;
  const cache: AllowCache = new Map();
  const c0 = evaluateInset(ctx, env, 0, cache);
  if (c0.stack.floors.length === 0) return null;
  if (c0.openOk) return c0;
  let lo = 0;
  let hi = minimumWidth(env.buildablePolygon) / 2;
  let best: Candidate | null = null;
  for (let k = 0; k < 30 && hi - lo > 0.005; k++) {
    const mid = (lo + hi) / 2;
    const c = evaluateInset(ctx, env, mid, cache);
    if (c.stack.floors.length > 0 && c.openOk) { best = c; hi = mid; } else { lo = mid; }
  }
  return best;
}

/** Candidate whose ground footprint is ≤ targetSqm (Design B objective). */
function footprintLimitedForClass(ctx: DesignContext, cls: BuildingClass, targetSqm: number): Candidate | null {
  const env = buildEnvelope(ctx, cls);
  if (env.buildablePolygon.length < 3 || env.buildableAreaSqm < MIN_FLOOR_AREA_SQM) return null;
  const cache: AllowCache = new Map();
  let inset = 0;
  if (env.buildableAreaSqm > targetSqm) {
    let lo = 0;
    let hi = minimumWidth(env.buildablePolygon) / 2;
    for (let k = 0; k < 30 && hi - lo > 0.005; k++) {
      const mid = (lo + hi) / 2;
      if (insetPolygon(env.buildablePolygon, mid).areaSqm <= targetSqm) hi = mid; else lo = mid;
    }
    inset = hi;
  }
  const c = evaluateInset(ctx, env, inset, cache);
  if (c.stack.floors.length === 0) return null;
  if (c.openOk) return c;
  // open-space rules still bind → shrink further
  let lo = inset;
  let hi = minimumWidth(env.buildablePolygon) / 2;
  let best: Candidate | null = null;
  for (let k = 0; k < 30 && hi - lo > 0.005; k++) {
    const mid = (lo + hi) / 2;
    const cc = evaluateInset(ctx, env, mid, cache);
    if (cc.stack.floors.length > 0 && cc.openOk) { best = cc; hi = mid; } else { lo = mid; }
  }
  return best;
}

export function allowedClasses(ctx: DesignContext): BuildingClass[] {
  const classes: BuildingClass[] = ['low-le9', 'low-lt23'];
  if (ctx.roadEligibility.mr33Allowed && !BUILDING_TYPES[ctx.buildingType].lowRiseOnly) classes.push('mr33');
  return classes;
}

function better(a: Candidate | null, b: Candidate | null): Candidate | null {
  if (!a) return b;
  if (!b) return a;
  if (b.totalGFA > a.totalGFA + 0.5) return b;
  if (a.totalGFA > b.totalGFA + 0.5) return a;
  return b.openSpaceSqm > a.openSpaceSqm ? b : a; // equal yield → more open space
}

function limitingConstraints(ctx: DesignContext, c: Candidate, variant: DesignVariant, coverageNote?: string): string[] {
  const out: string[] = [];
  const env = c.env;
  const farGFA = ctx.plotAreaSqm * 7;
  if (variant === 'open-space' && coverageNote) out.push(coverageNote);
  switch (c.stack.stopReason) {
    case 'gfa-cap':
      out.push(env.maxGFA >= farGFA - 1 ? `FAR 7.0 reached (${fmt(farGFA, 0)} m²).` : `Floor-area cap: ${env.gfaRule}.`);
      break;
    case 'height-limit':
      out.push(`${env.heightRule}.`);
      if (env.buildingClass !== 'mr33') {
        if (!ctx.roadEligibility.mr33Allowed) out.push(ctx.roadEligibility.reason + '.');
        else if (BUILDING_TYPES[ctx.buildingType].lowRiseOnly) out.push('This building type is limited to low-rise.');
      }
      break;
    case 'sky-plane':
      out.push(`The 2:1 sky-exposure plane (MR 55 Cl. 44) leaves no usable floor plate above L${c.stack.floors.length}.`);
      break;
    case 'no-buildable-area':
      out.push('The setback footprint is too small or narrow for another storey.');
      break;
    case 'max-floors':
      out.push('Model limit of 150 storeys reached.');
      break;
  }
  if (variant === 'max-yield' && c.inset > 0) {
    out.push(`Open-space rules governed the footprint: the buildable area was inset a further ${fmt(c.inset, 2)} m.`);
  }
  if (env.discardedAreaSqm > 1) out.push(`Setbacks split the buildable area; a disconnected ${fmt(env.discardedAreaSqm, 0)} m² piece is not used (one building mass is modelled).`);
  if (c.totalGFA < farGFA - 1 && c.stack.stopReason !== 'gfa-cap') out.push(`FAR used ${(c.totalGFA / ctx.plotAreaSqm).toFixed(2)} of 7.00.`);
  return out;
}

function toDesign(ctx: DesignContext, c: Candidate, variant: DesignVariant, coverageNote?: string): DesignResult {
  const floors = c.stack.floors;
  const residentialGFA = floors.filter((f) => f.use === 'residential').reduce((s, f) => s + f.areaSqm, 0);
  const commercialGFA = c.totalGFA - residentialGFA;
  const mr33Building = c.isHighRise || c.isExtraLarge;
  const reqs = openSpaceRequirements(ctx.buildingType, ctx.plotAreaSqm, c.totalGFA, c.largestFloorSqm, mr33Building);
  const required = Math.max(...reqs.filter((r) => r.applies).map((r) => r.requiredSqm));
  const zoningReq = reqs.find((r) => r.id === 'zoning-osr')!.requiredSqm;
  const permeableRequiredSqm = 0.5 * Math.max(zoningReq, required);
  const eia = assessEia(ctx.buildingType, residentialGFA, c.heightM, c.totalGFA);
  const checks = computeChecks({
    plot: ctx.plot,
    plotAreaSqm: ctx.plotAreaSqm,
    edges: ctx.edges,
    buildingType: ctx.buildingType,
    jurisdiction: ctx.jurisdiction,
    roadEligibility: ctx.roadEligibility,
    nearTransitDeclared: ctx.nearTransitDeclared,
    envelope: c.env,
    floors,
    totalGFA: c.totalGFA,
    commercialGFA,
    heightM: c.heightM,
    largestFloorSqm: c.largestFloorSqm,
    openSpaceSqm: c.openSpaceSqm,
    openSpaceRequirements: reqs,
    permeableRequiredSqm,
    isHighRise: c.isHighRise,
    isExtraLarge: c.isExtraLarge,
    eia,
  });
  const isA = variant === 'max-yield';
  return {
    variant,
    label: isA ? 'Design A · Maximum Yield' : 'Design B · Open Space Optimised',
    objective: isA
      ? 'Largest legal total floor area on this plot'
      : 'Smaller ground footprint (~60 % of Design A) for more landscaped open space',
    description: isA
      ? `${c.env.classLabel}. Uses the whole buildable footprint and stacks storeys until FAR, height class, floor-area caps or the 2:1 plane stop it.`
      : `${c.env.classLabel}. The footprint is inset ${fmt(c.inset, 2)} m from the buildable line, and the yield is recovered with extra height where the road allows.`,
    envelope: c.env,
    floors,
    totalGFA: c.totalGFA,
    residentialGFA,
    commercialGFA,
    far: ctx.plotAreaSqm > 0 ? c.totalGFA / ctx.plotAreaSqm : 0,
    heightM: c.heightM,
    floorCount: floors.length,
    largestFloorSqm: c.largestFloorSqm,
    footprintSqm: c.footprintSqm,
    groundCoveragePct: (c.footprintSqm / ctx.plotAreaSqm) * 100,
    openSpaceSqm: c.openSpaceSqm,
    openSpacePct: (c.openSpaceSqm / ctx.plotAreaSqm) * 100,
    footprintPolygon: c.footprint,
    footprintInsetM: c.inset,
    openSpaceRequirements: reqs,
    requiredOpenSpaceSqm: required,
    permeableRequiredSqm,
    isHighRise: c.isHighRise,
    isExtraLarge: c.isExtraLarge,
    eia,
    limitingConstraints: limitingConstraints(ctx, c, variant, coverageNote),
    checks,
    ...summarize(checks),
  };
}

export const DESIGN_B_COVERAGE_RATIOS = [0.6, 0.75, 0.85] as const;

export function generateDesigns(ctx: DesignContext): { designA: DesignResult | null; designB: DesignResult | null } {
  const classes = allowedClasses(ctx);
  let bestA: Candidate | null = null;
  for (const cls of classes) bestA = better(bestA, maxYieldForClass(ctx, cls));
  if (!bestA) return { designA: null, designB: null };
  const designA = toDesign(ctx, bestA, 'max-yield');

  let bestB: Candidate | null = null;
  let usedRatio = 0;
  for (const ratio of DESIGN_B_COVERAGE_RATIOS) {
    const target = ratio * bestA.footprintSqm;
    for (const cls of classes) bestB = better(bestB, footprintLimitedForClass(ctx, cls, target));
    if (bestB) { usedRatio = ratio; break; }
  }
  if (!bestB) return { designA, designB: null };
  const note = `Design objective: ground footprint ≤ ${Math.round(usedRatio * 100)} % of Design A (${fmt(bestB.footprintSqm, 0)} m² vs ${fmt(bestA.footprintSqm, 0)} m²), adding ${fmt(bestB.openSpaceSqm - bestA.openSpaceSqm, 0)} m² of open space.`;
  return { designA, designB: toDesign(ctx, bestB, 'open-space', note) };
}
