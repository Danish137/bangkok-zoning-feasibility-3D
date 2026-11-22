# Architecture

React 19 + TypeScript + Vite 6, Tailwind v4, MapLibre GL 5 (OpenFreeMap vector tiles with OSM buildings), Three.js as a MapLibre custom layer, polygon-clipping, Vitest, Cloudflare Pages + Pages Functions. No other frameworks.

```
src/engine/            pure, deterministic, DOM-free; shared by browser, worker and API
  regulations.ts       every legal number + its source (single source of truth)
  types.ts             domain types, building types
  geo.ts               WGS84 ↔ local metres (equirectangular at the plot centroid)
  polygon.ts           area, winding, validation, distance setbacks, robust clipping
  rules.ts             setbacks (MR 55 Cl. 41/50, MR 33 Cl. 4), 2:1 planes (Cl. 44–46),
                       MR 33 road eligibility, use caps (Plan Cl. 16), envelope, floor stacking
  designs.ts           Design A (max yield) and Design B (open space optimised)
  compliance.ts        per-design checklist measured from geometry; open-space rules; EIA
  zoning.ts            zone detection: plot-area overlay on the BMA 2013 plan layer (PASS / UNVERIFIED / FAIL)
  transit.ts           distance to mass-transit stations (Plan Cl. 16 500 m conditions)
  parking.ts           BMA 2544 Cl. 83–86 / MR 7 parking demand and podium allocation
  feasibility.ts       runFeasibility(SiteInput, SiteData?): the one entry point
src/site/roadAnalysis.ts  road frontage, width and access-route estimates from vector-tile geometry
src/siteData.ts        loads public/data/*.geojson once (worker + map overlays)
public/data/           bkk-zoning-2556.geojson (BMA GIS), bkk-rail-stations.geojson (OSM)
scripts/ingest/        reproducible ingestion of both datasets (+ .github/workflows/ingest-data.yml)
src/engine.worker.ts   runs runFeasibility off the main thread
src/hooks/useEngine.ts posts inputs to the worker (latest wins; sync fallback)
src/state.tsx          reducer: plot, per-edge roads (width source, access width), road analysis,
                       program inputs (unit size, parking mode), drawing state machine, view state
src/scene/buildScene.ts result → Three.js group (four spatial layers + guides)
src/components/        MapContainer (map, overlay, interaction), stage panels, UI kit
functions/api/evaluate.ts  POST /api/evaluate → runFeasibility (same engine)
tests/                 Vitest: geometry, regulations, Bangkok data + BMA 2544, road analysis,
                       designs/invariants, state, API
e2e/run-e2e.mjs        Playwright-core + installed Edge against the production build
```

## Data flow

1. The reducer stores the plot as a **CCW** WGS84 ring. Winding changes (finish, drag) remap road edges and widths, so edge *i* always denotes the same physical boundary.
2. **Road analysis (map side).** Once the map is idle with the plot in view, `MapContainer` reads road centrelines and building footprints from the loaded OpenFreeMap tiles and calls `analyzeRoads()` (`src/site/roadAnalysis.ts`). The result is dispatched as `SET_ROAD_ANALYSIS`, keyed by the plot geometry so stale results are dropped:
   - on a new plot with no roads selected, the detected frontages become road edges with `source: 'map-estimate'`;
   - on existing road edges, estimated widths are refreshed, but a value the user typed (`source: 'user'`) is never overwritten;
   - if nothing is found, it retries (up to 3 attempts, 1.5 s apart, while tiles stream in), then asks the user to click the road edges.
3. **Engine input.** `useEngine` posts the following to the worker (latest request wins):

   ```
   { polygon,
     roadEdges: [{ edgeIndex, widthM, source, accessMinWidthM?, accessSource? }],
     buildingType, nearTransitDeclared, avgUnitSizeSqm, parkingMode }
   ```

   At startup the worker loads `public/data/*.geojson` once (`loadSiteData`); every request waits for that and passes it as `SiteData` (zones and stations). If loading fails (e.g. offline), results are still computed, the zone is reported as not verified, and a warning is added.
4. `runFeasibility(input, siteData)`:
   - validates the input (≥ 3 vertices, no self-intersection, ≥ 50 m², valid edges and widths) and projects it to metres at the centroid;
   - classifies edges (road / side / rear) and flags road edges that are not on the convex hull (notch roads);
   - looks up the zone (`checkJurisdiction`) and the stations within 500 m (`computeTransit`). Both are memoized per polygon, so editing road widths or the building type does not repeat them;
   - computes road eligibility (MR 33 Cl. 2 frontage and continuity) and use caps (Plan Cl. 16, with the transit exemption only when the whole plot is within 500 m);
   - generates the designs:
     - **Envelopes** for each permitted class: buildable polygon (layer 2) = plot minus edge capsules at the class setbacks. The ≤ 9 m class adds an upper buildable polygon from the 3rd storey (3 m from private land, BMA 2544 Cl. 54); the < 23 m class already uses 3 m.
     - **Floors**: allowable(top) (layer 3) = buildable ∩ active 2:1 planes at that storey's roof; actual floor (layer 4) = footprint ∩ allowable ∩ the storey below. The last storey is trimmed to land exactly on the floor-area cap.
     - **Parking**: demand from BMA 2544 Cl. 83–85 (large-building rate solved to a fixed point), placed in podium storeys or basements; parking counts in FAR. If the required spaces cannot fit, or ≥ 15 spaces would need a road narrower than 6 m (Cl. 90), the floor area is capped.
     - **Design A**: the class with the most floor area (classes are pruned by an upper bound). The footprint is inset only as far as the open-space rules require (regula-falsi search); if the BMA 2544 Cl. 53 front-space test fails, its depth from the main road is cut.
     - **Design B**: footprint ≤ 60 % (else 75 %, 85 %) of A's footprint; the best class on that footprint.
     - **Checklist**: per design, measured from the storey polygons. Checks whose inputs are map estimates carry `inputConfidence: 'estimated'`.
5. `buildScene` renders the result in the engine's own metric frame. The custom layer multiplies MapLibre's `defaultProjectionData.mainMatrix` by `translate(anchor) · scale(m, −m, m)`, so engine metres, Three.js geometry and the SVG floor plan all share one frame.

The API (`functions/api/evaluate.ts`) follows steps 3–4. It reads the same GeoJSON through the Pages `ASSETS` binding, so the zone and transit results match the browser. It does not run road analysis: widths come from the request.

## Map and interaction details

- **Drawing and drag feedback** is an SVG overlay re-projected on every `move`. It is immediate, unlike GeoJSON updates, which pass through MapLibre's worker queue.
- **Picking**: rays are unprojected from the inverse MVP. `Raycaster.setFromCamera` does not support a bare Camera.
- **Context buildings** overlapping the plot are hidden with a change-only filter built from `querySourceFeatures`. The idle app performs 0 renders.
- **OSM road check**: a centreline crossing the plot is an error-level advisory. Proximity within an estimated half-width (by road class) is a warning. Neither is cadastral.
- **Reference overlays** (toggled in the Building stage): zoning polygons (ย.9 highlighted, zone labels) from `bkk-zoning-2556.geojson`; stations with names, and a 500 m ring around the nearest station.
- **Access route**: for each road edge, the traced route to the nearest arterial is drawn as a dashed line, with a marker and label at its narrowest point (the MR 33 continuity bottleneck).
- **Edge labels** show the width and "est." for map-derived values. Clicking a label toggles the edge as a road frontage.
