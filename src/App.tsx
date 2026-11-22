// ─── App root ───
import React, { useEffect } from 'react';
import { AppProvider, useActiveDesign, useAppDispatch, useAppState } from './state';
import { MapContainer } from './components/MapContainer';
import { StageBar } from './components/StageBar';
import { SidePanel } from './components/SidePanel';
import { useEngine } from './hooks/useEngine';
import { fmtNum } from './components/ui';

function Hud() {
  const s = useAppState();
  const d = useActiveDesign();
  const r = s.result;
  if (!r?.valid || !d || s.drawing.active) return null;
  const item = (label: string, value: React.ReactNode, tone = 'text-slate-100') => (
    <div className="px-3">
      <div className="text-[9.5px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`text-[12.5px] font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
  return (
    <div data-testid="hud" className="fixed bottom-3 left-3 z-40 flex max-w-[calc(100vw-25rem)] items-center divide-x divide-slate-700/60 overflow-x-auto rounded-xl border border-slate-700/60 bg-slate-900/90 py-1.5 shadow-2xl backdrop-blur-xl max-[900px]:hidden">
      {item('Design', s.activeDesign === 'a' ? 'A · Max yield' : 'B · Open space', s.activeDesign === 'a' ? 'text-indigo-300' : 'text-sky-300')}
      {item('Plot', `${fmtNum(r.plotAreaSqm)} m²`)}
      {item('Floor area', `${fmtNum(d.totalGFA)} m²`, 'text-indigo-200')}
      {item('FAR', `${d.far.toFixed(2)} / 7.00`)}
      {item('Height', `${fmtNum(d.heightM, 1)} m · ${d.floorCount} st.`)}
      {item('Open space', `${d.openSpacePct.toFixed(0)} %`, 'text-emerald-300')}
      {item('Checks', d.compliant ? `No fails · ${d.unverifiedCount} unverified` : `${d.failCount} FAIL`, d.compliant ? 'text-emerald-300' : 'text-rose-300')}
    </div>
  );
}

function CameraControls() {
  const s = useAppState();
  const dispatch = useAppDispatch();
  if (s.polygon.length < 3) return null;
  const btn = (label: string, title: string, kind: Parameters<typeof dispatch>[0] & { type: 'CAMERA' }, testId: string) => (
    <button data-testid={testId} title={title} onClick={() => dispatch(kind)}
      className="h-8 min-w-8 rounded-lg border border-slate-700/60 bg-slate-900/90 px-2 text-[11px] text-slate-200 shadow-lg backdrop-blur hover:bg-slate-800">{label}</button>
  );
  return (
    <div className="fixed bottom-20 left-3 z-40 flex gap-1 max-[900px]:bottom-3">
      {btn('⟲', 'Rotate 45° left', { type: 'CAMERA', kind: 'rotate-left' }, 'cam-rotate-left')}
      {btn('⟳', 'Rotate 45° right', { type: 'CAMERA', kind: 'rotate-right' }, 'cam-rotate-right')}
      {btn('Top', 'Plan view', { type: 'CAMERA', kind: 'top' }, 'cam-top')}
      {btn('3D', 'Perspective view', { type: 'CAMERA', kind: 'perspective' }, 'cam-3d')}
      {btn('Reset view', 'Frame the plot', { type: 'CAMERA', kind: 'reset' }, 'cam-reset')}
    </div>
  );
}

function AppInner() {
  useEngine();
  const state = useAppState();
  const dispatch = useAppDispatch();
  useEffect(() => {
    // test / debugging hook
    (window as unknown as Record<string, unknown>).__BKK__ = { state, dispatch };
  }, [state, dispatch]);

  return (
    <div className="relative h-screen w-screen select-none overflow-hidden bg-slate-950 font-sans">
      <MapContainer />
      <div className="fixed left-3 top-3 z-40 rounded-xl border border-slate-700/60 bg-slate-900/90 px-3 py-2 shadow-2xl backdrop-blur-xl max-[900px]:top-16">
        <div className="text-[12px] font-semibold tracking-wide text-white">Bangkok Feasibility Studio</div>
        <div className="text-[10px] text-slate-400">Zone ย.9 (Yor.9) · Bangkok Plan B.E. 2556 · MR 33 / MR 55</div>
      </div>
      <StageBar />
      <SidePanel />
      <CameraControls />
      <Hud />
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
