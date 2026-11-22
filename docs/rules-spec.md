# Rules specification (as implemented)

Sources and Thai text: `docs/regulatory-research.md`. Constants: `src/engine/regulations.ts`. *w* = road reserve width, *H* = roof-deck height of the building or storey, *d* = distance inside the plot from a road edge.

## Zone detection (BMA GIS layer of the 2013 plan)
- The plot polygon is overlaid on the bundled zone polygons and the area share of each zone is computed.
- **PASS**: ≥ 99.9 % of the plot is in ย.9 and the plot boundary is ≥ 10 m from every zone boundary.
- **UNVERIFIED**: in ย.9 but within 10 m of a zone boundary; no zone data loaded; or the plot is in Bangkok but outside every zone polygon (unzoned land, waterways and military land are not in the layer).
- **FAIL**: the plot lies in another zone (the zone is named), straddles ย.9 and another zone, or is outside Bangkok.

## Zoning: Plan B.E. 2556, Cl. 16 (ย.9)
- Total floor area (all storeys, including parking storeys and basements) ≤ 7 × plot area.
- Open space (plot minus building footprint) ≥ 4.5 % × total floor area, and ≥ every building-control minimum.
- Permeable planted area ≥ 50 % of the 4.5 % OSR: PASS when the open space is at least that large. Basements sit under the building footprint, so the open space stays natural ground; keeping it unpaved is a design commitment.
- Office: floor area ≤ 10,000 m² unless *w* ≥ 16 m or the site is within 500 m of a station.
- Mixed-use retail: ≤ 5,000 m² unless *w* ≥ 12 m; ≤ 10,000 m² unless *w* ≥ 16 m (or the site is within 500 m of a station).
- **Station proximity** is computed from the bundled OpenStreetMap stations. The 500 m condition counts as met only when the **whole plot** (its farthest vertex) is within 500 m of one station. A user declaration is accepted only when station data is unavailable, and makes the check UNVERIFIED.
- Total floor area stands in for "operating area" (conservative). There is no transit FAR bonus in ย.9; the bonuses of Cl. 52–56 are not modelled.

## Building classes
| Class | Condition | Boundary setback | Road-edge setback |
|---|---|---|---|
| Low ≤ 9 m | H ≤ 9, GFA ≤ 9,999 | 2 m (MR 55 Cl. 50(1)); 3 m from the 3rd storey (BMA 2544 Cl. 54) | max(2, Cl. 41) |
| Low < 23 m | H < 23, GFA ≤ 9,999 | 3 m (MR 55 Cl. 50(2); BMA 2544 Cl. 54) | max(3, Cl. 41) |
| MR 33 | needs ≥ 12 m frontage on *w* ≥ 10 m (≥ 18 m if > 30,000 m²), with continuity to another ≥ 10 m road | 6 m (MR 33 Cl. 4) | max(6, Cl. 41) |

All setbacks are distances to the boundary, measured on every storey polygon. The best legal class (most floor area) wins; classes are never mixed within one building.

MR 55 Cl. 41 (identical tiers in BMA 2544 Cl. 50) from the road edge:
- *w* < 10: 6 − *w*/2
- 10 ≤ *w* ≤ 20: *w*/10
- *w* > 20: 2

## 2:1 plane: MR 55 Cl. 44–46 (= BMA 2544 Cl. 49)
- Every point of a storey with roof height *H* satisfies *H* ≤ 2(*d* + *w*), i.e. *d* ≥ *H*/2 − *w*.
- With unequal roads, the narrower road's plane is waived when:
  - parallel roads are ≤ 60 m apart and the building width along the wider road is ≤ 60 m (Cl. 45); or
  - at a corner, the building length along the narrower road is ≤ 60 m (Cl. 46).
- Otherwise all planes apply.

## Open space
The required open space is the largest of:
- 4.5 % × total floor area (zoning, Plan Cl. 16)
- 30 % (residential, mixed) or 10 % (office) × land area (BMA 2544 Cl. 52(1)–(2), every building): usually the governing rule
- 30 % (residential, mixed) or 10 % (office) × largest floor (MR 55 Cl. 33)
- for MR 33 buildings only: 30 % or 10 % × plot area (MR 33 Cl. 6)

Each rule is a separate check; the largest sets the design's footprint limit.

## Floor stacking
- Storey heights: condo 3.0 m; office 4.5 m ground then 3.8 m; mixed 4.5 m ground then 3.2 m. Podium parking storeys keep the storey height of their position; basement levels are 3.0 m and do not count towards height.
- Each storey = design footprint ∩ allowable polygon at its roof ∩ the storey below (storeys nest). From the 3rd storey, the ≤ 9 m class uses the upper footprint (BMA 2544 Cl. 54).
- Stacking stops at the height class, the floor-area cap, or a floor plate < 50 m² or < 5 m wide (design assumption).
- The last storey is trimmed to land exactly on the cap: a cut parallel to the main road edge (the widest road; ties go to the longer edge), so it steps back from that road.

## EIA (INFO only)
- Condo: ≥ 80 units (estimated as residential floor area × 0.7 ÷ the average unit size, default 35 m²) or ≥ 4,000 m² usable area (proxy: residential floor area).
- Office: H ≥ 23 m or ≥ 10,000 m².
- Mixed-use ≥ 23 m or ≥ 10,000 m²: "check" (retail item 27.2).

## Tolerances
Area 0.001 m², distance 1 mm. Full precision internally; rounding only for display.

## Bangkok Building Control Ordinance B.E. 2544 (added in the second audit)
- **Open space (Cl. 52(1)–(2)):** ≥ 30 % of the land area (residential, incl. mixed use with housing), or 10 % (other uses), for every building. Evaluated with the other three open-space rules (see "Open space" above); the largest governs.
- **Front space (Cl. 52(6) / 53), for buildings > 2 storeys or > 8 m, or commercial:** the building's face on the road must be longer than 1/8 of its perimeter and within 20 m of the road (Cl. 53). Otherwise it needs open space ≥ 6 m wide in front (≥ 12 m above 3 storeys) along ≥ 1/6 of the perimeter. If Cl. 53 fails, the generator cuts the footprint depth from the main road.
- **Openings (Cl. 54):** 3 m from private land from the 3rd storey. Applied to the ≤ 9 m class as an upper buildable polygon from storey index 2.
- **Around the building (Cl. 55)** and **corner splay (Cl. 51):** checks.
- **Parking (Cl. 83–86, MR 7 Cl. 3(1)):**
  - spaces = max(by use, large-building rate), each rounded up;
  - by use: 1 per unit when the average unit is ≥ 60 m²; office or retail ≥ 300 m²: 1 per 60 m²;
  - large building (> 2,000 m², or ≥ 15 m and > 1,000 m²): 1 per 120 m² of all floor area, parking included (solved to a fixed point);
  - capacity is 28 m² per space on plates ≥ 16 m wide, 36 m² on plates 11–16 m, none below 11 m.
  - Podium: the lowest non-retail storeys become parking. Basement: levels under the ground storey, counted in FAR.
- **Car access (Cl. 90):** with ≥ 15 spaces, the road (and its access route) must be ≥ 6 m. Otherwise the generator caps the floor area so the requirement stays below 15 spaces.

## Road continuity (MR 33 Cl. 2)
`accessMinWidthM` per road edge is the narrowest reserve on the route to another ≥ 10 m public road. If it is < 10 m (< 18 m above 30,000 m²), MR 33 classes are refused. If it is unknown, they are allowed, but the road-width check is UNVERIFIED.

In the browser, the route is traced on the OpenStreetMap road graph from the frontage to the nearest arterial, with reserve widths sampled every 15 m; the narrowest sample becomes the estimate (`source: 'map-estimate'`). A width the user types replaces it.

## Estimated inputs
Road widths and access widths carry a source: `user` (surveyed, typed) or `map-estimate`. Checks that depend on an estimated width keep their PASS / FAIL status but are flagged `inputConfidence: 'estimated'` (shown as **EST. INPUT**). Estimates never upgrade a result to "verified".

## 2:1 plane on notch roads
For a road edge not on the plot's convex hull, the plane governs only points in front of the road line: the slab 0 ≤ d < H/2 − w is removed, and points behind the line are exempt.
