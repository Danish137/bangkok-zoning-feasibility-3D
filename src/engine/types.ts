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

export type UseCategory = 'residential' | 'commercial' | 'parking';

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
export type InputSource = 'user' | 'map-estimate';

export interface RoadEdgeInput {
  edgeIndex: number;
  /** Public road reserve width (เขตทาง) in metres */
  widthM: number;
  /** Where the width came from (default 'user') */
  source?: InputSource;
  /**
   * Narrowest road reserve (m) along the route from this frontage to another public road >= 10 m
   * (MR 33 Cl. 2 continuity). Unknown if omitted.
   */
  accessMinWidthM?: number;
  accessSource?: InputSource;
}

export type ParkingMode = 'podium' | 'basement';

export interface SiteInput {
  polygonLngLat: LngLatPolygon;
  roadEdges: RoadEdgeInput[];
  buildingType: BuildingType;
  /** Fallback only when no station data is available: user declares 500 m station proximity (unverified) */
  nearTransitDeclared?: boolean;
  /** Average net unit size for condominiums (m2); drives unit count, parking and EIA. Default 35 m2 */
  avgUnitSizeSqm?: number;
  /** Where required parking is placed. Default 'podium' (above-ground storeys) */
  parkingMode?: ParkingMode;
}

/** Reference data the engine can use (bundled static assets; optional) */
export interface ZoneFeature {
  zone: string;
  /** Polygons -> rings -> [lng, lat]; first ring outer, others holes */
  polygons: LngLat[][][];
  bbox: [number, number, number, number];
}
export interface StationPoint {
  name: string;
  nameEn: string;
  network: string;
  lngLat: LngLat;
}
export interface SiteData {
  zones?: ZoneFeature[];
  zoningSource?: string;
  stations?: StationPoint[];
}

export type EdgeKind = 'road' | 'side' | 'rear';

export interface PlotEdge {
  index: number;
  start: MetricPoint;
  end: MetricPoint;
  lengthM: number;
  kind: EdgeKind;
  roadWidthM?: number;
  roadSource?: InputSource;
  accessMinWidthM?: number;
  accessSource?: InputSource;
  /** False when part of the plot lies behind this edge's line (edge inside a concave notch) */
  onHull: boolean;
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
  /** Edge not on the plot's convex hull: the plane governs only the part of the plot in front of the road line */
  frontOnly: boolean;
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
  /** Stricter buildable polygon for storeys >= upperFromIndex (BMA 2544 Cl. 54: 3 m from private land from the 3rd storey) */
  upperBuildablePolygon?: Polygon;
  upperFromIndex?: number;
  /** Per-edge setback distances used for the upper polygon */
  upperSetbacks?: number[];
  /** Max roof-deck height for the class (null = no height limit other than FAR / sky plane) */
  maxHeightM: number | null;
  heightRule: string;
  maxGFA: number;
  gfaRule: string;
}

// ── Floors ──
export interface FloorResult {
  /** Storey index: 0 = ground storey; basement levels are -1, -2, ... */
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
  /** Parking spaces this storey provides (parking storeys only) */
  parkingSpaces?: number;
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
  | 'frontage'
  | 'parking'
  | 'front-space'
  | 'zone'
  | 'transit'
  | 'access-route';

export interface ComplianceCheck {
  id: string;
  group: 'Zoning' | 'Open space' | 'Setbacks' | 'Height & form' | 'Access' | 'Parking' | 'Classification' | 'Integrity';
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
  /** The result depends on map-estimated inputs (road or access width) rather than surveyed values */
  inputConfidence?: 'estimated';
}

export interface OpenSpaceRequirement {
  id: 'zoning-osr' | 'mr55-33' | 'mr33-6' | 'bco-52';
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

export interface ParkingResult {
  mode: ParkingMode;
  requiredSpaces: number;
  providedSpaces: number;
  /** Requirement derivation lines (clause + arithmetic) */
  basis: string[];
  areaPerSpaceSqm: number;
  parkingAreaSqm: number;
  parkingStoreys: number;
  basementLevels: number;
  units: number;
  avgUnitSizeSqm: number;
  isLargeBuilding: boolean;
  warnings: string[];
}

export interface FrontSpaceResult {
  applies: boolean;
  perimeterM: number;
  roadFaceM: number;
  /** Cl. 53 path: building face on the road longer than perimeter / 8 and within 20 m of the road */
  cl53Ok: boolean;
  /** Cl. 52(6) path: front open space >= requiredWidthM along >= perimeter / 6 */
  cl526Ok: boolean;
  requiredWidthM: number;
  wideFrontM: number;
  /** The footprint depth was limited by the generator to satisfy Cl. 53 */
  depthLimited: boolean;
}

export interface DesignResult {
  variant: DesignVariant;
  label: string;
  objective: string;
  description: string;
  envelope: Envelope;
  floors: FloorResult[];
  /** Basement storeys (parking), index -1, -2, ... (counted in total floor area / FAR) */
  basementFloors: FloorResult[];
  totalGFA: number;
  residentialGFA: number;
  parkingGFA: number;
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
  parking: ParkingResult;
  frontSpace: FrontSpaceResult;
  limitingConstraints: string[];
  checks: ComplianceCheck[];
  /** True when no check FAILs (UNVERIFIED items may remain) */
  compliant: boolean;
  failCount: number;
  unverifiedCount: number;
}

export interface JurisdictionResult {
  status: 'PASS' | 'UNVERIFIED' | 'FAIL';
  insideBangkok: boolean;
  message: string;
  /** Zone containing (most of) the plot, from the BMA GIS layer */
  zone?: string;
  /** Share of plot area per zone (sums to <= 1; the rest is outside any mapped zone) */
  overlaps: { zone: string; fraction: number }[];
  /** Distance from the plot to the nearest Yor.9 boundary when fully inside (m) */
  boundaryMarginM?: number;
  dataSource?: string;
}

export interface TransitResult {
  source: 'station-data' | 'declared' | 'none';
  nearest?: { name: string; nameEn: string; network: string; lngLat: LngLat; minDistanceM: number; maxDistanceM: number };
  /** Is the whole plot within 500 m ('all'), part of it ('part'), or none of it? */
  within500: 'all' | 'part' | 'none' | 'unknown';
  /** Proximity accepted for Plan Cl. 16 use conditions (conservative: whole plot within 500 m) */
  qualifies: boolean;
  message: string;
}

export interface RoadEligibility {
  /** Continuity of the >= 10 m (>= 18 m) road to another public road (MR 33 Cl. 2) */
  continuity: 'ok' | 'fail' | 'unknown';
  inputConfidence?: 'estimated';
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
  transit: TransitResult;
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
