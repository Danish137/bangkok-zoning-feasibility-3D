// ─── App state & reducer ───
import React, { createContext, useContext, useReducer, type Dispatch } from 'react';
import type {
  BuildingType, FeasibilityResult, LngLat, LngLatPolygon, ParkingMode, RoadAdvisory, RoadEdgeInput,
} from './engine/types';
import type { RoadAnalysis } from './site/roadAnalysis';
import { DEFAULT_AVG_UNIT_SIZE_SQM } from './engine/regulations';
import { PRESET_PLOTS } from './engine/presets';
import { isSelfIntersecting, normalizePolygonWinding, pathSegmentCrosses } from './engine/polygon';
import { runFeasibility } from './engine/feasibility';

export type Stage = 'site' | 'building' | 'floor' | 'compliance' | 'report';
export type GuideKey = 'buildable' | 'envelope' | 'skyPlane' | 'openSpace' | 'threshold23' | 'roads' | 'zoning' | 'transit';

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
  avgUnitSizeSqm: number;
  parkingMode: ParkingMode;
  activePresetId: string | null;
  /** Map-geometry road analysis for the current polygon (key = polygon JSON) */
  roadAnalysis: { key: string; analysis: RoadAnalysis } | null;
  /** Mark detected road frontages automatically when the next analysis arrives (new drawn plot) */
  autoRoadsPending: boolean;
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
    roadEdges: roadEdges.map((r) => ({ ...r, edgeIndex: norm.remap(r.edgeIndex) })),
  };
}

export const polygonKey = (p: LngLatPolygon) => JSON.stringify(p);

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
  avgUnitSizeSqm: DEFAULT_AVG_UNIT_SIZE_SQM,
  parkingMode: 'podium',
  activePresetId: defaultPreset.id,
  roadAnalysis: null,
  autoRoadsPending: false,
  previousPlot: null,
  plotMessage: null,
  activeDesign: 'a',
  selectedFloor: null,
  sectionCutaway: false,
  guides: { buildable: true, envelope: false, skyPlane: true, openSpace: true, threshold23: false, roads: true, zoning: true, transit: true },
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
  | { type: 'SET_AVG_UNIT'; sqm: number }
  | { type: 'SET_PARKING_MODE'; mode: ParkingMode }
  | { type: 'SET_ROAD_ANALYSIS'; key: string; analysis: RoadAnalysis; final?: boolean }
  | { type: 'SET_ACCESS_WIDTH'; edgeIndex: number; widthM: number | undefined }
  | { type: 'USE_ROAD_ESTIMATE'; edgeIndex: number }
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
        roadAnalysis: null,
        autoRoadsPending: true,
        plotMessage: 'Plot created. Road frontages are detected from the map automatically; check them and replace the estimated widths with surveyed ones when available.',
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
        roadAnalysis: null,
        autoRoadsPending: false,
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
        roadAnalysis: null,
        autoRoadsPending: false,
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
        roadEdges: state.roadEdges.map((r) => ({ ...r, edgeIndex: norm.remap(r.edgeIndex) })),
        activePresetId: null,
        plotMessage: norm.wasReversed ? 'The plot was flipped; road edges were remapped to the same physical boundaries.' : null,
      };
    }

    case 'TOGGLE_ROAD_EDGE': {
      if (action.edgeIndex < 0 || action.edgeIndex >= state.polygon.length) return state;
      const exists = state.roadEdges.some((r) => r.edgeIndex === action.edgeIndex);
      const lastWidth = state.roadEdges[state.roadEdges.length - 1]?.widthM ?? DEFAULT_ROAD_WIDTH;
      const est = state.roadAnalysis?.key === polygonKey(state.polygon) ? estimateFor(state.roadAnalysis.analysis, action.edgeIndex) : null;
      return {
        ...state,
        roadEdges: exists
          ? state.roadEdges.filter((r) => r.edgeIndex !== action.edgeIndex)
          : [...state.roadEdges, est ?? { edgeIndex: action.edgeIndex, widthM: lastWidth, source: 'user' as const }].sort((a, b) => a.edgeIndex - b.edgeIndex),
        activePresetId: null,
        plotMessage: null,
      };
    }

    case 'SET_ROAD_WIDTH':
      return {
        ...state,
        roadEdges: state.roadEdges.map((r) => (r.edgeIndex === action.edgeIndex ? { ...r, widthM: action.widthM, source: 'user' as const } : r)),
        activePresetId: null,
      };

    case 'SET_ACCESS_WIDTH':
      return {
        ...state,
        roadEdges: state.roadEdges.map((r) => (r.edgeIndex === action.edgeIndex
          ? (action.widthM === undefined ? { ...r, accessMinWidthM: undefined, accessSource: undefined } : { ...r, accessMinWidthM: action.widthM, accessSource: 'user' as const })
          : r)),
        activePresetId: null,
      };

    case 'USE_ROAD_ESTIMATE': {
      const est = state.roadAnalysis?.key === polygonKey(state.polygon) ? estimateFor(state.roadAnalysis.analysis, action.edgeIndex) : null;
      if (!est) return state;
      return { ...state, roadEdges: state.roadEdges.map((r) => (r.edgeIndex === action.edgeIndex ? est : r)) };
    }

    case 'SET_ROAD_ANALYSIS': {
      if (action.key !== polygonKey(state.polygon)) return state; // stale
      const a = action.analysis;
      let roadEdges = state.roadEdges.map((r) => {
        const est = estimateFor(a, r.edgeIndex);
        if (!est) return r;
        return {
          ...r,
          ...(r.source === 'map-estimate' ? { widthM: est.widthM } : {}),
          ...(r.accessSource !== 'user' && est.accessMinWidthM !== undefined ? { accessMinWidthM: est.accessMinWidthM, accessSource: 'map-estimate' as const } : {}),
        };
      });
      let plotMessage = state.plotMessage;
      const found = a.edges.some((e) => e.facesRoad);
      if (state.autoRoadsPending && !found && action.final === false) {
        return { ...state, roadAnalysis: { key: action.key, analysis: a }, roadEdges }; // wait for the retry
      }
      if (state.autoRoadsPending && roadEdges.length === 0) {
        roadEdges = a.edges.filter((e) => e.facesRoad).map((e) => estimateFor(a, e.edgeIndex)!).filter(Boolean);
        plotMessage = roadEdges.length
          ? `Detected ${roadEdges.length} road frontage${roadEdges.length > 1 ? 's' : ''} from the map (${roadEdges.map((r) => `E${r.edgeIndex + 1} ≈ ${r.widthM} m`).join(', ')}). These are estimates: check them and enter surveyed widths when available.`
          : 'No road frontage was detected from the map. Click the edge(s) that face a public road.';
      }
      return { ...state, roadAnalysis: { key: action.key, analysis: a }, roadEdges, autoRoadsPending: false, plotMessage };
    }

    case 'SET_AVG_UNIT':
      return { ...state, avgUnitSizeSqm: action.sqm };

    case 'SET_PARKING_MODE':
      return { ...state, parkingMode: action.mode };

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

/** Road input built from the map analysis for one edge (estimated width + access-route width) */
export function estimateFor(a: RoadAnalysis, edgeIndex: number): RoadEdgeInput | null {
  const e = a.edges.find((x) => x.edgeIndex === edgeIndex);
  if (!e?.facesRoad || e.estimatedWidthM === undefined) return null;
  const acc = a.access.find((x) => x.fromEdge === edgeIndex);
  return {
    edgeIndex, widthM: e.estimatedWidthM, source: 'map-estimate',
    ...(acc ? { accessMinWidthM: acc.minWidthM, accessSource: 'map-estimate' as const } : {}),
  };
}
