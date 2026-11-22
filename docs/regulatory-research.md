# Regulatory research: Bangkok ย.9 feasibility

Researched 22 Nov 2026. Every rule the engine uses was read in the original Thai text, except where marked otherwise. Quotes are cleaned of PDF-extraction spacing artefacts. English renderings are my own working translations, not official ones. Constants live in `src/engine/regulations.ts`, the single source of truth for the code.

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

**Boundary.** The plan divides ย.9 into 30 separate areas (ย.9-1 … ย.9-30) shown only on the annexed land-use map. No machine-readable official boundary was publicly reachable: BMA GIS hosts returned 403 or DNS errors, and plan4bangkok.com only publishes PDF maps of the *draft* 4th revision. The previous implementation's four-point rectangle labelled "official Yor.9 boundary" had **no source**. The tool now reports the zone as **UNVERIFIED (user-declared)** for any plot in Bangkok, and FAIL only when the plot is provably outside a conservative bounding box around the BMA.

## 3. Open space: three separate rules with different bases

The earlier implementation applied "30 % of the plot" and attributed it to MR 55 Clause 33. **That is wrong on both counts.**

| Rule | Text | Basis | Applies to |
|---|---|---|---|
| Plan Cl. 16 para 2(2) | 4.5 % of total floor area (above) | **Total floor area** | All buildings in ย.9 |
| **MR 55 Cl. 33** | (๑) อาคารอยู่อาศัย และอาคารอยู่อาศัยรวม ต้องมีที่ว่างไม่น้อยกว่า ๓๐ ใน ๑๐๐ ส่วนของพื้นที่ชั้นใดชั้นหนึ่งที่มากที่สุดของอาคาร (๒) … อาคารอื่นซึ่งไม่ได้ใช้เป็นที่อยู่อาศัย … ๑๐ ใน ๑๐๐ ส่วน … แต่ถ้าอาคารดังกล่าวใช้เป็นที่อยู่อาศัยด้วยต้องมีที่ว่างตาม (๑) | **Largest single floor** of the building | All buildings (MR 55 is the general regulation) |
| **MR 33 Cl. 6** | (1) อาคารที่อยู่อาศัยต้องมีที่ว่างไม่น้อยกว่าร้อยละ 30 ของพื้นที่ดินที่ใช้เป็นที่ตั้งอาคาร (2) … ไม่ได้ใช้เป็นที่อยู่อาศัย … ร้อยละ 10 … แต่ถ้า … ใช้เป็นที่อยู่อาศัยรวมอยู่ด้วยต้องมีที่ว่างตาม (1) | **Plot area** | High-rise and extra-large buildings only |

"ที่ว่าง" (MR 55 Cl. 1, MR 33 Cl. 1) means area without roof or structure overhead. Pools, open parking and structures ≤ 1.20 m high without cover also count. The engine computes open space as plot area minus the union of all storey footprints. It evaluates the three rules independently and requires the largest. Mixed-use buildings that contain housing take the residential rates under both MRs.

Worked example (Design A on the 18 m + 12 m corner preset; plot 5,898.6 m², total floor area 41,290 m², largest floor 4,040 m²):

| Rule | Calculation | Required |
|---|---|---|
| Zoning OSR | 0.045 × 41,290 | 1,858 m² (governs) |
| MR 55 Cl. 33 | 0.30 × 4,040 | 1,212 m² |
| MR 33 Cl. 6 | 0.30 × 5,898.6 | 1,770 m² |

The engine shrinks the footprint by a further 0.62 m inset to provide exactly 1,858 m². At FAR 7, the zoning OSR equals 31.5 % of the plot, which exceeds MR 33's 30 %.

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

- **Bangkok Building Control Ordinance B.E. 2544:** the official copy ([bmc.go.th](https://bmc.go.th/wp-content/uploads/2020/05/169.pdf)) is a scanned image with no text layer. Any stricter Bangkok rules (setbacks, parking, open space) are **not verified**, and every checklist shows this as UNVERIFIED.
- **Parking** (MR 41 / Bangkok ordinance), basements, parking-area exclusions from floor area, FAR bonuses, and fire, structural and accessibility rules beyond MR 33 Clauses 2–4.
- **Road widths** are user-entered legal reserves. OSM centrelines are used only to warn about plots that cross or crowd a mapped road.
