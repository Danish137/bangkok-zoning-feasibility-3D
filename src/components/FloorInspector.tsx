// ─── Floor Inspector ───
import React from 'react';
import { useAppState, useAppDispatch } from '../state';
import type { FloorResult, Polygon } from '../engine/types';

export function FloorInspector() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  const design = state.activeDesign === 'b' ? state.designB : state.designA;
  if (!design || design.floors.length === 0) {
    return (
      <div data-testid="floor-inspector" className="text-xs text-slate-400 p-4">
        No active building massing. Select a preset or draw a plot.
      </div>
    );
  }

  const { floors } = design;
  const selectedIdx = state.selectedFloor !== null && state.selectedFloor < floors.length ? state.selectedFloor : 0;
  const floor = floors[selectedIdx] ?? floors[0]!;

  return (
    <div data-testid="floor-inspector" className="flex flex-col gap-4 text-xs">
      {/* Level Scrubber */}
      <Section title={`Interactive Storey Selector (${floors.length} Floors)`}>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3">
          <input
            type="range"
            min={0}
            max={floors.length - 1}
            step={1}
            value={selectedIdx}
            onChange={(e) => dispatch({ type: 'SET_SELECTED_FLOOR', floor: Number(e.target.value) })}
            className="w-full accent-indigo-500 cursor-pointer"
            data-testid="floor-scrubber"
          />
          <div className="flex justify-between items-center text-[10px] text-slate-400 mt-2 font-mono">
            <span>GF (L1)</span>
            <span className="text-indigo-300 font-bold bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-700/50">
              Level {selectedIdx + 1} of {floors.length}
            </span>
            <span>Top (L{floors.length})</span>
          </div>
        </div>
      </Section>

      {/* Floor Diagnostics */}
      <Section title={`Level ${selectedIdx + 1} Metrics`}>
        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
          <Metric label="Slab Elevation" value={`+${floor.elevationM.toFixed(1)} m`} />
          <Metric label="Floor Height" value={`${floor.heightM.toFixed(1)} m`} />
          <Metric label="Gross Floor Area" value={`${floor.areaSqm.toFixed(1)} m²`} />
          <Metric
            label="Footprint Ratio"
            value={
              floors[0]
                ? `${((floor.areaSqm / floors[0].areaSqm) * 100).toFixed(0)}% of GF`
                : '—'
            }
          />
        </div>
      </Section>

      {/* 3D Section Cutaway Toggle */}
      <button
        data-testid="section-cutaway-toggle"
        onClick={() => dispatch({ type: 'TOGGLE_SECTION_CUTAWAY' })}
        className={`w-full py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all flex items-center justify-center gap-2 ${
          state.sectionCutaway
            ? 'bg-purple-600/30 border-purple-500 text-purple-200 shadow-lg shadow-purple-900/30'
            : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:text-white'
        }`}
      >
        <span>🔪</span>
        <span>{state.sectionCutaway ? '3D Section Cutaway: ACTIVE' : 'Enable 3D Section Cutaway'}</span>
      </button>

      {/* Synced 2D Floor Plan SVG */}
      <Section title="Synchronized 2D Floor Plan">
        <FloorPlanSVG
          plotPolygon={state.evaluation?.floors[0]?.polygon}
          floorPolygon={floor.polygon}
          roadEdges={state.roadEdges}
          elevation={floor.elevationM}
          area={floor.areaSqm}
        />
      </Section>

      {/* Floor Schedule Table */}
      <Section title="Storey Schedule">
        <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-700/60">
          <table className="w-full text-[10px]">
            <thead className="bg-slate-800/90 text-slate-400 sticky top-0">
              <tr>
                <th className="text-left px-2 py-1">Storey</th>
                <th className="text-right px-2 py-1">Elev</th>
                <th className="text-right px-2 py-1">Area</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {floors.map((f, i) => (
                <tr
                  key={i}
                  className={`cursor-pointer transition-colors ${
                    i === selectedIdx
                      ? 'bg-indigo-600/25 text-indigo-200 font-semibold'
                      : 'text-slate-300 hover:bg-slate-800/50'
                  }`}
                  onClick={() => dispatch({ type: 'SET_SELECTED_FLOOR', floor: i })}
                >
                  <td className="px-2 py-1">L{i + 1}</td>
                  <td className="text-right px-2 py-1 font-mono text-slate-400">+{f.elevationM.toFixed(1)}m</td>
                  <td className="text-right px-2 py-1 font-mono">{f.areaSqm.toFixed(0)} m²</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-800 font-semibold text-white sticky bottom-0">
              <tr>
                <td className="px-2 py-1">Total</td>
                <td className="text-right px-2 py-1 font-mono">{design.heightM}m</td>
                <td className="text-right px-2 py-1 text-indigo-300 font-mono">{design.totalGFA.toLocaleString()} m²</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Section>
    </div>
  );
}

function FloorPlanSVG({
  plotPolygon,
  floorPolygon,
  roadEdges,
  elevation,
  area,
}: {
  plotPolygon?: Polygon;
  floorPolygon: Polygon;
  roadEdges: number[];
  elevation: number;
  area: number;
}) {
  if (floorPolygon.length < 3) return null;

  const allPts = [...floorPolygon, ...(plotPolygon ?? [])];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of allPts) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  const pad = 12;
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;
  const svgW = 240;
  const svgH = 200;
  const scale = Math.min((svgW - pad * 2) / w, (svgH - pad * 2) / h);

  const tx = (x: number) => pad + (x - minX) * scale;
  const ty = (y: number) => svgH - pad - (y - minY) * scale;

  const plotPath = plotPolygon
    ? plotPolygon.map((p, i) => `${i === 0 ? 'M' : 'L'}${tx(p[0]).toFixed(1)},${ty(p[1]).toFixed(1)}`).join(' ') + ' Z'
    : '';

  const floorPath =
    floorPolygon.map((p, i) => `${i === 0 ? 'M' : 'L'}${tx(p[0]).toFixed(1)},${ty(p[1]).toFixed(1)}`).join(' ') + ' Z';

  return (
    <div className="bg-slate-950/80 rounded-xl p-2 border border-slate-700/60 shadow-inner">
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-auto">
        {/* Plot boundary dashed */}
        {plotPath && (
          <path d={plotPath} fill="none" stroke="#64748b" strokeWidth="1.5" strokeDasharray="4,3" />
        )}
        {/* Road frontage highlighted */}
        {plotPolygon && roadEdges.map((edgeIdx) => {
          const p1 = plotPolygon[edgeIdx];
          const p2 = plotPolygon[(edgeIdx + 1) % plotPolygon.length];
          if (!p1 || !p2) return null;
          return (
            <line
              key={edgeIdx}
              x1={tx(p1[0])}
              y1={ty(p1[1])}
              x2={tx(p2[0])}
              y2={ty(p2[1])}
              stroke="#f59e0b"
              strokeWidth="3.5"
            />
          );
        })}
        {/* Floor polygon fill & outline */}
        <path d={floorPath} fill="rgba(99, 102, 241, 0.28)" stroke="#818cf8" strokeWidth="2" />
        {/* Label */}
        <text x={svgW / 2} y={svgH - 6} textAnchor="middle" fill="#94a3b8" fontSize="9" fontFamily="monospace">
          +{elevation.toFixed(1)}m elev · {area.toFixed(0)} m² slab
        </text>
      </svg>
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
