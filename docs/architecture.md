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
  zoning.ts            jurisdiction (never auto-"verified")
  feasibility.ts       runFeasibility(SiteInput): the one entry point
src/engine.worker.ts   runs runFeasibility off the main thread
src/hooks/useEngine.ts posts inputs to the worker (latest wins; sync fallback)
src/state.tsx          reducer: plot, per-edge roads, drawing state machine, view state
src/scene/buildScene.ts result → Three.js group (four spatial layers + guides)
src/components/        MapContainer (map, overlay, interaction), stage panels, UI kit
functions/api/evaluate.ts  POST /api/evaluate → runFeasibility (same engine)
tests/                 Vitest: geometry, regulations, designs/invariants, state, API
e2e/run-e2e.mjs        Playwright-core + installed Edge against the production build
```

## Data flow

1. The reducer stores the plot as a **CCW** WGS84 ring. Winding changes (finish, drag) remap road edges and widths, so edge *i* always denotes the same physical boundary.
2. `useEngine` posts `{polygon, roadEdges:[{edgeIndex, widthM}], buildingType, nearTransitDeclared}` to the worker.
3. `runFeasibility` validates the input (≥ 3 vertices, no self-intersection, ≥ 50 m², valid edges and widths), projects to metres at the centroid, classifies edges (road / side / rear), and computes road eligibility and use caps. It then generates:
   - **Envelopes** for each permitted class: buildable polygon (layer 2) = plot minus edge capsules at the class setbacks.
   - **Floors**: allowable(top) (layer 3) = buildable ∩ active 2:1 half-planes at that storey's roof; actual floor (layer 4) = allowable ∩ design footprint; the last storey is trimmed to land exactly on the floor-area cap.
   - **Design A**: the class with the most floor area; the footprint is inset only as far as the open-space rules require (binary search).
   - **Design B**: footprint ≤ 60 % (else 75 %, 85 %) of A's footprint; the best class on that footprint.
   - **Checklist**: per design, measured from the storey polygons.
4. `buildScene` renders the result in the engine's own metric frame. The custom layer multiplies MapLibre's `defaultProjectionData.mainMatrix` by `translate(anchor) · scale(m, −m, m)`, so engine metres, Three.js geometry and the SVG floor plan all share one frame.

## Map and interaction details

- **Drawing and drag feedback** is an SVG overlay re-projected on every `move`. It is immediate, unlike GeoJSON updates, which pass through MapLibre's worker queue.
- **Picking**: rays are unprojected from the inverse MVP. `Raycaster.setFromCamera` does not support a bare Camera.
- **Context buildings** overlapping the plot are hidden with a change-only filter built from `querySourceFeatures`. The idle app performs 0 renders.
- **OSM road check**: a centreline crossing the plot is an error-level advisory. Proximity within an estimated half-width (by road class) is a warning. Neither is cadastral.
