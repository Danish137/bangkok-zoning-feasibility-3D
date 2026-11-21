// ─── App Root Component ───
import React from 'react';
import { AppProvider, useAppState } from './state';
import { MapContainer } from './components/MapContainer';
import { StageBar } from './components/StageBar';
import { SidePanel } from './components/SidePanel';
import { useEngine } from './hooks/useEngine';

function AppInner() {
  useEngine();
  const state = useAppState();
  const activeDesign = state.activeDesign === 'b' ? state.designB : state.designA;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans select-none">
      {/* 1. Full-screen 3D MapLibre + Three.js Canvas */}
      <MapContainer />

      {/* 2. Top-Left Studio Branding */}
      <div className="fixed top-4 left-5 z-40 flex items-center gap-2.5 bg-slate-900/85 backdrop-blur-xl border border-slate-700/60 rounded-xl px-3 py-2 shadow-2xl">
        <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
        <div>
          <div className="text-[11px] font-bold text-white tracking-wide uppercase flex items-center gap-1.5">
            <span>Bangkok Zoning Studio</span>
            <span className="text-[9px] font-normal px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
              Yor.9
            </span>
          </div>
          <div className="text-[9px] text-slate-400">
            Sukhumvit / Thonglor · B.E. 2556 Comprehensive Plan
          </div>
        </div>
      </div>

      {/* 3. Central Floating Stage Bar */}
      <StageBar />

      {/* 4. Contextual Floating Side Panel */}
      <SidePanel />

      {/* 5. Bottom Live Metrics HUD */}
      {state.evaluation && (
        <div className="fixed bottom-4 left-5 z-40 flex items-center gap-2 max-w-[calc(100vw-24rem)] overflow-x-auto py-1">
          <div className="bg-slate-900/85 backdrop-blur-xl border border-slate-700/60 rounded-xl px-3 py-1.5 shadow-2xl flex items-center gap-4 text-xs">
            <div>
              <div className="text-[9px] text-slate-400 uppercase tracking-wider">Plot Area</div>
              <div className="font-semibold text-slate-100 font-mono">
                {state.evaluation.plotAreaSqm.toLocaleString()} m²
              </div>
            </div>

            <div className="w-px h-6 bg-slate-800" />

            <div>
              <div className="text-[9px] text-slate-400 uppercase tracking-wider">Permissible FAR</div>
              <div className="font-semibold text-slate-100 font-mono">
                {activeDesign ? activeDesign.actualFAR : state.evaluation.actualFAR} / 7.0
              </div>
            </div>

            <div className="w-px h-6 bg-slate-800" />

            <div>
              <div className="text-[9px] text-slate-400 uppercase tracking-wider">Total GFA</div>
              <div className="font-semibold text-indigo-300 font-mono">
                {(activeDesign ? activeDesign.totalGFA : state.evaluation.totalGFA).toLocaleString()} m²
              </div>
            </div>

            <div className="w-px h-6 bg-slate-800" />

            <div>
              <div className="text-[9px] text-slate-400 uppercase tracking-wider">Storeys</div>
              <div className="font-semibold text-slate-100 font-mono">
                {activeDesign ? activeDesign.floorCount : state.evaluation.floorCount}F ({activeDesign ? activeDesign.heightM : state.evaluation.heightM}m)
              </div>
            </div>

            <div className="w-px h-6 bg-slate-800" />

            <div>
              <div className="text-[9px] text-slate-400 uppercase tracking-wider">EIA Status</div>
              <div className={`font-semibold text-[10px] px-1.5 py-0.5 rounded ${
                activeDesign?.eiaRequired
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'bg-emerald-500/20 text-emerald-300'
              }`}>
                {activeDesign?.eiaRequired ? '⚠️ EIA Req' : '⚡ EIA Exempt'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}
