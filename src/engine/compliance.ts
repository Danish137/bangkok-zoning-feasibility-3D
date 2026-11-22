// ─── Per-design compliance checklist ───
// Every check is computed from the design's actual geometry, not from the generator's intent.
// Missing evidence is reported as UNVERIFIED, never as PASS.

import type {
  BuildingType, CheckStatus, ComplianceCheck, DesignResult, EiaAssessment, Envelope, FloorResult,
  JurisdictionResult, OpenSpaceRequirement, PlotEdge, Polygon, RoadEligibility,
} from './types';
import { BUILDING_TYPES } from './types';
import { EIA, MR33, MR55, SOURCES, YOR9 } from './regulations';
import { differenceArea, polygonSegmentDistance, signedDistanceToEdgeLine } from './polygon';
import { fmt, STRICT_EPS } from './rules';

/** Containment / area tolerance (m²) for numerical clipping noise */
export const AREA_TOL_SQM = 0.01;
/** Distance tolerance (m) */
export const DIST_TOL_M = 1e-3;

export interface ComplianceInput {
  plot: Polygon;
  plotAreaSqm: number;
  edges: PlotEdge[];
  buildingType: BuildingType;
  jurisdiction: JurisdictionResult;
  roadEligibility: RoadEligibility;
  nearTransitDeclared: boolean;
  envelope: Envelope;
  floors: FloorResult[];
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
}

export function openSpaceRequirements(
  buildingType: BuildingType, plotAreaSqm: number, totalGFA: number, largestFloorSqm: number, mr33Building: boolean,
): OpenSpaceRequirement[] {
  const residential = BUILDING_TYPES[buildingType].use !== 'office';
  const r55 = residential ? MR55.openSpaceResidential : MR55.openSpaceNonResidential;
  const r33 = residential ? MR33.openSpaceResidential : MR33.openSpaceNonResidential;
  return [
    {
      id: 'zoning-osr',
      label: 'Zoning OSR (Plan Cl. 16)',
      basis: `4.5 % × total floor area ${fmt(totalGFA)} m²`,
      requiredSqm: YOR9.minOSRFractionOfGFA * totalGFA,
      applies: true,
    },
    {
      id: 'mr55-33',
      label: 'Open space (MR 55 Cl. 33)',
      basis: `${r55 * 100} % × largest floor ${fmt(largestFloorSqm)} m² (${residential ? 'residential' : 'non-residential'})`,
      requiredSqm: r55 * largestFloorSqm,
      applies: true,
    },
    {
      id: 'mr33-6',
      label: 'Open space (MR 33 Cl. 6)',
      basis: `${r33 * 100} % × plot area ${fmt(plotAreaSqm)} m² (high-rise / extra-large only)`,
      requiredSqm: r33 * plotAreaSqm,
      applies: mr33Building,
    },
  ];
}

export function assessEia(buildingType: BuildingType, residentialGFA: number, heightM: number, totalGFA: number): EiaAssessment {
  const units = Math.floor((residentialGFA * 0.7) / 35);
  const cfg = BUILDING_TYPES[buildingType];
  const reasons: string[] = [];
  let status: EiaAssessment['status'] = 'likely-not-required';
  if (cfg.use !== 'office' && residentialGFA > 0) {
    if (units >= EIA.residentialUnits || residentialGFA >= EIA.residentialUsableAreaSqm) {
      status = 'required';
      reasons.push(`Item 31 condominium: ≈ ${units} units (≥ 80) or usable area ≈ ${fmt(residentialGFA, 0)} m² (≥ 4,000 m²)`);
    } else {
      reasons.push(`Item 31 condominium: ≈ ${units} units and ≈ ${fmt(residentialGFA, 0)} m² usable area are below 80 units / 4,000 m²`);
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
  return { status, reason: reasons.join('; '), estimatedUnits: units, usableAreaProxySqm: residentialGFA };
}

const S = SOURCES;

export function computeChecks(c: ComplianceInput): ComplianceCheck[] {
  const checks: ComplianceCheck[] = [];
  const cfg = BUILDING_TYPES[c.buildingType];
  const env = c.envelope;
  const roads = c.edges.filter((e) => e.kind === 'road');
  const maxRoad = roads.reduce((m, e) => Math.max(m, e.roadWidthM ?? 0), 0);
  const mr33Building = c.isHighRise || c.isExtraLarge;
  const far = c.plotAreaSqm > 0 ? c.totalGFA / c.plotAreaSqm : 0;
  const floors = c.floors;

  // ── Zoning ──
  checks.push({
    id: 'zoning-jurisdiction',
    group: 'Zoning',
    label: 'Zoning district ย.9',
    actual: c.jurisdiction.insideBangkok ? 'User-declared ย.9' : 'Outside Bangkok',
    required: 'Plot inside a ย.9 area of the 2013 plan map',
    status: c.jurisdiction.status,
    reference: 'Bangkok Plan B.E. 2556, Clause 16 & annexed land-use map',
    sourceId: S.BKK_PLAN_2556.id,
    explanation: c.jurisdiction.message,
    geometry: 'plot',
  });

  {
    let status: CheckStatus = 'PASS';
    let actual = '';
    let required = '';
    let explanation = '';
    if (cfg.use === 'residential') {
      actual = 'Condominium (อาคารอยู่อาศัยรวม)';
      required = 'Not on the Clause 16 prohibited list';
      explanation = 'Clause 16 lists the prohibited uses for ย.9. Residential condominiums are not on the list, and ย.9 has no road-width limit for them.';
    } else if (cfg.use === 'office') {
      actual = `Office ${fmt(c.totalGFA, 0)} m²`;
      required = maxRoad >= YOR9.office.roadM ? 'Any size (road ≥ 16 m)' : '≤ 10,000 m² unless road ≥ 16 m or ≤ 500 m from a station';
      if (c.totalGFA > YOR9.office.maxAreaSqm + AREA_TOL_SQM && maxRoad < YOR9.office.roadM) {
        status = c.nearTransitDeclared ? 'UNVERIFIED' : 'FAIL';
      }
      explanation = 'Clause 16(10) prohibits offices with operating area > 10,000 m² unless they front a ≥ 16 m road or lie within 500 m of a mass-transit station. Total floor area is used as a conservative proxy for operating area.' +
        (c.nearTransitDeclared ? ' The 500 m station proximity is user-declared and not verified.' : '');
    } else {
      actual = `Retail ${fmt(c.commercialGFA, 0)} m² + residential`;
      const t1 = YOR9.commerce.tier1AreaSqm, t2 = YOR9.commerce.tier2AreaSqm;
      const needs = c.commercialGFA > t2 ? YOR9.commerce.tier2RoadM : c.commercialGFA > t1 ? YOR9.commerce.tier1RoadM : 0;
      required = needs ? `Road ≥ ${needs} m or ≤ 500 m from a station` : 'Retail ≤ 5,000 m² permitted anywhere in ย.9';
      if (needs && maxRoad < needs) status = c.nearTransitDeclared ? 'UNVERIFIED' : 'FAIL';
      explanation = 'Clause 16(9) prohibits commerce with operating area > 5,000 m² unless it fronts a ≥ 12 m road (≥ 16 m above 10,000 m²) or lies within 500 m of a station. Residential use is permitted.' +
        (c.nearTransitDeclared ? ' The station proximity is user-declared and not verified.' : '');
    }
    checks.push({ id: 'permitted-use', group: 'Zoning', label: 'Permitted use in ย.9', actual, required, status, reference: 'Bangkok Plan B.E. 2556, Cl. 16 para 1', sourceId: S.BKK_PLAN_2556.id, explanation });
  }

  checks.push({
    id: 'far',
    group: 'Zoning',
    label: 'Floor area ratio (FAR)',
    actual: `${far.toFixed(2)} (${fmt(c.totalGFA, 0)} m²)`,
    required: `≤ 7.00 (${fmt(c.plotAreaSqm * YOR9.maxFAR, 0)} m²)`,
    status: c.totalGFA <= c.plotAreaSqm * YOR9.maxFAR + AREA_TOL_SQM ? 'PASS' : 'FAIL',
    reference: 'Bangkok Plan B.E. 2556, Cl. 16 para 2(1)',
    sourceId: S.BKK_PLAN_2556.id,
    explanation: 'Total floor area of all storeys (sum of the floor polygons) ÷ plot area. FAR bonuses (Cl. 52–56) are not modelled. MR 33 Cl. 5 (FAR ≤ 10) is less strict.',
    geometry: 'floors',
  });

  // ── Open space ──
  for (const req of c.openSpaceRequirements) {
    const ok = c.openSpaceSqm + AREA_TOL_SQM >= req.requiredSqm;
    checks.push({
      id: req.id,
      group: 'Open space',
      label: req.label,
      actual: `${fmt(c.openSpaceSqm, 0)} m² open`,
      required: req.applies ? `≥ ${fmt(req.requiredSqm, 0)} m² (${req.basis})` : 'Not applicable',
      status: req.applies ? (ok ? 'PASS' : 'FAIL') : 'N/A',
      reference: req.id === 'zoning-osr' ? 'Bangkok Plan B.E. 2556, Cl. 16 para 2(2)' : req.id === 'mr55-33' ? 'MR 55 Cl. 33' : 'MR 33 Cl. 6',
      sourceId: req.id === 'zoning-osr' ? S.BKK_PLAN_2556.id : req.id === 'mr55-33' ? S.MR55.id : S.MR33.id,
      explanation: req.id === 'zoning-osr'
        ? 'Uncovered open land (plot minus building footprint) must be at least 4.5 % of total floor area, and never below the building-control minimum.'
        : req.id === 'mr55-33'
          ? 'MR 55 Clause 33 measures open space against the largest single floor area of the building, not the plot.'
          : mr33Building
            ? 'MR 33 Clause 6 applies to high-rise and extra-large buildings and is measured against the plot area.'
            : 'The building is neither high-rise (≥ 23 m) nor extra-large (≥ 10,000 m²), so MR 33 does not apply.',
      geometry: 'open-space',
    });
  }
  checks.push({
    id: 'permeable',
    group: 'Open space',
    label: 'Permeable planted area',
    actual: `${fmt(c.openSpaceSqm, 0)} m² open space available`,
    required: `≥ ${fmt(c.permeableRequiredSqm, 0)} m² permeable planted ground (50 % of OSR open space)`,
    status: c.openSpaceSqm + AREA_TOL_SQM >= c.permeableRequiredSqm ? 'UNVERIFIED' : 'FAIL',
    reference: 'Bangkok Plan B.E. 2556, Cl. 16 para 2(2)',
    sourceId: S.BKK_PLAN_2556.id,
    explanation: 'At least half of the OSR open space must be water-permeable ground for planting. There is enough open space for this, but surface materials are a landscape-design matter and are not modelled.',
    geometry: 'open-space',
  });

  // ── Setbacks (measured on every floor polygon) ──
  const measure = (edgeIdx: number) => {
    const e = c.edges[edgeIdx]!;
    let d = Infinity;
    for (const f of floors) d = Math.min(d, polygonSegmentDistance(f.polygon, e.start, e.end));
    return d;
  };
  for (const e of roads) {
    const sb = env.setbacks[e.index]!;
    const d = measure(e.index);
    checks.push({
      id: `road-setback-${e.index}`,
      group: 'Setbacks',
      label: `Front setback, edge ${e.index + 1} (${fmt(e.roadWidthM ?? 0)} m road)`,
      actual: floors.length ? `${fmt(d, 2)} m` : 'No building',
      required: `≥ ${fmt(sb.distanceM, 2)} m`,
      status: floors.length === 0 ? 'N/A' : d + DIST_TOL_M >= sb.distanceM ? 'PASS' : 'FAIL',
      reference: sb.reference,
      sourceId: sb.reference.startsWith('MR 33') ? S.MR33.id : S.MR55.id,
      explanation: `${sb.basis}. Measured as the minimum distance from any storey to the road edge.`,
      geometry: 'road-setback',
      edges: [e.index],
    });
  }
  for (const kind of ['side', 'rear'] as const) {
    const group = c.edges.filter((e) => e.kind === kind);
    if (group.length === 0) continue;
    let worst = Infinity, worstReq = 0, worstMargin = Infinity;
    for (const e of group) {
      const d = measure(e.index);
      const req = env.setbacks[e.index]!.distanceM;
      if (d - req < worstMargin) { worstMargin = d - req; worst = d; worstReq = req; }
    }
    const sb = env.setbacks[group[0]!.index]!;
    checks.push({
      id: `${kind}-setback`,
      group: 'Setbacks',
      label: kind === 'side' ? `Side setbacks (${group.length} edge${group.length > 1 ? 's' : ''})` : `Rear setback (${group.length} edge${group.length > 1 ? 's' : ''})`,
      actual: floors.length ? `${fmt(worst, 2)} m (closest)` : 'No building',
      required: `≥ ${fmt(worstReq, 2)} m`,
      status: floors.length === 0 ? 'N/A' : worstMargin + DIST_TOL_M >= 0 ? 'PASS' : 'FAIL',
      reference: sb.reference,
      sourceId: sb.reference.startsWith('MR 33') ? S.MR33.id : S.MR55.id,
      explanation: `${sb.basis}. Thai law does not distinguish side and rear boundaries; "rear" means the boundaries facing away from the main road.`,
      geometry: kind === 'side' ? 'side-setback' : 'rear-setback',
      edges: group.map((e) => e.index),
    });
  }

  // ── Height & form ──
  {
    const active = env.skyPlanes.filter((p) => p.active);
    let worst = Infinity;
    let worstFloor = -1;
    for (const pl of active) {
      const e = c.edges[pl.edgeIndex]!;
      for (const f of floors) {
        for (const v of f.polygon) {
          const dist = signedDistanceToEdgeLine(v, e.start, e.end) + pl.roadWidthM;
          const margin = MR55.skyPlaneRatio * dist - f.topM;
          if (margin < worst) { worst = margin; worstFloor = f.index; }
        }
      }
    }
    const relief = env.skyPlanes.filter((p) => !p.active).map((p) => p.reason);
    checks.push({
      id: 'sky-plane',
      group: 'Height & form',
      label: '2:1 sky-exposure plane',
      actual: active.length === 0 ? 'No public road declared' : floors.length ? `Min. clearance ${fmt(worst, 2)} m (L${worstFloor + 1})` : 'No building',
      required: 'H ≤ 2 × distance to opposite road boundary at every point',
      status: active.length === 0 ? 'UNVERIFIED' : floors.length === 0 ? 'N/A' : worst >= -DIST_TOL_M ? 'PASS' : 'FAIL',
      reference: relief.length ? 'MR 55 Cl. 44, 45, 46' : 'MR 55 Cl. 44',
      sourceId: S.MR55.id,
      explanation: `Checked at every vertex of every storey at its roof level, assuming the plot edge is the road boundary. ${active.map((p) => `Edge ${p.edgeIndex + 1}: ${p.reason}`).join('. ')}${relief.length ? '. ' + relief.join('. ') : ''}.`,
      geometry: 'sky-plane',
      edges: env.skyPlanes.map((p) => p.edgeIndex),
    });
  }
  {
    let status: CheckStatus = 'PASS';
    let required = env.heightRule;
    if (env.buildingClass === 'low-le9' && c.heightM > MR55.openingSetbackLowMaxHeightM + 1e-9) status = 'FAIL';
    if (env.buildingClass === 'low-lt23' && c.heightM >= MR33.highRiseHeightM - STRICT_EPS) status = 'FAIL';
    if (mr33Building && !c.roadEligibility.mr33Allowed) { status = 'FAIL'; required = 'High-rise needs a ≥ 12 m frontage on a ≥ 10 m road'; }
    checks.push({
      id: 'height',
      group: 'Height & form',
      label: 'Building height',
      actual: `${fmt(c.heightM, 2)} m, ${floors.length} storeys`,
      required,
      status,
      reference: 'MR 33 Cl. 1, 2; MR 55 Cl. 50',
      sourceId: S.MR33.id,
      explanation: 'Height is measured from ground to the roof deck. Bangkok ย.9 has no fixed height limit; the effective limits are the high-rise threshold (needs an eligible road), the 2:1 plane and FAR.',
      geometry: 'height',
    });
  }

  // ── Access (MR 33) ──
  const q = c.roadEligibility;
  const qualifying = roads.filter((e) => e.lengthM >= MR33.minFrontageM - 1e-9 && (e.roadWidthM ?? 0) >= (c.totalGFA > MR33.largeAreaSqm ? MR33.minRoadWidthLargeM : MR33.minRoadWidthM) - 1e-9);
  checks.push({
    id: 'road-width',
    group: 'Access',
    label: 'Road width (high-rise / extra-large)',
    actual: roads.length ? `Widest ${fmt(maxRoad)} m` : 'No road declared',
    required: mr33Building ? `≥ ${c.totalGFA > MR33.largeAreaSqm ? 18 : 10} m reserve` : 'N/A (not MR 33)',
    status: !mr33Building ? 'N/A' : qualifying.length ? 'PASS' : 'FAIL',
    reference: 'MR 33 Cl. 2',
    sourceId: S.MR33.id,
    explanation: `${q.reason}. The width is user-entered and must match the legal road reserve; it cannot be verified from OpenStreetMap.`,
    geometry: 'frontage',
    edges: roads.map((e) => e.index),
  });
  checks.push({
    id: 'frontage',
    group: 'Access',
    label: 'Public-road frontage length',
    actual: roads.length ? roads.map((e) => `E${e.index + 1}: ${fmt(e.lengthM)} m`).join(', ') : 'None',
    required: mr33Building ? '≥ 12 m on the qualifying road' : 'At least one public-road edge',
    status: roads.length === 0 ? 'UNVERIFIED' : !mr33Building ? 'PASS' : qualifying.length ? 'PASS' : 'FAIL',
    reference: mr33Building ? 'MR 33 Cl. 2' : 'Site access (user-declared)',
    sourceId: S.MR33.id,
    explanation: roads.length === 0
      ? 'No road edge is selected, so road setbacks, the 2:1 plane and access cannot be evaluated.'
      : 'Frontage is the length of each road-facing plot edge.',
    geometry: 'frontage',
    edges: roads.map((e) => e.index),
  });
  checks.push({
    id: 'fire-access',
    group: 'Access',
    label: 'Fire-engine access ring (6 m)',
    actual: mr33Building ? `${fmt(Math.min(...env.setbacks.map((s) => s.distanceM)), 1)} m clear on every side` : 'N/A',
    required: mr33Building ? '≥ 6 m clear road surface around the building' : 'N/A (not MR 33)',
    status: !mr33Building ? 'N/A' : env.setbacks.every((s) => s.distanceM >= MR33.fireRoadM - 1e-9) ? 'PASS' : 'FAIL',
    reference: 'MR 33 Cl. 3',
    sourceId: S.MR33.id,
    explanation: 'The 6 m setback ring leaves room for the required fire-engine road. Paving and turning details are not modelled.',
    geometry: 'side-setback',
  });

  // ── Classification ──
  checks.push({
    id: 'classification',
    group: 'Classification',
    label: 'High-rise / extra-large classification',
    actual: `${c.isHighRise ? 'High-rise' : 'Not high-rise'} · ${c.isExtraLarge ? 'Extra-large' : 'Not extra-large'}`,
    required: 'High-rise: H ≥ 23 m · Extra-large: ≥ 10,000 m²',
    status: 'INFO',
    reference: 'MR 33 Cl. 1',
    sourceId: S.MR33.id,
    explanation: `Envelope used: ${env.classLabel}. Both thresholds are inclusive ("ตั้งแต่"). Either one makes all MR 33 rules apply.`,
  });
  checks.push({
    id: 'eia',
    group: 'Classification',
    label: 'EIA report',
    actual: c.eia.status === 'required' ? 'Required (estimate)' : c.eia.status === 'check' ? 'Check required' : 'Likely not required (estimate)',
    required: 'Condo: ≥ 80 units or ≥ 4,000 m² usable area · Office: ≥ 23 m or ≥ 10,000 m²',
    status: 'INFO',
    reference: 'MNRE EIA notification, Items 27 and 31',
    sourceId: S.EIA.id,
    explanation: `${c.eia.reason}. The unit count is estimated (residential GFA × 0.70 ÷ 35 m²), and usable area is approximated by GFA. An EIA is a permitting step, not a design limit. Height ≥ 23 m alone does not trigger an EIA for condominiums.`,
  });
  checks.push({
    id: 'bkk-ordinance',
    group: 'Classification',
    label: 'Bangkok Building Control Ordinance 2544',
    actual: 'Not evaluated',
    required: 'Bangkok-specific building rules',
    status: 'UNVERIFIED',
    reference: 'ข้อบัญญัติกรุงเทพมหานคร เรื่อง ควบคุมอาคาร พ.ศ. ๒๕๔๔',
    sourceId: S.BKK_BCO_2544.id,
    explanation: 'The official copy is a scanned image and could not be text-verified. Any Bangkok-specific rules stricter than MR 33 / MR 55 must be checked by the architect.',
  });

  // ── Integrity (numerical invariants) ──
  let outsideAllowable = 0;
  let outsidePlot = 0;
  for (const f of floors) {
    outsideAllowable = Math.max(outsideAllowable, differenceArea(f.polygon, f.allowablePolygon));
    outsidePlot = Math.max(outsidePlot, differenceArea(f.polygon, c.plot));
  }
  checks.push({
    id: 'floors-in-envelope',
    group: 'Integrity',
    label: 'Every storey inside its allowable polygon',
    actual: `max. overhang ${outsideAllowable.toFixed(3)} m²`,
    required: `≤ ${AREA_TOL_SQM} m² (numerical tolerance)`,
    status: outsideAllowable <= AREA_TOL_SQM && outsidePlot <= AREA_TOL_SQM ? 'PASS' : 'FAIL',
    reference: 'Engine invariant',
    explanation: 'Each storey polygon is checked against its own allowable polygon (setbacks plus the 2:1 plane at its roof level) and against the plot boundary.',
    geometry: 'envelope',
  });
  const sum = floors.reduce((s, f) => s + f.areaSqm, 0);
  checks.push({
    id: 'gfa-reconciliation',
    group: 'Integrity',
    label: 'Floor areas sum to total floor area',
    actual: `Σ ${floors.length} storeys = ${fmt(sum, 2)} m²`,
    required: `= ${fmt(c.totalGFA, 2)} m²`,
    status: Math.abs(sum - c.totalGFA) <= AREA_TOL_SQM ? 'PASS' : 'FAIL',
    reference: 'Engine invariant',
    explanation: 'Total floor area is the exact sum of the floor polygon areas (MR 33 Cl. 1 "พื้นที่อาคาร": gross area inside the outer walls). It is not net sellable area.',
    geometry: 'floors',
  });

  return checks;
}

export function summarize(checks: ComplianceCheck[]): Pick<DesignResult, 'compliant' | 'failCount' | 'unverifiedCount'> {
  const failCount = checks.filter((k) => k.status === 'FAIL').length;
  const unverifiedCount = checks.filter((k) => k.status === 'UNVERIFIED').length;
  return { compliant: failCount === 0, failCount, unverifiedCount };
}
