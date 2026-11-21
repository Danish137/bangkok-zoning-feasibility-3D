// ─── Side Panel ───
import React from 'react';
import { useAppState } from '../state';
import { SiteControls } from './SiteControls';
import { DesignSelector } from './DesignSelector';
import { FloorInspector } from './FloorInspector';
import { ComplianceChecklist } from './ComplianceChecklist';
import { ReportView } from './ReportView';

export function SidePanel() {
  const { stage } = useAppState();

  return (
    <aside
      data-testid="side-panel"
      className="fixed right-0 top-0 bottom-0 w-72 z-40 bg-neutral-900/95 backdrop-blur-md border-l border-neutral-800 overflow-y-auto"
    >
      <div className="pt-16 pb-6 px-4">
        {/* Stage title */}
        <h2 className="text-xs font-bold text-white uppercase tracking-widest mb-4">
          {stage === 'site' && '📍 Site Setup'}
          {stage === 'building' && '🏗️ Building Design'}
          {stage === 'floor' && '🏢 Floor Inspector'}
          {stage === 'compliance' && '✅ Compliance Check'}
          {stage === 'report' && '📊 Report'}
        </h2>

        {/* Stage content */}
        {stage === 'site' && <SiteControls />}
        {stage === 'building' && <DesignSelector />}
        {stage === 'floor' && <FloorInspector />}
        {stage === 'compliance' && <ComplianceChecklist />}
        {stage === 'report' && <ReportView />}
      </div>
    </aside>
  );
}
