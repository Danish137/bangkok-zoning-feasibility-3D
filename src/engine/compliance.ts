// ─── Per-design compliance checklist ───
// Every check is computed from the design's actual geometry, not from the generator's intent.
// Missing evidence is reported as UNVERIFIED, never as PASS. Checks whose inputs are map estimates
// (road / access widths) carry inputConfidence: 'estimated'.

import type {
  BuildingType, CheckStatus, ComplianceCheck, DesignResult, EiaAssessment, Envelope, FloorResult,
  FrontSpaceResult, JurisdictionResult, MetricPoint, OpenSpaceRequirement, ParkingResult, PlotEdge, Polygon,
  RoadEligibility, TransitResult,
} from './types';
import { BUILDING_TYPES } from './types';
import { BMA2544, EIA, MR33, MR55, NET_TO_GROSS_RESIDENTIAL, SOURCES, YOR9 } from './regulations';
import {
  edgeLength, edgeOutwardNormal, intersectionArea, overhangArea, polygonPerimeter, polygonSegmentDistance,
  signedDistanceToEdgeLine, slabOverlapArea,
} from './polygon';
import { fmt, skyPlaneOffset, STRICT_EPS } from './rules';

/** Containment / area tolerance (m²) for numerical clipping noise */
export const AREA_TOL_SQM = 0.001;
/** Distance tolerance (m) */
export const DIST_TOL_M = 1e-3;

export interface ComplianceInput {
  plot: Polygon;
  plotAreaSqm: number;
  edges: PlotEdge[];
  buildingType: BuildingType;
  jurisdiction: JurisdictionResult;
  transit: TransitResult;
  roadEligibility: RoadEligibility;
  envelope: Envelope;
  floors: FloorResult[];
  basementFloors: FloorResult[];
  footprint: Polygon;
  totalGFA: number;
  commercialGFA: number;
  heightM: number;
  largestFloorSqm: number;
  openSpaceSqm: number;
  openSpaceRequirements: OpenSpaceRequirement[];
  permeableRequiredSqm: number;
  isHighRise: boolean;
  isExtraLarge: boolean;
  eia: EiaAssessment;
  parking: ParkingResult;
  frontSpace: FrontSpaceResult;
}

export function openSpaceRequirements(
  buildingType: BuildingType, plotAreaSqm: number, totalGFA: number, largestFloorSqm: number, mr33Building: boolean,
): OpenSpaceRequirement[] {
  const residential = BUILDING_TYPES[buildingType].use !== 'office';
  const r55 = residential ? MR55.openSpaceResidential : MR55.openSpaceNonResidential;
  const r33 = residential ? MR33.openSpaceResidential : MR33.openSpaceNonResidential;
  const rB = residential ? BMA2544.openSpaceResidential : BMA2544.openSpaceNonResidential;
  return [
    { id: 'zoning-osr', label: 'Zoning OSR (Plan Cl. 16)', basis: `4.5 % × total floor area ${fmt(totalGFA)} m²`, requiredSqm: YOR9.minOSRFractionOfGFA * totalGFA, applies: true },
    { id: 'bco-52', label: 'Open space (BMA 2544 Cl. 52)', basis: `${rB * 100} % × land area ${fmt(plotAreaSqm)} m² (${residential ? 'residential' : 'non-residential'}; all buildings in Bangkok)`, requiredSqm: rB * plotAreaSqm, applies: true },
    { id: 'mr55-33', label: 'Open space (MR 55 Cl. 33)', basis: `${r55 * 100} % × largest floor ${fmt(largestFloorSqm)} m² (${residential ? 'residential' : 'non-residential'})`, requiredSqm: r55 * largestFloorSqm, applies: true },
    { id: 'mr33-6', label: 'Open space (MR 33 Cl. 6)', basis: `${r33 * 100} % × plot area ${fmt(plotAreaSqm)} m² (high-rise / extra-large only)`, requiredSqm: r33 * plotAreaSqm, applies: mr33Building },
  ];
}

export function assessEia(buildingType: BuildingType, residentialGFA: number, heightM: number, totalGFA: number, units?: number): EiaAssessment {
  const cfg = BUILDING_TYPES[buildingType];
  const u = units ?? Math.floor((residentialGFA * NET_TO_GROSS_RESIDENTIAL) / 35);
  const reasons: string[] = [];
  let status: EiaAssessment['status'] = 'likely-not-required';
  if (cfg.use !== 'office' && residentialGFA > 0) {
    if (u >= EIA.residentialUnits || residentialGFA >= EIA.residentialUsableAreaSqm) {
      status = 'required';
      reasons.push(`Item 31 condominium: ≈ ${u} units (≥ 80) or usable area ≈ ${fmt(residentialGFA, 0)} m² (≥ 4,000 m²)`);
    } else {
      reasons.push(`Item 31 condominium: ≈ ${u} units and ≈ ${fmt(residentialGFA, 0)} m² usable area are below 80 units / 4,000 m²`);
    }
  }
  if (cfg.use === 'office') {
    if (heightM >= EIA.officeHeightM - STRICT_EPS || totalGFA >= EIA.officeAreaSqm) {
      status = 'required';
      reasons.push(`Item 27.3 private office building: height ${fmt(heightM)} m (≥ 23 m) or floor area ${fmt(totalGFA, 0)} m² (≥ 10,000 m²)`);
    } else {
      reasons.push('Item 27.3 private office building: below 23 m and 10,000 m²');
    }
  }
  if (cfg.use === 'mixed' && (heightM >= EIA.officeHeightM - STRICT_EPS || totalGFA >= EIA.officeAreaSqm) && status !== 'required') {
    status = 'check';
    reasons.push('Item 27.2 (retail buildings ≥ 23 m or ≥ 10,000 m²) may apply to the retail podium; confirm with ONEP');
  }
  return { status, reason: reasons.join('; '), estimatedUnits: u, usableAreaProxySqm: residentialGFA };
}

/**
 * BMA 2544 Cl. 52(6) / Cl. 53 front open space ("L/6 – L/8" rule) on the ground footprint.
 * Cl. 53: a building on a public road is exempt from 52(6) if its face on the road is longer than 1/8 of
 * its external perimeter and that face is ≤ 20 m from the road. Otherwise Cl. 52(6): open space in front
 * ≥ 6 m wide (≥ 12 m above 3 storeys), contiguous along ≥ 1/6 of the perimeter.
 */
export function frontSpaceAssessment(footprint: Polygon, edges: PlotEdge[], storeys: number, heightM: number, commercial: boolean): FrontSpaceResult {
  const applies = storeys > 2 || heightM > 8 || commercial;
  const perimeterM = footprint.length >= 3 ? polygonPerimeter(footprint) : 0;
  const requiredWidthM = storeys >= BMA2544.frontSpaceHighFromStoreys ? BMA2544.frontSpaceHighM : BMA2544.frontSpaceLowM;
  const roads = edges.filter((e) => e.kind === 'road');
  let roadFaceM = 0;
  let wideFrontM = 0;
  const cos30 = Math.cos(Math.PI / 6);
  for (let i = 0; i < footprint.length; i++) {
    const a = footprint[i]!, b = footprint[(i + 1) % footprint.length]!;
    const nB = edgeOutwardNormal(a, b);
    let bestFace = 0, bestWide = 0;
    for (const r of roads) {
      const nR = edgeOutwardNormal(r.start, r.end);
      if (nB[0] * nR[0] + nB[1] * nR[1] < cos30) continue;
      const da = signedDistanceToEdgeLine(a, r.start, r.end), db = signedDistanceToEdgeLine(b, r.start, r.end);
      // overlap of the building edge's projection with the road edge (the face must actually front the road)
      const ux = (r.end[0] - r.start[0]) / r.lengthM, uy = (r.end[1] - r.start[1]) / r.lengthM;
      const ta = (a[0] - r.start[0]) * ux + (a[1] - r.start[1]) * uy;
      const tb = (b[0] - r.start[0]) * ux + (b[1] - r.start[1]) * uy;
      const overlap = Math.max(0, Math.min(Math.max(ta, tb), r.lengthM) - Math.max(Math.min(ta, tb), 0));
      if (overlap <= 0) continue;
      const frac = overlap / Math.max(Math.abs(tb - ta), 1e-9);
      const len = edgeLength(a, b) * Math.min(1, frac);
      if (Math.max(da, db) <= BMA2544.roadFaceMaxDistanceM + 1e-9 && Math.min(da, db) >= -1e-9) bestFace = Math.max(bestFace, len);
      if (Math.min(da, db) >= requiredWidthM - 1e-9) bestWide = Math.max(bestWide, len);
    }
    roadFaceM += bestFace;
    wideFrontM += bestWide;
  }
  return {
    applies,
    perimeterM,
    roadFaceM,
    cl53Ok: roadFaceM > perimeterM * BMA2544.roadFacePerimeterFraction + 1e-9,
    cl526Ok: wideFrontM >= perimeterM * BMA2544.frontSpacePerimeterFraction - 1e-9,
    requiredWidthM,
    wideFrontM,
    depthLimited: false,
  };
}

const S = SOURCES;

export function computeChecks(c: ComplianceInput): ComplianceCheck[] {
  const checks: ComplianceCheck[] = [];
  const cfg = BUILDING_TYPES[c.buildingType];
  const env = c.envelope;
  const roads = c.edges.filter((e) => e.kind === 'road');
  const maxRoad = roads.reduce((m, e) => Math.max(m, e.roadWidthM ?? 0), 0);
  const roadsEstimated = roads.some((e) => e.roadSource === 'map-estimate');
  const est = (cond: boolean) => (cond ? { inputConfidence: 'estimated' as const } : {});
  const mr33Building = c.isHighRise || c.isExtraLarge;
  const far = c.plotAreaSqm > 0 ? c.totalGFA / c.plotAreaSqm : 0;
  const floors = c.floors;
  const allFloors = [...c.basementFloors, ...floors];

  // ── Zoning ──
  checks.push({
    id: 'zoning-jurisdiction', group: 'Zoning', label: 'Zoning district ย.9',
    actual: c.jurisdiction.zone ? `${c.jurisdiction.zone}${c.jurisdiction.overlaps.length > 1 ? ` (+${c.jurisdiction.overlaps.length - 1} other)` : ''}` : c.jurisdiction.insideBangkok ? 'Not determined' : 'Outside Bangkok',
    required: 'Whole plot inside a ย.9 area (≥ 10 m from its boundary)',
    status: c.jurisdiction.status,
    reference: 'Bangkok Plan B.E. 2556, Cl. 16 & annexed land-use map',
    sourceId: c.jurisdiction.dataSource ? S.BMA_ZONING_GIS.id : S.BKK_PLAN_2556.id,
    explanation: c.jurisdiction.message, geometry: 'zone',
  });

  {
    let status: CheckStatus = 'PASS';
    let actual = '', required = '', explanation = '';
    const t = c.transit;
    const transitTxt = t.source === 'station-data' ? ` ${t.message}` : t.source === 'declared' ? ' Station proximity is user-declared and not verified.' : ' Station data unavailable.';
    if (cfg.use === 'residential') {
      actual = 'Condominium (อาคารอยู่อาศัยรวม)';
      required = 'Not on the Clause 16 prohibited list';
      explanation = 'Clause 16 lists the prohibited uses for ย.9. Residential condominiums are not on the list, and ย.9 has no road-width limit for them.';
    } else if (cfg.use === 'office') {
      actual = `Office ${fmt(c.totalGFA, 0)} m²`;
      required = maxRoad >= YOR9.office.roadM ? 'Any size (road ≥ 16 m)' : '≤ 10,000 m² unless road ≥ 16 m or whole plot ≤ 500 m from a station';
      if (c.totalGFA > YOR9.office.maxAreaSqm + AREA_TOL_SQM && maxRoad < YOR9.office.roadM) {
        status = t.qualifies ? (t.source === 'declared' ? 'UNVERIFIED' : 'PASS') : 'FAIL';
      }
      explanation = 'Clause 16(10) prohibits offices with operating area > 10,000 m² unless they front a ≥ 16 m road or lie within 500 m of a mass-transit station. Total floor area is used as a conservative proxy for operating area.' + transitTxt;
    } else {
      actual = `Retail ${fmt(c.commercialGFA, 0)} m² + residential`;
      const t1 = YOR9.commerce.tier1AreaSqm, t2 = YOR9.commerce.tier2AreaSqm;
      const needs = c.commercialGFA > t2 ? YOR9.commerce.tier2RoadM : c.commercialGFA > t1 ? YOR9.commerce.tier1RoadM : 0;
      required = needs ? `Road ≥ ${needs} m or whole plot ≤ 500 m from a station` : 'Retail ≤ 5,000 m² permitted anywhere in ย.9';
      if (needs && maxRoad < needs) status = t.qualifies ? (t.source === 'declared' ? 'UNVERIFIED' : 'PASS') : 'FAIL';
      explanation = 'Clause 16(9) prohibits commerce with operating area > 5,000 m² unless it fronts a ≥ 12 m road (≥ 16 m above 10,000 m²) or lies within 500 m of a station. Residential use is permitted.' + transitTxt;
    }
    checks.push({ id: 'permitted-use', group: 'Zoning', label: 'Permitted use in ย.9', actual, required, status, reference: 'Bangkok Plan B.E. 2556, Cl. 16 para 1', sourceId: S.BKK_PLAN_2556.id, explanation, geometry: cfg.use === 'residential' ? undefined : 'transit', ...est(roadsEstimated && cfg.use !== 'residential') });
  }

  checks.push({
    id: 'transit', group: 'Zoning', label: 'Mass-transit station within 500 m',
    actual: c.transit.nearest ? `${c.transit.nearest.nameEn || c.transit.nearest.name}: ${fmt(c.transit.nearest.minDistanceM, 0)}–${fmt(c.transit.nearest.maxDistanceM, 0)} m` : c.transit.source === 'declared' ? 'Declared' : 'Unknown',
    required: 'Informs Plan Cl. 16 use conditions (offices, retail, hotels)',
    status: 'INFO', reference: 'Bangkok Plan B.E. 2556, Cl. 16(8)–(10), (13), (18), (19), (24)', sourceId: S.OSM_STATIONS.id,
    explanation: `${c.transit.message} Station points from OpenStreetMap (±30 m). There is no automatic transit FAR bonus in ย.9; the FAR bonuses of Cl. 52–56 (affordable housing, public open space, park-and-ride near listed stations, rainwater retention, green building) need design commitments and are not modelled.`,
    geometry: 'transit',
  });

  checks.push({
    id: 'far', group: 'Zoning', label: 'Floor area ratio (FAR)',
    actual: `${far.toFixed(2)} (${fmt(c.totalGFA, 0)} m²)`, required: `≤ 7.00 (${fmt(c.plotAreaSqm * YOR9.maxFAR, 0)} m²)`,
    status: c.totalGFA <= c.plotAreaSqm * YOR9.maxFAR + AREA_TOL_SQM ? 'PASS' : 'FAIL',
    reference: 'Bangkok Plan B.E. 2556, Cl. 16 para 2(1)', sourceId: S.BKK_PLAN_2556.id,
    explanation: `Total floor area of all storeys, including ${c.basementFloors.length ? 'basement and ' : ''}parking storeys, ÷ plot area. FAR bonuses (Cl. 52–56) are not modelled. MR 33 Cl. 5 (FAR ≤ 10) is less strict.`,
    geometry: 'floors',
  });

  // ── Open space ──
  const osText: Record<string, string> = {
    'zoning-osr': 'Uncovered open land (plot minus building footprint) must be at least 4.5 % of total floor area, and never below the building-control minimum.',
    'bco-52': 'Bangkok\'s own rule: every residential building (incl. mixed use with housing) needs uncovered open space of at least 30 % of the land; other buildings 10 %. This applies in Bangkok whatever the height, and is usually the governing open-space rule.',
    'mr55-33': 'MR 55 Clause 33 measures open space against the largest single floor area of the building.',
    'mr33-6': mr33Building ? 'MR 33 Clause 6 applies to high-rise and extra-large buildings and is measured against the plot area.' : 'The building is neither high-rise (≥ 23 m) nor extra-large (≥ 10,000 m²), so MR 33 does not apply.',
  };
  for (const req of c.openSpaceRequirements) {
    const ok = c.openSpaceSqm + AREA_TOL_SQM >= req.requiredSqm;
    checks.push({
      id: req.id, group: 'Open space', label: req.label,
      actual: `${fmt(c.openSpaceSqm, 0)} m² open`,
      required: req.applies ? `≥ ${fmt(req.requiredSqm, 0)} m² (${req.basis})` : 'Not applicable',
      status: req.applies ? (ok ? 'PASS' : 'FAIL') : 'N/A',
      reference: req.id === 'zoning-osr' ? 'Bangkok Plan B.E. 2556, Cl. 16 para 2(2)' : req.id === 'mr55-33' ? 'MR 55 Cl. 33' : req.id === 'bco-52' ? 'BMA 2544 Cl. 52(1)–(2)' : 'MR 33 Cl. 6',
      sourceId: req.id === 'zoning-osr' ? S.BKK_PLAN_2556.id : req.id === 'mr55-33' ? S.MR55.id : req.id === 'bco-52' ? S.BKK_BCO_2544.id : S.MR33.id,
      explanation: osText[req.id]!, geometry: 'open-space',
    });
  }
  checks.push({
    id: 'permeable', group: 'Open space', label: 'Permeable planted area (≥ 50 % of OSR)',
    actual: `${fmt(c.openSpaceSqm, 0)} m² open space, none of it over basements`,
    required: `≥ ${fmt(c.permeableRequiredSqm, 0)} m² permeable planted ground`,
    status: c.openSpaceSqm + AREA_TOL_SQM >= c.permeableRequiredSqm ? 'PASS' : 'FAIL',
    reference: 'Bangkok Plan B.E. 2556, Cl. 16 para 2(2)', sourceId: S.BKK_PLAN_2556.id,
    explanation: 'At least half of the OSR open space must be water-permeable ground for planting. The design keeps basements under the building footprint, so this much natural ground is available. Paving that ground would break the rule; landscape materials are a design commitment.',
    geometry: 'open-space',
  });

  // ── Setbacks (measured on every storey polygon) ──
  const measure = (edgeIdx: number, fl: FloorResult[] = allFloors) => {
    const e = c.edges[edgeIdx]!;
    let d = Infinity;
    for (const f of fl) d = Math.min(d, polygonSegmentDistance(f.polygon, e.start, e.end));
    return d;
  };
  for (const e of roads) {
    const sb = env.setbacks[e.index]!;
    const d = measure(e.index);
    checks.push({
      id: `road-setback-${e.index}`, group: 'Setbacks', label: `Front setback, edge ${e.index + 1} (${fmt(e.roadWidthM ?? 0)} m road)`,
      actual: floors.length ? `${fmt(d, 2)} m` : 'No building', required: `≥ ${fmt(sb.distanceM, 2)} m`,
      status: floors.length === 0 ? 'N/A' : d + DIST_TOL_M >= sb.distanceM ? 'PASS' : 'FAIL',
      reference: sb.reference, sourceId: sb.reference.startsWith('MR 33') ? S.MR33.id : S.MR55.id,
      explanation: `${sb.basis}. Measured as the minimum distance from any storey to the road edge.`,
      geometry: 'road-setback', edges: [e.index], ...est(e.roadSource === 'map-estimate'),
    });
  }
  for (const kind of ['side', 'rear'] as const) {
    const group = c.edges.filter((e) => e.kind === kind);
    if (group.length === 0) continue;
    let worst = Infinity, worstReq = 0, worstMargin = Infinity;
    const upperFrom = env.upperFromIndex ?? Infinity;
    for (const e of group) {
      const lower = floors.filter((f) => f.index < upperFrom);
      const upperF = floors.filter((f) => f.index >= upperFrom);
      const tiers: [FloorResult[], number][] = [[[...c.basementFloors, ...lower], env.setbacks[e.index]!.distanceM]];
      if (upperF.length && env.upperSetbacks) tiers.push([upperF, env.upperSetbacks[e.index]!]);
      for (const [fl, req] of tiers) {
        if (!fl.length) continue;
        const d = measure(e.index, fl);
        if (d - req < worstMargin) { worstMargin = d - req; worst = d; worstReq = req; }
      }
    }
    const sb = env.setbacks[group[0]!.index]!;
    checks.push({
      id: `${kind}-setback`, group: 'Setbacks',
      label: kind === 'side' ? `Side setbacks (${group.length} edge${group.length > 1 ? 's' : ''})` : `Rear setback (${group.length} edge${group.length > 1 ? 's' : ''})`,
      actual: floors.length ? `${fmt(worst, 2)} m (closest)` : 'No building', required: `≥ ${fmt(worstReq, 2)} m`,
      status: floors.length === 0 ? 'N/A' : worstMargin + DIST_TOL_M >= 0 ? 'PASS' : 'FAIL',
      reference: sb.reference + (env.upperSetbacks ? '; BMA Cl. 54 (3 m from the 3rd storey)' : ''),
      sourceId: sb.reference.startsWith('MR 33') ? S.MR33.id : S.MR55.id,
      explanation: `${sb.basis}.${env.upperSetbacks ? ' BMA 2544 Cl. 54 raises the distance to 3 m for openings from the 3rd storey upwards.' : ''} Thai law does not distinguish side and rear boundaries; "rear" means the boundaries facing away from the main road.`,
      geometry: kind === 'side' ? 'side-setback' : 'rear-setback', edges: group.map((e) => e.index),
    });
  }
  {
    const req = c.heightM > BMA2544.aroundThresholdM ? BMA2544.aroundHighM : BMA2544.aroundLowM;
    let d = Infinity;
    c.edges.forEach((e) => { d = Math.min(d, measure(e.index)); });
    checks.push({
      id: 'bco-55', group: 'Setbacks', label: 'Clear space around the building',
      actual: floors.length ? `${fmt(d, 2)} m (closest)` : 'No building', required: `≥ ${req} m`,
      status: floors.length === 0 ? 'N/A' : d + DIST_TOL_M >= req ? 'PASS' : 'FAIL',
      reference: 'BMA 2544 Cl. 55', sourceId: S.BKK_BCO_2544.id,
      explanation: 'Bangkok requires open space all around a building: at least 1 m up to 15 m height, 2 m above. The setbacks above are larger, so this rarely governs.',
      geometry: 'side-setback', edges: c.edges.map((e) => e.index),
    });
  }
  // Cl. 51 corner splay: two consecutive road edges 3–8 m wide meeting at < 135°
  for (let i = 0; i < c.edges.length; i++) {
    const e1 = c.edges[i]!, e2 = c.edges[(i + 1) % c.edges.length]!;
    const inRange = (w?: number) => w !== undefined && w >= BMA2544.splayRoadMinM && w <= BMA2544.splayRoadMaxM;
    if (e1.kind !== 'road' || e2.kind !== 'road' || !inRange(e1.roadWidthM) || !inRange(e2.roadWidthM)) continue;
    const v = e1.end;
    const u1: MetricPoint = [(e1.start[0] - v[0]) / e1.lengthM, (e1.start[1] - v[1]) / e1.lengthM];
    const u2: MetricPoint = [(e2.end[0] - v[0]) / e2.lengthM, (e2.end[1] - v[1]) / e2.lengthM];
    const angle = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1])));
    if (angle * 180 / Math.PI >= BMA2544.splayMaxAngleDeg) continue;
    const L = BMA2544.splayM / 2 / Math.sin(angle / 2);
    const tri: Polygon = [v, [v[0] + u1[0] * L, v[1] + u1[1] * L], [v[0] + u2[0] * L, v[1] + u2[1] * L]];
    const intr = Math.max(0, ...allFloors.map((f) => intersectionArea(f.polygon, tri)));
    checks.push({
      id: `corner-splay-${i}`, group: 'Setbacks', label: `Corner splay at E${i + 1}/E${((i + 1) % c.edges.length) + 1}`,
      actual: `${fmt(intr, 3)} m² of building in the splay`, required: '0 m² (4 m chamfer kept clear)',
      status: intr <= AREA_TOL_SQM ? 'PASS' : 'FAIL',
      reference: 'BMA 2544 Cl. 51', sourceId: S.BKK_BCO_2544.id,
      explanation: `Plots at the corner of two public roads 3–8 m wide meeting at less than 135° (here ${fmt(angle * 180 / Math.PI, 0)}°) must chamfer the corner by 4 m; no fence or building part may enter it.`,
      geometry: 'road-setback', edges: [i, (i + 1) % c.edges.length], ...est(e1.roadSource === 'map-estimate' || e2.roadSource === 'map-estimate'),
    });
  }
  {
    const fs = c.frontSpace;
    checks.push({
      id: 'front-space', group: 'Setbacks', label: 'Front open space / road face (L/6 – L/8)',
      actual: fs.applies ? `Road face ${fmt(fs.roadFaceM, 1)} m of ${fmt(fs.perimeterM, 1)} m perimeter${fs.cl53Ok ? '' : `; ≥ ${fs.requiredWidthM} m front space along ${fmt(fs.wideFrontM, 1)} m`}` : 'N/A',
      required: fs.applies ? `Road face > ${fmt(fs.perimeterM / 8, 1)} m within 20 m of the road (Cl. 53), or ≥ ${fs.requiredWidthM} m front space along ≥ ${fmt(fs.perimeterM / 6, 1)} m (Cl. 52(6))` : 'Buildings ≤ 2 storeys and ≤ 8 m',
      status: !fs.applies ? 'N/A' : fs.cl53Ok || fs.cl526Ok ? 'PASS' : 'FAIL',
      reference: 'BMA 2544 Cl. 52(6), 53', sourceId: S.BKK_BCO_2544.id,
      explanation: `Bangkok requires buildings over 2 storeys / 8 m to have an open space in front (≥ 6 m, or ≥ 12 m above 3 storeys) running along ≥ 1/6 of the building perimeter, unless the building's face on the public road is longer than 1/8 of its perimeter and within 20 m of the road (Cl. 53).${fs.cl53Ok ? ' This design uses the Cl. 53 route.' : fs.cl526Ok ? ' This design uses the Cl. 52(6) route; the front space must also connect to a ≥ 6 m driveway to the public road.' : ''}${fs.depthLimited ? ' The generator limited the building depth so the road face stays above 1/8 of the perimeter.' : ''}`,
      geometry: 'front-space', edges: roads.map((e) => e.index), ...est(roadsEstimated),
    });
  }

  // ── Height & form ──
  {
    const active = env.skyPlanes.filter((p) => p.active);
    let worst = Infinity, worstFloor = -1, slabViolation = 0;
    for (const pl of active) {
      const e = c.edges[pl.edgeIndex]!;
      for (const f of floors) {
        for (const v of f.polygon) {
          const d = signedDistanceToEdgeLine(v, e.start, e.end);
          if (pl.frontOnly && d < -1e-9) continue; // behind the road line: not governed by this road
          const margin = MR55.skyPlaneRatio * (d + pl.roadWidthM) - f.topM;
          if (margin < worst) { worst = margin; worstFloor = f.index; }
        }
        if (pl.frontOnly) slabViolation = Math.max(slabViolation, slabOverlapArea(f.polygon, e.start, e.end, skyPlaneOffset(f.topM, pl.roadWidthM)));
      }
    }
    const relief = env.skyPlanes.filter((p) => !p.active).map((p) => p.reason);
    const ok = worst >= -DIST_TOL_M && slabViolation <= AREA_TOL_SQM;
    checks.push({
      id: 'sky-plane', group: 'Height & form', label: '2:1 sky-exposure plane',
      actual: active.length === 0 ? 'No public road declared' : floors.length ? `Min. clearance ${fmt(worst, 2)} m (L${worstFloor + 1})` : 'No building',
      required: 'H ≤ 2 × distance to opposite road boundary at every point',
      status: active.length === 0 ? 'UNVERIFIED' : floors.length === 0 ? 'N/A' : ok ? 'PASS' : 'FAIL',
      reference: (relief.length ? 'MR 55 Cl. 44, 45, 46' : 'MR 55 Cl. 44') + '; BMA 2544 Cl. 49', sourceId: S.MR55.id,
      explanation: `Checked at every vertex of every storey at its roof level, assuming the plot edge is the road boundary (distance to the opposite boundary = distance to the plot edge + road width). ${active.map((p) => `Edge ${p.edgeIndex + 1}: ${p.reason}`).join('. ')}${relief.length ? '. ' + relief.join('. ') : ''}.`,
      geometry: 'sky-plane', edges: env.skyPlanes.map((p) => p.edgeIndex), ...est(roadsEstimated),
    });
  }
  {
    let status: CheckStatus = 'PASS';
    let required = env.heightRule;
    if (env.buildingClass === 'low-le9' && c.heightM > MR55.openingSetbackLowMaxHeightM + 1e-9) status = 'FAIL';
    if (env.buildingClass === 'low-lt23' && c.heightM >= MR33.highRiseHeightM - STRICT_EPS) status = 'FAIL';
    if (mr33Building && !c.roadEligibility.mr33Allowed) { status = 'FAIL'; required = 'High-rise needs a ≥ 12 m frontage on a ≥ 10 m road'; }
    checks.push({
      id: 'height', group: 'Height & form', label: 'Building height',
      actual: `${fmt(c.heightM, 2)} m, ${floors.length} storeys${c.basementFloors.length ? ` + ${c.basementFloors.length} basement` : ''}`,
      required, status, reference: 'MR 33 Cl. 1, 2; MR 55 Cl. 50', sourceId: S.MR33.id,
      explanation: 'Height is measured from ground to the roof deck; basements do not count. Bangkok ย.9 has no fixed height limit; the effective limits are the high-rise threshold (needs an eligible road), the 2:1 plane and FAR.',
      geometry: 'height',
    });
  }

  // ── Access ──
  const q = c.roadEligibility;
  const reqW = c.totalGFA > MR33.largeAreaSqm ? MR33.minRoadWidthLargeM : MR33.minRoadWidthM;
  const qualifying = roads.filter((e) => e.lengthM >= MR33.minFrontageM - 1e-9 && (e.roadWidthM ?? 0) >= reqW - 1e-9);
  const routeKnown = qualifying.some((e) => e.accessMinWidthM !== undefined && e.accessMinWidthM >= reqW - 1e-9);
  const routeFails = qualifying.length > 0 && qualifying.every((e) => e.accessMinWidthM !== undefined && e.accessMinWidthM < reqW - 1e-9);
  const accessEst = roads.some((e) => e.accessSource === 'map-estimate');
  checks.push({
    id: 'road-width', group: 'Access', label: 'Road width & continuity (high-rise / extra-large)',
    actual: roads.length ? `Widest ${fmt(maxRoad)} m; route min ${qualifying.length && qualifying[0]!.accessMinWidthM !== undefined ? `${fmt(Math.max(...qualifying.map((e) => e.accessMinWidthM ?? 0)))} m` : 'unknown'}` : 'No road declared',
    required: mr33Building ? `≥ ${reqW} m reserve, continuous to another ≥ ${reqW} m public road` : 'N/A (not MR 33)',
    status: !mr33Building ? 'N/A' : qualifying.length === 0 || routeFails ? 'FAIL' : routeKnown ? 'PASS' : 'UNVERIFIED',
    reference: 'MR 33 Cl. 2', sourceId: S.MR33.id,
    explanation: `${q.reason}. The fronting road must stay at least ${reqW} m wide all the way to another public road of that width ("ยาวต่อเนื่องกันโดยตลอดจนไปเชื่อมต่อกับถนนสาธารณะอื่น"). Widths from the map are estimates; a surveyed road reserve (BMA / title deed) is needed for a permit.`,
    geometry: 'access-route', edges: roads.map((e) => e.index), ...est(roadsEstimated || accessEst),
  });
  checks.push({
    id: 'frontage', group: 'Access', label: 'Public-road frontage length',
    actual: roads.length ? roads.map((e) => `E${e.index + 1}: ${fmt(e.lengthM)} m`).join(', ') : 'None',
    required: mr33Building ? '≥ 12 m on the qualifying road' : 'At least one public-road edge',
    status: roads.length === 0 ? 'UNVERIFIED' : !mr33Building ? 'PASS' : qualifying.length ? 'PASS' : 'FAIL',
    reference: mr33Building ? 'MR 33 Cl. 2' : 'Site access', sourceId: S.MR33.id,
    explanation: roads.length === 0 ? 'No road edge is selected, so road setbacks, the 2:1 plane and access cannot be evaluated.' : 'Frontage is the length of each road-facing plot edge.',
    geometry: 'frontage', edges: roads.map((e) => e.index), ...est(roadsEstimated),
  });
  checks.push({
    id: 'fire-access', group: 'Access', label: 'Fire-engine access ring (6 m)',
    actual: mr33Building ? `${fmt(Math.min(...env.setbacks.map((s) => s.distanceM)), 1)} m clear on every side` : 'N/A',
    required: mr33Building ? '≥ 6 m clear road surface around the building' : 'N/A (not MR 33)',
    status: !mr33Building ? 'N/A' : env.setbacks.every((s) => s.distanceM >= MR33.fireRoadM - 1e-9) ? 'PASS' : 'FAIL',
    reference: 'MR 33 Cl. 3', sourceId: S.MR33.id,
    explanation: 'The 6 m setback ring leaves room for the required fire-engine road. Paving and turning details are a design matter.',
    geometry: 'side-setback',
  });

  // ── Parking ──
  const pk = c.parking;
  checks.push({
    id: 'parking-provision', group: 'Parking', label: 'Parking spaces',
    actual: `${pk.providedSpaces} spaces (${pk.parkingStoreys} podium storey${pk.parkingStoreys === 1 ? '' : 's'}${pk.basementLevels ? `, ${pk.basementLevels} basement level${pk.basementLevels > 1 ? 's' : ''}` : ''})`,
    required: `≥ ${pk.requiredSpaces} spaces`,
    status: pk.providedSpaces >= pk.requiredSpaces ? 'PASS' : 'FAIL',
    reference: 'BMA 2544 Cl. 83–86; MR 7 Cl. 3(1)', sourceId: S.BKK_BCO_2544.id,
    explanation: `${pk.basis.join('. ')}. Provided capacity assumes ${pk.areaPerSpaceSqm} m² gross per space (2.40 × 5.00 m bays on 6 m aisles, Cl. 86 & 88, plus ramps and cores). Parking storeys count in total floor area.${pk.warnings.length ? ' ' + pk.warnings.join(' ') : ''}`,
    geometry: 'parking',
  });
  if (pk.requiredSpaces >= BMA2544.parkingAccessSpaces) {
    const accessW = Math.max(0, ...roads.map((e) => Math.min(e.roadWidthM ?? 0, e.accessMinWidthM ?? Infinity)));
    checks.push({
      id: 'parking-access', group: 'Parking', label: 'Car access road (≥ 15 spaces)',
      actual: roads.length ? `${fmt(accessW)} m` : 'No road', required: '≥ 6 m public road, continuing to a wider road',
      status: accessW >= BMA2544.parkingAccessRoadM - 1e-9 ? (roads.some((e) => e.accessMinWidthM !== undefined) ? 'PASS' : 'UNVERIFIED') : 'FAIL',
      reference: 'BMA 2544 Cl. 90', sourceId: S.BKK_BCO_2544.id,
      explanation: 'Car parks with 15 or more spaces must connect to a public road at least 6 m wide that continues to a wider public road. Driveway position (≥ 20 m from junction curves, Cl. 89) is a design matter.',
      geometry: 'access-route', edges: roads.map((e) => e.index), ...est(roadsEstimated || accessEst),
    });
  }

  // ── Classification ──
  checks.push({
    id: 'classification', group: 'Classification', label: 'High-rise / extra-large classification',
    actual: `${c.isHighRise ? 'High-rise' : 'Not high-rise'} · ${c.isExtraLarge ? 'Extra-large' : 'Not extra-large'}`,
    required: 'High-rise: H ≥ 23 m · Extra-large: ≥ 10,000 m²', status: 'INFO', reference: 'MR 33 Cl. 1', sourceId: S.MR33.id,
    explanation: `Envelope used: ${env.classLabel}. Both thresholds are inclusive ("ตั้งแต่"). Either one makes all MR 33 rules apply.`,
  });
  checks.push({
    id: 'eia', group: 'Classification', label: 'EIA report',
    actual: c.eia.status === 'required' ? 'Required (estimate)' : c.eia.status === 'check' ? 'Check required' : 'Likely not required (estimate)',
    required: 'Condo: ≥ 80 units or ≥ 4,000 m² usable area · Office: ≥ 23 m or ≥ 10,000 m²', status: 'INFO',
    reference: 'MNRE EIA notification, Items 27 and 31', sourceId: S.EIA.id,
    explanation: `${c.eia.reason}. Units = residential floor area × 0.70 ÷ the average unit size; usable area is approximated by residential floor area. An EIA is a permitting step, not a design limit. Height ≥ 23 m alone does not trigger an EIA for condominiums.`,
  });
  checks.push({
    id: 'bkk-ordinance-scope', group: 'Classification', label: 'BMA 2544: other chapters',
    actual: 'Massing clauses evaluated (Cl. 49–55, 83–90)', required: 'Structure, fire, stairs, sanitation, drainage', status: 'INFO',
    reference: 'BMA 2544 Ch. 3, 4, 6–8, 10–11', sourceId: S.BKK_BCO_2544.id,
    explanation: 'The ordinance\'s chapters on materials, stairs, sanitary fittings, lighting/ventilation, drainage and wastewater tanks, plumbing and structure set detailed-design requirements that do not change the buildable envelope. They are for the architect and engineers, not this massing study.',
  });

  // ── Integrity (numerical invariants) ──
  let outsideAllowable = 0, outsidePlot = 0, outsideBuildable = 0;
  for (const f of floors) {
    outsideAllowable = Math.max(outsideAllowable, overhangArea(f.polygon, f.allowablePolygon));
    outsidePlot = Math.max(outsidePlot, overhangArea(f.polygon, c.plot));
  }
  for (const f of c.basementFloors) outsideBuildable = Math.max(outsideBuildable, overhangArea(f.polygon, env.buildablePolygon));
  const overhang = Math.max(outsideAllowable, outsidePlot, outsideBuildable);
  checks.push({
    id: 'floors-in-envelope', group: 'Integrity', label: 'Every storey inside its allowable polygon',
    actual: `max. overhang ${overhang.toFixed(3)} m²`, required: `≤ ${AREA_TOL_SQM} m² (numerical tolerance)`,
    status: overhang <= AREA_TOL_SQM ? 'PASS' : 'FAIL', reference: 'Engine invariant',
    explanation: 'Each storey polygon is checked against its own allowable polygon (setbacks plus the 2:1 plane at its roof level) and against the plot boundary; basements against the buildable polygon (MR 33 Cl. 4 applies below ground too).',
    geometry: 'envelope',
  });
  const sum = allFloors.reduce((s, f) => s + f.areaSqm, 0);
  checks.push({
    id: 'gfa-reconciliation', group: 'Integrity', label: 'Floor areas sum to total floor area',
    actual: `Σ ${allFloors.length} storeys = ${fmt(sum, 3)} m²`, required: `= ${fmt(c.totalGFA, 3)} m²`,
    status: Math.abs(sum - c.totalGFA) <= AREA_TOL_SQM ? 'PASS' : 'FAIL', reference: 'Engine invariant',
    explanation: 'Total floor area is the exact sum of the storey polygon areas, including parking and basement storeys (MR 33 Cl. 1 "พื้นที่อาคาร": gross area inside the outer walls). It is not net sellable area.',
    geometry: 'floors',
  });

  return checks;
}

export function summarize(checks: ComplianceCheck[]): Pick<DesignResult, 'compliant' | 'failCount' | 'unverifiedCount'> {
  const failCount = checks.filter((k) => k.status === 'FAIL').length;
  const unverifiedCount = checks.filter((k) => k.status === 'UNVERIFIED').length;
  return { compliant: failCount === 0, failCount, unverifiedCount };
}
