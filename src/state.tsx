// ─── App State & Context ───
import React, { createContext, useContext, useReducer, type Dispatch } from 'react';
import type {
  LngLatPolygon, BuildingType, DesignVariant, PresetPlot, LngLat, PlotEdge, ZoningInput,
} from './engine/types';
import type { DesignResult, EvaluationResult } from './engine/types';
import { PRESET_PLOTS } from './engine/presets';
import { anchorAtCentroid, polygonToMetric } from './engine/geo';
import { ensureCCW, normalizePolygonWinding } from './engine/polygon';
import { evaluate } from './engine/rules';
import { generateDesigns } from './engine/designs';

export type Stage = 'site' | 'building' | 'floor' | 'compliance' | 'report';

export interface AppState {
  // Navigation
  stage: Stage;

  // Drawing mode & Warnings
  isDrawing: boolean;
  roadEncroachment: { roadName?: string; count: number } | null;

  // Plot
  polygon: LngLatPolygon;
  roadEdges: number[];
  roadWidth: number;
  buildingType: BuildingType;
  activePresetId: string | null;

  // Design
  activeDesign: 'a' | 'b' | 'envelope';
  selectedFloor: number | null;
  showEnvelope: boolean;
  showSetbacks: boolean;
  showSkyPlane: boolean;
  showHeightCap: boolean;
  showOSR: boolean;
  sectionCutaway: boolean;

  // Interactive highlighting
  hoveredRule: string | null;

  // Results (computed)
  designA: DesignResult | null;
  designB: DesignResult | null;
  evaluation: EvaluationResult | null;
}

const defaultPreset = PRESET_PLOTS[0]!;

function computeInitialPresetResults() {
  try {
    const anchor = anchorAtCentroid(defaultPreset.polygon);
    const metricPoly = polygonToMetric(anchor, defaultPreset.polygon);
    const ccwPoly = ensureCCW(metricPoly);
    const edges: PlotEdge[] = ccwPoly.map((_, i) => {
      const isRoad = defaultPreset.roadEdges.includes(i);
      return {
        index: i,
        start: ccwPoly[i]!,
        end: ccwPoly[(i + 1) % ccwPoly.length]!,
        type: isRoad ? 'road' : 'side',
        roadWidth: isRoad ? defaultPreset.roadWidth : undefined,
      };
    });
    const input: ZoningInput = {
      polygon: ccwPoly,
      edges,
      buildingType: defaultPreset.buildingType,
      roadWidths: new Map(defaultPreset.roadEdges.map((i) => [i, defaultPreset.roadWidth])),
    };
    const evaluation = evaluate(input);
    const [designA, designB] = generateDesigns(input);
    return { designA, designB, evaluation };
  } catch {
    return { designA: null, designB: null, evaluation: null };
  }
}

const initialResults = computeInitialPresetResults();

export const initialState: AppState = {
  stage: 'site',
  isDrawing: false,
  roadEncroachment: null,
  polygon: defaultPreset.polygon,
  roadEdges: defaultPreset.roadEdges,
  roadWidth: defaultPreset.roadWidth,
  buildingType: defaultPreset.buildingType,
  activePresetId: defaultPreset.id,
  activeDesign: 'a',
  selectedFloor: 0,
  showEnvelope: false,
  showSetbacks: true,
  showSkyPlane: true,
  showHeightCap: true,
  showOSR: true,
  sectionCutaway: false,
  hoveredRule: null,
  designA: initialResults.designA,
  designB: initialResults.designB,
  evaluation: initialResults.evaluation,
};

export type AppAction =
  | { type: 'SET_STAGE'; stage: Stage }
  | { type: 'START_DRAWING' }
  | { type: 'CANCEL_DRAWING' }
  | { type: 'FINISH_DRAWING'; polygon: LngLatPolygon }
  | { type: 'CLEAR_PLOT' }
  | { type: 'SET_ROAD_ENCROACHMENT'; encroachment: { roadName?: string; count: number } | null }
  | { type: 'SET_POLYGON'; polygon: LngLatPolygon }
  | { type: 'UPDATE_VERTEX'; index: number; coord: LngLat }
  | { type: 'SET_ROAD_EDGES'; roadEdges: number[] }
  | { type: 'TOGGLE_ROAD_EDGE'; edgeIndex: number }
  | { type: 'SET_ROAD_WIDTH'; width: number }
  | { type: 'SET_BUILDING_TYPE'; buildingType: BuildingType }
  | { type: 'SET_PRESET'; presetId: string; polygon: LngLatPolygon; roadEdges: number[]; roadWidth: number; buildingType: BuildingType }
  | { type: 'SET_ACTIVE_DESIGN'; design: 'a' | 'b' | 'envelope' }
  | { type: 'SET_SELECTED_FLOOR'; floor: number | null }
  | { type: 'TOGGLE_GUIDE'; guide: 'envelope' | 'setbacks' | 'skyPlane' | 'heightCap' | 'osr' }
  | { type: 'TOGGLE_SECTION_CUTAWAY' }
  | { type: 'SET_HOVERED_RULE'; rule: string | null }
  | { type: 'SET_RESULTS'; designA: DesignResult; designB: DesignResult; evaluation: EvaluationResult }
  | { type: 'CLEAR_RESULTS' };

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_STAGE':
      return { ...state, stage: action.stage };
    case 'START_DRAWING':
      return {
        ...state,
        isDrawing: true,
        polygon: [],
        roadEdges: [],
        activePresetId: null,
        designA: null,
        designB: null,
        evaluation: null,
        selectedFloor: 0,
        stage: 'site',
        roadEncroachment: null,
      };
    case 'CANCEL_DRAWING':
      return {
        ...state,
        isDrawing: false,
        polygon: state.polygon.length >= 3 ? state.polygon : defaultPreset.polygon,
        roadEdges: state.polygon.length >= 3 ? state.roadEdges : defaultPreset.roadEdges,
        activePresetId: state.polygon.length >= 3 ? state.activePresetId : defaultPreset.id,
      };
    case 'FINISH_DRAWING': {
      const normalized = normalizePolygonWinding(action.polygon, [0]);
      return {
        ...state,
        isDrawing: false,
        polygon: normalized.vertices,
        roadEdges: normalized.roadEdges.length > 0 ? normalized.roadEdges : [0],
        activePresetId: null,
        selectedFloor: 0,
      };
    }
    case 'CLEAR_PLOT':
      return {
        ...state,
        polygon: [],
        roadEdges: [],
        activePresetId: null,
        designA: null,
        designB: null,
        evaluation: null,
        selectedFloor: 0,
        isDrawing: false,
        roadEncroachment: null,
      };
    case 'SET_ROAD_ENCROACHMENT':
      return { ...state, roadEncroachment: action.encroachment };
    case 'SET_POLYGON': {
      const normalized = normalizePolygonWinding(action.polygon, state.roadEdges);
      return { ...state, polygon: normalized.vertices, roadEdges: normalized.roadEdges, activePresetId: null };
    }
    case 'UPDATE_VERTEX': {
      const nextPoly = [...state.polygon];
      nextPoly[action.index] = action.coord;
      return { ...state, polygon: nextPoly, activePresetId: null };
    }
    case 'SET_ROAD_EDGES':
      return { ...state, roadEdges: action.roadEdges };
    case 'TOGGLE_ROAD_EDGE': {
      const idx = action.edgeIndex;
      const edges = state.roadEdges.includes(idx)
        ? state.roadEdges.filter((e) => e !== idx)
        : [...state.roadEdges, idx];
      return { ...state, roadEdges: edges };
    }
    case 'SET_ROAD_WIDTH':
      return { ...state, roadWidth: action.width };
    case 'SET_BUILDING_TYPE':
      return { ...state, buildingType: action.buildingType };
    case 'SET_PRESET': {
      const normalized = normalizePolygonWinding(action.polygon, action.roadEdges);
      return {
        ...state,
        polygon: normalized.vertices,
        roadEdges: normalized.roadEdges,
        roadWidth: action.roadWidth,
        buildingType: action.buildingType,
        activePresetId: action.presetId,
        selectedFloor: 0,
      };
    }
    case 'SET_ACTIVE_DESIGN':
      return { ...state, activeDesign: action.design };
    case 'SET_SELECTED_FLOOR':
      return { ...state, selectedFloor: action.floor };
    case 'TOGGLE_GUIDE': {
      const key = {
        envelope: 'showEnvelope',
        setbacks: 'showSetbacks',
        skyPlane: 'showSkyPlane',
        heightCap: 'showHeightCap',
        osr: 'showOSR',
      }[action.guide] as keyof AppState;
      return { ...state, [key]: !state[key] };
    }
    case 'TOGGLE_SECTION_CUTAWAY':
      return { ...state, sectionCutaway: !state.sectionCutaway };
    case 'SET_HOVERED_RULE':
      return { ...state, hoveredRule: action.rule };
    case 'SET_RESULTS':
      return { ...state, designA: action.designA, designB: action.designB, evaluation: action.evaluation };
    case 'CLEAR_RESULTS':
      return { ...state, designA: null, designB: null, evaluation: null };
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
      <AppDispatchContext.Provider value={dispatch}>
        {children}
      </AppDispatchContext.Provider>
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  return useContext(AppStateContext);
}

export function useAppDispatch() {
  return useContext(AppDispatchContext);
}
