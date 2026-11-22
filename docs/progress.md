# Status (22 Nov 2026)

Implemented and verified as of the second audit. "Browser-verified" means exercised by `e2e/run-e2e.mjs` (33 checks, all passing on the last run) against the production build in Microsoft Edge (headless, software WebGL). Unit and regression tests: 141 Vitest tests in 7 suites, all passing.

All checks run locally: the Function is exercised in Node (`tests/api.test.ts`) and in Cloudflare's local runtime (`wrangler pages dev dist`). None of the automated checks runs against the live Cloudflare deployment.

| Area | Status | Verified by |
|---|---|---|
| Rules engine: Plan Cl. 16, MR 55 Cl. 33/41/44–46/50, MR 33 Cl. 1–6, EIA items 27/31 | Implemented | `tests/regulations.test.ts` (32 reference cases) |
| Concave-safe distance setbacks, robust clipping, winding/edge remapping | Implemented | `tests/geometry.test.ts` (16) |
| Design A / B for any plot shape, independently checked (area invariants ≤ 0.001 m²) | Implemented | `tests/designs.test.ts` (25 scenario and invariant tests, independent re-verifier) |
| Zone detection from the BMA GIS layer (PASS / UNVERIFIED / FAIL, 10 m boundary margin) | Implemented | `tests/bangkok.test.ts`, browser |
| Station proximity (whole plot within 500 m) and Plan Cl. 16 use conditions | Implemented | `tests/bangkok.test.ts`, browser |
| BMA 2544 Cl. 52 (30 % land open space), Cl. 52(6)/53 front space, Cl. 54 upper storeys | Implemented | `tests/bangkok.test.ts` (hand-derived cases) |
| BMA 2544 Cl. 55 (clear space around the building) and Cl. 51 (corner splay) | Implemented as checklist items | No dedicated unit test; exercised by the full-checklist runs |
| Parking (Cl. 83–86, MR 7): podium or basement, counted in FAR | Implemented | `tests/bangkok.test.ts`, browser (basement mode) |
| Cl. 90 car-access cap (≥ 15 spaces need a ≥ 6 m road) | Implemented | `tests/designs.test.ts` (narrow-soi case) |
| MR 33 Cl. 2 road continuity (`accessMinWidthM`) | Implemented | `tests/bangkok.test.ts` |
| Notch roads (2:1 plane applied in front of the road line only) and irregular-polygon invariants | Implemented | `tests/bangkok.test.ts` (46 tests in this suite in total) |
| Automatic road frontage, width and access-route estimates from vector tiles (EST. badges) | Implemented | `tests/roadAnalysis.test.ts` (5), browser |
| Drawing: first-vertex marker, live preview, polygon preview, undo, cancel, finish, close on first point, crossing rejection, live area | Implemented | `tests/state.test.ts` (12) + browser |
| Vertex drag with winding-safe road remap, self-intersection guard | Implemented | `tests/state.test.ts` + browser |
| Per-edge road widths with source (map estimate vs surveyed); a typed width is never overwritten | Implemented | Engine, reducer and browser tests |
| Presets inside ย.9 (Thong Lo side soi L-shape, Thong Lo trapezoid, Ekkamai corner) | Implemented | `tests/bangkok.test.ts`, browser |
| Five stages, 3D floor picking, cutaway, 2D plan with 4 layers, schedule reconciliation (incl. basements) | Implemented | Browser |
| Zoning and station overlays, access route and bottleneck on the map | Implemented | Browser |
| Checklist ↔ 3D geometry highlighting | Implemented | Browser (hover state), screenshots |
| JSON report, API payload (parking, front space, transit, sources) | Implemented | Browser download test |
| Cloudflare Pages Function on the same engine, reading site data via `ASSETS` | Implemented | `tests/api.test.ts` (5, handler invoked in Node); `wrangler pages dev` |
| Idle performance (0 renders), memory (stable after GC), 58–60 fps orbit | Measured | Browser |
| Engine latency | 13–30 ms median (warm), 15–18 ms cold | Measured in Node; about 60 ms input→result in the browser |

Not done: see "Known limitations" in `docs/audit-findings.md`, section 7 of `docs/regulatory-research.md`, and the Limitations section of the README.
