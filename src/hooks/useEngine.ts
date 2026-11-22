// ─── Engine hook ───
// Recomputes the feasibility result whenever plot, roads, building type or transit flag change.
// Work runs in a Web Worker (latest request wins); falls back to the main thread if needed.
import { useEffect, useRef } from 'react';
import { useAppDispatch, useAppState } from '../state';
import { runFeasibility } from '../engine/feasibility';
import type { FeasibilityResult, SiteInput } from '../engine/types';

type Reply = { id: number; result?: FeasibilityResult; error?: string };

export function useEngine() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const workerRef = useRef<Worker | null>(null);
  const reqId = useRef(0);
  const firstRun = useRef(true);

  useEffect(() => {
    try {
      const w = new Worker(new URL('../engine.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<Reply>) => {
        if (e.data.id !== reqId.current) return; // stale
        if (e.data.error) {
          console.error('Engine error:', e.data.error);
          dispatch({ type: 'SET_RESULT', result: null });
        } else {
          dispatch({ type: 'SET_RESULT', result: e.data.result ?? null });
        }
      };
      w.onerror = (ev) => {
        console.warn('Engine worker failed; falling back to main thread', ev.message);
        workerRef.current = null;
      };
      workerRef.current = w;
    } catch {
      workerRef.current = null;
    }
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [dispatch]);

  useEffect(() => {
    if (firstRun.current) {
      // initial result is computed synchronously in initialState
      firstRun.current = false;
      if (state.result) return;
    }
    if (state.polygon.length < 3) {
      dispatch({ type: 'SET_RESULT', result: null });
      return;
    }
    const input: SiteInput = {
      polygonLngLat: state.polygon,
      roadEdges: state.roadEdges,
      buildingType: state.buildingType,
      nearTransitDeclared: state.nearTransitDeclared,
    };
    const id = ++reqId.current;
    dispatch({ type: 'COMPUTING' });
    if (workerRef.current) {
      workerRef.current.postMessage({ id, input });
    } else {
      const t = setTimeout(() => {
        if (id !== reqId.current) return;
        try {
          dispatch({ type: 'SET_RESULT', result: runFeasibility(input) });
        } catch (err) {
          console.error('Engine error:', err);
          dispatch({ type: 'SET_RESULT', result: null });
        }
      }, 0);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.polygon, state.roadEdges, state.buildingType, state.nearTransitDeclared, dispatch]);
}
