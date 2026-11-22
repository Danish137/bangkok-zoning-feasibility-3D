// ─── Engine Web Worker ───
// Runs the same deterministic engine off the main thread. Reference data (zoning layer, stations) is loaded
// once; if it fails (offline), results are still computed and the zone is reported as not verified.
import { runFeasibility } from './engine/feasibility';
import type { SiteData, SiteInput } from './engine/types';
import { loadSiteData } from './siteData';

let data: SiteData = {};
let dataError: string | null = null;
const ready = loadSiteData(self.location.origin).then(
  (d) => { data = d; },
  (e) => { dataError = e instanceof Error ? e.message : String(e); },
);

self.onmessage = async (e: MessageEvent<{ id: number; input: SiteInput }>) => {
  const { id, input } = e.data;
  await ready;
  try {
    const result = runFeasibility(input, data);
    if (dataError) result.warnings.push(`Reference data could not be loaded (${dataError}); the zone and station proximity are not verified.`);
    (self as unknown as Worker).postMessage({ id, result });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
