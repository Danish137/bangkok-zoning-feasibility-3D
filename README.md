# Bangkok Feasibility Studio: ย.9 (Yor.9) 3D zoning & massing

A browser tool that answers a developer's first question about a Bangkok plot: **what can legally be built here, how much, and what might it look like?** Draw any plot on a real 3D map of Bangkok, mark the road(s) it faces, pick a building type. The tool then:

- applies the zoning and building-control rules for zone **ย.9 (high-density residential)**;
- shows the legal building envelope;
- generates two concept designs, each with its own rule-by-rule compliance checklist.

> **Pre-design estimate only, not legal advice or a permit determination.** The zone is read from the BMA's GIS layer of the plan, and road widths are estimated from map data until you enter surveyed values. Read [Limitations](#limitations-and-regulatory-disclaimers) before relying on any figure.

![Building stage](docs/screenshots/2-building-design-a.png)

## Features

- **Any plot shape.** Draw rectangles, trapezoids or concave and irregular polygons. Vertex markers and the live preview appear on the first click. Undo, cancel, finish, close-on-first-point, draggable vertices, self-intersection prevention and live area are all supported.
- **Real site context.** OpenStreetMap buildings in 3D via OpenFreeMap. Buildings inside the plot are hidden, and plots crossing mapped roads get a warning.
- **Automatic zone and transit detection.** The plot's area is overlaid on the BMA GIS layer of the 2013 plan (498 zones, validated against the Gazette). Plots in another zone, straddling zones, or within 10 m of a zone boundary are flagged. Distances to 225 BTS / MRT / ARL / SRT Red / Gold / monorail stations are computed for the Plan's 500 m conditions.
- **Automatic road frontage and widths.** Road-facing edges are detected from OpenStreetMap centrelines. Reserve widths are estimated (centreline offset, facade clearance, road class), and the narrowest point on the route to the nearest arterial is traced for MR 33 continuity. All map values are labelled **EST.** and can be replaced with surveyed widths.
- **Rules engine** (strictest rule wins, every rule cited):
  - Bangkok Comprehensive Plan B.E. 2556, Clause 16: FAR 7, OSR 4.5 %, use limits;
  - Bangkok Building Control Ordinance B.E. 2544: 30 % land open space, L/6 – L/8 front space, upper-storey distances, parking, car-access roads;
  - Ministerial Regulation 55: road and boundary setbacks, the 2:1 sky-exposure plane with two-road relief, open space;
  - Ministerial Regulation 33: high-rise / extra-large thresholds, road width and continuity, 6 m setbacks, open space;
  - MR 7: parking;
  - EIA thresholds, as information only.
- **Parking.** Required spaces under BMA 2544 Cl. 83–85 (1 per unit ≥ 60 m², 1 / 60 m² office or retail, 1 / 120 m² for large buildings), placed in podium storeys or basements. Parking counts in FAR.
- **Two designs.**
  - *A · Maximum Yield* gives the most legal floor area and explains what limits it.
  - *B · Open Space Optimised* uses at most about 60 % of A's footprint and recovers floor area with height where the road allows.
- **Compliance checklist per design.** Actual vs required values, **PASS / FAIL / UNVERIFIED / INFO**, the clause, a source link, and a 3D highlight of the related geometry. Missing evidence is never shown as PASS.
- **Floor inspection.** Per-storey polygons and areas, a 2D plan showing four layers (plot, buildable area, allowable envelope, storey), a cutaway view, and an area schedule that reconciles exactly with total floor area.
- **Report.** Design A vs B comparison, schedules, assumptions, legal sources and JSON export.
- **Live updates.** The engine runs in a Web Worker in about 15–30 ms per change (measured), so changes to plot, roads, building type, unit size or parking mode update everything without a reload.

## Technology

React 19 · TypeScript · Vite 6 · Tailwind CSS 4 · MapLibre GL JS 5 + OpenFreeMap tiles · Three.js (MapLibre custom layer) · polygon-clipping · Vitest · Playwright-core (browser checks) · Cloudflare Pages + Pages Functions.

The rules engine (`src/engine/`) is pure, deterministic TypeScript. The browser, the Web Worker and the API all call the same `runFeasibility()`.

## Getting started

Requires Node.js ≥ 20 (`.nvmrc` pins 22). No API keys or environment variables are needed.

```bash
npm ci
npm run dev        # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm test` | Vitest: geometry, regulatory reference cases, design invariants, state machine, API |
| `npm run lint` | TypeScript checks for the app and the Cloudflare Function |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run e2e` | Browser checks against the production build (needs `npm run build` and Microsoft Edge installed) |

To run the site and the API together in Cloudflare's local runtime: `npm run build && npx wrangler pages dev dist`.

## API

`POST /api/evaluate` runs on Cloudflare Pages Functions (`functions/api/evaluate.ts`) and calls the same engine as the browser.

```json
{
  "polygon": [[100.5755, 13.7305], [100.5762, 13.7305], [100.5762, 13.7312], [100.5755, 13.7312]],
  "roadEdges": [{ "edgeIndex": 0, "widthM": 18, "accessMinWidthM": 18 }, { "edgeIndex": 1, "widthM": 12 }],
  "buildingType": "high-rise-condo",
  "avgUnitSizeSqm": 35,
  "parkingMode": "podium"
}
```

- `polygon`: `[lng, lat]` pairs (≥ 3, any winding).
- `roadEdges[].edgeIndex`: edge *i* runs from vertex *i* to vertex *i+1*.
- `roadEdges[].accessMinWidthM` (optional): narrowest road reserve between the frontage and the nearest ≥ 10 m public road (MR 33 Cl. 2 continuity). If omitted, continuity is reported UNVERIFIED for high-rise designs.
- `buildingType`: one of `low-rise-condo`, `high-rise-condo`, `commercial-office`, `mixed-use`.
- `avgUnitSizeSqm` (default 35) and `parkingMode` (`podium` | `basement`) are optional.
- The function reads the bundled zoning and station data through the Pages `ASSETS` binding, so zone and transit results match the browser.
- Legacy form: `"roadEdges": [0, 1]` with a single `"roadWidth": 12`.

| Status | Meaning |
|---|---|
| 200 | Full feasibility result: site, both designs, floors and checklists |
| 400 | Malformed input |
| 422 | Geometrically invalid plot (e.g. self-intersecting) |
| 405 | Method other than POST or OPTIONS |

CORS is open.

## Deploying to Cloudflare Pages

| Setting | Value |
|---|---|
| Framework preset | React (Vite) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | repository root |
| Functions | `functions/` (detected automatically) |
| Environment variables | none required (optionally `NODE_VERSION=22`) |

`public/_routes.json` sends only `/api/*` to the Function; every other path is served as static assets.

## Project structure

```
src/engine/        rules engine (regulations.ts holds every legal constant and its source)
src/site/          road-width / access-route estimation from map geometry
public/data/       bundled reference data: 2013 plan zones (BMA GIS), stations (OSM)
scripts/ingest/    reproducible data ingestion (official BMA service / Overpass)
src/scene/         Three.js scene builder
src/components/    map, stage panels, UI
functions/api/     Cloudflare Pages Function
tests/             Vitest suites
e2e/               browser verification script
docs/              regulatory research, audit findings, architecture, decisions, screenshots
```

## Limitations and regulatory disclaimers

- **Zone data is a GIS copy.** The zone comes from the BMA's GIS layer of the 2013 plan (bundled copy, validated against the Gazette's area counts; see [`docs/data-sources.md`](docs/data-sources.md)). The legally binding map is the one annexed to the regulation, so obtain a BMA land-use certificate for a permit. Plots within 10 m of a zone boundary are UNVERIFIED.
- **Road widths from the map are estimates.** OpenStreetMap has centrelines, not legal road reserves. Checks that depend on estimated widths are badged "EST. INPUT". Enter surveyed widths from the title deed or the BMA to replace them.
- **Plan version.** The 2013 plan is still operative. Its 4th revision (in public posting until 9 Nov 2026) is expected to change ย.9 values, so re-run the analysis once it is promulgated.
- **Bangkok Building Control Ordinance B.E. 2544:** the massing-relevant clauses (49–55, 83–90) were read from a text-layer copy and are implemented. Later amendments, if any, are not verified. The detailed-design chapters (structure, fire, sanitation) are out of scope.
- **EIA thresholds** were read from the 2018 notification. Their carry-over into the in-force 2023 notification is assumed, not verified. Unit counts and usable area are estimates. The EIA result is information, not a design limit.
- **Road widths are user inputs** and plot edges are assumed to be road boundaries. OpenStreetMap is navigation data, not a cadastral survey. Presets are synthetic test parcels, not surveyed title deeds.
- **Parking area** uses 28 m² gross per space. The large-building rate is applied literally, with parking floors included in the base (conservative).
- **Not modelled:** FAR bonuses (Plan Cl. 52–56), mechanical parking, parapets and rooftop structures, permeable-surface layout, detailed fire and structural requirements, and the draft 4th-revision plan (no GIS layer published).
- **Assumption:** all walls are treated as having openings, so the window setbacks apply to every boundary.

The clause text, calculations, sources and verification status are in [`docs/regulatory-research.md`](docs/regulatory-research.md). The audit trail is in [`docs/audit-findings.md`](docs/audit-findings.md).

Map data and station data © OpenStreetMap contributors (ODbL), tiles by OpenFreeMap. Zoning: BMA City Planning and Urban Development Department, 2013 plan GIS layer. The fallback basemap is © CARTO.
