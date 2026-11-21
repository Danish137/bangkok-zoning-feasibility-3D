// ─── Bangkok Yor.9 Zoning Rules Engine ───
// Pure deterministic TypeScript — zero DOM/framework deps
// Implements: Bangkok Plan B.E. 2556, MR 33, MR 55

import type {
  Polygon, MetricPoint, PlotEdge, BuildingType, BuildingTypeConfig,
  EdgeSetback, SkyPlaneClip, FloorResult, ComplianceCheck, EvaluationResult,
  ZoningInput, LngLatPolygon,
} from './types';
import { BUILDING_TYPES, ZONE_YOR9 } from './types';
import { sqmToRaiNganWah } from './geo';
import {
  polygonArea, ensureCCW, edgeLength, perEdgeInwardOffset, clipByHalfPlane,
  edgeInwardNormal, polygonCentroid, isPlotInZoneYor9,
} from './polygon';

// ─── Setback Computation ───

export interface SetbackConfig {
  isHighRise: boolean;      // height > 23m
  isExtraLarge: boolean;    // GFA >= 10,000 sqm
  floorElevation: number;   // bottom of floor in meters
}

/** Compute setback distance for a single edge at a given floor elevation */
export function computeEdgeSetback(
  edge: PlotEdge,
  config: SetbackConfig
): EdgeSetback {
  const { isHighRise, isExtraLarge, floorElevation } = config;

  // High-rise or extra-large: 6m all edges (MR 33)
  if (isHighRise || isExtraLarge) {
    return {
      edgeIndex: edge.index,
      edgeType: edge.type,
      setbackMeters: 6,
      rule: 'MR 33: High-rise/Extra-large 6m setback all edges',
    };
  }

  // Standard building (≤23m, <10,000 sqm)
  if (edge.type === 'road') {
    const rw = edge.roadWidth ?? 10;
    let setback: number;
    let rule: string;

    if (rw >= 20) {
      setback = 2;
      rule = `MR 55: Road >20m, setback 2m`;
    } else if (rw >= 10) {
      setback = Math.max(rw / 10, 2);
      rule = `MR 55: Road ${rw}m, setback max(${rw}/10, 2) = ${setback.toFixed(1)}m`;
    } else {
      // Road < 10m: 2:1 distance rule from opposite road line, min 2m
      // Distance from building to opposite side of road = setback + roadWidth
      // Must be >= H/2 (handled by sky plane), but minimum setback = 2m
      setback = Math.max(2, rw / 10);
      rule = `MR 55: Narrow road ${rw}m, min 2m setback + 2:1 sky plane`;
    }

    return { edgeIndex: edge.index, edgeType: 'road', setbackMeters: setback, rule };
  }

  // Side/rear edges (MR 55, walls with openings)
  if (floorElevation < 9) {
    return {
      edgeIndex: edge.index,
      edgeType: edge.type,
      setbackMeters: 2,
      rule: 'MR 55: Side/rear ≤9m height, 2m setback',
    };
  } else {
    return {
      edgeIndex: edge.index,
      edgeType: edge.type,
      setbackMeters: 3,
      rule: 'MR 55: Side/rear 9-23m height, 3m setback',
    };
  }
}

// ─── Sky Exposure Plane (2:1) ───

/** 
 * Apply 2:1 sky exposure plane clipping for a floor at given elevation.
 * Under MR 55 Section 44:
 * The building must not exceed a 2:1 slope drawn from the opposite road boundary.
 * Horizontal distance from opposite road line to building face >= H / 2.
 * Since opposite road line is at distance `roadWidth` from plot boundary:
 * Required horizontal setback from plot road edge = (H / 2) - roadWidth.
 * If this required setback is greater than 0, upper floors must step back.
 * Returns the clipped floor polygon.
 */
export function applySkyPlane(
  floorPolygon: Polygon,
  plotPolygon: Polygon,
  edges: PlotEdge[],
  elevationM: number
): { polygon: Polygon; clips: SkyPlaneClip[] } {
  let currentPoly = floorPolygon;
  const clips: SkyPlaneClip[] = [];

  for (const edge of edges) {
    if (edge.type !== 'road') continue;
    const rw = edge.roadWidth ?? 10;
    
    // MR 55 Section 44:
    // Required horizontal setback from plot road edge = (H / 2) - roadWidth
    const clipFromRoadEdge = (elevationM / 2) - rw;
    
    // If the required setback from road edge is <= 0, the road setback already complies
    if (clipFromRoadEdge <= 0) continue;

    const p1 = plotPolygon[edge.index]!;
    const p2 = plotPolygon[(edge.index + 1) % plotPolygon.length]!;
    const [nx, ny] = edgeInwardNormal(p1, p2);

    // Offset the plot's road edge inward by clipFromRoadEdge
    const offsetP1: MetricPoint = [p1[0] + nx * clipFromRoadEdge, p1[1] + ny * clipFromRoadEdge];
    const offsetP2: MetricPoint = [p2[0] + nx * clipFromRoadEdge, p2[1] + ny * clipFromRoadEdge];

    const clipped = clipByHalfPlane(currentPoly, offsetP1, offsetP2, [nx, ny]);
    if (clipped.length > 0 && clipped[0]!.length >= 3) {
      currentPoly = clipped[0]!;
      clips.push({
        floorIndex: -1, // filled in by caller
        elevationM,
        clipDistanceFromRoad: clipFromRoadEdge,
        roadEdgeIndex: edge.index,
      });
    } else {
      // Floor is completely clipped away by sky exposure plane
      return { polygon: [], clips };
    }
  }

  return { polygon: currentPoly, clips };
}

// ─── Road Eligibility ───

export interface RoadEligibility {
  highRiseAllowed: boolean;
  maxHeight: number;
  maxGFA: number;
  blocker?: string;
}

export function checkRoadEligibility(edges: PlotEdge[], plotArea: number): RoadEligibility {
  // Find widest road and longest frontage
  let maxRoadWidth = 0;
  let maxFrontageLength = 0;

  for (const edge of edges) {
    if (edge.type !== 'road') continue;
    const rw = edge.roadWidth ?? 0;
    const len = edgeLength(edge.start, edge.end);
    if (rw > maxRoadWidth) maxRoadWidth = rw;
    if (len > maxFrontageLength) maxFrontageLength = len;
  }

  if (maxRoadWidth === 0) {
    return {
      highRiseAllowed: false,
      maxHeight: 23,
      maxGFA: Math.min(10000, plotArea * ZONE_YOR9.maxFAR),
      blocker: 'No road-facing edge defined',
    };
  }

  if (maxRoadWidth < 10) {
    return {
      highRiseAllowed: false,
      maxHeight: 23,
      maxGFA: Math.min(9999, plotArea * ZONE_YOR9.maxFAR),
      blocker: `Road width ${maxRoadWidth}m < 10m required for high-rise (MR 33)`,
    };
  }

  if (maxFrontageLength < 12) {
    return {
      highRiseAllowed: false,
      maxHeight: 23,
      maxGFA: Math.min(9999, plotArea * ZONE_YOR9.maxFAR),
      blocker: `Frontage ${maxFrontageLength.toFixed(1)}m < 12m required for high-rise (MR 33)`,
    };
  }

  // High-rise allowed
  const maxGFA = maxRoadWidth >= 18
    ? plotArea * ZONE_YOR9.maxFAR   // no GFA cap beyond FAR
    : Math.min(29999, plotArea * ZONE_YOR9.maxFAR); // < 18m road: GFA < 30,000

  return {
    highRiseAllowed: true,
    maxHeight: Infinity,
    maxGFA,
  };
}

// ─── Floor Generation ───

export interface GenerateFloorsOptions {
  targetGFA?: number; // optional GFA cap
  maxHeight?: number; // optional height override
  podiumFloors?: number; // number of podium floors before tower inset
  towerInsetMeters?: number; // additional inset on tower floors
  groundInsetMeters?: number; // additional inset on all floors (e.g. courtyard)
}

export function generateFloors(
  plotPolygon: Polygon,
  edges: PlotEdge[],
  buildingType: BuildingType,
  roadEligibility: RoadEligibility,
  options?: GenerateFloorsOptions | number, // supports number for backward compat
): FloorResult[] {
  const opts: GenerateFloorsOptions = typeof options === 'number' ? { targetGFA: options } : (options ?? {});
  const config = BUILDING_TYPES[buildingType];
  const plotArea = polygonArea(plotPolygon);
  const maxFAR_GFA = plotArea * ZONE_YOR9.maxFAR;
  const maxGFA = opts.targetGFA ?? Math.min(roadEligibility.maxGFA, maxFAR_GFA);
  const effectiveMaxHeight = opts.maxHeight ?? (config.maxHeightCap
    ? Math.min(config.maxHeightCap, roadEligibility.maxHeight)
    : roadEligibility.maxHeight);

  const floors: FloorResult[] = [];
  let cumulativeGFA = 0;
  let floorIndex = 0;

  while (true) {
    const floorHeight = floorIndex === 0 && config.groundFloorHeight
      ? config.groundFloorHeight
      : config.floorToFloor;
    const elevation = floors.reduce((sum, f) => sum + f.heightM, 0);
    const topOfFloor = elevation + floorHeight;

    // Height limit check
    if (topOfFloor > effectiveMaxHeight) break;

    // Determine if this floor level makes the building high-rise
    const willBeHighRise = topOfFloor > 23;
    if (willBeHighRise && !roadEligibility.highRiseAllowed) break;

    // Compute setbacks for this floor
    const isHighRise = willBeHighRise;
    const isExtraLarge = cumulativeGFA >= 10000;

    // Check if this floor is a tower floor in a podium-tower design
    const isTowerFloor = opts.podiumFloors !== undefined && floorIndex >= opts.podiumFloors;
    const extraInset = (opts.groundInsetMeters ?? 0) + (isTowerFloor ? (opts.towerInsetMeters ?? 0) : 0);

    const setbackDistances = edges.map((edge) => {
      const sb = computeEdgeSetback(edge, {
        isHighRise: isHighRise || isExtraLarge,
        isExtraLarge,
        floorElevation: elevation,
      });
      return sb.setbackMeters + extraInset;
    });

    const setbacks = edges.map((edge) =>
      computeEdgeSetback(edge, {
        isHighRise: isHighRise || isExtraLarge,
        isExtraLarge,
        floorElevation: elevation,
      })
    );

    // Apply per-edge setbacks
    const offsetPolygons = perEdgeInwardOffset(plotPolygon, setbackDistances);
    if (offsetPolygons.length === 0) break;

    let floorPoly = offsetPolygons[0]!;

    // Apply 2:1 sky exposure plane
    const { polygon: clippedPoly, clips } = applySkyPlane(
      floorPoly, plotPolygon, edges, topOfFloor
    );

    if (clippedPoly.length < 3) break;
    floorPoly = clippedPoly;

    const floorArea = polygonArea(floorPoly);
    if (floorArea < 1) break; // too small to be useful

    // GFA cap check
    if (cumulativeGFA + floorArea > maxGFA) break;

    floors.push({
      index: floorIndex,
      elevationM: elevation,
      heightM: floorHeight,
      polygon: floorPoly,
      areaSqm: floorArea,
      setbacks,
      skyPlaneClips: clips.map((c) => ({ ...c, floorIndex })),
    });

    cumulativeGFA += floorArea;
    floorIndex++;

    // Safety: max 100 floors
    if (floorIndex >= 100) break;
  }

  return floors;
}

// ─── Compliance Checks ───

export function computeCompliance(
  plotArea: number,
  floors: FloorResult[],
  edges: PlotEdge[],
  buildingType: BuildingType,
  roadEligibility: RoadEligibility,
  polygonLngLat?: LngLatPolygon,
): ComplianceCheck[] {
  const config = BUILDING_TYPES[buildingType];
  const totalGFA = floors.reduce((sum, f) => sum + f.areaSqm, 0);
  const actualFAR = plotArea > 0 ? totalGFA / plotArea : 0;
  const groundFloor = floors[0];
  const groundCoverage = groundFloor ? groundFloor.areaSqm / plotArea : 0;
  const openSpaceSqm = plotArea - (groundFloor?.areaSqm ?? 0);
  const openSpacePercent = (openSpaceSqm / plotArea) * 100;
  const height = floors.reduce((sum, f) => sum + f.heightM, 0);
  const isResidential = config.useCategory === 'residential';

  // Zoning OSR: 4.5% of GFA
  const zoningOSR = 0.045 * totalGFA;
  // BCA MR 55: 30% of plot (residential) or 10% (commercial)
  const bcaOpenSpace = isResidential ? 0.30 * plotArea : 0.10 * plotArea;

  // Find max road width and frontage
  let maxRoadWidth = 0;
  let maxFrontage = 0;
  for (const edge of edges) {
    if (edge.type !== 'road') continue;
    maxRoadWidth = Math.max(maxRoadWidth, edge.roadWidth ?? 0);
    maxFrontage = Math.max(maxFrontage, edgeLength(edge.start, edge.end));
  }

  const estimatedUnits = Math.floor((totalGFA * 0.7) / 40);
  const eiaByHeight = height > 23 && isResidential;
  const eiaByUnits = estimatedUnits >= 80;

  // Road setback check
  const isHighRise = height > 23 || totalGFA >= 10000;
  const minRequiredRoadSetback = isHighRise ? 6 : (maxRoadWidth >= 20 ? 2 : Math.max(2, maxRoadWidth / 10));

  const zoneCheck = isPlotInZoneYor9(polygonLngLat);

  const checks: ComplianceCheck[] = [];

  // 0. Zoning Jurisdiction Check (if coordinates provided)
  if (polygonLngLat && polygonLngLat.length > 0) {
    checks.push({
      rule: 'zoning-boundary',
      label: 'Zone Yor.9 Jurisdiction',
      actual: zoneCheck.inZone ? 'Verified In Zone' : `${zoneCheck.outsideCount} vertex outside`,
      allowed: 'Inside Zone Yor.9',
      unit: '',
      pass: zoneCheck.inZone,
      statutoryRef: 'Bangkok Comprehensive Plan B.E. 2556 (Zone Yor.9)',
    });
  }

  checks.push(
    {
      rule: 'far',
      label: 'Floor Area Ratio (FAR)',
      actual: Math.round(actualFAR * 100) / 100,
      allowed: ZONE_YOR9.maxFAR,
      unit: '',
      pass: actualFAR <= ZONE_YOR9.maxFAR + 0.01,
      statutoryRef: 'Bangkok Plan B.E. 2556, Zone Yor.9',
    },
    {
      rule: 'osr',
      label: 'Open Space (Zoning OSR)',
      actual: Math.round(openSpaceSqm * 10) / 10,
      allowed: Math.round(zoningOSR * 10) / 10,
      unit: 'sqm',
      pass: openSpaceSqm >= zoningOSR - 0.1,
      statutoryRef: 'Bangkok Plan B.E. 2556, Zone Yor.9 (4.5% of GFA)',
    },
    {
      rule: 'bca-open-space',
      label: `BCA Open Space (${isResidential ? '30%' : '10%'} of plot)`,
      actual: Math.round(openSpacePercent * 10) / 10,
      allowed: isResidential ? 30 : 10,
      unit: '%',
      pass: openSpacePercent >= (isResidential ? 30 : 10) - 0.1,
      statutoryRef: 'MR 55 Clause 33 (Open Space Ratio)',
    },
    {
      rule: 'height',
      label: 'Building Height Limit',
      actual: Math.round(height * 10) / 10,
      allowed: roadEligibility.maxHeight === Infinity ? 'No limit' : roadEligibility.maxHeight,
      unit: 'm',
      pass: height <= roadEligibility.maxHeight + 0.1,
      statutoryRef: height > 23 ? 'MR 33 (Road & Frontage)' : 'MR 55 / Building Type Cap',
    },
    {
      rule: 'road-setback',
      label: 'Road Frontage Setback',
      actual: isHighRise ? '≥ 6m' : `≥ ${minRequiredRoadSetback}m`,
      allowed: isHighRise ? '6.0m (MR 33)' : `${minRequiredRoadSetback}m (MR 55)`,
      unit: '',
      pass: true,
      statutoryRef: isHighRise ? 'MR 33: 6m fire access' : 'MR 55 Clause 41 (Road Setbacks)',
    },
    {
      rule: 'side-rear-setback',
      label: 'Side & Rear Setbacks',
      actual: isHighRise ? '≥ 6m' : (height > 9 ? '≥ 3m' : '≥ 2m'),
      allowed: isHighRise ? '6.0m (MR 33)' : (height > 9 ? '3.0m' : '2.0m'),
      unit: '',
      pass: true,
      statutoryRef: isHighRise ? 'MR 33: 6m all edges' : 'MR 55 Clause 50 (Side/Rear Setbacks)',
    },
    {
      rule: 'sky-plane',
      label: '2:1 Sky Exposure Plane',
      actual: 'Compliant',
      allowed: '1:2 Slope',
      unit: '',
      pass: true,
      statutoryRef: 'MR 55 Clause 44 (2:1 Sky Exposure Plane)',
    },
    {
      rule: 'road-width',
      label: 'Road Width Eligibility',
      actual: `${maxRoadWidth}m`,
      allowed: height > 23 ? '≥ 10m' : 'Any',
      unit: '',
      pass: height <= 23 || maxRoadWidth >= 10,
      statutoryRef: 'MR 33: High-rise requires road >= 10m',
    },
    {
      rule: 'frontage',
      label: 'Road Frontage Eligibility',
      actual: `${Math.round(maxFrontage * 10) / 10}m`,
      allowed: height > 23 ? '≥ 12m' : 'Any',
      unit: '',
      pass: height <= 23 || maxFrontage >= 12,
      statutoryRef: 'MR 33: High-rise requires frontage >= 12m',
    },
    {
      rule: 'eia',
      label: 'EIA Approval Status',
      actual: eiaByHeight || eiaByUnits ? 'Required' : 'Exempt',
      allowed: 'Info',
      unit: '',
      pass: true, // informational flag
      statutoryRef: 'NEB EIA Notification (Height > 23m or Units >= 80)',
    },
  );

  return checks;
}

// ─── Full Evaluation ───

export function evaluate(input: ZoningInput): EvaluationResult {
  const polygon = ensureCCW(input.polygon);
  const plotArea = polygonArea(polygon);
  const config = BUILDING_TYPES[input.buildingType];
  
  const roadElig = checkRoadEligibility(input.edges, plotArea);
  const floors = generateFloors(polygon, input.edges, input.buildingType, roadElig);

  const totalGFA = floors.reduce((sum, f) => sum + f.areaSqm, 0);
  const actualFAR = plotArea > 0 ? totalGFA / plotArea : 0;
  const groundFloor = floors[0];
  const groundCoverage = groundFloor ? (groundFloor.areaSqm / plotArea) * 100 : 0;
  const openSpaceSqm = plotArea - (groundFloor?.areaSqm ?? 0);
  const openSpacePercent = plotArea > 0 ? (openSpaceSqm / plotArea) * 100 : 0;
  const height = floors.reduce((sum, f) => sum + f.heightM, 0);
  const estimatedUnits = Math.floor((totalGFA * 0.7) / 40);
  const isHighRise = height > 23;
  const isExtraLarge = totalGFA >= 10000;
  const isResidential = config.useCategory === 'residential';
  const eiaRequired = (isResidential && isHighRise) || estimatedUnits >= 80;

  // Frontage
  let maxRoadWidth = 0;
  let maxFrontageLength = 0;
  for (const edge of input.edges) {
    if (edge.type !== 'road') continue;
    maxRoadWidth = Math.max(maxRoadWidth, edge.roadWidth ?? 0);
    maxFrontageLength = Math.max(maxFrontageLength, edgeLength(edge.start, edge.end));
  }

  const zoneCheck = isPlotInZoneYor9(input.polygonLngLat);
  const checks = computeCompliance(plotArea, floors, input.edges, input.buildingType, roadElig, input.polygonLngLat);
  const plotRaiNganWah = sqmToRaiNganWah(plotArea);

  return {
    plotAreaSqm: Math.round(plotArea * 100) / 100,
    plotAreaRaiNganWah: plotRaiNganWah.display,
    frontageM: Math.round(maxFrontageLength * 100) / 100,

    maxAllowedHeightM: roadElig.maxHeight === Infinity ? 999 : roadElig.maxHeight,
    maxAllowedFloors: Math.floor((roadElig.maxHeight === Infinity ? 999 : roadElig.maxHeight) / config.floorToFloor),
    maxAllowedGFA: Math.round(roadElig.maxGFA * 100) / 100,

    totalGFA: Math.round(totalGFA * 100) / 100,
    actualFAR: Math.round(actualFAR * 100) / 100,
    groundCoveragePercent: Math.round(groundCoverage * 10) / 10,
    openSpaceSqm: Math.round(openSpaceSqm * 100) / 100,
    openSpacePercent: Math.round(openSpacePercent * 10) / 10,
    heightM: Math.round(height * 10) / 10,
    floorCount: floors.length,
    estimatedUnits,

    floors,
    checks,

    isHighRise,
    isExtraLarge,
    eiaRequired,
    eiaReason: eiaRequired
      ? (isHighRise ? 'Height > 23m (residential)' : `Estimated ${estimatedUnits} units ≥ 80`)
      : undefined,
    roadBlocker: roadElig.blocker,
    btsFlag: config.useCategory === 'commercial',
    zoneCheck: input.polygonLngLat ? {
      inZone: zoneCheck.inZone,
      outsideCount: zoneCheck.outsideCount,
      message: zoneCheck.message,
    } : undefined,

    maxRoadWidth,
    maxFrontageLength,
    highRiseEligible: roadElig.highRiseAllowed,
  };
}
