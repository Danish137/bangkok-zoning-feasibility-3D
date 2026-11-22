// ─── Contextual side panel ───
import React, { useState } from 'react';
import { useAppDispatch, useAppState, type Stage } from '../state';
import { SiteControls } from './SiteControls';
import { DesignSelector } from './DesignSelector';
import { FloorInspector } from './FloorInspector';
import { ComplianceChecklist } from './ComplianceChecklist';
import { ReportView } from './ReportView';
import { STAGES } from './StageBar';

const TITLES: Record<Stage, [string, string]> = {
  site: ['Site', 'Plot, road frontage and building type'],
  building: ['Building', 'Two concept designs inside the legal envelope'],
  floor: ['Floor', 'Storey-by-storey geometry and areas'],
  compliance: ['Compliance', 'Rule-by-rule check of the selected design'],
  report: ['Report', 'Summary, sources and export'],
};

export function SidePanel() {
  const s = useAppState();
  const dispatch = useAppDispatch();
  const [collapsed, setCollapsed] = useState(false);
  const idx = STAGES.findIndex((x) => x.id === s.stage);
  const canAdvance = !!s.result?.designA && !s.drawing.active;
  const next = STAGES[idx + 1];
  const prev = STAGES[idx - 1];
  const [title, subtitle] = TITLES[s.stage];

  return (
    <aside data-testid="side-panel" className={`fixed right-3 top-3 bottom-3 z-40 flex flex-col transition-all duration-300 ${collapsed ? 'w-11' : 'w-[22.5rem] max-w-[calc(100vw-1.5rem)]'}`}>
      <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900/92 text-slate-100 shadow-2xl backdrop-blur-xl">
        <header className="flex items-center gap-2 border-b border-slate-800 px-4 py-2.5">
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="rounded bg-indigo-600/30 px-1.5 font-mono text-[10px] text-indigo-200">{idx + 1}/5</span>
                <span className="text-[13px] font-semibold">{title}</span>
                {s.computing && <span data-testid="computing" className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" title="Recalculating…" />}
              </div>
              <div className="truncate text-[10.5px] text-slate-400">{subtitle}</div>
            </div>
          )}
          <button onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Expand panel' : 'Collapse panel'} className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
            {collapsed ? '‹' : '›'}
          </button>
        </header>
        {!collapsed && (
          <>
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {s.stage === 'site' && <SiteControls />}
              {s.stage === 'building' && <DesignSelector />}
              {s.stage === 'floor' && <FloorInspector />}
              {s.stage === 'compliance' && <ComplianceChecklist />}
              {s.stage === 'report' && <ReportView />}
            </div>
            <footer className="flex gap-2 border-t border-slate-800 px-4 py-2.5">
              <button data-testid="stage-prev" disabled={!prev} onClick={() => prev && dispatch({ type: 'SET_STAGE', stage: prev.id })}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-[11.5px] text-slate-300 hover:bg-slate-800 disabled:opacity-30">‹ {prev?.label ?? 'Back'}</button>
              <button data-testid="stage-next" disabled={!next || !canAdvance} onClick={() => next && dispatch({ type: 'SET_STAGE', stage: next.id })}
                className="flex-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-[11.5px] font-medium text-white hover:bg-indigo-500 disabled:opacity-30">
                {next ? `Next: ${next.label} ›` : 'Done'}
              </button>
            </footer>
          </>
        )}
      </div>
    </aside>
  );
}
