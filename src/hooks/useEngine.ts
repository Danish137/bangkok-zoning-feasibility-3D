// ─── Engine Hook ───
// Recomputes designs whenever polygon/edges/buildingType change
import { useEffect } from 'react';
import { useAppState, useAppDispatch } from '../state';
import { anchorAtCentroid, polygonToMetric } from '../engine/geo';
import { ensureCCW, polygonArea, edgeLength } from '../engine/polygon';
import { evaluate } from '../engine/rules';
import { generateDesigns } from '../engine/designs';
import type { PlotEdge, ZoningInput } from '../engine/types';

export function useEngine() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (state.polygon.length < 3) {
      dispatch({ type: 'CLEAR_RESULTS' });
      return;
    }

    try {
      const anchor = anchorAtCentroid(state.polygon);
      const metricPoly = polygonToMetric(anchor, state.polygon);
      const ccwPoly = ensureCCW(metricPoly);

      const edges: PlotEdge[] = ccwPoly.map((_, i) => {
        const isRoad = state.roadEdges.includes(i);
        return {
          index: i,
          start: ccwPoly[i]!,
          end: ccwPoly[(i + 1) % ccwPoly.length]!,
          type: isRoad ? 'road' : 'side',
          roadWidth: isRoad ? state.roadWidth : undefined,
        };
      });

      const input: ZoningInput = {
        polygon: ccwPoly,
        edges,
        buildingType: state.buildingType,
        roadWidths: new Map(
          state.roadEdges.map((i) => [i, state.roadWidth])
        ),
        polygonLngLat: state.polygon,
      };

      const evaluationResult = evaluate(input);
      const [designA, designB] = generateDesigns(input);

      dispatch({
        type: 'SET_RESULTS',
        designA,
        designB,
        evaluation: evaluationResult,
      });

      // Expose state for testing
      (window as any).__BANGKOK_ZONING_STATE__ = {
        input,
        evaluation: evaluationResult,
        designA,
        designB,
      };
    } catch (err) {
      console.error('Engine error:', err);
      dispatch({ type: 'CLEAR_RESULTS' });
    }
  }, [state.polygon, state.roadEdges, state.roadWidth, state.buildingType]);
}
