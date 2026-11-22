// ─── Regulatory constants & sources (single source of truth) ───
// Every number used by the rules engine lives here, next to the clause it
// comes from. Wording was read from the primary Thai texts listed in SOURCES
// (see docs/regulatory-research.md for the quoted clauses and verification notes).

export interface LegalSource {
  id: string;
  title: string;
  titleTh: string;
  gazette?: string;
  effective?: string;
  url: string;
  /** How the text was verified for this project */
  verification: string;
}

export const SOURCES = {
  BKK_PLAN_2556: {
    id: 'BKK_PLAN_2556',
    title: 'Ministerial Regulation enforcing the Bangkok Comprehensive Plan B.E. 2556 (2013)',
    titleTh: 'กฎกระทรวงให้ใช้บังคับผังเมืองรวมกรุงเทพมหานคร พ.ศ. ๒๕๕๖',
    gazette: 'Royal Gazette Vol. 130, Part 41 Kor, 16 May 2013',
    effective: '16 May 2013 (still operative: the 4th revision was in its 90-day posting until 9 Nov 2026 and has not been promulgated)',
    url: 'https://download.asa.or.th/03media/04law/cpa/mr56-bma.pdf',
    verification: 'Clause 4 definitions and Clause 16 (ย.9) read from the Royal Gazette text (ASA mirror).',
  },
  MR55: {
    id: 'MR55',
    title: 'Ministerial Regulation No. 55 B.E. 2543 (2000) under the Building Control Act',
    titleTh: 'กฎกระทรวง ฉบับที่ ๕๕ (พ.ศ. ๒๕๔๓)',
    effective: '2000 (Clause 48 amended by MR No. 61 B.E. 2550; clauses used here unamended)',
    url: 'https://data.yotathai.org/legacy/uploads/2/8/0/3/28039899/%E0%B8%81%E0%B8%8E%E0%B8%81%E0%B8%A3%E0%B8%B0%E0%B8%97%E0%B8%A3%E0%B8%A7%E0%B8%87%E0%B8%89%E0%B8%9A%E0%B8%B1%E0%B8%9A%E0%B8%97%E0%B8%B5%E0%B9%88_55.pdf',
    verification: 'Clauses 1, 33, 41, 44, 45, 46, 50 read from the Office of the Council of State (Krisdika) consolidated text, via the yotathai.com mirror (the Krisdika server failed TLS verification).',
  },
  MR33: {
    id: 'MR33',
    title: 'Ministerial Regulation No. 33 B.E. 2535 (1992), consolidated to amendment No. 69 B.E. 2564',
    titleTh: 'กฎกระทรวง ฉบับที่ ๓๓ (พ.ศ. ๒๕๓๕) แก้ไขโดยฉบับที่ ๔๒, ๕๐, ๖๙',
    effective: '1992; Clauses 2–6 as amended by MR No. 50 B.E. 2540 (1997)',
    url: 'https://download.asa.or.th/03media/04law/cba/mr/mr35-33-upd69.pdf',
    verification: 'Clauses 1–6 read from the ASA consolidated text.',
  },
  EIA: {
    id: 'EIA',
    title: 'MNRE Notification on projects requiring an EIA report (residential & building items)',
    titleTh: 'ประกาศกระทรวงทรัพยากรธรรมชาติและสิ่งแวดล้อม เรื่อง กำหนดประเภทและขนาดของโครงการ ... (พ.ศ. ๒๕๖๑), consolidated by the 2566 notification',
    effective: '2018 notification (items 27, 31) read; the 20 Dec 2023 consolidated notification has been in force since 6 Jan 2024',
    url: 'https://www.onep.go.th/wp-content/uploads/2024/01/2567-01-05-p240-mnre-announcement.pdf',
    verification: 'Items 27 and 31 read from the 2018 annex (copy at rsdi.kku.ac.th/wp-content/uploads/2021/08/07_notification.pdf). The in-force 2023 consolidated notification (linked) could not be text-extracted because of its font encoding, so carry-over of these thresholds is assumed, not verified.',
  },
  BKK_BCO_2544: {
    id: 'BKK_BCO_2544',
    title: 'Bangkok Building Control Ordinance B.E. 2544 (2001)',
    titleTh: 'ข้อบัญญัติกรุงเทพมหานคร เรื่อง ควบคุมอาคาร พ.ศ. ๒๕๔๔',
    url: 'https://download.asa.or.th/03media/04law/cba/bb/bb44-03.pdf',
    verification: 'Clauses 49–55 (building lines, open space, distances) and 83–90 (parking) read from the ASA text-layer copy. The official BMC copy (bmc.go.th/wp-content/uploads/2020/05/169.pdf) is a scanned image. The ASA copy shows no amendments to the ordinance; later amendments, if any, are not verified.',
  },
  MR7: {
    id: 'MR7',
    title: 'Ministerial Regulation No. 7 B.E. 2517 (1974) on parking, as amended by No. 41 (1994) and No. 64 (2012)',
    titleTh: 'กฎกระทรวง ฉบับที่ ๗ (พ.ศ. ๒๕๑๗) แก้ไขโดยฉบับที่ ๔๑ และ ๖๔',
    url: 'https://download.asa.or.th/03media/04law/cba/mr/mr17-07-upd64.pdf',
    verification: 'Clause 3(1) (Bangkok rates) read from the ASA consolidated text; rates for condominiums, offices and large buildings equal BMA 2544 Cl. 84.',
  },
  BMA_ZONING_GIS: {
    id: 'BMA_ZONING_GIS',
    title: 'BMA City Planning Dept. GIS layer "ผังเมืองรวม 2556" (ArcGIS service DOL/LupDolWms, layer 1)',
    titleTh: 'ชั้นข้อมูลผังเมืองรวมกรุงเทพมหานคร พ.ศ. ๒๕๕๖ (สำนักการวางผังและพัฒนาเมือง)',
    url: 'http://3d-cpd.bangkok.go.th/ArcGIS/rest/services/DOL/LupDolWms/MapServer/1',
    verification: 'Bundled as public/data/bkk-zoning-2556.geojson from a converted export of this service (github.com/Kanesuan/KNS.MAP). Per-zone polygon counts match the Gazette for 20 zones, incl. ย.9 = 30 areas. The service is geo-blocked from here; scripts/ingest/bma-zoning.mjs re-ingests it directly where reachable.',
  },
  OSM_STATIONS: {
    id: 'OSM_STATIONS',
    title: 'OpenStreetMap mass-transit stations (BTS, MRT, ARL, SRT Red, Gold, monorails)',
    titleTh: 'ตำแหน่งสถานีรถไฟฟ้าขนส่งมวลชน (OpenStreetMap)',
    url: 'https://www.openstreetmap.org/copyright',
    verification: 'public/data/bkk-rail-stations.geojson, extracted with scripts/ingest/osm-stations.mjs. © OpenStreetMap contributors, ODbL 1.0. Station points are indicative (±30 m).',
  },
} satisfies Record<string, LegalSource>;

export type SourceId = keyof typeof SOURCES;

// ── Bangkok Comprehensive Plan B.E. 2556, Clause 16 (ที่ดินประเภท ย.๙) ──
export const YOR9 = {
  code: 'ย.9',
  name: 'Yor.9 — High-density residential (brown)',
  /** Clause 16 para 2 (1): "อัตราส่วนพื้นที่อาคารรวมต่อพื้นที่ดินไม่เกิน ๗ : ๑" */
  maxFAR: 7,
  /** Clause 16 para 2 (2): OSR "ไม่น้อยกว่าร้อยละสี่จุดห้า" of total floor area */
  minOSRFractionOfGFA: 0.045,
  /** Clause 16 para 2 (2): permeable planted area "ไม่น้อยกว่าร้อยละห้าสิบของพื้นที่ว่าง" */
  minPermeableFractionOfOSR: 0.5,
  /** Clause 16 para 1 (9): commerce > 5,000 m² needs road ≥ 12 m or 500 m of a station; > 10,000 m² needs ≥ 16 m */
  commerce: { tier1AreaSqm: 5000, tier1RoadM: 12, tier2AreaSqm: 10000, tier2RoadM: 16 },
  /** Clause 16 para 1 (10): office > 10,000 m² needs road ≥ 16 m or 500 m of a station */
  office: { maxAreaSqm: 10000, roadM: 16 },
  transitRadiusM: 500,
  clauseRef: 'Bangkok Plan B.E. 2556, Clause 16',
} as const;

// ── MR 33 (high-rise & extra-large buildings) ──
export const MR33 = {
  /** Clause 1: "ความสูงตั้งแต่ 23.00 เมตรขึ้นไป" measured ground → roof deck (inclusive) */
  highRiseHeightM: 23,
  /** Clause 1: total floor area of all floors, or any one floor, "ตั้งแต่ 10,000 ตารางเมตรขึ้นไป" (inclusive) */
  extraLargeAreaSqm: 10000,
  /** Clause 2: one side ≥ 12 m abutting a public road with reserve ≥ 10 m (≤ 30,000 m²) / ≥ 18 m (> 30,000 m²) */
  minFrontageM: 12,
  minRoadWidthM: 10,
  largeAreaSqm: 30000,
  minRoadWidthLargeM: 18,
  /** Clause 3: ≥ 6 m clear fire-engine road around the building */
  fireRoadM: 6,
  /** Clause 4: outermost part ≥ 6 m from neighbouring land or public road */
  boundarySetbackM: 6,
  /** Clause 5: FAR ≤ 10:1 */
  maxFAR: 10,
  /** Clause 6: open space ≥ 30 % (residential) / 10 % (non-residential) of the plot area */
  openSpaceResidential: 0.3,
  openSpaceNonResidential: 0.1,
} as const;

// ── MR 55 (general buildings) ──
export const MR55 = {
  /** Clause 33: open space ≥ 30/100 (residential) or 10/100 (other) of the largest floor area */
  openSpaceResidential: 0.3,
  openSpaceNonResidential: 0.1,
  /** Clause 41 para 1: road < 6 m → building line ≥ 3 m from road centreline (all buildings) */
  narrowRoadM: 6,
  narrowRoadCentrelineM: 3,
  /** Clause 41 para 2: buildings > 2 storeys or > 8 m, condos, commercial … */
  clause41TallStoreys: 2,
  clause41TallHeightM: 8,
  /** (1) road < 10 m → ≥ 6 m from centreline; (2) 10–20 m → ≥ 1/10 of width from road line; (3) > 20 m → ≥ 2 m */
  roadTier1MaxM: 10,
  roadTier1CentrelineM: 6,
  roadTier2MaxM: 20,
  roadTier2Fraction: 0.1,
  roadTier3SetbackM: 2,
  /** Clause 44: height at any point ≤ 2 × horizontal distance to the opposite road boundary */
  skyPlaneRatio: 2,
  /** Clauses 45/46: two-road relief applies within 60 m */
  multiRoadReliefM: 60,
  /** Clause 50: walls with openings ≥ 2 m (height ≤ 9 m) / ≥ 3 m (9 m < height < 23 m) from the property line */
  openingSetbackLowM: 2,
  openingSetbackLowMaxHeightM: 9,
  openingSetbackMidM: 3,
} as const;

// ── EIA (MNRE notification, 2018 annex) ──
export const EIA = {
  /** Item 31 condo / Item 30 hotel: ≥ 80 rooms or usable area ≥ 4,000 m² (inclusive "ตั้งแต่") */
  residentialUnits: 80,
  residentialUsableAreaSqm: 4000,
  /** Item 27.2 retail / 27.3 private office buildings: height ≥ 23 m or floor area ≥ 10,000 m² */
  officeHeightM: 23,
  officeAreaSqm: 10000,
} as const;

/** Explicit modelling assumptions (shown in the report) */
// ── Bangkok Building Control Ordinance B.E. 2544 ──
export const BMA2544 = {
  /** Cl. 52(1)/(2): open space ≥ 30 % (residential) / 10 % (other; residential use → 30 %) of the LAND area */
  openSpaceResidential: 0.3,
  openSpaceNonResidential: 0.1,
  /** Cl. 52(6): buildings > 2 storeys or > 8 m (and commercial): front open space ≥ 6 m wide; > 3 storeys ≥ 12 m,
   *  contiguous length ≥ 1/6 of the building's external perimeter */
  frontSpaceLowM: 6,
  frontSpaceHighM: 12,
  frontSpaceHighFromStoreys: 4,
  frontSpacePerimeterFraction: 1 / 6,
  /** Cl. 53: exempt from 52(6) if the face on the public road is > 1/8 of the perimeter and ≤ 20 m from the road */
  roadFacePerimeterFraction: 1 / 8,
  roadFaceMaxDistanceM: 20,
  /** Cl. 54: openings ≥ 2 m from private land up to the 2nd storey / 9 m; ≥ 3 m from the 3rd storey or above 9 m */
  openingLowM: 2,
  openingUpperM: 3,
  openingUpperFromStoreyIndex: 2,
  /** Cl. 55: ≥ 1 m clear around buildings ≤ 15 m; ≥ 2 m above 15 m */
  aroundLowM: 1,
  aroundHighM: 2,
  aroundThresholdM: 15,
  /** Cl. 51: corner splay 4 m at corners of public roads 3–8 m wide with an angle < 135° */
  splayM: 4,
  splayRoadMinM: 3,
  splayRoadMaxM: 8,
  splayMaxAngleDeg: 135,
  /** Definition (101) "อาคารขนาดใหญ่": floor area > 2,000 m², or height ≥ 15 m and floor area > 1,000 m² */
  largeBuildingAreaSqm: 2000,
  largeBuildingHeightM: 15,
  largeBuildingAreaIfTallSqm: 1000,
  /** Cl. 90: ≥ 15 parking spaces → access must connect to a public road ≥ 6 m wide */
  parkingAccessSpaces: 15,
  parkingAccessRoadM: 6,
} as const;

// ── Parking: BMA 2544 Cl. 83–88 and MR 7 Cl. 3(1) (identical Bangkok rates for these uses) ──
export const PARKING = {
  /** Cl. 83(3) / MR 7 Cl. 2(3): condos need parking when each unit is ≥ 60 m²; Cl. 84(3): 1 space per unit */
  condoUnitThresholdSqm: 60,
  spacesPerCondoUnit: 1,
  /** Cl. 84(6): office 1 space / 60 m² (applies from 300 m² of office space, Cl. 83(6)) */
  officeSqmPerSpace: 60,
  /** Cl. 84(18): commercial building 1 space / 60 m² (from 300 m², Cl. 83(18)) */
  commercialSqmPerSpace: 60,
  useThresholdSqm: 300,
  /** Cl. 84(16): large building 1 space / 120 m² of building area, or the sum by use, whichever is greater */
  largeBuildingSqmPerSpace: 120,
  /** Cl. 86: 90° bay 2.40 × 5.00 m; Cl. 88: aisle ≥ 6 m for angles > 60° */
  bayWidthM: 2.4,
  bayLengthM: 5,
  aisleM: 6,
  /** Design assumption: gross parking floor area per space incl. aisles, ramps, cores (net double-loaded = 19.2 m²) */
  grossSqmPerSpace: 28,
  /** Floor plates narrower than this cannot take a double-loaded aisle (5 + 6 + 5 m) */
  minWidthDoubleLoadedM: 16,
  /** Single-loaded (5 + 6 m) */
  minWidthSingleLoadedM: 11,
  singleLoadedGrossSqmPerSpace: 36,
} as const;

export const DEFAULT_AVG_UNIT_SIZE_SQM = 35;
export const NET_TO_GROSS_RESIDENTIAL = 0.7;
/** Zone boundary precision margin: plots closer than this to the GIS zone boundary are reported UNVERIFIED */
export const ZONE_BOUNDARY_MARGIN_M = 10;

/** Explicit modelling assumptions (shown in the report) */
export const ASSUMPTIONS = [
  'The zone is read from the BMA GIS layer of the 2013 plan (bundled copy, validated against the Gazette). The legally binding map is the one annexed to the regulation; obtain a BMA land-use certificate before permit applications. Plots within 10 m of a zone boundary are reported UNVERIFIED.',
  'Each road-facing plot edge is assumed to coincide with the public-road boundary (เขตถนน); the road centreline is assumed at half the entered road width.',
  'Road widths and access-route widths estimated from OpenStreetMap geometry are estimates, not cadastral or BMA right-of-way data. Checks that depend on them are flagged "estimated input"; enter surveyed widths (title deed / BMA) to replace them.',
  'All walls are assumed to have openings (windows/balconies), so the MR 55 Cl. 50 and BMA 2544 Cl. 54 distances apply on every boundary.',
  'Building height is measured to the roof deck of the top floor (MR 33 Clause 1); parapets and rooftop structures are not modelled.',
  'Every storey, including parking and basement storeys, counts in total floor area for FAR and the MR 33 thresholds (Plan Cl. 4 "all storeys"; Plan Cl. 54 confirms parking normally counts). FAR bonuses (Plan Clauses 52–56) are not modelled.',
  'Units = residential floor area × 0.70 ÷ the average unit size entered. EIA usable area is approximated by residential floor area (upper bound).',
  'Parking: 28 m² gross per space (2.40 × 5.00 m bay + share of 6 m aisle, ramps and cores). The large-building rate (1 space / 120 m² of building area) is applied literally, i.e. the base includes the parking floors themselves (conservative; some practitioners exclude parking area).',
  'Station proximity is measured from OpenStreetMap station points; the plot qualifies only when its farthest point is within 500 m (conservative reading of "ภายในระยะ 500 เมตร").',
] as const;
