// ─── Site Controls Panel ───
import React from 'react';
import { useAppState, useAppDispatch } from '../state';
import { BUILDING_TYPES, type BuildingType } from '../engine/types';
import { PRESET_PLOTS } from '../engine/presets';

const ROAD_PRESETS = [6, 8, 10, 12, 18, 30];

export function SiteControls() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  return (
    <div data-testid="site-controls" className="flex flex-col gap-4">
      {/* Preset Plots */}
      <Section title="Quick Start Presets">
        <div className="flex flex-col gap-1.5">
          {PRESET_PLOTS.map((p) => (
            <button
              key={p.id}
              data-testid={`preset-${p.id}`}
              onClick={() =>
                dispatch({
                  type: 'SET_PRESET',
                  presetId: p.id,
                  polygon: p.polygon,
                  roadEdges: p.roadEdges,
                  roadWidth: p.roadWidth,
                  buildingType: p.buildingType,
                })
              }
              className={`text-left px-3 py-2 rounded-lg text-xs transition-all ${
                state.activePresetId === p.id
                  ? 'bg-blue-500/20 border border-blue-500/50 text-blue-300'
                  : 'bg-neutral-800 border border-neutral-700 text-neutral-300 hover:border-neutral-500'
              }`}
            >
              <div className="font-medium">{p.label}</div>
              <div className="text-neutral-500 text-[10px] mt-0.5">{p.description}</div>
            </button>
          ))}
        </div>
      </Section>

      {/* Building Type */}
      <Section title="Building Type">
        <div className="flex flex-col gap-1">
          {(Object.entries(BUILDING_TYPES) as [BuildingType, typeof BUILDING_TYPES[BuildingType]][]).map(
            ([key, config]) => (
              <button
                key={key}
                data-testid={`building-type-${key}`}
                onClick={() => dispatch({ type: 'SET_BUILDING_TYPE', buildingType: key })}
                className={`text-left px-3 py-2 rounded-lg text-xs transition-all ${
                  state.buildingType === key
                    ? 'bg-amber-500/20 border border-amber-500/50 text-amber-300'
                    : 'bg-neutral-800 border border-neutral-700 text-neutral-300 hover:border-neutral-500'
                }`}
              >
                <div className="font-medium">{config.label}</div>
                <div className="text-neutral-500 text-[10px] mt-0.5">
                  {config.floorToFloor}m floor-to-floor
                  {config.maxHeightCap ? ` · Max ${config.maxHeightCap}m` : ''}
                </div>
              </button>
            )
          )}
        </div>
      </Section>

      {/* Road Width */}
      <Section title="Road Width">
        <div className="flex flex-wrap gap-1 mb-2">
          {ROAD_PRESETS.map((w) => (
            <button
              key={w}
              data-testid={`road-width-${w}`}
              onClick={() => dispatch({ type: 'SET_ROAD_WIDTH', width: w })}
              className={`px-2 py-1 rounded text-xs font-mono transition-all ${
                state.roadWidth === w
                  ? 'bg-green-500/20 border border-green-500/50 text-green-300'
                  : 'bg-neutral-800 border border-neutral-700 text-neutral-400 hover:border-neutral-500'
              }`}
            >
              {w}m
            </button>
          ))}
        </div>
        <input
          type="range"
          min={4}
          max={40}
          step={1}
          value={state.roadWidth}
          onChange={(e) => dispatch({ type: 'SET_ROAD_WIDTH', width: Number(e.target.value) })}
          className="w-full accent-green-500"
        />
        <div className="text-center text-xs text-neutral-400 mt-1">
          {state.roadWidth}m
        </div>
      </Section>

      {/* Instructions */}
      <Section title="Plot Drawing">
        <div className="text-[10px] text-neutral-500 leading-relaxed">
          <p>• Click the map to draw plot vertices</p>
          <p>• Click first vertex to close the polygon</p>
          <p>• Drag vertices to reshape</p>
          <p>• Click an edge to toggle road frontage</p>
          <p className="text-amber-400 mt-1">🟠 = Road-facing edge</p>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
        {title}
      </h3>
      {children}
    </div>
  );
}
