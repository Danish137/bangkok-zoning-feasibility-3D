// ─── Bangkok Zoning & Building Feasibility Tool ───
// Shared type definitions for the engine module
// Zero DOM / framework dependencies

/** WGS84 coordinate [longitude, latitude] */
export type LngLat = [number, number];

/** 2D point in local metric space [x_meters, y_meters] from anchor */
export type MetricPoint = [number, number];

/** Polygon as array of vertices (first != last, CCW winding) */
export type Polygon = MetricPoint[];

/** Polygon in WGS84 */
export type LngLatPolygon = LngLat[];

/** Edge classification */
export type EdgeType = 'road' | 'side' | 'rear';

/** Edge definition */
export interface PlotEdge {
  index: number;        // index of start vertex in polygon
  start: MetricPoint;
  end: MetricPoint;
  type: EdgeType;
  /** Road width in meters (only relevant if type === 'road') */
  roadWidth?: number;
}

/** Building type selector */
export type BuildingType =
  | 'low-rise-condo'
  | 'high-rise-condo'
  | 'commercial-office'
  | 'mixed-use-shophouse';

/** Building type configuration */
export interface BuildingTypeConfig {
  label: string;
  floorToFloor: number;        // meters per typical floor
  groundFloorHeight?: number;  // meters, if different from typical
  maxHeightCap?: number;       // hard cap in meters (e.g. 23m for low-rise)
  useCategory: 'residential' | 'commercial';
}

export const BUILDING_TYPES: Record<BuildingType, BuildingTypeConfig> = {
  'low-rise-condo': {
    label: 'Low-Rise Condo',
    floorToFloor: 3.0,
    maxHeightCap: 23,
    useCategory: 'residential',
  },
  'high-rise-condo': {
    label: 'High-Rise Condo',
    floorToFloor: 3.0,
    useCategory: 'residential',
  },
  'commercial-office': {
    label: 'Commercial / Office',
    floorToFloor: 3.8,
    useCategory: 'commercial',
  },
  'mixed-use-shophouse': {
    label: 'Mixed-Use Shophouse',
    floorToFloor: 3.2,
    groundFloorHeight: 4.2,
    maxHeightCap: 23,
    useCategory: 'residential',  // treated as residential for OSR
  },
};

/** Official Zone Yor.9 spatial boundary polygon (WGS84 [lng, lat]) */
export const ZONE_YOR9_BOUNDARY: LngLatPolygon = [
  [100.5580, 13.7480], // NW: Asok Montri / New Phetchaburi intersection
  [100.6000, 13.7460], // NE: Khlong Saen Saep / Sukhumvit 71
  [100.6020, 13.7150], // SE: Khlong Phra Khanong / Rama IV
  [100.5620, 13.7160], // SW: Rama IV / Khlong Toei
];

/** Zone Yor.9 constants */
export const ZONE_YOR9 = {
  name: 'Yor.9 (ย.9)',
  description: 'High-Density Residential (Brown Zone)',
  maxFAR: 7.0,
  minOSRPercent: 4.5,  // percent of GFA
  center: [100.5760, 13.7308] as LngLat,
  boundary: ZONE_YOR9_BOUNDARY,
} as const;

/** Setback rule result for one edge at one floor level */
export interface EdgeSetback {
  edgeIndex: number;
  edgeType: EdgeType;
  setbackMeters: number;
  rule: string;  // statutory reference
}

/** Sky plane clip result */
export interface SkyPlaneClip {
  floorIndex: number;
  elevationM: number;
  clipDistanceFromRoad: number;
  roadEdgeIndex: number;
}

/** Single floor result */
export interface FloorResult {
  index: number;          // 0-based floor number
  elevationM: number;     // bottom of floor slab
  heightM: number;        // floor-to-floor height
  polygon: Polygon;       // the actual floor polygon after setbacks + sky plane
  areaSqm: number;        // exact area of this floor polygon
  setbacks: EdgeSetback[];
  skyPlaneClips: SkyPlaneClip[];
}

/** Compliance check result */
export interface ComplianceCheck {
  rule: string;
  label: string;
  actual: number | string;
  allowed: number | string;
  unit: string;
  pass: boolean;
  statutoryRef: string;
}

/** Full evaluation result */
export interface EvaluationResult {
  // Plot metrics
  plotAreaSqm: number;
  plotAreaRaiNganWah: string;
  frontageM: number;

  // Building envelope
  maxAllowedHeightM: number;
  maxAllowedFloors: number;
  maxAllowedGFA: number;

  // Actual design metrics
  totalGFA: number;
  actualFAR: number;
  groundCoveragePercent: number;
  openSpaceSqm: number;
  openSpacePercent: number;
  heightM: number;
  floorCount: number;
  estimatedUnits: number;

  // Floor-by-floor results
  floors: FloorResult[];

  // Compliance
  checks: ComplianceCheck[];

  // Flags
  isHighRise: boolean;
  isExtraLarge: boolean;
  eiaRequired: boolean;
  eiaReason?: string;
  roadBlocker?: string;
  btsFlag?: boolean;
  zoneCheck?: {
    inZone: boolean;
    outsideCount: number;
    message: string;
  };

  // Road info
  maxRoadWidth: number;
  maxFrontageLength: number;
  highRiseEligible: boolean;
}

/** Road right-of-way advisory */
export interface RoadAdvisory {
  type: 'centerline_intersection' | 'corridor_proximity';
  roadName: string;
  count: number;
  description: string;
  legalReference: string;
  cadastralDisclaimer: string;
}

/** Preset plot definition */
export interface PresetPlot {
  id: string;
  label: string;
  description: string;
  polygon: LngLatPolygon;
  roadEdges: number[];      // indices of road-facing edges
  roadWidth: number;
  buildingType: BuildingType;
}

/** Full input state */
export interface ZoningInput {
  polygon: Polygon;          // in metric coords
  edges: PlotEdge[];
  buildingType: BuildingType;
  roadWidths: Map<number, number>;  // edge index → road width
  polygonLngLat?: LngLatPolygon;    // WGS84 coordinates for geographic zone verification
}

/** Design variant */
export type DesignVariant = 'max-yield' | 'podium-tower' | 'sub-eia';

/** Design result */
export interface DesignResult {
  variant: DesignVariant;
  label: string;
  description: string;
  floors: FloorResult[];
  totalGFA: number;
  actualFAR: number;
  heightM: number;
  floorCount: number;
  groundCoveragePercent: number;
  openSpaceSqm: number;
  openSpacePercent: number;
  estimatedUnits: number;
  checks: ComplianceCheck[];
  eiaRequired: boolean;
  eiaReason?: string;
  limitingConstraint?: string;
  zoneCheck?: {
    inZone: boolean;
    outsideCount: number;
    message: string;
  };
}

/** Thai area conversion */
export interface ThaiArea {
  rai: number;
  ngan: number;
  wah: number;
  display: string;
}
