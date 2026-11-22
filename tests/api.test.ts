// The Cloudflare Pages Function must return exactly what the browser engine computes.
import { describe, expect, it } from 'vitest';
import { onRequestPost, parseBody } from '../functions/api/evaluate';
import { runFeasibility } from '../src/engine/feasibility';
import { PRESET_PLOTS } from '../src/engine/presets';

const post = (body: unknown) => onRequestPost({ request: new Request('http://x/api/evaluate', { method: 'POST', body: JSON.stringify(body) }) });

describe('/api/evaluate', () => {
  it('returns the same designs as the client engine (per-edge widths)', async () => {
    const p = PRESET_PLOTS[2]!;
    const res = await post({ polygon: p.polygon, roadEdges: p.roadEdges, buildingType: p.buildingType });
    expect(res.status).toBe(200);
    const api = await res.json();
    const local = runFeasibility({ polygonLngLat: p.polygon, roadEdges: p.roadEdges, buildingType: p.buildingType });
    expect(api.designA.totalGFA).toBe(local.designA!.totalGFA);
    expect(api.designB.totalGFA).toBe(local.designB!.totalGFA);
    expect(api.designA.checks.map((c: { id: string; status: string }) => `${c.id}:${c.status}`))
      .toEqual(local.designA!.checks.map((c) => `${c.id}:${c.status}`));
  });
  it('accepts the legacy single-width form', () => {
    const { input } = parseBody({ polygon: PRESET_PLOTS[1]!.polygon, roadEdges: [0], roadWidth: 12, buildingType: 'high-rise-condo' });
    expect(input!.roadEdges).toEqual([{ edgeIndex: 0, widthM: 12 }]);
  });
  it('validates input', async () => {
    expect((await post({ polygon: [[0, 0]], roadEdges: [], buildingType: 'high-rise-condo' })).status).toBe(400);
    expect((await post({ polygon: PRESET_PLOTS[0]!.polygon, roadEdges: [], buildingType: 'castle' })).status).toBe(400);
    const bowtie = [[100.576, 13.73], [100.577, 13.731], [100.577, 13.73], [100.576, 13.731]];
    expect((await post({ polygon: bowtie, roadEdges: [], buildingType: 'low-rise-condo' })).status).toBe(422);
  });
});

describe('/api/evaluate with the bundled reference data (Pages ASSETS binding)', () => {
  it('serves zone + station results identical to the browser engine', async () => {
    const { readFileSync } = await import('node:fs');
    const { realData } = await import('./helpers');
    const ASSETS = { fetch: async (req: Request | string) => {
      const path = new URL(typeof req === 'string' ? req : req.url).pathname;
      return new Response(readFileSync(`public${path}`, 'utf8'), { status: 200 });
    } };
    const p = PRESET_PLOTS[2]!;
    const res = await onRequestPost({ request: new Request('https://example.pages.dev/api/evaluate', { method: 'POST', body: JSON.stringify({ polygon: p.polygon, roadEdges: p.roadEdges, buildingType: p.buildingType }) }), env: { ASSETS } });
    expect(res.status).toBe(200);
    const api = await res.json();
    const local = runFeasibility({ polygonLngLat: p.polygon, roadEdges: p.roadEdges, buildingType: p.buildingType }, realData());
    expect(api.jurisdiction.status).toBe('PASS');
    expect(api.jurisdiction.zone).toBe('ย.9');
    expect(api.transit.nearest.nameEn).toBe(local.transit.nearest!.nameEn);
    expect(api.designA.totalGFA).toBe(local.designA!.totalGFA);
    expect(api.designA.parking.requiredSpaces).toBe(local.designA!.parking.requiredSpaces);
  });
  it('accepts avgUnitSizeSqm and parkingMode', () => {
    const { input } = parseBody({ polygon: PRESET_PLOTS[1]!.polygon, roadEdges: [{ edgeIndex: 0, widthM: 15, accessMinWidthM: 12 }], buildingType: 'high-rise-condo', avgUnitSizeSqm: 70, parkingMode: 'basement' });
    expect(input).toMatchObject({ avgUnitSizeSqm: 70, parkingMode: 'basement', roadEdges: [{ edgeIndex: 0, widthM: 15, accessMinWidthM: 12, source: 'user', accessSource: 'user' }] });
  });
});
