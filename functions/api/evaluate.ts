// ─── Cloudflare Pages Function: POST /api/evaluate ───
// Stateless wrapper around the SAME engine entry point the browser uses (runFeasibility).
//
// Body:
// {
//   "polygon": [[lng, lat], ...],                     // ≥ 3 vertices, any winding
//   "roadEdges": [{ "edgeIndex": 0, "widthM": 18 }],  // per-edge road reserve widths
//   "buildingType": "high-rise-condo" | "low-rise-condo" | "commercial-office" | "mixed-use",
//   "nearTransitDeclared": false                      // optional
// }
// Legacy form also accepted: "roadEdges": [0, 1] with a single "roadWidth": 12.

import { runFeasibility } from '../../src/engine/feasibility';
import { BUILDING_TYPES } from '../../src/engine/types';
import type { BuildingType, LngLat, RoadEdgeInput, SiteInput } from '../../src/engine/types';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

type Handler = (ctx: { request: Request }) => Promise<Response>;

export const onRequestOptions: Handler = async () => new Response(null, { status: 204, headers: CORS_HEADERS });

/** Any other method: explicit 405 (otherwise Pages would fall through to the SPA's index.html) */
export const onRequest: Handler = async () =>
  new Response(JSON.stringify({ error: 'Method not allowed. Use POST with a JSON body.' }), {
    status: 405,
    headers: { ...CORS_HEADERS, Allow: 'POST, OPTIONS', 'Content-Type': 'application/json' },
  });

export function parseBody(body: unknown): { input?: SiteInput; error?: string } {
  if (!body || typeof body !== 'object') return { error: 'Body must be a JSON object' };
  const b = body as Record<string, unknown>;
  const poly = b.polygon;
  if (!Array.isArray(poly) || poly.length < 3 || !poly.every((p) => Array.isArray(p) && p.length >= 2 && p.every((v) => typeof v === 'number' && Number.isFinite(v)))) {
    return { error: 'polygon must be an array of ≥ 3 [lng, lat] number pairs' };
  }
  if (!Array.isArray(b.roadEdges)) return { error: 'roadEdges must be an array' };
  let roadEdges: RoadEdgeInput[];
  if (b.roadEdges.length === 0) {
    roadEdges = [];
  } else if (b.roadEdges.every((r) => typeof r === 'number')) {
    if (typeof b.roadWidth !== 'number') return { error: 'roadWidth (number) is required when roadEdges is a list of indices' };
    roadEdges = (b.roadEdges as number[]).map((i) => ({ edgeIndex: i, widthM: b.roadWidth as number }));
  } else if (b.roadEdges.every((r) => r && typeof r === 'object' && typeof (r as RoadEdgeInput).edgeIndex === 'number' && typeof (r as RoadEdgeInput).widthM === 'number')) {
    roadEdges = (b.roadEdges as RoadEdgeInput[]).map((r) => ({ edgeIndex: r.edgeIndex, widthM: r.widthM }));
  } else {
    return { error: 'roadEdges must be [{ edgeIndex, widthM }] or a list of indices with roadWidth' };
  }
  const bt = b.buildingType;
  if (typeof bt !== 'string' || !(bt in BUILDING_TYPES)) {
    return { error: `buildingType must be one of ${Object.keys(BUILDING_TYPES).join(', ')}` };
  }
  return {
    input: {
      polygonLngLat: (poly as number[][]).map((p) => [p[0]!, p[1]!] as LngLat),
      roadEdges,
      buildingType: bt as BuildingType,
      nearTransitDeclared: b.nearTransitDeclared === true,
    },
  };
}

export const onRequestPost: Handler = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const { input, error } = parseBody(body);
  if (!input) return json({ error }, 400);
  try {
    const result = runFeasibility(input);
    if (!result.valid) return json({ error: result.errors.join(' '), result }, 422);
    return json(result, 200);
  } catch (err) {
    return json({ error: `Server error: ${err instanceof Error ? err.message : 'unknown'}` }, 500);
  }
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}
