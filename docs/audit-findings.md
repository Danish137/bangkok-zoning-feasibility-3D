# Independent audit: findings and corrections

Audit of commit `266ca76` against the hiring brief (`full-brief.md`). Each finding was reproduced in code, tests or the browser before it was fixed. Regulatory evidence is in `docs/regulatory-research.md`.

Severity: **Critical** = wrong legal answer or misleading compliance; **High** = core feature broken; **Medium** = quality or performance; **Low** = polish.

## Regulatory and compliance

| # | Sev. | Finding (evidence) | Fix |
|---|---|---|---|
| R1 | Critical | Setback, side/rear and 2:1 checks were hard-coded `pass: true` (`rules.ts computeCompliance`). The checklist could never fail them. | Every check is now measured on the actual storey polygons (`compliance.ts`), and an independent re-verifier in `tests/designs.test.ts` repeats the measurements. |
| R2 | Critical | The "official Zone Yor.9 boundary" was an unsourced four-point rectangle, and every plot inside it was "Verified In Zone". The plan publishes 30 ย.9 areas only on its map. | No more "verified" claim. The zone is UNVERIFIED (user-declared) inside Bangkok and FAIL outside a conservative BMA box. The rectangle was removed from the map. |
| R3 | Critical | "30 % of plot" open space was attributed to MR 55 Cl. 33 and applied to all residential buildings. MR 55 Cl. 33 actually uses the **largest floor**; the 30 %-of-plot rule is **MR 33 Cl. 6** and applies to high-rise/extra-large buildings only. | Three independent open-space rules (zoning OSR, MR 55 Cl. 33, MR 33 Cl. 6), each with its own basis. |
| R4 | Critical | EIA was triggered by "height > 23 m" for condos (not a condo trigger) and missed the 4,000 m² usable-area trigger. Design B was built around a 79-unit cap. | Items 27/31 thresholds, reported as INFO; the EIA no longer drives the design. |
| R5 | High | The high-rise test was `> 23` m; the law says ≥ 23 m. The extra-large test switched setbacks part-way up the stack, producing low-setback podiums under 6 m-setback towers (illegal under MR 33 Cl. 4). | The building class is decided for the whole building. Three envelopes (≤ 9 m, < 23 m and < 10,000 m², MR 33) are each generated and the best legal one is kept. |
| R6 | High | Road setbacks for roads < 10 m used max(2, w/10). MR 55 Cl. 41(1) requires 6 m from the **centreline**. Clause 50 (2 m / 3 m) was keyed to floor elevation instead of building height and ignored on road edges. | Cl. 41 by road tier, Cl. 50 by building class on every boundary, MR 33 Cl. 4 (6 m) for high-rise. |
| R7 | High | One global road width was used for every road edge, so a corner plot on 18 m + 12 m roads was impossible. Clauses 45/46 (multi-road relief) were not implemented. | Per-edge widths throughout state, engine, API and 3D. Cl. 45/46 relief only when its 60 m conditions hold. |
| R8 | Medium | Office type had no Plan Cl. 16(10) limit; mixed-use had no Cl. 16(9) commerce limit. | Use caps, with an optional user-declared 500 m transit proximity (marked UNVERIFIED). |
| R9 | Medium | The checklist header read "✓ Zone Yor.9 Jurisdiction Verified" and "Fast-Track EIA Exempt". | Removed. Unverified items always show UNVERIFIED; a FAIL makes the design non-compliant. |

## Geometry

| # | Sev. | Finding | Fix |
|---|---|---|---|
| G1 | Critical | `perEdgeInwardOffset` intersected the plot with an **infinite half-plane per edge**. On an L-shape, the half-plane of the inner edge deletes the whole other arm. | True distance setbacks: plot minus the union of edge capsules, tangent-circumscribed so they never encroach. Unit test: the L-shape keeps both arms and its area matches the analytic 896.86 m² within 0.04 m². |
| G2 | High | When clipping split a polygon, the code silently kept `result[0]` (an arbitrary piece). | The largest piece is kept; discarded area is reported as a limiting constraint. |
| G3 | High | Dragging a vertex could flip winding without remapping road edges (`UPDATE_VERTEX` skipped normalisation). The engine re-normalised the metric polygon, so road setbacks could land on the wrong edge. | `MOVE_VERTEX` normalises and remaps edges and widths. The drag tracks the moved vertex across a reversal. Self-intersecting moves are rejected. Tests cover both. |
| G4 | High | polygon-clipping 0.15 throws "Unable to complete output ring" on near-coincident vertices; this surfaced with capsule setbacks. | `safeClip`: deterministic snap/scale/rotate retries at µm scale; capsules are subtracted one at a time. |
| G5 | Medium | The open-space overlay painted the whole plot green; the setback guide always showed Design A; the sky plane used the global width. | Open space = plot minus footprint (Shape with a hole); all guides come from the active design's envelope. |

## Interaction and UI

| # | Sev. | Finding | Fix |
|---|---|---|---|
| U1 | High | "First click does nothing": the first vertex was a one-point LineString (not rendered). Measured: even after that fix, GeoJSON updates took **450–1,100 ms** to appear, because of worker tiling plus the idle loop in P1. | SVG overlay projected each frame: vertex markers, live segment, closing line, translucent fill, close-target ring. Measured 0 ms after the click event. |
| U2 | High | No undo, finish button, keyboard shortcuts, self-intersection prevention or live area. Clicking edges while drawing was ambiguous. | Undo / Cancel / Finish, Enter / Esc / Backspace, double-click to finish, crossing segments rejected with a message, live length and area tooltip. |
| U3 | High | 3D floor picking used `Raycaster.setFromCamera` with a bare `THREE.Camera`, which logs "Unsupported camera type" and never hits. It only appeared to work. | The ray is unprojected from the inverse MVP. The browser test now selects storey 10 by clicking. |
| U4 | Medium | No way to identify edges or set a width per edge; no camera reset or rotate controls. | E-labels on edges, a per-edge width slider and input, Rotate / Top / 3D / Reset view. |
| U5 | Medium | Compliance rows could not be tied to geometry beyond a few hover cases. | Every check carries a geometry key and edges. Hover highlights it; click pins it (setback strip and vertical plane, active 2:1 planes, open space, envelope, 23 m threshold). |

## Performance

| # | Sev. | Finding (measured, headless Edge) | Fix |
|---|---|---|---|
| P1 | High | **Endless render loop while idle (~40 fps of GPU work with no input).** `idle` → `queryRenderedFeatures` → hide buildings → hidden buildings vanish from the next query → filter cleared → repaint → `idle` … It also dispatched a new advisory array each cycle, re-rendering React. | `querySourceFeatures`, change-only `setFilter`, and advisory de-duplication. Measured: **0 renders and 0 state updates in 5 s idle**. |
| P2 | Medium | Missing basemap sprite icons fired `styleimagemissing` about 30 times/s, re-running symbol placement. | A transparent placeholder is registered once per id. |
| P3 | Medium | The engine ran on the main thread for every change (50–220 ms per evaluation). | Web Worker (latest request wins). Map interaction stays at 58–60 fps while the engine runs. |

## Engineering

- The Cloudflare function duplicated input handling and used a single road width. It now calls the same `runFeasibility` as the browser, and a test asserts identical output.
- `tsconfig.functions.json` referenced `@cloudflare/workers-types`, which is not installed, so the function never typechecked. Fixed, and added to `npm run lint`.
- The old docs claimed "no idle loop", an "official BMA Yor.9 polygon" and "MR 55 Clause 33 open space". All are rewritten.

## Deployment-preparation audit (22 Nov 2026)

- **Secrets:** the assignment access key and personal submission links appear in no commit and no tracked file. `full-brief.md`, `.env*`, `.dev.vars`, `.wrangler/` and agent tooling (`.agents/`) are git-ignored. `.agents/mcp_config.json` (no credential) was untracked.
- **Pages Function:** bundled with `wrangler pages functions build` and exercised in local workerd (`wrangler pages dev dist`). POST returns the same results as the browser engine; OPTIONS returns 204; other methods now return 405 instead of falling through to the SPA.
- **Dependency advisory (open):** `npm audit` reports GHSA-jrc7-96c5-q579 (critical, XSS in MapLibre `DOM.sanitize()`) for every `maplibre-gl` ≤ 6.4.0; the fix requires the v6 major version. This app passes no user-controlled HTML to MapLibre (no popups or `setHTML`; only the basemap's attribution strings), so exposure is low. Upgrading is recommended as a separate, tested change because it touches the custom-layer projection code. The vitest/tinypool advisories are dev-only and are not shipped.
