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
    <div data-testid="site-controls" className="flex flex-col gap-4 text-xs">
      {/* 1. Bangkok Preset Plots */}
      <Section title="Zone Yor.9 Preset Plots">
        <div className="flex flex-col gap-1.5">
          {PRESET_PLOTS.map((p) => {
            const isSelected = state.activePresetId === p.id;
            return (
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
                className={`text-left px-3 py-2.5 rounded-xl border transition-all ${
                  isSelected
                    ? 'bg-indigo-600/25 border-indigo-500 text-white shadow-md'
                    : 'bg-slate-800/50 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-100">{p.label}</span>
                  <span className="text-[10px] font-mono text-indigo-400 bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-800/50">
                    {p.roadWidth}m road
                  </span>
                </div>
                <div className="text-slate-400 text-[10px] mt-1 leading-snug">{p.description}</div>
              </button>
            );
          })}
        </div>
      </Section>

      {/* 2. Building Typology */}
      <Section title="Building Typology">
        <div className="grid grid-cols-1 gap-1.5">
          {(Object.entries(BUILDING_TYPES) as [BuildingType, typeof BUILDING_TYPES[BuildingType]][]).map(
            ([key, config]) => {
              const isSelected = state.buildingType === key;
              return (
                <button
                  key={key}
                  data-testid={`building-type-${key}`}
                  onClick={() => dispatch({ type: 'SET_BUILDING_TYPE', buildingType: key })}
                  className={`text-left px-3 py-2 rounded-xl border transition-all ${
                    isSelected
                      ? 'bg-indigo-600/25 border-indigo-500 text-white shadow-md'
                      : 'bg-slate-800/50 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <div className="font-semibold text-slate-100 flex items-center justify-between">
                    <span>{config.label}</span>
                    <span className="text-[10px] text-slate-400 font-normal">
                      {config.floorToFloor}m / fl
                    </span>
                  </div>
                  <div className="text-slate-400 text-[10px] mt-0.5">
                    {config.maxHeightCap ? `Max height ${config.maxHeightCap}m` : 'High-rise eligible (MR 33)'}
                  </div>
                </button>
              );
            }
          )}
        </div>
      </Section>

      {/* 3. Road Width Controls */}
      <Section title="Road Width & Frontage">
        <div className="flex flex-wrap gap-1 mb-2">
          {ROAD_PRESETS.map((w) => (
            <button
              key={w}
              data-testid={`road-width-${w}`}
              onClick={() => dispatch({ type: 'SET_ROAD_WIDTH', width: w })}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium border transition-all ${
                state.roadWidth === w
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm'
                  : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {w}m
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 bg-slate-800/40 border border-slate-700/50 rounded-xl px-3 py-2">
          <input
            type="range"
            min={4}
            max={40}
            step={1}
            value={state.roadWidth}
            onChange={(e) => dispatch({ type: 'SET_ROAD_WIDTH', width: Number(e.target.value) })}
            className="flex-1 accent-indigo-500 cursor-pointer"
          />
          <span className="text-xs font-mono font-bold text-indigo-300 min-w-8 text-right">
            {state.roadWidth}m
          </span>
        </div>
      </Section>

      {/* 4. Interactive Help Callout */}
      <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-3 text-[10px] text-slate-400 space-y-1">
        <div className="font-semibold text-slate-300 flex items-center gap-1.5 mb-1 text-[11px]">
          <span>💡</span> Interactive Site Actions
        </div>
        <div>• <strong>Click plot edges</strong> to toggle road frontage (<span className="text-amber-400">orange line</span>)</div>
        <div>• <strong>Drag white vertex nodes</strong> to reshape any plot in real time</div>
        <div>• <strong>Click 3D slabs</strong> to inspect individual floors</div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
        {title}
      </h3>
      {children}
    </div>
  );
}
