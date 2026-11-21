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
