// ─── Cloudflare Pages Function: POST /api/evaluate ───
// Stateless wrapper around the SAME engine entry point the browser uses (runFeasibility). The zoning layer and
// station list are the static assets the site already serves (/data/*.geojson), read through the Pages ASSETS
// binding and cached per isolate.
//
// Body:
// {
//   "polygon": [[lng, lat], ...],                                   // ≥ 3 vertices, any winding
//   "roadEdges": [{ "edgeIndex": 0, "widthM": 18, "accessMinWidthM": 18 }],
//   "buildingType": "high-rise-condo" | "low-rise-condo" | "commercial-office" | "mixed-use",
//   "avgUnitSizeSqm": 35,                                            // optional
//   "parkingMode": "podium" | "basement",                            // optional
//   "nearTransitDeclared": false                                     // optional, only used without station data
// }
// Legacy form also accepted: "roadEdges": [0, 1] with a single "roadWidth": 12.

import { runFeasibility } from '../../src/engine/feasibility';
import { buildZoningIndex } from '../../src/engine/zoning';
import { BUILDING_TYPES } from '../../src/engine/types';
import type { BuildingType, LngLat, RoadEdgeInput, SiteData, SiteInput, StationPoint } from '../../src/engine/types';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

interface Env { ASSETS?: { fetch: (req: Request | string) => Promise<Response> } }
type Handler = (ctx: { request: Request; env?: Env }) => Promise<Response>;

export const onRequestOptions: Handler = async () => new Response(null, { status: 204, headers: CORS_HEADERS });

/** Any other method: explicit 405 (otherwise Pages would fall through to the SPA's index.html) */
export const onRequest: Handler = async () =>
  new Response(JSON.stringify({ error: 'Method not allowed. Use POST with a JSON body.' }), {
    status: 405,
    headers: { ...CORS_HEADERS, Allow: 'POST, OPTIONS', 'Content-Type': 'application/json' },
  });

const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

export function parseBody(body: unknown): { input?: SiteInput; error?: string } {
  if (!body || typeof body !== 'object') return { error: 'Body must be a JSON object' };
  const b = body as Record<string, unknown>;
  const poly = b.polygon;
  if (!Array.isArray(poly) || poly.length < 3 || !poly.every((p) => Array.isArray(p) && p.length >= 2 && p.every(num))) {
    return { error: 'polygon must be an array of ≥ 3 [lng, lat] number pairs' };
  }
  if (!Array.isArray(b.roadEdges)) return { error: 'roadEdges must be an array' };
  let roadEdges: RoadEdgeInput[];
  if (b.roadEdges.length === 0) {
    roadEdges = [];
  } else if (b.roadEdges.every((r) => typeof r === 'number')) {
    if (!num(b.roadWidth)) return { error: 'roadWidth (number) is required when roadEdges is a list of indices' };
    roadEdges = (b.roadEdges as number[]).map((i) => ({ edgeIndex: i, widthM: b.roadWidth as number }));
  } else if (b.roadEdges.every((r) => r && typeof r === 'object' && num((r as RoadEdgeInput).edgeIndex) && num((r as RoadEdgeInput).widthM))) {
    roadEdges = (b.roadEdges as RoadEdgeInput[]).map((r) => ({
      edgeIndex: r.edgeIndex, widthM: r.widthM,
      ...(num(r.accessMinWidthM) ? { accessMinWidthM: r.accessMinWidthM } : {}),
      source: r.source === 'map-estimate' ? 'map-estimate' : 'user',
      ...(num(r.accessMinWidthM) ? { accessSource: r.accessSource === 'map-estimate' ? 'map-estimate' : 'user' } : {}),
    }));
  } else {
    return { error: 'roadEdges must be [{ edgeIndex, widthM, accessMinWidthM? }] or a list of indices with roadWidth' };
  }
  const bt = b.buildingType;
  if (typeof bt !== 'string' || !(bt in BUILDING_TYPES)) {
    return { error: `buildingType must be one of ${Object.keys(BUILDING_TYPES).join(', ')}` };
  }
  if (b.avgUnitSizeSqm !== undefined && !num(b.avgUnitSizeSqm)) return { error: 'avgUnitSizeSqm must be a number' };
  if (b.parkingMode !== undefined && b.parkingMode !== 'podium' && b.parkingMode !== 'basement') return { error: 'parkingMode must be "podium" or "basement"' };
  return {
    input: {
      polygonLngLat: (poly as number[][]).map((p) => [p[0]!, p[1]!] as LngLat),
      roadEdges,
      buildingType: bt as BuildingType,
      nearTransitDeclared: b.nearTransitDeclared === true,
      ...(num(b.avgUnitSizeSqm) ? { avgUnitSizeSqm: b.avgUnitSizeSqm as number } : {}),
      ...(b.parkingMode ? { parkingMode: b.parkingMode as 'podium' | 'basement' } : {}),
    },
  };
}

let dataPromise: Promise<SiteData> | null = null;

/** Load the bundled zoning layer and station list through the Pages ASSETS binding (once per isolate) */
export function loadSiteData(request: Request, env?: Env): Promise<SiteData> {
  if (!env?.ASSETS) return Promise.resolve({});
  dataPromise ??= (async () => {
    const get = async (path: string) => {
      const res = await env.ASSETS!.fetch(new URL(path, request.url).toString());
      if (!res.ok) throw new Error(`${path}: ${res.status}`);
      return res.json() as Promise<{ features: { properties: Record<string, unknown>; geometry: { type: string; coordinates: unknown } }[]; metadata?: { source?: string } }>;
    };
    const [zoning, stations] = await Promise.all([get('/data/bkk-zoning-2556.geojson'), get('/data/bkk-rail-stations.geojson')]);
    return {
      zones: buildZoningIndex(zoning),
      zoningSource: zoning.metadata?.source,
      stations: stations.features.map((f) => ({
        name: String(f.properties.name ?? ''), nameEn: String(f.properties.nameEn ?? ''), network: String(f.properties.network ?? ''),
        lngLat: f.geometry.coordinates as LngLat,
      }) as StationPoint),
    };
  })().catch((err) => { dataPromise = null; throw err; });
  return dataPromise;
}

export const onRequestPost: Handler = async ({ request, env }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const { input, error } = parseBody(body);
  if (!input) return json({ error }, 400);
  let data: SiteData = {};
  try {
    data = await loadSiteData(request, env);
  } catch {
    data = {}; // degrade to "zone not verified" rather than failing the request
  }
  try {
    const result = runFeasibility(input, data);
    if (!result.valid) return json({ error: result.errors.join(' '), result }, 422);
    return json(result, 200);
  } catch (err) {
    return json({ error: `Server error: ${err instanceof Error ? err.message : 'unknown'}` }, 500);
  }
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}
