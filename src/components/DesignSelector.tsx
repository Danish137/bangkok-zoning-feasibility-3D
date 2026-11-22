// ─── Building stage panel: two concept designs + spatial layers ───
import React from 'react';
import { useAppDispatch, useAppState, type GuideKey } from '../state';
import type { DesignResult } from '../engine/types';
import { Callout, Metric, Section, Toggle, fmtNum } from './ui';

export function DesignCard({ d, active, onSelect, testId }: { d: DesignResult; active: boolean; onSelect: () => void; testId: string }) {
  return (
    <button
      data-testid={testId}
      onClick={onSelect}
      className={`w-full rounded-xl border p-3 text-left transition-colors ${active ? 'border-indigo-400 bg-indigo-600/15 shadow-lg shadow-indigo-950/40' : 'border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/60'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[12.5px] font-semibold text-slate-50">{d.label}</div>
          <div className="text-[10.5px] text-slate-400">{d.objective}</div>
        </div>
        <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9.5px] font-bold ${d.compliant ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300' : 'border-rose-500/50 bg-rose-500/15 text-rose-300'}`}>
          {d.compliant ? 'NO FAILS' : `${d.failCount} FAIL`}
          {d.unverifiedCount ? ` · ${d.unverifiedCount} UNVERIFIED` : ''}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1">
        <Metric label="Floor area" value={`${fmtNum(d.totalGFA)} m²`} tone="accent" />
        <Metric label="FAR" value={d.far.toFixed(2)} />
        <Metric label="Height" value={`${fmtNum(d.heightM, 1)} m`} sub={`${d.floorCount} storeys`} />
        <Metric label="Footprint" value={`${fmtNum(d.footprintSqm)} m²`} sub={`${d.groundCoveragePct.toFixed(0)} % cover`} />
        <Metric label="Open space" value={`${fmtNum(d.openSpaceSqm)} m²`} sub={`${d.openSpacePct.toFixed(0)} % of plot`} tone="good" />
        <Metric label="Class" value={d.isHighRise || d.isExtraLarge ? 'MR 33' : 'Low-rise'} sub={d.isHighRise ? 'high-rise' : d.isExtraLarge ? 'extra-large' : '< 23 m'} />
      </div>
    </button>
  );
}

const LAYERS: { key: GuideKey; label: string; swatch: string; hint: string }[] = [
  { key: 'buildable', label: '② Buildable footprint (setbacks)', swatch: '#34d399', hint: 'Ground area left after the mandatory boundary and road setbacks' },
  { key: 'envelope', label: '③ Allowable floor envelope', swatch: '#22d3ee', hint: 'Per-floor allowable polygons after setbacks and the 2:1 sky plane' },
  { key: 'skyPlane', label: '2:1 sky-exposure planes', swatch: '#f59e0b', hint: 'MR 55 Cl. 44: height ≤ 2 × distance to the opposite road boundary' },
  { key: 'openSpace', label: 'Open space (plot − footprint)', swatch: '#10b981', hint: 'Uncovered land counted for OSR / MR 55 / MR 33 open space' },
  { key: 'roads', label: 'Road corridors (entered widths)', swatch: '#64748b', hint: 'Road reserve of the entered width, centreline and opposite boundary' },
  { key: 'threshold23', label: '23 m high-rise threshold', swatch: '#ef4444', hint: 'MR 33 Cl. 1: buildings ≥ 23 m are high-rise' },
];

export function LayerToggles() {
  const s = useAppState();
  const dispatch = useAppDispatch();
  return (
    <Section title="Spatial layers">
      <div className="mb-1 flex items-center gap-2 text-[10.5px] text-slate-400">
        <span className="h-2.5 w-2.5 rounded-sm bg-slate-200" /> ① Plot boundary (always)
        <span className="ml-2 h-2.5 w-2.5 rounded-sm bg-indigo-500" /> ④ Designed floors
      </div>
      <div className="flex flex-col gap-1">
        {LAYERS.map((l) => (
          <Toggle key={l.key} testId={`guide-${l.key}`} label={l.label} swatch={l.swatch} hint={l.hint} checked={s.guides[l.key]} onChange={() => dispatch({ type: 'TOGGLE_GUIDE', guide: l.key })} />
        ))}
      </div>
    </Section>
  );
}

export function DesignSelector() {
  const s = useAppState();
  const dispatch = useAppDispatch();
  const r = s.result;
  if (!r?.designA) {
    return <Callout tone="warn">No design fits this plot. {r?.warnings.join(' ')} {r?.errors.join(' ')}</Callout>;
  }
  const active = s.activeDesign === 'b' && r.designB ? r.designB : r.designA;
  return (
    <div data-testid="design-selector" className="flex flex-col gap-5 text-xs">
      <Section title="Concept designs">
        <DesignCard d={r.designA} active={s.activeDesign === 'a'} onSelect={() => dispatch({ type: 'SET_ACTIVE_DESIGN', design: 'a' })} testId="design-a" />
        {r.designB ? (
          <DesignCard d={r.designB} active={s.activeDesign === 'b'} onSelect={() => dispatch({ type: 'SET_ACTIVE_DESIGN', design: 'b' })} testId="design-b" />
        ) : (
          <Callout tone="warn">Design B could not be generated: the plot is too small to cut the footprint and still fit a usable floor plate.</Callout>
        )}
      </Section>

      <Section title={`Why ${active === r.designA ? 'Design A' : 'Design B'} stops here`}>
        <ul data-testid="limiting-constraints" className="flex flex-col gap-1">
          {active.limitingConstraints.map((c) => (
            <li key={c} className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-2.5 py-1.5 text-[11px] leading-snug text-amber-100">{c}</li>
          ))}
        </ul>
        <div className="text-[10.5px] leading-snug text-slate-400">{active.description}</div>
      </Section>

      <Section title="Envelope applied">
        <div className="grid grid-cols-2 gap-1.5">
          <Metric label="Building class" value={active.envelope.classLabel.split(' (')[0]} />
          <Metric label="Buildable footprint" value={`${fmtNum(active.envelope.buildableAreaSqm)} m²`} />
        </div>
        <div className="flex flex-col gap-1">
          {active.envelope.setbacks.map((sb) => (
            <div key={sb.edgeIndex}
              onMouseEnter={() => dispatch({ type: 'FOCUS_EDGE', edgeIndex: sb.edgeIndex })}
              onMouseLeave={() => dispatch({ type: 'FOCUS_EDGE', edgeIndex: null })}
              className="flex items-start justify-between gap-2 rounded border border-slate-700/40 bg-slate-800/20 px-2 py-1 text-[10.5px]">
              <span className="font-mono text-slate-300">E{sb.edgeIndex + 1} <span className="text-slate-500">{sb.kind}</span></span>
              <span className="text-right text-slate-400"><b className="text-slate-100">{fmtNum(sb.distanceM, 2)} m</b> · {sb.reference}</span>
            </div>
          ))}
        </div>
      </Section>

      <LayerToggles />
    </div>
  );
}
