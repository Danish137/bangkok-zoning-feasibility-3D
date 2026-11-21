// ─── Design Generators ───
// Generates Design A (Max-Yield) and Design B (Podium-Tower or Sub-EIA)
// Pure TypeScript, no DOM deps

import type {
  Polygon, PlotEdge, BuildingType, DesignVariant, DesignResult,
  FloorResult, ComplianceCheck, ZoningInput,
} from './types';
import { BUILDING_TYPES, ZONE_YOR9 } from './types';
import { polygonArea, ensureCCW, edgeLength } from './polygon';
import { generateFloors, checkRoadEligibility, computeCompliance } from './rules';

/** Generate Design A: Maximum Yield Envelope */
export function generateDesignA(input: ZoningInput): DesignResult {
  const polygon = ensureCCW(input.polygon);
  const plotArea = polygonArea(polygon);
  const roadElig = checkRoadEligibility(input.edges, plotArea);
  
  // Design A maximizes permissible GFA up to statutory envelope and FAR limit
  const floors = generateFloors(polygon, input.edges, input.buildingType, roadElig);
  
  return buildDesignResult(
    'max-yield',
    'Design A: Max-Yield Envelope',
    'Maximizes permissible GFA within FAR 7.0, OSR, statutory setbacks, and 2:1 sky exposure plane.',
    floors, polygon, plotArea, input,
  );
}

/** Generate Design B: Podium + Slender Tower OR Sub-EIA Courtyard Block */
export function generateDesignB(input: ZoningInput): DesignResult {
  const polygon = ensureCCW(input.polygon);
  const plotArea = polygonArea(polygon);
  const config = BUILDING_TYPES[input.buildingType];
  const roadElig = checkRoadEligibility(input.edges, plotArea);

  if (roadElig.highRiseAllowed && !config.maxHeightCap) {
    // ── High-Rise Scenario: Podium + Slender Tower ──
    // Floors 0 to 2: Podium base (retail / parking / amenities)
    // Floors 3+: Slender tower inset by an extra 4m from all edges for light, ventilation, and rooftop terraces
    const targetGFA = Math.min(roadElig.maxGFA, plotArea * ZONE_YOR9.maxFAR) * 0.78;
    
    const floors = generateFloors(polygon, input.edges, input.buildingType, roadElig, {
      targetGFA,
      podiumFloors: 3,
      towerInsetMeters: 4.0, // 4m inset creates slender tower profile
    });
    
    return buildDesignResult(
      'podium-tower',
      'Design B: Podium + Slender Tower',
      'Leaves generous landscaped open space above statutory OSR. Uses a 3-storey podium with an inset slender tower for daylight, cross-ventilation, and rooftop terrace.',
      floors, polygon, plotArea, input,
    );
  } else {
    // ── Low-Rise / Narrow-Soi Scenario: Sub-EIA Courtyard Block ──
    // Keeps residential units below 80 and height <= 23m to bypass costly EIA review
    const maxUnits = 79;
    const maxUsableGFA = (maxUnits * 40) / 0.7; // ~4,514 sqm GFA cap for 79 units
    const maxHeightCap = Math.min(23, roadElig.maxHeight);
    const targetGFA = Math.min(maxUsableGFA, plotArea * ZONE_YOR9.maxFAR * 0.75);

    const floors = generateFloors(polygon, input.edges, input.buildingType, roadElig, {
      targetGFA,
      maxHeight: maxHeightCap,
      groundInsetMeters: 2.0, // extra 2m garden setback creates courtyard open space
    });

    return buildDesignResult(
      'sub-eia',
      'Design B: Sub-EIA Courtyard Block',
      'Fast-track permitting design: strictly caps estimated units at 79 and height at 23m to remain EIA-exempt. Features generous courtyard garden setbacks.',
      floors, polygon, plotArea, input,
    );
  }
}

/** Build a DesignResult from generated floors */
function buildDesignResult(
  variant: DesignVariant,
  label: string,
  description: string,
  floors: FloorResult[],
  plotPolygon: Polygon,
  plotArea: number,
  input: ZoningInput,
): DesignResult {
  const config = BUILDING_TYPES[input.buildingType];
  const totalGFA = floors.reduce((sum, f) => sum + f.areaSqm, 0);
  const actualFAR = plotArea > 0 ? totalGFA / plotArea : 0;
  const groundFloor = floors[0];
  const groundCoverage = groundFloor ? (groundFloor.areaSqm / plotArea) * 100 : 0;
  const openSpaceSqm = plotArea - (groundFloor?.areaSqm ?? 0);
  const openSpacePercent = plotArea > 0 ? (openSpaceSqm / plotArea) * 100 : 0;
  const height = floors.reduce((sum, f) => sum + f.heightM, 0);
  const estimatedUnits = Math.floor((totalGFA * 0.7) / 40);
  const isResidential = config.useCategory === 'residential';
  const eiaRequired = (isResidential && height > 23) || estimatedUnits >= 80;

  const roadElig = checkRoadEligibility(input.edges, plotArea);
  const checks = computeCompliance(plotArea, floors, input.edges, input.buildingType, roadElig);

  let limitingConstraint: string | undefined;
  if (actualFAR < ZONE_YOR9.maxFAR - 0.1) {
    if (!roadElig.highRiseAllowed) {
      limitingConstraint = `Capped at FAR ${actualFAR.toFixed(2)} vs statutory max 7.0: ${roadElig.blocker || 'Road width < 10m'} limits height to 23m (${floors.length}F max under MR 33). Boundary setbacks (2m/3m) restrict floor plate.`;
    } else if (config.maxHeightCap && config.maxHeightCap <= 23) {
      limitingConstraint = `Capped at FAR ${actualFAR.toFixed(2)} vs statutory max 7.0: Selected typology '${config.label}' enforces a 23m height cap (${floors.length} storeys).`;
    } else if (roadElig.maxGFA < plotArea * ZONE_YOR9.maxFAR) {
      limitingConstraint = `Capped at FAR ${actualFAR.toFixed(2)} vs statutory max 7.0: Road width < 18m imposes a 30,000 m² GFA cap (MR 33).`;
    } else {
      limitingConstraint = `FAR ${actualFAR.toFixed(2)} constrained by 2:1 sky exposure plane stepbacks (MR 55 Sec. 44) and statutory setbacks.`;
    }
  }

  return {
    variant,
    label,
    description,
    floors,
    totalGFA: Math.round(totalGFA * 100) / 100,
    actualFAR: Math.round(actualFAR * 100) / 100,
    heightM: Math.round(height * 10) / 10,
    floorCount: floors.length,
    groundCoveragePercent: Math.round(groundCoverage * 10) / 10,
    openSpaceSqm: Math.round(openSpaceSqm * 100) / 100,
    openSpacePercent: Math.round(openSpacePercent * 10) / 10,
    estimatedUnits,
    checks,
    eiaRequired,
    eiaReason: eiaRequired
      ? (height > 23 ? 'Residential building height > 23m' : `Estimated ${estimatedUnits} units ≥ 80 threshold`)
      : undefined,
    limitingConstraint,
  };
}

/** Generate both designs */
export function generateDesigns(input: ZoningInput): [DesignResult, DesignResult] {
  return [generateDesignA(input), generateDesignB(input)];
}
