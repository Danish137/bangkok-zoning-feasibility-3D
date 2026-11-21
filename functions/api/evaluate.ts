// ─── Cloudflare Pages Function: /api/evaluate ───
// Stateless POST endpoint importing engine directly
// Runs on Cloudflare V8 Workers runtime — zero Node-only deps

import { evaluate } from '../../src/engine/rules';
import { generateDesigns } from '../../src/engine/designs';
import { anchorAtCentroid, polygonToMetric } from '../../src/engine/geo';
import { ensureCCW } from '../../src/engine/polygon';
import type { PlotEdge, ZoningInput, BuildingType, LngLatPolygon } from '../../src/engine/types';

interface RequestBody {
  polygon: LngLatPolygon;
  roadEdges: number[];
  roadWidth: number;
  buildingType: BuildingType;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

export const onRequestPost: PagesFunction = async ({ request }) => {
  try {
    const body = await request.json() as RequestBody;

    // Validate
    if (!body.polygon || !Array.isArray(body.polygon) || body.polygon.length < 3) {
      return jsonError('Invalid polygon: must have at least 3 vertices', 400);
    }
    if (!body.roadEdges || !Array.isArray(body.roadEdges)) {
      return jsonError('Invalid roadEdges: must be an array of edge indices', 400);
    }
    if (typeof body.roadWidth !== 'number' || body.roadWidth < 4 || body.roadWidth > 40) {
      return jsonError('Invalid roadWidth: must be 4-40 meters', 400);
    }
    const validTypes = ['low-rise-condo', 'high-rise-condo', 'commercial-office', 'mixed-use-shophouse'];
    if (!validTypes.includes(body.buildingType)) {
      return jsonError(`Invalid buildingType: must be one of ${validTypes.join(', ')}`, 400);
    }

    // Project
    const anchor = anchorAtCentroid(body.polygon);
    const metricPoly = polygonToMetric(anchor, body.polygon);
    const ccwPoly = ensureCCW(metricPoly);

    const edges: PlotEdge[] = ccwPoly.map((_, i) => ({
      index: i,
      start: ccwPoly[i]!,
      end: ccwPoly[(i + 1) % ccwPoly.length]!,
      type: body.roadEdges.includes(i) ? 'road' : 'side',
      roadWidth: body.roadEdges.includes(i) ? body.roadWidth : undefined,
    }));

    const input: ZoningInput = {
      polygon: ccwPoly,
      edges,
      buildingType: body.buildingType as BuildingType,
      roadWidths: new Map(body.roadEdges.map(i => [i, body.roadWidth])),
      polygonLngLat: body.polygon,
    };

    const evaluation = evaluate(input);
    const [designA, designB] = generateDesigns(input);

    return new Response(
      JSON.stringify({ evaluation, designA, designB }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    return jsonError(`Server error: ${err instanceof Error ? err.message : 'unknown'}`, 500);
  }
};

function jsonError(message: string, status: number) {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    }
  );
}
