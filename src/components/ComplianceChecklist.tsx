// ─── Compliance stage panel ───
import React, { useState } from 'react';
import { useActiveDesign, useAppDispatch, useAppState } from '../state';
import type { ComplianceCheck } from '../engine/types';
import { SOURCES } from '../engine/regulations';
import { Callout, StatusPill } from './ui';

const GROUP_ORDER: ComplianceCheck['group'][] = ['Zoning', 'Open space', 'Setbacks', 'Height & form', 'Access', 'Classification', 'Integrity'];

export function ComplianceChecklist() {
  const s = useAppState();
  const dispatch = useAppDispatch();
  const design = useActiveDesign();
  const r = s.result;
  if (!r || !design) return <Callout tone="warn">No design to check. Select or draw a plot.</Callout>;
  const counts = { PASS: 0, FAIL: 0, UNVERIFIED: 0, INFO: 0, 'N/A': 0 } as Record<ComplianceCheck['status'], number>;
  design.checks.forEach((c) => counts[c.status]++);

  return (
    <div data-testid="compliance-checklist" className="flex flex-col gap-4 text-xs">
      <div className="flex rounded-lg border border-slate-700/60 bg-slate-900/80 p-0.5">
        {(['a', 'b'] as const).map((k) => (
          <button key={k} data-testid={`checklist-design-${k}-btn`} disabled={k === 'b' && !r.designB}
            onClick={() => dispatch({ type: 'SET_ACTIVE_DESIGN', design: k })}
            className={`flex-1 rounded-md py-1.5 text-[11px] font-medium ${s.activeDesign === k ? (k === 'a' ? 'bg-indigo-600' : 'bg-sky-600') + ' text-white' : 'text-slate-400 hover:text-white'} disabled:opacity-30`}>
            {k === 'a' ? 'Design A · Max yield' : 'Design B · Open space'}
          </button>
        ))}
      </div>

      <div data-testid="compliance-summary" className={`rounded-xl border p-3 ${design.compliant ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-rose-500/50 bg-rose-500/10'}`}>
        <div className="text-[12.5px] font-semibold text-slate-50">
          {design.compliant ? 'No rule fails' : `${counts.FAIL} rule${counts.FAIL > 1 ? 's' : ''} fail. This design is NOT compliant`}
        </div>
        <div className="mt-1 flex flex-wrap gap-2 text-[10.5px] text-slate-300">
          <span>{counts.PASS} pass</span><span>· {counts.FAIL} fail</span><span>· {counts.UNVERIFIED} unverified</span><span>· {counts.INFO} info</span><span>· {counts['N/A']} n/a</span>
        </div>
        {counts.UNVERIFIED > 0 && <div className="mt-1 text-[10px] leading-snug text-amber-200/90">UNVERIFIED means the tool lacks the data to decide. It is not a pass. Resolve these items with official documents before relying on the result.</div>}
      </div>

      <div className="text-[10.5px] text-slate-400">Hover a rule to highlight its geometry in 3D; click to pin it and see the details.</div>

      {GROUP_ORDER.map((g) => {
        const items = design.checks.filter((c) => c.group === g);
        if (!items.length) return null;
        return (
          <div key={g} className="flex flex-col gap-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{g}</div>
            {items.map((c) => <CheckRow key={c.id} c={c} pinned={s.focusedCheck === c.id} />)}
          </div>
        );
      })}
    </div>
  );
}

function CheckRow({ c, pinned }: { c: ComplianceCheck; pinned: boolean }) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const expanded = open || pinned;
  const src = c.sourceId ? (SOURCES as Record<string, { url: string; title: string }>)[c.sourceId] : undefined;
  const border = c.status === 'FAIL' ? 'border-rose-500/50 bg-rose-500/5' : c.status === 'UNVERIFIED' ? 'border-amber-500/30 bg-amber-500/[0.03]' : 'border-slate-700/50 bg-slate-800/25';
  return (
    <div
      data-testid={`check-${c.id}`}
      data-status={c.status}
      onMouseEnter={() => dispatch({ type: 'HOVER_CHECK', id: c.id })}
      onMouseLeave={() => dispatch({ type: 'HOVER_CHECK', id: null })}
      className={`rounded-lg border px-2.5 py-2 transition-colors ${border} ${pinned ? 'ring-1 ring-rose-400/70' : ''}`}
    >
      <button className="flex w-full items-start gap-2 text-left" onClick={() => { setOpen(!open); dispatch({ type: 'FOCUS_CHECK', id: c.id }); }}>
        <StatusPill status={c.status} />
        <div className="min-w-0 flex-1">
          <div className="text-[11.5px] font-medium leading-tight text-slate-100">{c.label}</div>
          <div className="mt-0.5 grid grid-cols-[auto_1fr] gap-x-2 text-[10.5px] leading-snug">
            <span className="text-slate-500">Actual</span><span className="tabular-nums text-slate-200">{c.actual}</span>
            <span className="text-slate-500">Required</span><span className="tabular-nums text-slate-300">{c.required}</span>
          </div>
        </div>
        {c.geometry && <span title="Highlights geometry in 3D" className="mt-0.5 text-[10px] text-slate-500">◎</span>}
      </button>
      {expanded && (
        <div className="mt-1.5 border-t border-slate-700/40 pt-1.5 text-[10.5px] leading-relaxed text-slate-300">
          <div>{c.explanation}</div>
          <div className="mt-1 text-[10px] text-slate-400">
            Reference: <span className="text-slate-200">{c.reference}</span>
            {src && <> · <a href={src.url} target="_blank" rel="noreferrer" className="text-sky-300 underline-offset-2 hover:underline">source</a></>}
          </div>
        </div>
      )}
    </div>
  );
}
