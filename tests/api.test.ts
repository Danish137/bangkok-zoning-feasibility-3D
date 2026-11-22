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
