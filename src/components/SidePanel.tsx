// ─── Floating Side Panel ───
import React, { useState } from 'react';
import { useAppState } from '../state';
import { SiteControls } from './SiteControls';
import { DesignSelector } from './DesignSelector';
import { FloorInspector } from './FloorInspector';
import { ComplianceChecklist } from './ComplianceChecklist';
import { ReportView } from './ReportView';

export function SidePanel() {
  const { stage } = useAppState();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      data-testid="side-panel"
      className={`fixed top-20 right-4 bottom-6 z-40 transition-all duration-300 flex flex-col ${
        collapsed ? 'w-12 pointer-events-auto' : 'w-84 max-w-[calc(100vw-2rem)]'
      }`}
    >
      <div className="h-full bg-slate-900/90 backdrop-blur-xl border border-slate-700/60 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/80 bg-slate-950/40 select-none">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <span className="text-sm">
                {stage === 'site' && '📍'}
                {stage === 'building' && '🏗️'}
                {stage === 'floor' && '🏢'}
                {stage === 'compliance' && '⚖️'}
                {stage === 'report' && '📊'}
              </span>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                {stage === 'site' && 'Site & Plot Setup'}
                {stage === 'building' && 'Building Massing'}
                {stage === 'floor' && 'Floor & Section'}
                {stage === 'compliance' && 'Statutory Compliance'}
                {stage === 'report' && 'Feasibility Report'}
              </span>
            </div>
          )}

          <button
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Expand panel' : 'Collapse panel'}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors ml-auto text-xs"
          >
            {collapsed ? '◀' : '▶'}
          </button>
        </div>

        {/* Scrollable Content Area */}
        {!collapsed && (
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {stage === 'site' && <SiteControls />}
            {stage === 'building' && <DesignSelector />}
            {stage === 'floor' && <FloorInspector />}
            {stage === 'compliance' && <ComplianceChecklist />}
            {stage === 'report' && <ReportView />}
          </div>
        )}

        {/* Minimized icon strip */}
        {collapsed && (
          <div className="flex-1 flex flex-col items-center py-4 gap-4 text-sm text-slate-400">
            <button onClick={() => setCollapsed(false)} className="hover:text-white">
              {stage === 'site' && '📍'}
              {stage === 'building' && '🏗️'}
              {stage === 'floor' && '🏢'}
              {stage === 'compliance' && '⚖️'}
              {stage === 'report' && '📊'}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
