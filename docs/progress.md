# Status (22 Nov 2026)

Implemented and verified as of this audit. "Browser-verified" means exercised by `e2e/run-e2e.mjs` against the production build in Microsoft Edge (headless, software WebGL).

| Area | Status | Verified by |
|---|---|---|
| Rules engine: Plan Cl. 16, MR 55 Cl. 33/41/44–46/50, MR 33 Cl. 1–6, EIA items 27/31 | Implemented | 32 regulatory reference tests |
| Concave-safe distance setbacks, robust clipping, winding/edge remapping | Implemented | 16 geometry tests |
| Design A / B for any plot shape, independently checked | Implemented | 25 scenario and invariant tests (independent re-verifier) |
| Drawing: first-vertex marker, live preview, polygon preview, undo, cancel, finish, close on first point, crossing rejection, live area | Implemented | Reducer tests + browser |
| Vertex drag with winding-safe road remap, self-intersection guard | Implemented | Reducer tests + browser |
| Per-edge road widths (corner 18 m + 12 m) | Implemented | Engine, reducer and browser tests |
| Five stages, 3D floor picking, cutaway, 2D plan with 4 layers, schedule reconciliation | Implemented | Browser |
| Checklist ↔ 3D geometry highlighting | Implemented | Browser (hover state), screenshots |
| JSON report, API payload | Implemented | Browser download test |
| Cloudflare Pages Function on the same engine | Implemented | `tests/api.test.ts` (function handler invoked in Node; not deployed) |
| Idle performance (0 renders), memory (stable after GC), 58–60 fps orbit | Measured | Browser |
| Zone detection from the BMA GIS layer; stations; automatic road frontage / width / access-route estimates | Implemented | `tests/bangkok.test.ts`, `tests/roadAnalysis.test.ts`, browser |
| BMA 2544 (Cl. 49–55, 83–90) and parking (podium / basement) | Implemented | `tests/bangkok.test.ts` (hand-derived cases), browser |
| Engine latency | 13–30 ms median (warm), 15–18 ms cold | measured in Node; 60 ms input→result in the browser |

Not done: see "Known limitations" in `docs/audit-findings.md` and section 7 of `docs/regulatory-research.md`.
