# Architecture

## Component Tree
```
App
├── MapContainer (MapLibre + Three.js CustomLayerInterface)
│   ├── PlotEditor (polygon draw/edit on map)
│   ├── ThreeOverlay (3D massing, envelope, guides)
│   └── BuildingPicker (raycast floor selection)
├── StageBar (Site → Building → Floor → Compliance → Report)
├── SidePanel
│   ├── SiteControls (presets, road width, building type)
│   ├── DesignSelector (Design A / B / Envelope toggle)
│   ├── FloorInspector (level scrubber, 2D SVG floor plan)
│   ├── ComplianceChecklist (rule-by-rule pass/fail)
│   └── ReportView (summary, floor schedule, JSON export)
└── State (React context + useReducer)
```

## Data Flow
1. User draws/edits plot polygon → WGS84 coords stored in state
2. `src/engine/geo.ts` converts WGS84 → local metric (meters from centroid)
3. `src/engine/rules.ts` computes setbacks, FAR, OSR, height, envelope per edge
4. `src/engine/designs.ts` generates Design A & B massing (floor-by-floor polygons)
5. Three.js renders 3D slabs; SVG renders 2D floor plans from same metric coords
6. Compliance checklist reads engine output directly

## Metric Projection (`src/engine/geo.ts`)
- Anchor: plot centroid in WGS84
- Scale: Web Mercator meter factor `metersPerDeg = 2 * PI * 6378137 * cos(latRad) / 360`
- X = (lng - anchorLng) * metersPerDegLng
- Y = (lat - anchorLat) * metersPerDegLat
- Single coordinate frame shared by engine calcs, Three.js vertices, and SVG floor plans

## MapLibre + Three.js WebGL Lifecycle
- Three.js mounted as `CustomLayerInterface` with `renderingMode: '3d'`
- Shares MapLibre's WebGL2 context: `new THREE.WebGLRenderer({ canvas, context: gl })`
- `renderer.resetState()` before every `renderer.render(scene, camera)`
- Never clears MapLibre's buffers; `renderer.autoClear = false`
- Camera sync: `camera.projectionMatrix` from MapLibre's render matrix × MercatorCoordinate transform
- Repaint on state/camera/hover change only (no idle loop)

## Cloudflare Pages Routing
- Static SPA served from CDN (Vite `dist/`)
- `_routes.json`: `{"version":1,"include":["/api/*"],"exclude":[]}`
- `functions/api/evaluate.ts`: stateless POST endpoint importing `src/engine/`
