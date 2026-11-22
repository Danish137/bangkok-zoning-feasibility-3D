// ─── Engine Web Worker ───
// Runs the same deterministic engine off the main thread so map interaction stays smooth.
import { runFeasibility } from './engine/feasibility';
import type { SiteInput } from './engine/types';

self.onmessage = (e: MessageEvent<{ id: number; input: SiteInput }>) => {
  const { id, input } = e.data;
  try {
    const result = runFeasibility(input);
    (self as unknown as Worker).postMessage({ id, result });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
