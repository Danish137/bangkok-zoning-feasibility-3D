// ─── App Root Component ───
import React from 'react';
import { AppProvider } from './state';
import { MapContainer } from './components/MapContainer';
import { StageBar } from './components/StageBar';
import { SidePanel } from './components/SidePanel';
import { useEngine } from './hooks/useEngine';

function AppInner() {
  useEngine();

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-neutral-900">
      <MapContainer />
      <StageBar />
      <SidePanel />

      {/* Zone badge */}
      <div className="fixed bottom-4 left-4 z-50 bg-neutral-900/80 backdrop-blur-sm border border-neutral-700/50 rounded-lg px-3 py-1.5 text-[10px] text-neutral-400">
        <span className="text-amber-400 font-medium">Zone Yor.9</span>
        <span className="mx-1.5">·</span>
        <span>Bangkok B.E. 2556</span>
        <span className="mx-1.5">·</span>
        <span>Sukhumvit / Thonglor</span>
      </div>
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
