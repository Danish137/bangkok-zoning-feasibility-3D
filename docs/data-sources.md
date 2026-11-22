# Data sources

Static reference data the app bundles in `public/data/`. Nothing is fetched from Thai government servers at runtime. Several of them geo-block non-Thai networks and Cloudflare edge locations, so a runtime dependency on them would fail for most users.

| File | What | Source | Licence / legal basis | Size |
|---|---|---|---|---|
| `bkk-zoning-2556.geojson` | 498 land-use zone polygons of the Bangkok Comprehensive Plan B.E. 2556 (field `zone`, e.g. `ย.9`) | BMA City Planning & Urban Development Dept., ArcGIS service `DOL/LupDolWms` layer 1 "ผังเมืองรวม 2556". Bundled from a converted export published in [Kanesuan/KNS.MAP](https://github.com/Kanesuan/KNS.MAP) (PR #6, ingested via GitHub Actions on 2026-10-10) | The plan, including its map, is enacted as a Ministerial Regulation. Thai Copyright Act B.E. 2537 s.7 excludes laws and official regulations from copyright. The BMA states no data licence. The converted export is a mechanical conversion (no creative content). Confirm with counsel before commercial redistribution. | 797 KB (219 KB gzip) |
| `bkk-rail-stations.geojson` | 225 operating mass-transit stations (BTS, MRT Blue/Purple, ARL, SRT Red, Gold Line, Pink/Yellow monorails) | OpenStreetMap via the Overpass API | © OpenStreetMap contributors, **ODbL 1.0**. This file is a derivative database published under ODbL; attribution is shown on the map | 45 KB |

Also used, but not bundled: the OpenFreeMap vector tiles the map displays (OpenStreetMap data, ODbL). They provide the 3D context buildings and the road centrelines and building footprints from which road widths are estimated in the browser (`src/site/roadAnalysis.ts`).

## How the zoning layer was validated

The Royal Gazette text of the plan states how many areas each zone has ("จำแนกเป็นบริเวณ ย.9-1 ถึง ย.9-30"). For every zone whose count is legible in the extracted Gazette text, the polygon count in the data must match. `scripts/ingest/bma-zoning.mjs` enforces this and refuses to write on any mismatch.

| Zones checked | Gazette = data |
|---|---|
| ย.1, ย.2, ย.4, ย.5, ย.6, ย.7, ย.8, **ย.9** | 4, 17, 40, 37, 48, 30, 26, **30** |
| พ.1, พ.2, พ.3, พ.4 | 21, 5, 43, 5 |
| อ.1, อ.2, อ.3 · ก.1, ก.4, ก.5 · ศ.1, ศ.2 | 6, 6, 1 · 16, 38, 13 · 6, 1 |

Spot checks: Siam → พ.5, Asok intersection → พ.5, outer Lat Krabang → ก.1, Thong Lo / Ekkamai upper sois → ย.9.

The layer omits "white" and military land. The legally binding map is the one annexed to the regulation, so the tool reports plots within 10 m of a zone boundary as UNVERIFIED.

## Refreshing the data

**Stations:** reachable from anywhere.
```bash
node scripts/ingest/osm-stations.mjs
```

**Zoning:** the official service needs a network that can reach `3d-cpd.bangkok.go.th`. Options:
1. From a Thai network or VPN: `node scripts/ingest/bma-zoning.mjs`.
2. Through a Thai HTTP(S) proxy: `NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://host:port HTTP_PROXY=http://host:port node scripts/ingest/bma-zoning.mjs` (Node ≥ 24).
3. On GitHub Actions: the workflow **Ingest reference data** (`.github/workflows/ingest-data.yml`, manual trigger). It runs both scripts and uploads the outputs as a build artifact for review; it does not commit.
4. Offline, from an existing export of the same layer: `node scripts/ingest/bma-zoning.mjs --from export.geojson`.

When the 4th revision of the plan is promulgated (expected 2027), its layer must be ingested separately. The rules for ย.9 are expected to change, so `src/engine/regulations.ts` must be updated as well.
