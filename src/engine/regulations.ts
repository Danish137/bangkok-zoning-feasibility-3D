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
    url: 'https://bmc.go.th/wp-content/uploads/2020/05/169.pdf',
    verification: 'NOT verified: the official copy is a scanned image without a text layer. Any stricter Bangkok-specific provisions are not modelled.',
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
export const ASSUMPTIONS = [
  'The zone is user-declared as ย.9. No official machine-readable zoning boundary is published for the 2013 plan; the plot is not verified against the official map.',
  'Each road-facing plot edge is assumed to coincide with the public-road boundary (เขตถนน); the road centreline is assumed at half the entered road width.',
  'Road widths are user-entered right-of-way widths (เขตทาง). OpenStreetMap is not a cadastral source.',
  'All walls are assumed to have openings (windows/balconies), so MR 55 Clause 50 distances apply on every boundary.',
  'Building height is measured to the roof deck of the top floor (MR 33 Clause 1); parapets and rooftop structures are not modelled.',
  'Every modelled storey is counted in total floor area for FAR. Basements, parking exclusions and FAR bonuses (Plan Clauses 52–56) are not modelled.',
  'Units are estimated as residential GFA × 0.70 net-to-gross ÷ 35 m² per unit. EIA usable area is approximated by residential GFA (upper bound).',
  'The Bangkok Building Control Ordinance B.E. 2544 may add stricter requirements. It could not be text-verified and is not modelled.',
] as const;
