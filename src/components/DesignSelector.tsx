// ─── Design Selector & Building Controls ───
import React from 'react';
import { useAppState, useAppDispatch } from '../state';

export function DesignSelector() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { designA, designB, activeDesign } = state;

  const designs = [
    { key: 'a' as const, label: 'Design A', subtitle: designA?.label ?? 'Max-Yield Envelope', data: designA },
    { key: 'b' as const, label: 'Design B', subtitle: designB?.label ?? 'Alternative', data: designB },
    { key: 'envelope' as const, label: 'Envelope', subtitle: 'Allowable Building Volume', data: null },
  ];

  const guides = [
    { key: 'setbacks' as const, label: 'Setback Boundaries', active: state.showSetbacks },
    { key: 'skyPlane' as const, label: '2:1 Sky Plane', active: state.showSkyPlane },
    { key: 'heightCap' as const, label: 'Height Cap', active: state.showHeightCap },
    { key: 'osr' as const, label: 'OSR Footprint', active: state.showOSR },
  ];

  return (
    <div data-testid="design-selector" className="flex flex-col gap-4">
      <Section title="Design Options">
        <div className="flex flex-col gap-1.5">
          {designs.map((d) => (
            <button
              key={d.key}
              data-testid={`design-${d.key}`}
              onClick={() => dispatch({ type: 'SET_ACTIVE_DESIGN', design: d.key })}
              className={`text-left px-3 py-2 rounded-lg text-xs transition-all ${
                activeDesign === d.key
                  ? 'bg-indigo-500/20 border border-indigo-500/50 text-indigo-300'
                  : 'bg-neutral-800 border border-neutral-700 text-neutral-300 hover:border-neutral-500'
              }`}
            >
              <div className="font-medium">{d.label}</div>
              <div className="text-neutral-500 text-[10px] mt-0.5">{d.subtitle}</div>
              {d.data && (
                <div className="flex gap-3 mt-1 text-[10px] text-neutral-400">
                  <span>GFA: {d.data.totalGFA.toLocaleString()} sqm</span>
                  <span>FAR: {d.data.actualFAR}</span>
                  <span>{d.data.floorCount}F</span>
                </div>
              )}
            </button>
          ))}
        </div>
      </Section>

      <Section title="3D Regulatory Guides">
        <div className="flex flex-col gap-1">
          {guides.map((g) => (
            <button
              key={g.key}
              data-testid={`guide-${g.key}`}
              onClick={() => dispatch({ type: 'TOGGLE_GUIDE', guide: g.key })}
              className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition-all ${
                g.active
                  ? 'bg-neutral-700/50 text-white'
                  : 'bg-neutral-800/50 text-neutral-500 hover:text-neutral-300'
              }`}
            >
              <span>{g.label}</span>
              <span className={`w-2 h-2 rounded-full ${g.active ? 'bg-green-400' : 'bg-neutral-600'}`} />
            </button>
          ))}
        </div>
      </Section>

      {/* Quick Metrics */}
      {state.evaluation && (
        <Section title="Plot Metrics">
          <div className="grid grid-cols-2 gap-1.5 text-[10px]">
            <Metric label="Plot Area" value={`${state.evaluation.plotAreaSqm.toLocaleString()} sqm`} />
            <Metric label="Thai Area" value={state.evaluation.plotAreaRaiNganWah} />
            <Metric label="Frontage" value={`${state.evaluation.frontageM}m`} />
            <Metric label="Road Width" value={`${state.roadWidth}m`} />
            <Metric label="High-Rise" value={state.evaluation.highRiseEligible ? '✅ Eligible' : '❌ Blocked'} />
            <Metric label="EIA" value={state.evaluation.eiaRequired ? '⚠️ Required' : '✅ Not needed'} />
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-neutral-800/50 rounded px-2 py-1">
      <div className="text-neutral-500">{label}</div>
      <div className="text-neutral-200 font-medium">{value}</div>
    </div>
  );
}
