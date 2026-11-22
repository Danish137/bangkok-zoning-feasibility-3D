// ─── Report stage panel ───
import React, { useState } from 'react';
import { useAppState } from '../state';
import type { DesignResult, FeasibilityResult } from '../engine/types';
import { BUILDING_TYPES } from '../engine/types';
import { ASSUMPTIONS, SOURCES, YOR9, type LegalSource } from '../engine/regulations';
import { Button, Callout, Section, fmtNum } from './ui';

export function buildReport(r: FeasibilityResult) {
  const designJson = (d: DesignResult | null) => d && ({
    variant: d.variant,
    label: d.label,
    objective: d.objective,
    buildingClass: d.envelope.classLabel,
    compliant: d.compliant,
    failCount: d.failCount,
    unverifiedCount: d.unverifiedCount,
    totalFloorAreaSqm: d.totalGFA,
    residentialFloorAreaSqm: d.residentialGFA,
    commercialFloorAreaSqm: d.commercialGFA,
    far: d.far,
    heightM: d.heightM,
    storeys: d.floorCount,
    footprintSqm: d.footprintSqm,
    groundCoveragePct: d.groundCoveragePct,
    openSpaceSqm: d.openSpaceSqm,
    openSpaceRequirements: d.openSpaceRequirements,
    permeableRequiredSqm: d.permeableRequiredSqm,
    isHighRise: d.isHighRise,
    isExtraLarge: d.isExtraLarge,
    eia: d.eia,
    setbacks: d.envelope.setbacks,
    skyPlanes: d.envelope.skyPlanes,
    limitingConstraints: d.limitingConstraints,
    checks: d.checks,
    floorSchedule: d.floors.map((f) => ({
      storey: f.index + 1, use: f.use, elevationM: f.elevationM, heightM: f.heightM, roofM: f.topM,
      areaSqm: f.areaSqm, allowableAreaSqm: f.allowableAreaSqm, trimmed: f.isPartial,
    })),
  });
  return {
    generator: 'Bangkok Feasibility Studio (ย.9)',
    generatedAt: new Date().toISOString(),
    disclaimer: 'Pre-design feasibility estimate. Not a legal opinion or permit determination. Zone, road reserves and plot boundary are user inputs and must be confirmed with official documents.',
    input: r.input,
    site: {
      plotAreaSqm: r.plotAreaSqm,
      plotAreaThai: r.plotAreaThai,
      anchor: r.anchor,
      edges: r.edges.map((e) => ({ edge: e.index + 1, lengthM: e.lengthM, kind: e.kind, roadWidthM: e.roadWidthM ?? null })),
      jurisdiction: r.jurisdiction,
      roadEligibility: r.roadEligibility,
    },
    zoning: { zone: YOR9.code, maxFAR: YOR9.maxFAR, minOSRPctOfGFA: YOR9.minOSRFractionOfGFA * 100, maxFloorAreaSqm: r.maxFARGFA },
    designs: { A: designJson(r.designA), B: designJson(r.designB) },
    assumptions: ASSUMPTIONS,
    sources: Object.values(SOURCES),
  };
}

export function ReportView() {
  const s = useAppState();
  const r = s.result;
  const [showApi, setShowApi] = useState(false);
  if (!r?.valid || !r.designA) return <Callout tone="warn">Nothing to report yet. Select or draw a plot first.</Callout>;
  const A = r.designA, B = r.designB;
  const download = () => {
    const blob = new Blob([JSON.stringify(buildReport(r), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `feasibility-yor9-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const rows: [string, (d: DesignResult) => string][] = [
    ['Building class', (d) => d.envelope.classLabel.split(' (')[0]!],
    ['Total floor area', (d) => `${fmtNum(d.totalGFA)} m²`],
    ['FAR (max 7.00)', (d) => d.far.toFixed(2)],
    ['Height / storeys', (d) => `${fmtNum(d.heightM, 1)} m / ${d.floorCount}`],
    ['Footprint', (d) => `${fmtNum(d.footprintSqm)} m² (${d.groundCoveragePct.toFixed(0)} %)`],
    ['Open space', (d) => `${fmtNum(d.openSpaceSqm)} m² (${d.openSpacePct.toFixed(0)} %)`],
    ['Open space required', (d) => `${fmtNum(d.requiredOpenSpaceSqm)} m²`],
    ['Est. units', (d) => (d.residentialGFA > 0 ? `≈ ${d.eia.estimatedUnits}` : '—')],
    ['EIA', (d) => (d.eia.status === 'required' ? 'Required' : d.eia.status === 'check' ? 'Check' : 'Likely not')],
    ['Compliance', (d) => (d.compliant ? `No fails · ${d.unverifiedCount} unverified` : `${d.failCount} FAIL`)],
  ];
  const unverified = [...new Map([...(A.checks), ...(B?.checks ?? [])].filter((c) => c.status === 'UNVERIFIED').map((c) => [c.id, c])).values()];

  return (
    <div data-testid="report-view" className="flex flex-col gap-5 text-xs">
      <div className="flex gap-1.5">
        <Button testId="download-json-btn" variant="primary" className="flex-1" onClick={download}>Download JSON report</Button>
        <Button testId="api-preview-btn" onClick={() => setShowApi(!showApi)}>API</Button>
      </div>
      {showApi && (
        <pre data-testid="api-payload" className="max-h-48 overflow-auto rounded-lg border border-slate-700 bg-slate-950 p-2 text-[9.5px] text-slate-300">
{`POST /api/evaluate
${JSON.stringify({ polygon: r.input.polygonLngLat, roadEdges: r.input.roadEdges, buildingType: r.input.buildingType, nearTransitDeclared: !!r.input.nearTransitDeclared }, null, 1)}`}
        </pre>
      )}

      <Section title="Site">
        <table className="w-full text-[10.5px]"><tbody className="divide-y divide-slate-800">
          <Row k="Zone" v={`${YOR9.code}: user-declared, not map-verified`} />
          <Row k="Plot area" v={`${fmtNum(r.plotAreaSqm, 1)} m² (${r.plotAreaThai})`} />
          <Row k="Roads" v={r.edges.filter((e) => e.kind === 'road').map((e) => `E${e.index + 1}: ${e.roadWidthM} m reserve, ${fmtNum(e.lengthM, 1)} m frontage`).join('; ') || 'None declared'} />
          <Row k="Building type" v={BUILDING_TYPES[r.input.buildingType].label} />
          <Row k="High-rise eligible" v={r.roadEligibility.mr33Allowed ? 'Yes' : 'No'} />
          <Row k="FAR 7 floor area" v={`${fmtNum(r.maxFARGFA)} m²`} />
        </tbody></table>
      </Section>

      <Section title="Design A vs Design B">
        <table data-testid="comparison-table" className="w-full text-[10.5px] tabular-nums">
          <thead className="text-slate-400"><tr><th className="py-1 text-left font-normal" /><th className="py-1 text-right">A · Max yield</th><th className="py-1 text-right">B · Open space</th></tr></thead>
          <tbody className="divide-y divide-slate-800">
            {rows.map(([k, f]) => (
              <tr key={k}><td className="py-1 pr-2 text-slate-400">{k}</td><td className="py-1 text-right text-slate-100">{f(A)}</td><td className="py-1 text-right text-slate-100">{B ? f(B) : '—'}</td></tr>
            ))}
          </tbody>
        </table>
      </Section>

      {[A, B].filter(Boolean).map((d) => (
        <Section key={d!.variant} title={`${d!.label}: open space & rules`}>
          <table className="w-full text-[10.5px] tabular-nums"><tbody className="divide-y divide-slate-800">
            {d!.openSpaceRequirements.map((q) => (
              <tr key={q.id}><td className="py-0.5 text-slate-400">{q.label}</td><td className="py-0.5 text-right text-slate-300">{q.applies ? `≥ ${fmtNum(q.requiredSqm)} m²` : 'n/a'}</td></tr>
            ))}
            <tr><td className="py-0.5 text-slate-400">Provided</td><td className="py-0.5 text-right font-semibold text-emerald-300">{fmtNum(d!.openSpaceSqm)} m²</td></tr>
            {d!.envelope.setbacks.map((sb) => (
              <tr key={sb.edgeIndex}><td className="py-0.5 text-slate-400">Setback E{sb.edgeIndex + 1} ({sb.kind})</td><td className="py-0.5 text-right text-slate-300">{fmtNum(sb.distanceM, 2)} m · {sb.reference}</td></tr>
            ))}
            <tr><td className="py-0.5 text-slate-400">Height rule</td><td className="py-0.5 text-right text-slate-300">{d!.envelope.heightRule}</td></tr>
          </tbody></table>
          <details className="rounded border border-slate-700/50 bg-slate-800/20 px-2 py-1">
            <summary className="cursor-pointer text-[10.5px] text-slate-300">Floor schedule ({d!.floorCount} storeys, Σ {fmtNum(d!.totalGFA, 2)} m²)</summary>
            <table className="mt-1 w-full text-[10px] tabular-nums"><tbody>
              {d!.floors.map((f) => (
                <tr key={f.index}><td className="text-slate-400">L{f.index + 1} {f.use === 'commercial' ? '(retail)' : ''}</td><td className="text-right text-slate-500">+{f.elevationM.toFixed(1)} m</td><td className="text-right text-slate-200">{f.areaSqm.toFixed(2)} m²</td></tr>
              ))}
            </tbody></table>
          </details>
        </Section>
      ))}

      <Section title="Open items (UNVERIFIED)">
        <ul className="flex flex-col gap-1">
          {unverified.map((c) => (
            <li key={c.id} className="rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-[10.5px] text-amber-100"><b>{c.label}:</b> {c.explanation}</li>
          ))}
        </ul>
      </Section>

      <Section title="Assumptions">
        <ul className="list-disc space-y-1 pl-4 text-[10.5px] leading-snug text-slate-300">
          {ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}
        </ul>
      </Section>

      <Section title="Legal sources">
        <ul className="flex flex-col gap-1.5 text-[10.5px] leading-snug">
          {(Object.values(SOURCES) as LegalSource[]).map((src) => (
            <li key={src.id} className="rounded border border-slate-700/50 bg-slate-800/20 px-2 py-1">
              <a href={src.url} target="_blank" rel="noreferrer" className="font-medium text-sky-300 hover:underline">{src.title}</a>
              <div className="text-slate-400">{src.titleTh}{src.gazette ? ` · ${src.gazette}` : ''}</div>
              <div className="text-slate-500">{src.verification}</div>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <tr><td className="py-1 pr-2 align-top text-slate-400">{k}</td><td className="py-1 text-right text-slate-100">{v}</td></tr>;
}
