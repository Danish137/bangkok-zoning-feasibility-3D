# Progress

## Phase 1: Rules & Geometry Engine ✅
- [x] `src/engine/types.ts` — shared types (BuildingType, ZONE_YOR9, FloorResult, etc.)
- [x] `src/engine/geo.ts` — WGS84 ↔ metric projection (Web Mercator scaling)
- [x] `src/engine/polygon.ts` — area, inward offset, winding, validation (polygon-clipping)
- [x] `src/engine/rules.ts` — Bangkok Yor.9 zoning rules engine (setbacks, sky plane, FAR, OSR)
- [x] `src/engine/designs.ts` — Design A (Max-Yield) & B (Podium-Tower/Sub-EIA)
- [x] `src/engine/presets.ts` — 3 Bangkok preset plots
- [x] `src/engine/index.ts` — barrel export
- [x] `tests/engine.test.ts` — 34 Vitest unit tests
- [x] All 34 tests passing ✅

## Phase 2: MapLibre + Three.js + Plot Editor ✅
- [x] MapLibre map with OpenFreeMap tiles
- [x] Three.js CustomLayerInterface integration (shared WebGL2)
- [x] Plot polygon draw/edit on map (click to draw, close on first vertex)
- [x] 3 preset Bangkok plots (L-shape 8m soi, trapezoid 12m, corner 18m)
- [x] Road edge visualization (amber highlight)
- [x] Road width control (6/8/10/12/18/30m presets + 4-40m slider)
- [x] Building type selector (4 types)
- [x] Camera sync and shared WebGL context

## Phase 3: 3D Massing & Interaction ✅
- [x] Design A & B 3D slab rendering (ExtrudeGeometry per floor)
- [x] 3D regulatory guides (setback planes, height cap)
- [x] Floor picking (selected floor highlight)
- [x] 3D section cutaway toggle
- [x] 2D SVG floor plan view (synced with 3D)
- [x] Design toggle (A / B / Envelope)
- [x] Floor level scrubber

## Phase 4: Navigation, Compliance & Deployment ✅
- [x] 5-stage navigation bar (Site → Building → Floor → Compliance → Report)
- [x] Compliance checklist with pass/fail per rule
- [x] Report view with design comparison + floor schedules
- [x] JSON report download
- [x] Cloudflare Pages Function (`functions/api/evaluate.ts`)
- [x] `public/_routes.json` routing
- [x] `data-testid` attributes across all stages and controls
- [x] `window.__BANGKOK_ZONING_STATE__` exposed
- [x] Build verified: TSC clean, 34/34 tests pass, Vite build succeeds
- [ ] Deploy to Cloudflare Pages
