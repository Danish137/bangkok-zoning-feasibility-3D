// ─── Design Selector & Building Controls ───
import React from 'react';
import { useAppState, useAppDispatch } from '../state';

export function DesignSelector() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { designA, designB, activeDesign } = state;

  const designs = [
    { key: 'a' as const, label: 'Design A', subtitle: designA?.label ?? 'Max-Yield Envelope', data: designA },
    { key: 'b' as const, label: 'Design B', subtitle: designB?.label ?? 'Alternative Option', data: designB },
    { key: 'envelope' as const, label: 'Envelope', subtitle: 'Allowable Building Volume', data: null },
  ];

  const guides = [
    { key: 'setbacks' as const, label: 'Setback Boundaries (MR 33/55)', active: state.showSetbacks, color: 'bg-emerald-400' },
    { key: 'skyPlane' as const, label: '2:1 Sky Exposure Plane (MR 55)', active: state.showSkyPlane, color: 'bg-amber-400' },
    { key: 'heightCap' as const, label: '23m Height Limit Cap', active: state.showHeightCap, color: 'bg-rose-400' },
    { key: 'osr' as const, label: 'OSR Open Space Footprint', active: state.showOSR, color: 'bg-teal-400' },
  ];

  return (
    <div data-testid="design-selector" className="flex flex-col gap-4 text-xs">
      {/* Design Options */}
      <Section title="Concept Massing Options">
        <div className="flex flex-col gap-2">
          {designs.map((d) => {
            const isSelected = activeDesign === d.key;
            return (
              <button
                key={d.key}
                data-testid={`design-${d.key}`}
                onClick={() => dispatch({ type: 'SET_ACTIVE_DESIGN', design: d.key })}
                className={`text-left p-3 rounded-xl border transition-all ${
                  isSelected
                    ? 'bg-indigo-600/25 border-indigo-500 text-white shadow-md'
                    : 'bg-slate-800/50 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-slate-100">{d.label}</span>
                  {d.data && (
                    <span className="text-[10px] font-mono text-indigo-300 bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-800/40">
                      FAR {d.data.actualFAR}
                    </span>
                  )}
                </div>
                <div className="text-slate-400 text-[10px] leading-snug">{d.subtitle}</div>
                {d.data && (
                  <div className="grid grid-cols-3 gap-1 mt-2 pt-2 border-t border-slate-700/40 text-[10px] font-mono text-slate-300">
                    <div>
                      <span className="text-slate-500 text-[9px] block">GFA</span>
                      {d.data.totalGFA.toLocaleString()} m²
                    </div>
                    <div>
                      <span className="text-slate-500 text-[9px] block">STOREYS</span>
                      {d.data.floorCount}F ({d.data.heightM}m)
                    </div>
                    <div>
                      <span className="text-slate-500 text-[9px] block">OPEN SPACE</span>
                      {d.data.openSpacePercent}%
                    </div>
                  </div>
                )}
                {d.data?.limitingConstraint && isSelected && (
                  <div className="mt-2 text-[10px] text-amber-300/90 bg-amber-500/10 border border-amber-500/25 rounded-lg p-2 leading-relaxed">
                    <div className="font-semibold text-amber-400 mb-0.5 flex items-center gap-1">
                      <span>ℹ️</span> Limiting Constraint:
                    </div>
                    {d.data.limitingConstraint}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </Section>

      {/* 3D Regulatory Guides */}
      <Section title="3D Regulatory Constraint Planes">
        <div className="flex flex-col gap-1.5">
          {guides.map((g) => (
            <button
              key={g.key}
              data-testid={`guide-${g.key}`}
              onClick={() => dispatch({ type: 'TOGGLE_GUIDE', guide: g.key })}
              className={`flex items-center justify-between px-3 py-2 rounded-xl border transition-all text-left ${
                g.active
                  ? 'bg-slate-800/80 border-slate-600 text-white'
                  : 'bg-slate-800/30 border-slate-700/40 text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="text-[11px]">{g.label}</span>
              <span className={`w-2.5 h-2.5 rounded-full transition-transform ${g.active ? `${g.color} shadow-sm shadow-current scale-110` : 'bg-slate-600'}`} />
            </button>
          ))}
        </div>
      </Section>

      {/* Quick Metrics */}
      {state.evaluation && (
        <Section title="Plot Diagnostics">
          <div className="grid grid-cols-2 gap-1.5 text-[10px]">
            <Metric label="Zoning District" value="Zone Yor.9 (Brown)" />
            <Metric label="Plot Area" value={`${state.evaluation.plotAreaSqm.toLocaleString()} m²`} />
            <Metric label="Frontage" value={`${state.evaluation.frontageM}m (${state.roadWidth}m Road)`} />
            <Metric label="Permit Track" value={state.evaluation.highRiseEligible ? 'High-Rise Eligible' : 'Low-Rise ≤23m'} />
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl px-2.5 py-1.5">
      <div className="text-slate-400 text-[9px]">{label}</div>
      <div className="text-slate-200 font-medium truncate">{value}</div>
    </div>
  );
}
