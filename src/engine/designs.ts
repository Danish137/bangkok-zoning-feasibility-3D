// ─── Design Generators ───
// Generates Design A (Max-Yield) and Design B (Podium-Tower or Sub-EIA)
// Pure TypeScript, no DOM deps

import type {
  Polygon, PlotEdge, BuildingType, DesignVariant, DesignResult,
  FloorResult, ComplianceCheck, ZoningInput,
} from './types';
import { BUILDING_TYPES, ZONE_YOR9 } from './types';
import { polygonArea, ensureCCW, edgeLength } from './polygon';
import { sqmToRaiNganWah } from './geo';
import { generateFloors, checkRoadEligibility, computeCompliance } from './rules';

/** Generate Design A: Maximum Yield Envelope */
export function generateDesignA(input: ZoningInput): DesignResult {
  const polygon = ensureCCW(input.polygon);
  const plotArea = polygonArea(polygon);
  const roadElig = checkRoadEligibility(input.edges, plotArea);
  const floors = generateFloors(polygon, input.edges, input.buildingType, roadElig);
  
  return buildDesignResult(
    'max-yield',
    'Design A: Max-Yield Envelope',
    'Maximizes permissible GFA within FAR, OSR, setbacks, and 2:1 sky plane.',
    floors, polygon, plotArea, input,
  );
}

/** Generate Design B: Podium-Tower or Sub-EIA variant */
export function generateDesignB(input: ZoningInput): DesignResult {
  const polygon = ensureCCW(input.polygon);
  const plotArea = polygonArea(polygon);
  const config = BUILDING_TYPES[input.buildingType];
  const roadElig = checkRoadEligibility(input.edges, plotArea);

  // Decide variant based on plot/road conditions
  if (roadElig.highRiseAllowed && !config.maxHeightCap) {
    // Podium + Slender Tower
    // Use 70% of max GFA for a more generous open space design
    const targetGFA = Math.min(roadElig.maxGFA, plotArea * ZONE_YOR9.maxFAR) * 0.7;
    const floors = generateFloors(polygon, input.edges, input.buildingType, roadElig, targetGFA);
    
    return buildDesignResult(
      'podium-tower',
      'Design B: Podium + Slender Tower',
      'Leaves generous landscaped open space above minimum OSR. Uses wider podium base with inset upper tower for light and ventilation.',
      floors, polygon, plotArea, input,
    );
  } else {
    // Sub-EIA Courtyard Block: stay under 23m/80 units
    const maxUnits = 79;
    const maxUsableGFA = maxUnits * 40 / 0.7; // ~4,514 sqm
    const maxHeightCap = Math.min(23, roadElig.maxHeight);
    const cappedRoadElig = { ...roadElig, maxHeight: maxHeightCap };
    const targetGFA = Math.min(maxUsableGFA, plotArea * ZONE_YOR9.maxFAR);
    const floors = generateFloors(polygon, input.edges, input.buildingType, cappedRoadElig, targetGFA);

    return buildDesignResult(
      'sub-eia',
      'Design B: Sub-EIA Courtyard Block',
      'Stays intentionally below the 23m / 80-unit EIA threshold for faster permitting. Leaves courtyard open space.',
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
      ? (height > 23 ? 'Height > 23m (residential)' : `Estimated ${estimatedUnits} units ≥ 80`)
      : undefined,
  };
}

/** Generate both designs */
export function generateDesigns(input: ZoningInput): [DesignResult, DesignResult] {
  return [generateDesignA(input), generateDesignB(input)];
}
