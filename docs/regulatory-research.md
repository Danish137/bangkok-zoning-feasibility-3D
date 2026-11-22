# Regulatory research: Bangkok ย.9 feasibility

Researched 22 Nov 2026; Bangkok ordinance, parking and zoning data added the same day (second audit). Every rule the engine uses was read in the original Thai text, except where marked otherwise. Quotes are cleaned of PDF-extraction spacing artefacts. English renderings are my own working translations, not official ones. Constants live in `src/engine/regulations.ts`, the single source of truth for the code.

Verification levels used below:
- **Read (primary):** read in the Royal Gazette text or the Council of State consolidated text.
- **Read (mirror):** the official text, read from a professional-body or university mirror because the government host blocked automated access.
- **Not verified:** could not be read; the tool does not model it, or marks it UNVERIFIED.

## 1. Which plan is in force

| Item | Finding | Source |
|---|---|---|
| Operative plan | Ministerial Regulation enforcing the Bangkok Comprehensive Plan **B.E. 2556**, Royal Gazette Vol. 130 Part 41 ก, **16 May 2013** | [ASA mirror of the Gazette](https://download.asa.or.th/03media/04law/cpa/mr56-bma.pdf) (Read, mirror) |
| 4th revision | Not promulgated. Its 90-day public posting ran **10 Aug to 9 Nov 2569 (2026)**, and press reports target promulgation in mid-2027. It will replace the 2556 regulation. The draft reportedly gives ย.9 a FAR of 5 and OSR of 8 % (press report, unverified), so results must be re-run once it takes effect. | [plan4bangkok.com/process](https://plan4bangkok.com/process/), [The Nation, 3 Feb 2026](https://www.nationthailand.com/news/general/40062056) |
| Validity | Clause 1 of the 2556 regulation states a five-year term ("ให้ใช้บังคับได้มีกำหนดห้าปี"). It remains operative pending its replacement; BMA and the revision project both treat it as current. I did not read the extension instrument itself. | Plan Cl. 1 (Read, mirror); legal assumption |

## 2. Zoning: ย.9 (Plan B.E. 2556, Clause 16)

**Use.** Clause 16 para 1 lists **prohibited** uses for ย.9. Condominiums (อาคารอยู่อาศัยรวม) are not listed, and **ย.9 has no road-width condition for residential buildings**. Conditions that matter for the tool's building types:

| Clause 16 para 1 | Rule (paraphrase of Thai text) | Implemented |
|---|---|---|
| (8) | Hotels > 80 rooms prohibited unless on a road reserve ≥ 12 m or within 500 m of a mass-transit station | No hotel type |
| (9) | Commerce with operating area > 5,000 m² prohibited, except (a) 5,000–10,000 m² on a ≥ 12 m road or within 500 m of a station; (b) > 10,000 m² on a ≥ 16 m road or within 500 m | Mixed-use retail podium cap (`useCaps`) |
| (10) | Offices with operating area > 10,000 m² prohibited unless on a ≥ 16 m road or within 500 m of a station | Office floor-area cap (`useCaps`) |

**Intensity.** Clause 16 para 2:

> (๑) มีอัตราส่วนพื้นที่อาคารรวมต่อพื้นที่ดินไม่เกิน ๗ : ๑
> (๒) มีอัตราส่วนของที่ว่างต่อพื้นที่อาคารรวมไม่น้อยกว่าร้อยละสี่จุดห้า แต่อัตราส่วนของที่ว่างต้องไม่ต่ำกว่าเกณฑ์ขั้นต่ำของที่ว่างอันปราศจากสิ่งปกคลุมตามกฎหมายว่าด้วยการควบคุมอาคาร … และให้มีพื้นที่น้ำซึมผ่านได้เพื่อปลูกต้นไม้ไม่น้อยกว่าร้อยละห้าสิบของพื้นที่ว่าง

**Definitions (Clause 4).** FAR is the total floor area of all storeys of all buildings ÷ the land area used for the buildings. OSR is the *uncovered open land* (ที่ว่างอันปราศจากสิ่งปกคลุม) ÷ total floor area.

**Calculations.**
- Max floor area = 7 × plot area.
- Zoning open space ≥ 0.045 × total floor area. It must also be ≥ every building-control minimum (section 3), and ≥ 50 % of it must be permeable planted ground.

**FAR bonuses (Clauses 52–56)** exist for affordable housing, public open space, park-and-ride, rainwater retention (+5–20 %) and certified green buildings (+5–20 %). They are **not modelled**, because each needs a design commitment the tool cannot verify.

**Boundary.** The plan divides ย.9 into 30 separate areas (ย.9-1 … ย.9-30) shown on the annexed land-use map. The BMA City Planning Department publishes the plan as a GIS layer on a public ArcGIS 10.0 service (`3d-cpd.bangkok.go.th/ArcGIS/rest/services/DOL/LupDolWms/MapServer/1`, field `ZONE`). That host does not respond from outside Thailand. A converted export of the layer (498 polygons) exists in a public GitHub project ([Kanesuan/KNS.MAP](https://github.com/Kanesuan/KNS.MAP), PR #6), made from GitHub Actions runners that can reach the service. Before bundling it, I checked it independently against the Gazette: **all 20 zone counts legible in the Gazette text match exactly** (ย.9 = 30 areas, ย.8 = 26, ย.7 = 30, พ.3 = 43, ก.4 = 38, …). Details and refresh procedure: `docs/data-sources.md`.

How the tool uses it (section 9): the plot's *area* is overlaid on every zone polygon, not just its vertices. Results:
- **PASS** when 100 % of the plot is in ย.9 and ≥ 10 m from any zone boundary;
- **UNVERIFIED** within 10 m of a boundary (GIS precision);
- **FAIL** when the plot is in another zone or straddles zones.

The legally binding map is still the one annexed to the regulation, so a BMA land-use certificate is still needed for a permit.

**Finding:** all three original study presets, described as "Yor.9 Sukhumvit / Thonglor", lie in **ย.10** on this layer (FAR 8, different rules). The presets were moved to a real ย.9 area north of Sukhumvit (Thong Lo / Ekkamai), 144–526 m from its boundary.

## 3. Open space: four separate rules with different bases

The first implementation applied "30 % of the plot" to every residential building and attributed it to MR 55 Clause 33. MR 55 Cl. 33 actually measures against the largest floor. Bangkok's own ordinance (BMA 2544 Cl. 52, section 8 below) **does** require 30 % of the *land* for every residential building. So the original number was right for Bangkok, but the reference was wrong. My first correction removed it for low-rise buildings because the ordinance could not be read then. It is now restored, with the right source.

| Rule | Text | Basis | Applies to |
|---|---|---|---|
| Plan Cl. 16 para 2(2) | 4.5 % of total floor area (above) | **Total floor area** | All buildings in ย.9 |
| **MR 55 Cl. 33** | (๑) อาคารอยู่อาศัย และอาคารอยู่อาศัยรวม ต้องมีที่ว่างไม่น้อยกว่า ๓๐ ใน ๑๐๐ ส่วนของพื้นที่ชั้นใดชั้นหนึ่งที่มากที่สุดของอาคาร (๒) … อาคารอื่นซึ่งไม่ได้ใช้เป็นที่อยู่อาศัย … ๑๐ ใน ๑๐๐ ส่วน … แต่ถ้าอาคารดังกล่าวใช้เป็นที่อยู่อาศัยด้วยต้องมีที่ว่างตาม (๑) | **Largest single floor** of the building | All buildings (MR 55 is the general regulation) |
| **MR 33 Cl. 6** | (1) อาคารที่อยู่อาศัยต้องมีที่ว่างไม่น้อยกว่าร้อยละ 30 ของพื้นที่ดินที่ใช้เป็นที่ตั้งอาคาร (2) … ไม่ได้ใช้เป็นที่อยู่อาศัย … ร้อยละ 10 … แต่ถ้า … ใช้เป็นที่อยู่อาศัยรวมอยู่ด้วยต้องมีที่ว่างตาม (1) | **Plot area** | High-rise and extra-large buildings only |
| **BMA 2544 Cl. 52(1)–(2)** | (1) อาคารอยู่อาศัยต้องมีที่ว่างไม่น้อยกว่า 30 ใน 100 ส่วนของพื้นที่ที่ดิน (2) … อาคารอื่นซึ่งไม่ได้ใช้เป็นที่อยู่อาศัย … 10 ใน 100 ส่วนของพื้นที่ที่ดิน แต่ถ้าอาคารนั้นใช้เป็นที่อยู่อาศัยด้วยต้องมีที่ว่างตาม (1) | **Land area** | **Every** building in Bangkok |

"ที่ว่าง" (MR 55 Cl. 1, MR 33 Cl. 1) means area without roof or structure overhead. Pools, open parking and structures ≤ 1.20 m high without cover also count. The engine computes open space as plot area minus the union of all storey footprints. It evaluates the three rules independently and requires the largest. Mixed-use buildings that contain housing take the residential rates under both MRs.

Worked example (Design A on the Ekkamai corner preset; plot 3,012.4 m², total floor area 21,087 m² incl. parking, largest floor 1,837 m²):

| Rule | Calculation | Required |
|---|---|---|
| Zoning OSR | 0.045 × 21,087 | 949 m² (governs) |
| BMA 2544 Cl. 52 | 0.30 × 3,012.4 | 904 m² |
| MR 33 Cl. 6 | 0.30 × 3,012.4 | 904 m² |
| MR 55 Cl. 33 | 0.30 × 1,837 | 551 m² |

The design provides 1,175 m². At FAR 7 the zoning OSR (4.5 % × 7 = 31.5 % of the plot) is just above Bangkok's 30 % of land. Below FAR ≈ 6.7, BMA Cl. 52 governs instead.

## 4. Height classes and road access (MR 33, consolidated to amendment No. 69)

Source: [ASA consolidated text](https://download.asa.or.th/03media/04law/cba/mr/mr35-33-upd69.pdf) (Read, mirror). Clauses 2–6 were amended by MR No. 50 (B.E. 2540).

| Clause | Text (abridged) | Engine |
|---|---|---|
| 1 "อาคารสูง" | ความสูงตั้งแต่ 23.00 เมตรขึ้นไป measured from ground to the roof deck (gable roofs: to the top of the highest wall) | High-rise ⇔ H **≥ 23 m (inclusive)**. Low-rise designs are kept strictly below 23 m |
| 1 "อาคารขนาดใหญ่พิเศษ" | Total floor area of all storeys, *or any one storey*, ตั้งแต่ 10,000 ตารางเมตรขึ้นไป | Extra-large ⇔ ≥ 10,000 m² (inclusive). Low-rise designs are capped at 9,999 m² |
| 1 "พื้นที่อาคาร" | Floor area within the outer walls, including balconies; excluding the roof deck and stairs outside the roof | Floor area = area of the floor polygon (gross) |
| 2 | Land for a high-rise / extra-large building ≤ 30,000 m² must have one side **≥ 12.00 m** on a public road with reserve **≥ 10.00 m**. Above 30,000 m², the road must be **≥ 18.00 m** | `checkRoadEligibility`; the 30,000 m² cap applies otherwise |
| 3 | A ≥ 6.00 m clear road surface around the building for fire engines | Satisfied geometrically by the 6 m ring (paving not modelled) |
| 4 | Outermost part of the building, above or below ground, **≥ 6.00 m from neighbouring land or a public road** | 6 m setback on **every** edge, at **every** level |
| 5 | FAR ≤ 10 : 1 | Less strict than the zoning FAR of 7; reported only |
| 6 | Open space 30 % (residential) / 10 % of plot | Section 3 |

Previous errors corrected here:
- The high-rise test used `> 23` (exclusive).
- The 6 m MR 33 setback was switched on per floor once that floor passed 23 m, producing illegal low-setback podiums under a high-rise.
- Low-rise "extra-large" status was decided mid-stack.

## 5. Setbacks and the 2:1 plane (MR 55)

Source: Krisdika consolidated text of MR 55, via the [yotathai.com mirror](https://www.yotathai.com/yotanews/rule55-buildinglaw) (Read, mirror; the Krisdika host failed TLS).

**Clause 41 (road setbacks).**

> Paragraph 1: a building near a public road narrower than 6 m must keep its building line ≥ 3 m from the road centreline.
>
> Paragraph 2: buildings higher than 2 storeys or 8 m, shophouses, commercial buildings, factories, public buildings, signs and warehouses:
> (1) road < 10 m: ≥ **6 m from the road centreline**
> (2) road 10–20 m: ≥ **1/10 of the road width** from the road boundary
> (3) road > 20 m: ≥ **2 m** from the road boundary

The 6 m figure in (1) is legible but interleaved with other characters in the extracted text layer. Taking the plot edge as the road boundary, (1) becomes 6 − w/2 from the plot edge: 2 m on an 8 m soi, 3 m on a 6 m road, 4 m on a 4 m road. The old code used max(2, w/10) for roads under 10 m.

**Clause 50 (walls with openings).**

> (1) Building ≤ 9 m high: walls or balconies with windows, doors, vents or openings ≥ **2 m** from the property line.
> (2) Building > 9 m and < 23 m: ≥ **3 m**.

Blank walls may be 0.5 m from the line, or on the line (up to 15 m high) with the neighbour's consent. The clause applies to **every** property line, road side included, and depends on the **building's** height, not each floor's. The old code switched from 2 m to 3 m by floor elevation.

The engine assumes openings on all sides. Each road edge's setback is the greater of Clause 41 and Clause 50 (or MR 33 Cl. 4).

**Clause 44 (2:1 rule).**

> ความสูงของอาคารไม่ว่าจากจุดหนึ่งจุดใด ต้องไม่เกินสองเท่าของระยะราบ วัดจากจุดนั้นไปตั้งฉากกับแนวเขตด้านตรงข้ามของถนนสาธารณะที่อยู่ใกล้อาคารนั้นที่สุด

The clause has **no road-width threshold**. Height is measured from road or ground level to the highest part of the building. For a point at distance *d* inside the plot edge of a road of width *w*: H ≤ 2(d + w), so a storey whose roof is at H must lie at d ≥ H/2 − w. The previous formula `(H/2) − roadWidth` is algebraically correct for a single road under this edge assumption. What was wrong around it:
- The 3D plane used one global road width for every road.
- The compliance row was hard-coded `pass: true`.
- Multi-road relief was not implemented.

The engine now checks every vertex of every storey at its roof level.

**Clauses 45 and 46 (two roads of unequal width).**
- Clause 45: two parallel roads ≤ 60 m apart, with the building ≤ 60 m wide along the wider road. The wider road's opposite boundary governs.
- Clause 46: a corner of two unequal roads. The wider road governs, provided the building is ≤ 60 m long along the narrower road (15 m for shophouses).

The engine grants this relief only when the condition holds for the whole buildable area. Otherwise every road's plane applies, which is equivalent to Clause 44's nearest-road rule. Example: the 18 m + 12 m corner preset is about 78 m long on the 12 m side (66 m of buildable length), so relief does not apply and both planes are active. A 50 × 50 m corner plot gets relief.

**Clause 40.** No part of a building may project into public space. Together with Clause 41, this is why a drawn plot crossing an OSM road centreline is flagged.

## 6. EIA (MNRE notification)

Source: the 2018 (B.E. 2561) annex, [university-hosted copy](https://rsdi.kku.ac.th/wp-content/uploads/2021/08/07_notification.pdf) (Read, mirror). ONEP lists the **20 Dec 2023 consolidated notification, in force since 6 Jan 2024**, as current ([PDF](https://www.onep.go.th/wp-content/uploads/2024/01/2567-01-05-p240-mnre-announcement.pdf)). Its font encoding defeated text extraction, so I could not confirm that these items carried over unchanged. **Not verified.**

| Item | Threshold (inclusive "ตั้งแต่") | Stage |
|---|---|---|
| 31 Condominium (อาคารอยู่อาศัยรวม) | **≥ 80 rooms or usable area (พื้นที่ใช้สอย) ≥ 4,000 m²** | Before the building permit |
| 30 Hotel | ≥ 80 rooms or ≥ 4,000 m² | Same |
| 27.1 Building near a river, sea, lake or beach, or in a national or historical park | H ≥ 23 m or ≥ 10,000 m² | Same |
| 27.2 Retail / wholesale building | H ≥ 23 m or ≥ 10,000 m² | Same |
| 27.3 Private office building | H ≥ 23 m or ≥ 10,000 m² | Same |

Corrections to the old implementation:
- **Height ≥ 23 m does not by itself trigger an EIA for a condominium** (the old code did). The 4,000 m² usable-area test does. Almost any FAR-7 condo needs an EIA.
- An EIA is a permitting step, not a design limit, so the tool reports it as INFO. Design B is no longer built around a "79-unit" cap.
- The units estimate (residential floor area × 0.70 ÷ 35 m²) and the usable-area proxy (= residential floor area) are labelled estimates. I did not find the notification's own definition of "พื้นที่ใช้สอย".

## 7. Not modelled or unverified

- **Later amendments to BMA 2544:** the ASA copy shows none, and I could not confirm whether any exist.
- **FAR bonuses** (Plan Cl. 52–56): they need design commitments.
- **Fire, structural, sanitation and accessibility rules** beyond MR 33 Cl. 2–4: detailed design, not massing.
- **Draft 4th revision overlay:** only PDF maps on Google Drive are published (plan4bangkok.com), with no GIS layer, so a "post-2027" preview would be guesswork.
- **Road reserves:** the map estimates (section 11) are not cadastral data.

## 8. Bangkok Building Control Ordinance B.E. 2544 (BMA)

Source: the ASA text-layer copy ([bb44-03.pdf](https://download.asa.or.th/03media/04law/cba/bb/bb44-03.pdf)). Read, mirror; the official BMC copy is a scanned image, and the BMA web portal returns 403. Where the ordinance repeats a Ministerial Regulation, the engine cites both. Where it is stricter, its value governs.

| Clause | Text (abridged, Thai) | Effect in the tool |
|---|---|---|
| 49 | ความสูงของอาคาร … ต้องไม่เกิน 2 เท่าของระยะราบ … ถนนสาธารณะที่อยู่ใกล้อาคารนั้นที่สุด; relief for buildings ≤ 100 m from a ≥ 80 m road with a ≥ 12 m access | Same as MR 55 Cl. 44; the 80 m-road relief is not modelled (conservative) |
| 50 | Road < 6 m: ≥ 3 m from the centreline. Buildings > 2 storeys / > 8 m (except houses ≤ 3 storeys, ≤ 10 m, ≤ 1,000 m²): (1) < 10 m road: 6 m from the centreline; (2) 10–20 m: 1/10 of the width; (3) > 20 m: 2 m | Same as MR 55 Cl. 41 |
| 51 | Corner of public roads 3–8 m wide meeting at < 135°: chamfer 4 m; no building part may enter it | Check on qualifying corners (never binding with ≥ 2 m road setbacks) |
| **52(1)–(2)** | อาคารอยู่อาศัยต้องมีที่ว่างไม่น้อยกว่า 30 ใน 100 ส่วนของพื้นที่ที่ดิน; non-residential 10 % | **New open-space rule**, often governing |
| **52(6)** | Commercial buildings and buildings > 2 storeys / > 8 m: front open space ≥ 6 m wide, ≥ 12 m if > 3 storeys, contiguous along ≥ 1/6 of the building's external perimeter, connected to a ≥ 6 m internal road | Check + generator |
| **53** | อาคารอยู่ริมทางสาธารณะ … แนวอาคารด้านที่ประชิดติดริมทางสาธารณะต้องมีความยาวมากกว่า 1 ใน 8 ส่วนของความยาวเส้นรอบรูปภายนอกของอาคาร … ห่างทางสาธารณะไม่เกิน 20 เมตร | Exemption from 52(6). Deep, narrow buildings fail it, so the generator limits building depth |
| 54 | Openings toward private land: ≥ 2 m up to the 2nd storey / 9 m; **≥ 3 m from the 3rd storey or above 9 m** | Tightens the ≤ 9 m class: 3 m from the 3rd storey |
| 55 | Open space around buildings ≥ 1 m (≤ 15 m tall), ≥ 2 m above | Check (never binding) |
| 83(3), 84(3) | อาคารอยู่อาศัยรวมหรืออาคารชุดที่มีพื้นที่ห้องชุดแต่ละห้องชุดตั้งแต่ 60 ตารางเมตรขึ้นไป → 1 คัน ต่อ 1 ห้องชุด | Parking by unit size (section 10) |
| 84(6), (18) | Office / commercial: 1 space per 60 m² | Parking |
| **84(16)** | อาคารขนาดใหญ่ ให้มีที่จอดรถ 1 คันต่อพื้นที่อาคาร 120 ตารางเมตร หรือ … ตามจำนวนที่กำหนดของแต่ละประเภท … ให้ถือที่จอดรถจำนวนที่มากกว่าเป็นเกณฑ์ | Usually governs condos |
| 85 | Sum by use vs. building type: the greater; round up per category | Implemented |
| 86, 88 | Bay 2.40 × 5.00 m (90°); aisle ≥ 6 m (> 60°) | Basis of the 28 m²/space assumption |
| 90 | ≥ 15 spaces: access must join a public road ≥ 6 m wide that continues to a wider road | Check + generator: on narrower roads the floor area is capped so parking stays < 15 |
| Def. (101) | อาคารขนาดใหญ่: > 2,000 m², or ≥ 15 m tall and > 1,000 m² | Large-building test for parking |
| Def. "ที่ว่าง" | No roof or structure overhead; may include open-air parking and structures ≤ 1.20 m without cover | Open space = plot − building footprint |

## 9. Zone and transit detection

- **Zone:** section 2 and `docs/data-sources.md`.
- **Transit:** Plan Cl. 16 uses "ภายในระยะ 500 เมตร จากบริเวณโดยรอบสถานีรถไฟฟ้าขนส่งมวลชน" for the hotel, commerce, office, exhibition, bus-terminal, amusement-park and university conditions. **There is no automatic transit FAR bonus in ย.9**: the FAR bonuses (Cl. 52–56) are for affordable housing, public open space, park-and-ride at listed stations, rainwater retention and green buildings. The tool measures from OpenStreetMap station points (BTS, MRT, ARL, SRT Red, Gold, monorails; 225 stations) and accepts proximity only when the plot's farthest point is within 500 m. How the BMA measures "บริเวณโดยรอบสถานี" is not specified, so this is conservative.

## 10. Parking (BMA 2544 Cl. 83–88; MR 7 Cl. 3(1))

MR 7 (as amended by No. 41 and 64; [ASA consolidated](https://download.asa.or.th/03media/04law/cba/mr/mr17-07-upd64.pdf)) gives the same Bangkok rates: condominium 1 per unit, office 1 per 60 m², large building the greater of the per-use sum and 1 per 120 m².

The base for the 1 per 120 m² rule is "พื้นที่อาคาร", which the ordinance defines as all floor area people use, parking floors included. Read literally, the requirement is circular: spaces = ⌈(other floor area + parking floor area) ÷ 120⌉. The engine solves this to a fixed point. Some practitioners exclude the parking area, which gives fewer spaces; that reading is disclosed, not used.

The Plan's own Cl. 54 shows that parking floor area normally counts in FAR ("พื้นที่จอดรถยนต์ที่เพิ่มขึ้นให้ได้รับการยกเว้นไม่ต้องนำมาพิจารณาอัตราส่วนพื้นที่อาคารรวม" exempts only *extra* public parking). Podium and basement parking both consume FAR.

**Capacity.** Each space takes 28 m² gross. A 2.40 × 5.00 m bay plus half of a 6 m aisle is 19.2 m² net; ramps and cores make up the rest (assumption). Floor plates narrower than 16 m get single-loaded aisles at 36 m² per space. Plates under 11 m cannot take ramped parking, and the generator then caps the floor area.

**Worked example** (Ekkamai corner, Design A). Average unit 35 m², so there is no per-unit requirement. Total floor area 21,087 m² gives ⌈21,087 ÷ 120⌉ = 176 spaces. Three podium storeys provide 195.

## 11. Road widths and access routes from map data: what can and cannot be known

OpenStreetMap (via the OpenFreeMap tiles the app displays) stores road **centrelines** and a class. It does not store the legal **road reserve (เขตทาง)**, which comes from the title deed or the BMA right-of-way register. Measured centrelines can be several metres off, and many Bangkok sois have walls and shopfronts set back from the reserve. The engine therefore treats any width derived from the map as an estimate, combining three measurements:
1. **Centreline offset** c from each plot edge (rays at 5 points); a road symmetric about its centreline is ≈ 2c wide.
2. **Building-to-building clearance** across the street: an upper bound on the reserve.
3. **Class range:** minor 4–16 m, tertiary 8–24 m, secondary 12–40 m, and so on.

For MR 33 Cl. 2 continuity and BMA Cl. 90, the street graph is traced (Dijkstra) from the frontage to the nearest tertiary-or-higher road. Each segment's width is min(class typical, the narrowest facade clearance, sampled every 15 m); the narrowest segment is the bottleneck. Every such value is labelled "EST." in the UI, and dependent checks are flagged "EST. INPUT". Typing a surveyed width replaces the estimate. The tool never claims a width is "verified" without cadastral data, and it does not use the Department of Lands parcel services (LandsMaps), which are geo-blocked and not licensed for reuse.
