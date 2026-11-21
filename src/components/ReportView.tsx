// ─── Report View ───
import React from 'react';
import { useAppState } from '../state';
import type { DesignResult } from '../engine/types';

export function ReportView() {
  const state = useAppState();
  const { designA, designB, evaluation } = state;

  if (!designA || !designB || !evaluation) {
    return (
      <div data-testid="report-view" className="text-xs text-neutral-500 p-4">
        No results to report. Draw a plot first.
      </div>
    );
  }

  const handleDownload = () => {
    const report = {
      timestamp: new Date().toISOString(),
      zone: 'Yor.9 (ย.9)',
      plotArea: evaluation.plotAreaSqm,
      plotAreaThai: evaluation.plotAreaRaiNganWah,
      roadWidth: state.roadWidth,
      buildingType: state.buildingType,
      evaluation,
      designA: { ...designA, floors: designA.floors.map(f => ({ ...f, polygon: undefined })) },
      designB: { ...designB, floors: designB.floors.map(f => ({ ...f, polygon: undefined })) },
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bangkok-zoning-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div data-testid="report-view" className="flex flex-col gap-4">
      {/* Summary */}
      <Section title="Summary">
        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
          <Metric label="Zone" value="Yor.9 (Brown)" />
          <Metric label="Plot Area" value={`${evaluation.plotAreaSqm.toLocaleString()} sqm`} />
          <Metric label="Thai Area" value={evaluation.plotAreaRaiNganWah} />
          <Metric label="Road Width" value={`${state.roadWidth}m`} />
          <Metric label="Frontage" value={`${evaluation.frontageM}m`} />
          <Metric label="Building Type" value={state.buildingType.replace(/-/g, ' ')} />
        </div>
      </Section>

      {/* Design Comparison */}
      <Section title="Design Comparison">
        <div className="grid grid-cols-2 gap-2">
          <DesignCard design={designA} label="Design A" />
          <DesignCard design={designB} label="Design B" />
        </div>
      </Section>

      {/* Floor Schedule - Design A */}
      <Section title={`Floor Schedule — ${designA.label}`}>
        <FloorTable floors={designA.floors} totalGFA={designA.totalGFA} height={designA.heightM} />
      </Section>

      {/* Floor Schedule - Design B */}
      <Section title={`Floor Schedule — ${designB.label}`}>
        <FloorTable floors={designB.floors} totalGFA={designB.totalGFA} height={designB.heightM} />
      </Section>

      {/* Download */}
      <button
        data-testid="download-report"
        onClick={handleDownload}
        className="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-medium text-white transition-colors"
      >
        📥 Download JSON Report
      </button>
    </div>
  );
}

function DesignCard({ design, label }: { design: DesignResult; label: string }) {
  return (
    <div className="bg-neutral-800/50 rounded-lg p-2.5 text-[10px]">
      <div className="font-medium text-neutral-200 mb-1.5">{label}</div>
      <div className="flex flex-col gap-0.5 text-neutral-400">
        <Row label="GFA" value={`${design.totalGFA.toLocaleString()} sqm`} />
        <Row label="FAR" value={`${design.actualFAR}`} />
        <Row label="Floors" value={`${design.floorCount}`} />
        <Row label="Height" value={`${design.heightM}m`} />
        <Row label="Open Space" value={`${design.openSpacePercent}%`} />
        <Row label="Units (est)" value={`${design.estimatedUnits}`} />
        <Row label="EIA" value={design.eiaRequired ? '⚠️ Yes' : '✅ No'} />
      </div>
    </div>
  );
}

function FloorTable({ floors, totalGFA, height }: { floors: any[]; totalGFA: number; height: number }) {
  return (
    <div className="max-h-32 overflow-y-auto">
      <table className="w-full text-[10px]">
        <thead>
          <tr className="text-neutral-500">
            <th className="text-left py-0.5">Floor</th>
            <th className="text-right py-0.5">Elev (m)</th>
            <th className="text-right py-0.5">Height (m)</th>
            <th className="text-right py-0.5">Area (sqm)</th>
          </tr>
        </thead>
        <tbody>
          {floors.map((f: any, i: number) => (
            <tr key={i} className="text-neutral-400 hover:bg-neutral-800">
              <td className="py-0.5">F{i + 1}</td>
              <td className="text-right py-0.5">{f.elevationM.toFixed(1)}</td>
              <td className="text-right py-0.5">{f.heightM.toFixed(1)}</td>
              <td className="text-right py-0.5">{f.areaSqm.toFixed(0)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="text-white font-medium border-t border-neutral-700">
            <td className="py-1">Total</td>
            <td className="text-right py-1">{height}m</td>
            <td></td>
            <td className="text-right py-1">{totalGFA.toLocaleString()}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-neutral-500">{label}</span>
      <span className="text-neutral-200">{value}</span>
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
