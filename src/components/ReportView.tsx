// ─── Report View ───
import React, { useState } from 'react';
import { useAppState } from '../state';
import type { DesignResult } from '../engine/types';

export function ReportView() {
  const state = useAppState();
  const { designA, designB, evaluation } = state;
  const [showApiPreview, setShowApiPreview] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!designA || !designB || !evaluation) {
    return (
      <div data-testid="report-view" className="text-xs text-neutral-500 p-4">
        No results to report. Draw or select a plot first.
      </div>
    );
  }

  const apiPayload = {
    polygon: state.polygon,
    roadEdges: state.roadEdges,
    roadWidth: state.roadWidth,
    buildingType: state.buildingType,
  };

  const handleDownload = () => {
    const report = {
      generator: 'Bangkok 3D Zoning & Building Feasibility Tool',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      zoning: {
        zone: 'Yor.9 (ย.9)',
        classification: 'High-Density Residential (Brown Zone)',
        authority: 'Bangkok Comprehensive Plan B.E. 2556 (2013)',
        baseFAR: 7.0,
        baseOSRPercent: 4.5,
      },
      site: {
        plotAreaSqm: evaluation.plotAreaSqm,
        plotAreaThai: evaluation.plotAreaRaiNganWah,
        roadWidthMeters: state.roadWidth,
        roadFrontageMeters: evaluation.frontageM,
        highRiseEligible: evaluation.highRiseEligible,
        roadBlocker: evaluation.roadBlocker ?? null,
      },
      buildingType: state.buildingType,
      designs: {
        designA: {
          variant: designA.variant,
          label: designA.label,
          totalGFASqm: designA.totalGFA,
          actualFAR: designA.actualFAR,
          heightMeters: designA.heightM,
          floorCount: designA.floorCount,
          groundCoveragePercent: designA.groundCoveragePercent,
          openSpacePercent: designA.openSpacePercent,
          estimatedUnits: designA.estimatedUnits,
          eiaRequired: designA.eiaRequired,
          complianceChecks: designA.checks,
          floorSchedule: designA.floors.map(f => ({
            floor: f.index + 1,
            elevationM: f.elevationM,
            heightM: f.heightM,
            areaSqm: f.areaSqm,
          })),
        },
        designB: {
          variant: designB.variant,
          label: designB.label,
          totalGFASqm: designB.totalGFA,
          actualFAR: designB.actualFAR,
          heightMeters: designB.heightM,
          floorCount: designB.floorCount,
          groundCoveragePercent: designB.groundCoveragePercent,
          openSpacePercent: designB.openSpacePercent,
          estimatedUnits: designB.estimatedUnits,
          eiaRequired: designB.eiaRequired,
          complianceChecks: designB.checks,
          floorSchedule: designB.floors.map(f => ({
            floor: f.index + 1,
            elevationM: f.elevationM,
            heightM: f.heightM,
            areaSqm: f.areaSqm,
          })),
        },
      },
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bangkok-zoning-feasibility-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyCurl = () => {
    const curl = `curl -X POST https://siliconbricks.co/api/evaluate \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(apiPayload)}'`;
    navigator.clipboard.writeText(curl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div data-testid="report-view" className="flex flex-col gap-4">
      {/* Site Summary */}
      <Section title="Site & Zoning Parameters">
        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
          <Metric label="Zoning District" value="Zone Yor.9 (Brown)" />
          <Metric label="Plot Area" value={`${evaluation.plotAreaSqm.toLocaleString()} sqm`} />
          <Metric label="Thai Units" value={evaluation.plotAreaRaiNganWah} />
          <Metric label="Frontage Width" value={`${state.roadWidth}m Road`} />
          <Metric label="Frontage Length" value={`${evaluation.frontageM}m`} />
          <Metric label="Permit Track" value={evaluation.highRiseEligible ? 'High-Rise Eligible' : 'Low-Rise ≤23m'} />
        </div>
      </Section>

      {/* Comparative Options */}
      <Section title="Comparative Feasibility">
        <div className="grid grid-cols-2 gap-2">
          <DesignCard design={designA} badge="Option A" />
          <DesignCard design={designB} badge="Option B" />
        </div>
      </Section>

      {/* Floor Schedule - Design A */}
      <Section title={`Area Schedule — ${designA.label}`}>
        <FloorTable floors={designA.floors} totalGFA={designA.totalGFA} height={designA.heightM} />
      </Section>

      {/* Floor Schedule - Design B */}
      <Section title={`Area Schedule — ${designB.label}`}>
        <FloorTable floors={designB.floors} totalGFA={designB.totalGFA} height={designB.heightM} />
      </Section>

      {/* Action Buttons */}
      <div className="flex flex-col gap-2 pt-1">
        <button
          data-testid="download-report"
          onClick={handleDownload}
          className="w-full py-2.5 px-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-semibold text-white shadow-lg transition-colors flex items-center justify-center gap-2"
        >
          <span>📥</span> Download Full JSON Report
        </button>

        <button
          data-testid="toggle-api-payload"
          onClick={() => setShowApiPreview(!showApiPreview)}
          className="w-full py-1.5 px-3 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg text-xs font-medium text-neutral-300 transition-colors flex items-center justify-between"
        >
          <span>⚡ API Endpoint Payload Preview</span>
          <span>{showApiPreview ? '▲' : '▼'}</span>
        </button>

        {showApiPreview && (
          <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-[10px] flex flex-col gap-2">
            <div className="flex items-center justify-between text-neutral-400">
              <span className="font-mono text-emerald-400">POST /api/evaluate</span>
              <button
                onClick={copyCurl}
                className="text-indigo-400 hover:text-indigo-300 underline"
              >
                {copied ? 'Copied curl!' : 'Copy cURL'}
              </button>
            </div>
            <pre className="bg-neutral-900 p-2 rounded overflow-x-auto text-neutral-300 font-mono text-[9px] max-h-40">
              {JSON.stringify(apiPayload, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function DesignCard({ design, badge }: { design: DesignResult; badge: string }) {
  return (
    <div className="bg-neutral-800/60 border border-neutral-700/60 rounded-lg p-2.5 text-[10px]">
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-semibold text-neutral-200">{badge}</span>
        <span className={`text-[8px] px-1.5 py-0.5 rounded font-medium ${
          design.eiaRequired ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'
        }`}>
          {design.eiaRequired ? 'EIA Req' : 'EIA Exempt'}
        </span>
      </div>
      <div className="flex flex-col gap-1 text-neutral-400">
        <Row label="GFA" value={`${design.totalGFA.toLocaleString()} sqm`} highlight />
        <Row label="FAR" value={`${design.actualFAR}`} />
        <Row label="Storeys" value={`${design.floorCount}F (${design.heightM}m)`} />
        <Row label="Open Space" value={`${design.openSpacePercent}%`} />
        <Row label="Est Units" value={`~${design.estimatedUnits}`} />
      </div>
    </div>
  );
}

function FloorTable({ floors, totalGFA, height }: { floors: any[]; totalGFA: number; height: number }) {
  return (
    <div className="max-h-36 overflow-y-auto rounded border border-neutral-800">
      <table className="w-full text-[10px]">
        <thead className="bg-neutral-800/80 sticky top-0">
          <tr className="text-neutral-400">
            <th className="text-left px-2 py-1">Level</th>
            <th className="text-right px-2 py-1">Elev</th>
            <th className="text-right px-2 py-1">Height</th>
            <th className="text-right px-2 py-1">Area</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800">
          {floors.map((f: any, i: number) => (
            <tr key={i} className="text-neutral-300 hover:bg-neutral-800/50">
              <td className="px-2 py-0.5 font-medium">L{i + 1}</td>
              <td className="text-right px-2 py-0.5 text-neutral-400 font-mono">+{f.elevationM.toFixed(1)}m</td>
              <td className="text-right px-2 py-0.5 text-neutral-400 font-mono">{f.heightM.toFixed(1)}m</td>
              <td className="text-right px-2 py-0.5 text-neutral-200 font-mono">{f.areaSqm.toFixed(0)} sqm</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-neutral-800/90 font-semibold text-white sticky bottom-0">
          <tr>
            <td className="px-2 py-1">Total</td>
            <td className="text-right px-2 py-1 text-neutral-400 font-mono">{height}m</td>
            <td></td>
            <td className="text-right px-2 py-1 text-indigo-300 font-mono">{totalGFA.toLocaleString()} sqm</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-neutral-500">{label}</span>
      <span className={highlight ? 'text-white font-semibold' : 'text-neutral-300'}>{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1.5">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-neutral-800/60 border border-neutral-700/40 rounded px-2 py-1">
      <div className="text-neutral-500 text-[9px]">{label}</div>
      <div className="text-neutral-200 font-medium truncate">{value}</div>
    </div>
  );
}
