# Progress

## Phase 1: Rules & Geometry Engine ✅
- [x] `src/engine/types.ts` — shared types (BuildingType, ZONE_YOR9, FloorResult, ComplianceCheck, etc.)
- [x] `src/engine/geo.ts` — WGS84 ↔ metric projection with Web Mercator scaling `1 / (2 * PI * 6378137 * cos(latRad))`
- [x] `src/engine/polygon.ts` — Shoelace area, inward offset, winding validation, edge normals (via polygon-clipping)
- [x] `src/engine/rules.ts` — Bangkok Yor.9 zoning rules engine (setbacks, MR 55 Section 44 2:1 sky plane, FAR 7.0, dual OSR, MR 33 road width & frontage)
- [x] `src/engine/designs.ts` — Design A (Max-Yield Envelope) & Design B (Podium + Slender Tower / Sub-EIA Courtyard Block)
- [x] `src/engine/presets.ts` — 3 real Bangkok Yor.9 preset plots (L-shape 8m soi, trapezoid 12m, corner 18m)
- [x] `src/engine/index.ts` — pure TypeScript barrel export
- [x] `tests/engine.test.ts` — 39 comprehensive Vitest unit tests covering geometry, setbacks, high-rise rules, EIA triggers, and GFA summation
- [x] All 39 tests passing ✅

## Phase 2: MapLibre + Three.js + Plot Editor ✅
- [x] MapLibre GL JS integration with OpenFreeMap vector tiles (`tiles.openfreemap.org/styles/liberty`)
- [x] Three.js CustomLayerInterface integration sharing WebGL2 context with MapLibre
- [x] Plot polygon draw/edit directly on 3D map (click to draw, click first vertex to close, interactive dragging of vertices)
- [x] 3 one-click real Bangkok Yor.9 presets with camera fly-to animation
- [x] Interactive road edge selector: click any polygon edge on map to toggle road frontage
- [x] Road width controls: quick presets (6m, 8m, 10m, 12m, 18m, 30m) + live 4m-40m slider
- [x] Building type selector: Low-Rise Condo, High-Rise Condo, Commercial / Office, Mixed-Use Shophouse
- [x] Synchronized metric-to-Mercator camera matrix transform (`camera.projectionMatrix = mercatorToClip.multiply(localToMercator)`)

## Phase 3: 3D Massing & Interaction ✅
- [x] Design A (Max-Yield) & Design B (Podium + Slender Tower / Sub-EIA Courtyard) 3D extruded slabs
- [x] 3D regulatory guides with live toggles:
  - Setback boundary ground planes & perimeter lines (MR 33 / MR 55)
  - 2:1 Sky Exposure Plane (angled 63.4° translucent amber planes rising from opposite road line)
  - 23m Height Limit warning cap plane
  - OSR / Open Space landscaped green footprint
  - Allowable building volume envelope in glowing cyan glass
- [x] Interactive 3D floor slab picking via NDC raycasting in local metric space
- [x] 3D section cutaway toggle (hides upper floors to inspect selected floor interior)
- [x] Synchronized 2D SVG floor plan view showing exact floor polygon, plot boundary, setbacks, and elevation
- [x] Floor level scrubber and interactive floor schedule table

## Phase 4: Navigation, Compliance & Deployment ✅
- [x] 5-stage navigation flow: `Site -> Building -> Floor -> Compliance -> Report`
- [x] Smooth camera animation presets (pitch, bearing, zoom) per navigation stage
- [x] Interactive rule-by-rule Compliance Matrix with 3D constraint highlighting on hover
- [x] Comprehensive Report view with comparative design analysis, full floor-by-floor area schedule, and JSON export
- [x] Interactive API payload preview with one-click cURL command for `/api/evaluate`
- [x] Stateless Cloudflare Pages Function at `functions/api/evaluate.ts` importing pure engine module with zero DOM/Node dependencies
- [x] `public/_routes.json` routing configuration (`{"version": 1, "include": ["/api/*"], "exclude": []}`)
- [x] Semantic `data-testid` attributes across all stages, controls, design toggles, and checklist rows
- [x] Live global state attached to `window.__BANGKOK_ZONING_STATE__`
- [x] TypeScript clean compilation (`tsc --noEmit` exits with 0 errors)
- [x] Optimized Vite production build with manual chunk splitting for MapLibre, Three.js, and React vendor

## Phase 5: Plot Reset, Road Safety & Cadastral Verification ✅
- [x] Independent "Draw Custom Plot" / "Clear Plot" workflow with full state reset across any location in Zone Yor.9
- [x] Polygon winding normalization with exact CCW edge-index mapping: `(n - 2 - i + n) % n`
- [x] Public Road Right-of-Way Advisory: detects polygon intersections with OpenStreetMap road centerlines via `segmentsCross` and displays BCA Section 41 warning
- [x] Cadastral disclaimer: Explicit notice that OSM road lines represent network centerlines, not certified cadastral parcel surveys
- [x] Verified independent plot drawing at Sukhumvit Soi 53 (`[100.5749, 13.7280]`) and Phrom Phong Soi 39 (`[100.5699, 13.7341]`)
- [x] Vitest 41/41 unit tests passing with zero regressions

