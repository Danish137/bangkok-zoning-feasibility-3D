# Bangkok Zoning Rules Specification

## Jurisdiction & Source Documents
- **Bangkok Comprehensive Plan B.E. 2556 (2013)** — active zoning ordinance
- **Ministerial Regulation 33 (MR 33)** — building control, road requirements, high-rise criteria
- **Ministerial Regulation 55 (MR 55)** — building setbacks, open space, sky exposure planes

## Zone: Yor.9 (ย.9) — High-Density Residential (Brown Zone)
- Coverage: Sukhumvit / Thonglor / Phrom Phong area
- Center: lat 13.7308, lng 100.5760

## Base Parameters
| Parameter | Value | Source |
|---|---|---|
| Max FAR | 7.0 | Bangkok Plan B.E. 2556, Zone Yor.9 |
| Min Zoning OSR | 4.5% of actual GFA | Bangkok Plan B.E. 2556, Zone Yor.9 |
| BCA Open Space (Residential) | 30% of plot area | MR 55 Clause 33 |
| BCA Open Space (Commercial) | 10% of plot area | MR 55 Clause 33 |

## Dual Open-Space Rule
Enforce the **stricter** of:
- Zoning OSR: `0.045 × actualGFA` sqm of open space required
- BCA MR 55: `0.30 × plotArea` (residential) or `0.10 × plotArea` (commercial)

## Road & Frontage Eligibility (MR 33)
| Condition | Road Width | Frontage | Consequence |
|---|---|---|---|
| High-rise (>23m) or GFA ≥ 10,000 sqm | ≥ 10m | ≥ 12m | Allowed |
| GFA ≥ 30,000 sqm | ≥ 18m | ≥ 12m | Allowed |
| Road < 10m | any | any | Height capped at 23m, GFA < 10,000 sqm |

## Setbacks (per polygon edge)
### High-rise (>23m) or Extra-Large (GFA ≥ 10,000 sqm)
- **All edges**: 6m (MR 33, fire engine access)

### Standard (≤23m and GFA < 10,000 sqm)
- **Side/rear edges** (walls with openings, MR 55):
  - Floors at height ≤ 9m: 2m setback
  - Floors at height 9m–23m: 3m setback
- **Road-facing edge(s)**:
  - Road 10m–20m: `max(roadWidth / 10, 2m)`
  - Road > 20m: 2m
  - Road < 10m: 2:1 distance rule from opposite road line, min 2m

## 2:1 Sky Exposure Plane (MR 55 Section 44)
For floor at elevation H above ground:
- Clip buildable polygon by half-plane at distance `≥ (H / 2) - roadWidth` from road-facing edge(s)
- Upper floors step back on narrow roads
- Applied per road-facing edge independently

## Developer Metrics & Flags
- **EIA trigger**: residential height > 23m OR estimated units ≥ 80
- **Unit estimate**: `usableGFA / 40` sqm (usable ≈ 70% of GFA)
- **Area units**: sqm and Thai Rai-Ngan-Wah (1 Rai = 1600 sqm, 1 Ngan = 400 sqm, 1 Wah = 4 sqm)

## Explicit Simplifications
1. Single zone (Yor.9) only — no zone boundary detection
2. Road width is user input, not derived from map data
3. No parking ratio calculation (would need building use sub-categories)
4. Fire escape stair widths not modeled
5. BTS/MRT 500m condition for commercial flagged but not geo-verified
6. Assume walls have openings on all sides (conservative setback)
