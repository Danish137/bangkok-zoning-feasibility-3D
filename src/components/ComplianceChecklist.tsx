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
        No design computed.
      </div>
    );
  }

  return (
    <div data-testid="compliance-checklist" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
          Rule-by-Rule Compliance
        </h3>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
          design.checks.every(c => c.pass)
            ? 'bg-green-500/20 text-green-400'
            : 'bg-red-500/20 text-red-400'
        }`}>
          {design.checks.filter(c => c.pass).length}/{design.checks.length} Pass
        </span>
      </div>

      <div className="flex flex-col gap-1">
        {design.checks.map((check, i) => (
          <CheckRow key={check.rule} check={check} index={i} />
        ))}
      </div>

      {/* EIA Warning */}
      {design.eiaRequired && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs">
          <div className="font-medium text-amber-400">⚠️ EIA Required</div>
          <div className="text-amber-300/80 text-[10px] mt-1">{design.eiaReason}</div>
        </div>
      )}

      {/* Road Blocker */}
      {state.evaluation?.roadBlocker && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-xs">
          <div className="font-medium text-red-400">🚫 Road Restriction</div>
          <div className="text-red-300/80 text-[10px] mt-1">{state.evaluation.roadBlocker}</div>
        </div>
      )}

      {/* BTS Flag */}
      {state.evaluation?.btsFlag && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 text-xs">
          <div className="font-medium text-blue-400">🚇 BTS/MRT Proximity</div>
          <div className="text-blue-300/80 text-[10px] mt-1">
            Commercial use: check 500m BTS/MRT station condition
          </div>
        </div>
      )}
    </div>
  );
}

function CheckRow({ check, index }: { check: ComplianceCheck; index: number }) {
  return (
    <div
      data-testid={`check-${check.rule}`}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all cursor-pointer hover:bg-neutral-800 ${
        check.pass ? 'bg-neutral-800/30' : 'bg-red-500/5 border border-red-500/20'
      }`}
    >
      <span className="text-sm flex-shrink-0">
        {check.pass ? '✅' : '❌'}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-neutral-200">{check.label}</div>
        <div className="text-[10px] text-neutral-500 mt-0.5">
          Actual: <span className={check.pass ? 'text-green-400' : 'text-red-400'}>{check.actual}</span>
          {check.unit ? ` ${check.unit}` : ''}
          {' · '}
          Allowed: <span className="text-neutral-300">{check.allowed}</span>
          {check.unit ? ` ${check.unit}` : ''}
        </div>
        <div className="text-[9px] text-neutral-600 mt-0.5">{check.statutoryRef}</div>
      </div>
    </div>
  );
}
