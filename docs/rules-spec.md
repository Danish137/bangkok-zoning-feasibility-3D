# Rules specification (as implemented)

Sources and Thai text: `docs/regulatory-research.md`. Constants: `src/engine/regulations.ts`. *w* = road reserve width, *H* = roof-deck height of the building or storey, *d* = distance inside the plot from a road edge.

## Zoning: Plan B.E. 2556, Cl. 16 (ย.9)
- Total floor area ≤ 7 × plot area.
- Open space (plot minus building footprint) ≥ 4.5 % × total floor area, and ≥ every building-control minimum.
- Permeable planted area ≥ 50 % of that open space: reported, not modelled (UNVERIFIED).
- Office: floor area ≤ 10,000 m² unless *w* ≥ 16 m or the site is within 500 m of a station (user-declared).
- Mixed-use retail: ≤ 5,000 m² unless *w* ≥ 12 m; ≤ 10,000 m² unless *w* ≥ 16 m (or the site is within 500 m of a station).

## Building classes
| Class | Condition | Boundary setback | Road-edge setback |
|---|---|---|---|
| Low ≤ 9 m | H ≤ 9, GFA ≤ 9,999 | 2 m (MR 55 Cl. 50(1)) | max(2, Cl. 41) |
| Low < 23 m | H < 23, GFA ≤ 9,999 | 3 m (Cl. 50(2)) | max(3, Cl. 41) |
| MR 33 | needs ≥ 12 m frontage on *w* ≥ 10 m (≥ 18 m if > 30,000 m²) | 6 m (MR 33 Cl. 4) | 6 m |

MR 55 Cl. 41 from the road edge:
- *w* < 10: 6 − *w*/2
- 10 ≤ *w* ≤ 20: *w*/10
- *w* > 20: 2

## 2:1 plane: MR 55 Cl. 44–46
- Every point of a storey with roof height *H* satisfies *H* ≤ 2(*d* + *w*), i.e. *d* ≥ *H*/2 − *w*.
- With unequal roads, the narrower road's plane is waived when:
  - parallel roads are ≤ 60 m apart and the building width along the wider road is ≤ 60 m (Cl. 45); or
  - at a corner, the building length along the narrower road is ≤ 60 m (Cl. 46).
- Otherwise all planes apply.

## Open space
The required open space is the largest of:
- 4.5 % × total floor area (zoning)
- 30 % (residential, mixed) or 10 % (office) × largest floor (MR 55 Cl. 33)
- for MR 33 buildings only: 30 % or 10 % × plot area (MR 33 Cl. 6)

## Floor stacking
- Storey heights: condo 3.0 m; office 4.5 m ground then 3.8 m; mixed 4.5 m ground then 3.2 m.
- Each storey = allowable polygon at its roof ∩ design footprint.
- Stacking stops at the height class, the floor-area cap (last storey trimmed by uniform inset to land exactly on the cap), or a floor plate < 50 m² or < 5 m wide (design assumption).

## EIA (INFO only)
- Condo: ≥ 80 units (estimated as residential floor area × 0.7 ÷ 35) or ≥ 4,000 m² usable area (proxy: residential floor area).
- Office: H ≥ 23 m or ≥ 10,000 m².
- Mixed-use ≥ 23 m or ≥ 10,000 m²: "check" (retail item 27.2).

## Tolerances
Area 0.001 m², distance 1 mm. Full precision internally; rounding only for display.

## Bangkok Building Control Ordinance B.E. 2544 (added in the second audit)
- **Open space (Cl. 52(1)–(2)):** ≥ 30 % of the land area (residential, incl. mixed use with housing), or 10 % (other uses), for every building. Evaluated with the other three open-space rules; the largest governs.
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

## 2:1 plane on notch roads
For a road edge not on the plot's convex hull, the plane governs only points in front of the road line: the slab 0 ≤ d < H/2 − w is removed, and points behind the line are exempt.
