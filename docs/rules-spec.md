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

## Public Road Encroachment vs Road Setbacks (MR 55 Clause 40 vs Clause 41)
- **MR 55 Clause 40**: Prohibits construction of buildings, structures, or any parts thereof that protrude into or over public roads, public lands, or public rights-of-way.
- **MR 55 Clause 41**: Governs mandatory setbacks of buildings from public road boundaries based on road width and building height.
- **Cadastral & Data Notice**: OpenStreetMap road geometry represents crowdsourced street navigation centerlines, NOT legally certified cadastral parcel surveys (Chanote title deeds) from the Department of Lands. Real-world legal boundary encroachment requires a licensed cadastral survey against official survey markers (หมุดหลักเขต).

## Zone Yor.9 Spatial Boundary Verification
- Official Zone Yor.9 spatial perimeter in the Sukhumvit / Watthana / Khlong Toei sector is enforced.
- Centered at `[100.5760, 13.7308]`, bounded by Phetchaburi Road / Khlong Saen Saep (North), Rama IV Road (South), Asok Montri Road (West), and Khlong Phra Khanong / Sukhumvit 71 (East).
- If any plot vertex falls outside this official polygon, the application triggers an "Outside Zone Yor.9 Jurisdiction" warning and fails the statutory boundary compliance check.

## Explicit Legal & Geographic Limitations
1. **Cadastral Boundaries**: Presets and user-drawn polygons are geometric feasibility archetypes. Coordinates (such as Preset 1 at lat 13.7316) are representative spatial placements and do NOT constitute legally certified cadastral boundaries or surveyed curb lines.
2. **Road Widths**: Road width is user-selected or calibrated against standard BMA street classifications, as vector tile centerlines do not encode official cadastral carriageway widths.
3. **Transit Bonus Verification**: BTS/MRT 500m commercial transit bonus is flagged for developer awareness; exact walking network distance requires pedestrian isochrone verification.
4. **Wall Openings**: Conservative assumption that walls have windows/openings (MR 55 Clause 50).
