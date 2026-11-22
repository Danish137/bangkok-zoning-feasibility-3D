// ─── Bangkok Zoning & Building Feasibility Tool ───
// Shared engine type definitions. Zero DOM / framework dependencies.

/** WGS84 coordinate [longitude, latitude] */
export type LngLat = [number, number];
/** Local metric point [x east (m), y north (m)] relative to the plot anchor */
export type MetricPoint = [number, number];
/** Simple polygon, open ring (first != last). Engine polygons are CCW. */
export type Polygon = MetricPoint[];
export type LngLatPolygon = LngLat[];

// ── Building types ──
export type BuildingType =
  | 'low-rise-condo'
  | 'high-rise-condo'
  | 'commercial-office'
  | 'mixed-use';

export type UseCategory = 'residential' | 'commercial';

export interface BuildingTypeConfig {
  label: string;
  short: string;
  description: string;
  floorToFloor: number;
  groundFloorHeight?: number;
  /** Only buildings below the MR 33 high-rise / extra-large thresholds */
  lowRiseOnly?: boolean;
  /** Use of the building for open-space / zoning purposes */
  use: 'residential' | 'office' | 'mixed';
  /** Mixed-use: number of lowest storeys designed as retail (subject to Plan Clause 16 (9)) */
  commercialPodiumFloors?: number;
}

export const BUILDING_TYPES: Record<BuildingType, BuildingTypeConfig> = {
  'low-rise-condo': {
    label: 'Low-rise condominium',
    short: 'Low-rise condo',
    description: 'Residential condominium kept below 23 m and 10,000 m², so MR 33 does not apply',
    floorToFloor: 3.0,
    lowRiseOnly: true,
    use: 'residential',
  },
  'high-rise-condo': {
    label: 'High-rise condominium',
    short: 'High-rise condo',
    description: 'Residential condominium; becomes an MR 33 high-rise / extra-large building where the road allows it',
    floorToFloor: 3.0,
    use: 'residential',
  },
  'commercial-office': {
    label: 'Office building',
    short: 'Office',
    description: 'Private office building (non-residential open-space rates; Plan Clause 16 (10) size limit)',
    floorToFloor: 3.8,
    groundFloorHeight: 4.5,
    use: 'office',
  },
  'mixed-use': {
    label: 'Mixed-use (retail podium + residential)',
    short: 'Mixed-use',
    description: 'Two retail storeys with residential above; residential open-space rates apply because the building is also residential',
    floorToFloor: 3.2,
    groundFloorHeight: 4.5,
    use: 'mixed',
    commercialPodiumFloors: 2,
  },
};

// ── Site input ──
export interface RoadEdgeInput {
  edgeIndex: number;
  /** Public road reserve width (เขตทาง) in metres */
  widthM: number;
}

export interface SiteInput {
  polygonLngLat: LngLatPolygon;
  roadEdges: RoadEdgeInput[];
  buildingType: BuildingType;
  /** User declares the plot lies within 500 m of a mass-transit station (unverified) */
  nearTransitDeclared?: boolean;
}

export type EdgeKind = 'road' | 'side' | 'rear';

export interface PlotEdge {
  index: number;
  start: MetricPoint;
  end: MetricPoint;
  lengthM: number;
  kind: EdgeKind;
  roadWidthM?: number;
}

// ── Envelope ──
/** MR-based building classes; each has its own legal envelope */
export type BuildingClass = 'low-le9' | 'low-lt23' | 'mr33';

export interface EdgeSetback {
  edgeIndex: number;
  kind: EdgeKind;
  distanceM: number;
  /** Human-readable derivation, e.g. "MR 55 Cl. 41(1): 6 m from centreline − 4 m half-road" */
  basis: string;
  reference: string;
}

export interface SkyPlane {
  edgeIndex: number;
  roadWidthM: number;
  active: boolean;
  reason: string;
}

export interface Envelope {
  buildingClass: BuildingClass;
  classLabel: string;
  setbacks: EdgeSetback[];
  /** Layer 2: buildable ground footprint after mandatory setbacks */
  buildablePolygon: Polygon;
  buildableAreaSqm: number;
  /** Area of setback-clipped pieces that were too small/disconnected and discarded */
  discardedAreaSqm: number;
  skyPlanes: SkyPlane[];
  /** Max roof-deck height for the class (null = no height limit other than FAR / sky plane) */
  maxHeightM: number | null;
  heightRule: string;
  maxGFA: number;
  gfaRule: string;
}

// ── Floors ──
export interface FloorResult {
  index: number;
  elevationM: number;
  heightM: number;
  topM: number;
  use: UseCategory;
  /** Layer 3: allowable floor polygon (buildable ∩ sky-exposure planes at this floor's top) */
  allowablePolygon: Polygon;
  allowableAreaSqm: number;
  /** Layer 4: actual designed floor polygon (⊆ allowable) */
  polygon: Polygon;
  areaSqm: number;
  /** Floor trimmed to land exactly on the FAR / size cap */
  isPartial: boolean;
  /** Which sky planes reduced this floor (edge indices) */
  skyPlaneEdges: number[];
}

// ── Compliance ──
export type CheckStatus = 'PASS' | 'FAIL' | 'UNVERIFIED' | 'INFO' | 'N/A';

export type GeometryKey =
  | 'plot'
  | 'road-setback'
  | 'side-setback'
  | 'rear-setback'
  | 'sky-plane'
  | 'height'
  | 'open-space'
  | 'envelope'
  | 'floors'
  | 'frontage';

export interface ComplianceCheck {
  id: string;
  group: 'Zoning' | 'Open space' | 'Setbacks' | 'Height & form' | 'Access' | 'Classification' | 'Integrity';
  label: string;
  actual: string;
  required: string;
  status: CheckStatus;
  reference: string;
  sourceId?: string;
  explanation: string;
  geometry?: GeometryKey;
  /** Edge indices the check relates to (for 3D highlighting) */
  edges?: number[];
}

export interface OpenSpaceRequirement {
  id: 'zoning-osr' | 'mr55-33' | 'mr33-6';
  label: string;
  basis: string;
  requiredSqm: number;
  applies: boolean;
}

export interface EiaAssessment {
  status: 'required' | 'likely-not-required' | 'check';
  reason: string;
  estimatedUnits: number;
  usableAreaProxySqm: number;
}

export type DesignVariant = 'max-yield' | 'open-space';

export interface DesignResult {
  variant: DesignVariant;
  label: string;
  objective: string;
  description: string;
  envelope: Envelope;
  floors: FloorResult[];
  totalGFA: number;
  residentialGFA: number;
  commercialGFA: number;
  far: number;
  heightM: number;
  floorCount: number;
  largestFloorSqm: number;
  footprintSqm: number;
  groundCoveragePct: number;
  openSpaceSqm: number;
  openSpacePct: number;
  /** Ground projection of the building (open space = plot − footprint) */
  footprintPolygon: Polygon;
  /** Extra uniform inset applied to the buildable area to meet open-space rules or the design objective */
  footprintInsetM: number;
  openSpaceRequirements: OpenSpaceRequirement[];
  requiredOpenSpaceSqm: number;
  permeableRequiredSqm: number;
  isHighRise: boolean;
  isExtraLarge: boolean;
  eia: EiaAssessment;
  limitingConstraints: string[];
  checks: ComplianceCheck[];
  /** True when no check FAILs (UNVERIFIED items may remain) */
  compliant: boolean;
  failCount: number;
  unverifiedCount: number;
}

export interface JurisdictionResult {
  status: 'UNVERIFIED' | 'FAIL';
  insideBangkok: boolean;
  message: string;
}

export interface RoadEligibility {
  mr33Allowed: boolean;
  /** Max total floor area allowed for an MR 33 building by road width (Clause 2) */
  mr33MaxGFA: number;
  qualifyingEdges: number[];
  reason: string;
}

export interface FeasibilityResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  input: SiteInput;
  anchor: LngLat;
  plotPolygon: Polygon;
  plotAreaSqm: number;
  plotAreaThai: string;
  edges: PlotEdge[];
  jurisdiction: JurisdictionResult;
  roadEligibility: RoadEligibility;
  maxFARGFA: number;
  designA: DesignResult | null;
  designB: DesignResult | null;
  computeMs: number;
}

export interface RoadAdvisory {
  type: 'centerline_intersection' | 'corridor_overlap';
  roadName: string;
  roadClass: string;
  estimatedHalfWidthM?: number;
  description: string;
}

export interface PresetPlot {
  id: string;
  label: string;
  description: string;
  polygon: LngLatPolygon;
  roadEdges: RoadEdgeInput[];
  buildingType: BuildingType;
}
