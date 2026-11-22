// ─── App state & reducer ───
import React, { createContext, useContext, useReducer, type Dispatch } from 'react';
import type {
  BuildingType, FeasibilityResult, LngLat, LngLatPolygon, RoadAdvisory, RoadEdgeInput,
} from './engine/types';
import { PRESET_PLOTS } from './engine/presets';
import { isSelfIntersecting, normalizePolygonWinding, pathSegmentCrosses } from './engine/polygon';
import { runFeasibility } from './engine/feasibility';

export type Stage = 'site' | 'building' | 'floor' | 'compliance' | 'report';
export type GuideKey = 'buildable' | 'envelope' | 'skyPlane' | 'openSpace' | 'threshold23' | 'roads';

export interface DrawingState {
  active: boolean;
  vertices: LngLat[];
  message: string | null;
}

export interface AppState {
  stage: Stage;
  drawing: DrawingState;
  /** Committed plot, always CCW (so edge indices are stable for the engine) */
  polygon: LngLatPolygon;
  roadEdges: RoadEdgeInput[];
  buildingType: BuildingType;
  nearTransitDeclared: boolean;
  activePresetId: string | null;
  /** Plot before the current drawing session (restored on cancel) */
  previousPlot: { polygon: LngLatPolygon; roadEdges: RoadEdgeInput[]; presetId: string | null } | null;
  plotMessage: string | null;

  activeDesign: 'a' | 'b';
  selectedFloor: number | null;
  sectionCutaway: boolean;
  guides: Record<GuideKey, boolean>;
  hoveredCheck: string | null;
  focusedCheck: string | null;
  focusedEdge: number | null;

  result: FeasibilityResult | null;
  computing: boolean;
  roadAdvisory: RoadAdvisory[];
  cameraCommand: { kind: 'reset' | 'rotate-left' | 'rotate-right' | 'top' | 'perspective'; n: number } | null;
}

export const DEFAULT_ROAD_WIDTH = 10;
const defaultPreset = PRESET_PLOTS[0]!;

function normalizePreset(polygon: LngLatPolygon, roadEdges: RoadEdgeInput[]) {
  const norm = normalizePolygonWinding(polygon, roadEdges.map((r) => r.edgeIndex));
  return {
    polygon: norm.vertices,
    roadEdges: roadEdges.map((r) => ({ edgeIndex: norm.remap(r.edgeIndex), widthM: r.widthM })),
  };
}

const initialPlot = normalizePreset(defaultPreset.polygon, defaultPreset.roadEdges);

function computeInitial(): FeasibilityResult | null {
  try {
    return runFeasibility({ polygonLngLat: initialPlot.polygon, roadEdges: initialPlot.roadEdges, buildingType: defaultPreset.buildingType });
  } catch {
    return null;
  }
}

export const initialState: AppState = {
  stage: 'site',
  drawing: { active: false, vertices: [], message: null },
  polygon: initialPlot.polygon,
  roadEdges: initialPlot.roadEdges,
  buildingType: defaultPreset.buildingType,
  nearTransitDeclared: false,
  activePresetId: defaultPreset.id,
  previousPlot: null,
  plotMessage: null,
  activeDesign: 'a',
  selectedFloor: null,
  sectionCutaway: false,
  guides: { buildable: true, envelope: false, skyPlane: true, openSpace: true, threshold23: false, roads: true },
  hoveredCheck: null,
  focusedCheck: null,
  focusedEdge: null,
  result: computeInitial(),
  computing: false,
  roadAdvisory: [],
  cameraCommand: null,
};

export type AppAction =
  | { type: 'SET_STAGE'; stage: Stage }
  | { type: 'START_DRAWING' }
  | { type: 'ADD_DRAFT_VERTEX'; coord: LngLat }
  | { type: 'UNDO_DRAFT_VERTEX' }
  | { type: 'FINISH_DRAWING' }
  | { type: 'CANCEL_DRAWING' }
  | { type: 'CLEAR_PLOT' }
  | { type: 'SET_PRESET'; presetId: string }
  | { type: 'MOVE_VERTEX'; index: number; coord: LngLat }
  | { type: 'TOGGLE_ROAD_EDGE'; edgeIndex: number }
  | { type: 'SET_ROAD_WIDTH'; edgeIndex: number; widthM: number }
  | { type: 'SET_BUILDING_TYPE'; buildingType: BuildingType }
  | { type: 'SET_TRANSIT'; value: boolean }
  | { type: 'SET_ACTIVE_DESIGN'; design: 'a' | 'b' }
  | { type: 'SET_SELECTED_FLOOR'; floor: number | null }
  | { type: 'TOGGLE_GUIDE'; guide: GuideKey }
  | { type: 'TOGGLE_SECTION_CUTAWAY' }
  | { type: 'HOVER_CHECK'; id: string | null }
  | { type: 'FOCUS_CHECK'; id: string | null }
  | { type: 'FOCUS_EDGE'; edgeIndex: number | null }
  | { type: 'COMPUTING' }
  | { type: 'SET_RESULT'; result: FeasibilityResult | null }
  | { type: 'SET_ROAD_ADVISORY'; advisory: RoadAdvisory[] }
  | { type: 'CAMERA'; kind: NonNullable<AppState['cameraCommand']>['kind'] }
  | { type: 'DISMISS_PLOT_MESSAGE' };

function resetSelection(s: AppState): Partial<AppState> {
  return { selectedFloor: null, focusedCheck: null, hoveredCheck: null, focusedEdge: null };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_STAGE':
      if (state.drawing.active && action.stage !== 'site') return state;
      return { ...state, stage: action.stage, focusedCheck: null, hoveredCheck: null };

    case 'START_DRAWING':
      return {
        ...state,
        ...resetSelection(state),
        stage: 'site',
        drawing: { active: true, vertices: [], message: null },
        previousPlot: state.polygon.length >= 3 ? { polygon: state.polygon, roadEdges: state.roadEdges, presetId: state.activePresetId } : state.previousPlot,
        plotMessage: null,
        roadAdvisory: [],
      };

    case 'ADD_DRAFT_VERTEX': {
      if (!state.drawing.active) return state;
      const v = state.drawing.vertices;
      const last = v[v.length - 1];
      if (last && Math.abs(last[0] - action.coord[0]) < 1e-9 && Math.abs(last[1] - action.coord[1]) < 1e-9) return state;
      if (pathSegmentCrosses(v, action.coord)) {
        return { ...state, drawing: { ...state.drawing, message: 'That segment would cross an existing edge. Choose another point.' } };
      }
      return { ...state, drawing: { ...state.drawing, vertices: [...v, action.coord], message: null } };
    }

    case 'UNDO_DRAFT_VERTEX':
      if (!state.drawing.active) return state;
      return { ...state, drawing: { ...state.drawing, vertices: state.drawing.vertices.slice(0, -1), message: null } };

    case 'FINISH_DRAWING': {
      if (!state.drawing.active) return state;
      const v = state.drawing.vertices;
      if (v.length < 3) {
        return { ...state, drawing: { ...state.drawing, message: 'Place at least three points before finishing.' } };
      }
      if (isSelfIntersecting(v)) {
        return { ...state, drawing: { ...state.drawing, message: 'The closing edge would cross another edge. Undo a point or move it.' } };
      }
      const norm = normalizePolygonWinding(v);
      return {
        ...state,
        drawing: { active: false, vertices: [], message: null },
        polygon: norm.vertices,
        roadEdges: [],
        activePresetId: null,
        previousPlot: null,
        plotMessage: 'Plot created. Now click the edge(s) that face a public road and set each road width.',
        cameraCommand: { kind: 'reset', n: (state.cameraCommand?.n ?? 0) + 1 },
      };
    }

    case 'CANCEL_DRAWING': {
      if (!state.drawing.active) return state;
      const prev = state.previousPlot;
      return {
        ...state,
        drawing: { active: false, vertices: [], message: null },
        polygon: prev ? prev.polygon : state.polygon,
        roadEdges: prev ? prev.roadEdges : state.roadEdges,
        activePresetId: prev ? prev.presetId : state.activePresetId,
        previousPlot: null,
      };
    }

    case 'CLEAR_PLOT':
      return {
        ...state,
        ...resetSelection(state),
        stage: 'site',
        drawing: { active: false, vertices: [], message: null },
        polygon: [],
        roadEdges: [],
        activePresetId: null,
        previousPlot: null,
        plotMessage: null,
        result: null,
        roadAdvisory: [],
      };

    case 'SET_PRESET': {
      const p = PRESET_PLOTS.find((x) => x.id === action.presetId);
      if (!p) return state;
      const norm = normalizePreset(p.polygon, p.roadEdges);
      return {
        ...state,
        ...resetSelection(state),
        drawing: { active: false, vertices: [], message: null },
        polygon: norm.polygon,
        roadEdges: norm.roadEdges,
        buildingType: p.buildingType,
        activePresetId: p.id,
        previousPlot: null,
        plotMessage: null,
        roadAdvisory: [],
        cameraCommand: { kind: 'reset', n: (state.cameraCommand?.n ?? 0) + 1 },
      };
    }

    case 'MOVE_VERTEX': {
      if (action.index < 0 || action.index >= state.polygon.length) return state;
      const next = state.polygon.map((p, i) => (i === action.index ? action.coord : p)) as LngLatPolygon;
      if (isSelfIntersecting(next)) {
        return { ...state, plotMessage: 'That move would make the boundary cross itself, so it was not applied.' };
      }
      const norm = normalizePolygonWinding(next, state.roadEdges.map((r) => r.edgeIndex));
      return {
        ...state,
        polygon: norm.vertices,
        roadEdges: state.roadEdges.map((r) => ({ edgeIndex: norm.remap(r.edgeIndex), widthM: r.widthM })),
        activePresetId: null,
        plotMessage: norm.wasReversed ? 'The plot was flipped; road edges were remapped to the same physical boundaries.' : null,
      };
    }

    case 'TOGGLE_ROAD_EDGE': {
      if (action.edgeIndex < 0 || action.edgeIndex >= state.polygon.length) return state;
      const exists = state.roadEdges.some((r) => r.edgeIndex === action.edgeIndex);
      const lastWidth = state.roadEdges[state.roadEdges.length - 1]?.widthM ?? DEFAULT_ROAD_WIDTH;
      return {
        ...state,
        roadEdges: exists
          ? state.roadEdges.filter((r) => r.edgeIndex !== action.edgeIndex)
          : [...state.roadEdges, { edgeIndex: action.edgeIndex, widthM: lastWidth }].sort((a, b) => a.edgeIndex - b.edgeIndex),
        activePresetId: null,
        plotMessage: null,
      };
    }

    case 'SET_ROAD_WIDTH':
      return {
        ...state,
        roadEdges: state.roadEdges.map((r) => (r.edgeIndex === action.edgeIndex ? { ...r, widthM: action.widthM } : r)),
        activePresetId: null,
      };

    case 'SET_BUILDING_TYPE':
      return { ...state, buildingType: action.buildingType, selectedFloor: null };

    case 'SET_TRANSIT':
      return { ...state, nearTransitDeclared: action.value };

    case 'SET_ACTIVE_DESIGN':
      return { ...state, activeDesign: action.design, selectedFloor: null, focusedCheck: null };

    case 'SET_SELECTED_FLOOR':
      return { ...state, selectedFloor: action.floor };

    case 'TOGGLE_GUIDE':
      return { ...state, guides: { ...state.guides, [action.guide]: !state.guides[action.guide] } };

    case 'TOGGLE_SECTION_CUTAWAY':
      return { ...state, sectionCutaway: !state.sectionCutaway };

    case 'HOVER_CHECK':
      return { ...state, hoveredCheck: action.id };

    case 'FOCUS_CHECK':
      return { ...state, focusedCheck: state.focusedCheck === action.id ? null : action.id };

    case 'FOCUS_EDGE':
      return { ...state, focusedEdge: action.edgeIndex };

    case 'COMPUTING':
      return { ...state, computing: true };

    case 'SET_RESULT': {
      const r = action.result;
      const design = state.activeDesign === 'b' ? r?.designB : r?.designA;
      const floorOk = state.selectedFloor !== null && design && state.selectedFloor < design.floors.length;
      return { ...state, result: r, computing: false, selectedFloor: floorOk ? state.selectedFloor : null };
    }

    case 'SET_ROAD_ADVISORY':
      return { ...state, roadAdvisory: action.advisory };

    case 'CAMERA':
      return { ...state, cameraCommand: { kind: action.kind, n: (state.cameraCommand?.n ?? 0) + 1 } };

    case 'DISMISS_PLOT_MESSAGE':
      return { ...state, plotMessage: null };

    default:
      return state;
  }
}

const AppStateContext = createContext<AppState>(initialState);
const AppDispatchContext = createContext<Dispatch<AppAction>>(() => {});

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  return (
    <AppStateContext.Provider value={state}>
      <AppDispatchContext.Provider value={dispatch}>{children}</AppDispatchContext.Provider>
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  return useContext(AppStateContext);
}

export function useAppDispatch() {
  return useContext(AppDispatchContext);
}

/** Active design helper */
export function useActiveDesign() {
  const s = useAppState();
  return s.activeDesign === 'b' ? s.result?.designB ?? null : s.result?.designA ?? null;
}
