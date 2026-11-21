// ─── App State & Context ───
import React, { createContext, useContext, useReducer, type Dispatch } from 'react';
import type {
  LngLatPolygon, BuildingType, DesignVariant, PresetPlot, LngLat,
} from './engine/types';
import type { DesignResult, EvaluationResult } from './engine/types';
import { PRESET_PLOTS } from './engine/presets';

export type Stage = 'site' | 'building' | 'floor' | 'compliance' | 'report';

export interface AppState {
  // Navigation
  stage: Stage;

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

export const initialState: AppState = {
  stage: 'site',
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
  designA: null,
  designB: null,
  evaluation: null,
};

export type AppAction =
  | { type: 'SET_STAGE'; stage: Stage }
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
    case 'SET_POLYGON':
      return { ...state, polygon: action.polygon, activePresetId: null };
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
    case 'SET_PRESET':
      return {
        ...state,
        polygon: action.polygon,
        roadEdges: action.roadEdges,
        roadWidth: action.roadWidth,
        buildingType: action.buildingType,
        activePresetId: action.presetId,
        selectedFloor: 0,
      };
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
