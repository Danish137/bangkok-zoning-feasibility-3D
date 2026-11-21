// ─── Compliance Checklist ───
import React from 'react';
import { useAppState, useAppDispatch } from '../state';
import type { ComplianceCheck } from '../engine/types';

export function ComplianceChecklist() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  const design = state.activeDesign === 'b' ? state.designB : state.designA;
  if (!design) {
    return (
      <div data-testid="compliance-checklist" className="text-xs text-neutral-500 p-4">
        No design computed. Draw or select a plot.
      </div>
    );
  }

  const passCount = design.checks.filter(c => c.pass).length;
  const totalCount = design.checks.length;
  const allPass = passCount === totalCount;

  return (
    <div data-testid="compliance-checklist" className="flex flex-col gap-3">
      {/* Design Switcher for Independent Compliance Audits */}
      <div className="flex bg-slate-900/90 border border-slate-700/60 rounded-xl p-1 gap-1">
        <button
          data-testid="checklist-design-a-btn"
          onClick={() => dispatch({ type: 'SET_ACTIVE_DESIGN', design: 'a' })}
          className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-medium transition-all ${
            state.activeDesign === 'a'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Option A: Max Yield
        </button>
        <button
          data-testid="checklist-design-b-btn"
          onClick={() => dispatch({ type: 'SET_ACTIVE_DESIGN', design: 'b' })}
          className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-medium transition-all ${
            state.activeDesign === 'b'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Option B: Open Space
        </button>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
          Statutory Compliance Matrix ({state.activeDesign === 'b' ? 'Design B' : 'Design A'})
        </h3>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
          allPass ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
        }`}>
          {passCount}/{totalCount} Pass
        </span>
      </div>

      <div className="text-[10px] text-neutral-400 leading-tight">
        Hover any regulation to spotlight its 3D constraint plane on the model:
      </div>

      <div className="flex flex-col gap-1.5">
        {design.checks.map((check, i) => (
          <CheckRow
            key={check.rule}
            check={check}
            index={i}
            isHovered={state.hoveredRule === check.rule}
            onHover={(rule) => dispatch({ type: 'SET_HOVERED_RULE', rule })}
          />
        ))}
      </div>

      {/* EIA Warning / Exemption Notice */}
      {design.eiaRequired ? (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs">
          <div className="font-medium text-amber-400 flex items-center gap-1.5">
            <span>⚠️</span> EIA Review Required
          </div>
          <div className="text-amber-300/80 text-[10px] mt-1">{design.eiaReason}</div>
          <div className="text-[9px] text-amber-400/60 mt-1">
            Required before building permit under Thai NEB notification.
          </div>
        </div>
      ) : (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-2.5 text-xs">
          <div className="font-medium text-emerald-400 flex items-center gap-1.5">
            <span>⚡</span> Fast-Track EIA Exempt
          </div>
          <div className="text-emerald-300/80 text-[10px] mt-0.5">
            Height ≤ 23m and units &lt; 80: eligible for direct municipal permit.
          </div>
        </div>
      )}

      {/* Road Blocker */}
      {state.evaluation?.roadBlocker && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-xs">
          <div className="font-medium text-red-400 flex items-center gap-1.5">
            <span>🚫</span> Road Frontage Blocker
          </div>
          <div className="text-red-300/80 text-[10px] mt-1">{state.evaluation.roadBlocker}</div>
        </div>
      )}

      {/* BTS Flag */}
      {state.evaluation?.btsFlag && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 text-xs">
          <div className="font-medium text-blue-400 flex items-center gap-1.5">
            <span>🚇</span> BTS / MRT 500m Transit Bonus
          </div>
          <div className="text-blue-300/80 text-[10px] mt-1">
            Zone Yor.9 commercial bonus: verify if site centroid is within 500m walking radius of BTS Phrom Phong / Thong Lo.
          </div>
        </div>
      )}
    </div>
  );
}

function CheckRow({
  check,
  index,
  isHovered,
  onHover,
}: {
  check: ComplianceCheck;
  index: number;
  isHovered: boolean;
  onHover: (rule: string | null) => void;
}) {
  return (
    <div
      data-testid={`check-${check.rule}`}
      onMouseEnter={() => onHover(check.rule)}
      onMouseLeave={() => onHover(null)}
      className={`flex items-start gap-2.5 px-3 py-2 rounded-lg text-xs transition-all cursor-pointer ${
        isHovered
          ? 'bg-neutral-800 border border-indigo-500 shadow-md scale-[1.01]'
          : check.pass
            ? 'bg-neutral-800/40 border border-neutral-700/50 hover:bg-neutral-800'
            : 'bg-red-500/10 border border-red-500/30 hover:bg-red-500/20'
      }`}
    >
      <span className="text-sm mt-0.5 flex-shrink-0">
        {check.pass ? '✅' : '❌'}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <div className="font-medium text-neutral-200">{check.label}</div>
          <div className="text-[10px] font-mono text-neutral-400">
            {check.actual} {check.unit}
          </div>
        </div>
        <div className="text-[10px] text-neutral-500 mt-0.5">
          Limit: <span className="text-neutral-300">{check.allowed}</span>
          {check.unit ? ` ${check.unit}` : ''}
        </div>
        <div className="text-[9px] text-neutral-400 mt-0.5 leading-snug">
          {check.statutoryRef}
        </div>
      </div>
    </div>
  );
}
