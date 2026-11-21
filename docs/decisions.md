# Decision Log

| # | Decision | Reason | Trade-off |
|---|---|---|---|
| 1 | Single zone Yor.9 only | Brief says "one zone done properly"; Yor.9 covers Sukhumvit/Thonglor, highest density and most developer interest | Cannot handle zone boundaries or other Bangkok zones |
| 2 | OpenFreeMap for base tiles | Zero API key, free, OSM-based vector tiles with 3D buildings | Less polished than Mapbox; no satellite imagery |
| 3 | Polygon-clipping for inward offsets | Handles concave/L-shaped polygons correctly via boolean intersection | Extra dependency (~15KB); manual edge-normal offset would fail on concave shapes |
| 4 | Three.js inside MapLibre CustomLayerInterface | Single shared WebGL context, no dual-canvas sync issues | Must manually sync camera matrices and call resetState() |
| 5 | All rules in pure TS engine module | Testable with Vitest, importable by Cloudflare Worker, zero DOM deps | Duplication of some types between engine and UI |
| 6 | Metric projection anchored at centroid | Simple, accurate for <2km radius plots, same frame for engine + Three.js | Would accumulate error for city-scale; fine for single plots |
| 7 | Setbacks applied per polygon edge not bounding box | Brief explicitly requires this; real plots are irregular | More complex geometry; need per-edge normal computation |
| 8 | Assume walls with openings on all sides | Conservative interpretation; most residential buildings have windows everywhere | Slightly larger setbacks than buildings with blank party walls |
| 9 | Floor area = area of clipped floor polygon | Exact GFA from geometry, not approximated from footprint × floors | Upper floors may be smaller due to sky plane stepback |
| 10 | Tailwind v4 with @import "tailwindcss" | Latest version, no config file needed, CSS-first | Newer API, fewer community examples |
| 11 | Local metric to Mercator matrix in CustomLayer | `camera.projectionMatrix = mercatorToClip.multiply(localToMercator)`. Lets all Three.js meshes be constructed in real-world meters (X=East, Y=North, Z=Up) | Requires exact Mercator scale and Y-inversion |
| 12 | Invert Y scale for Three.js Mercator projection | Mercator Y increases southward; inverting scale aligns +Y with true North and +Z with elevation above ground | Must be accounted for in direct unprojection |
| 13 | Architectural slab articulation (0.94 floor height) | Slight visual gap between floor slabs highlights each storey cleanly and prevents Z-fighting | Floor polygon area is uncompromised; visual only |
| 14 | Distinct Design B massing generator | Implements a real 3-storey podium + 4m inset slender tower for high-rise, and a courtyard block with 79-unit cap for sub-EIA | Requires parameterized floor generation options |
| 15 | Live 3D Raycasting with inverted projection matrix | Direct click-to-pick floor slabs unprojecting NDC coordinates through camera.projectionMatrix | Requires meshes to maintain floorIndex in userData |
| 16 | `@tailwindcss/vite` compilation plugin | Tailwind CSS v4 in Vite requires `@tailwindcss/vite` in `vite.config.ts` to transform `@import "tailwindcss"` into utility CSS classes | Required installing `@tailwindcss/vite` |
| 17 | MapLibre v5 `defaultProjectionData.mainMatrix` for Three.js | MapLibre GL JS v5 `options.modelViewProjectionMatrix` operates on tile world coordinates, whereas `options.defaultProjectionData.mainMatrix` is the normalized [0,1] Mercator-to-Clip matrix | Must inspect both v5 `defaultProjectionData` and fallback arrays |
| 18 | Disable Frustum Culling on Three.js CustomLayer objects | MapLibre's non-standard projection matrix causes Three.js's standard `_frustum.intersectsObject` to prematurely cull valid meshes | Traversed and set `obj.frustumCulled = false` |
| 19 | Feature-ID filtering on MapLibre `idle` event | OpenFreeMap 3D buildings (`building-3d` layer) render asynchronously and clip through custom massings; querying and filtering overlapping IDs on `idle` prevents Z-fighting | Only filters features intersecting plot bbox |
| 20 | Precomputed initial state for Design A & B | Eliminates zero-state flickering and async mount race where Three.js geometry was unpopulated on initial load | Computes default preset massing synchronously in `initialState` |
| 21 | CCW Winding Normalization & Remapping | Inverting a polygon from CW to CCW changes edge order. Remapping via `(n - 2 - i + n) % n` guarantees road edge frontages and setback normals attach to the correct physical boundaries | Added `normalizePolygonWinding` to `src/engine/polygon.ts` |
| 22 | Native OSM Context vs Synthetic Boxes | Hardcoded dummy boxes at centroid caused unexplained visual occlusions; removed them in favor of authentic MapLibre `building-3d` vector buildings with plot-level ID filtering | Map relies on OpenFreeMap tiles for surrounding urban massing |
| 23 | Explicit Limiting Constraint in Max-Yield | Developers need to know why FAR is capped below 7.0; engine derives whether road width < 10m (MR 33), 23m typology caps, or 30k sqm GFA limits the yield | Surfaced in DesignSelector and ReportView |
| 24 | Public Road Right-of-Way Intersection Advisory | Building Control Act Sec. 41 prohibits building on public rights-of-way; app queries MapLibre road features and detects polygon intersection | Warning banner rendered; OSM centerlines noted as non-cadastral |
| 25 | Independent Plot Clear & Redraw Architecture | Users need to explore arbitrary locations across Yor.9 without residual state | Dedicated `CLEAR_PLOT` and `START_DRAWING` action cycle resetting polygon, frontages, and camera targets |
