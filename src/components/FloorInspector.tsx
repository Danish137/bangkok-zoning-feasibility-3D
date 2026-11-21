// ─── Floor Inspector ───
// Level scrubber + 2D SVG floor plan view
import React from 'react';
import { useAppState, useAppDispatch } from '../state';
import type { FloorResult, Polygon } from '../engine/types';

export function FloorInspector() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  const design = state.activeDesign === 'b' ? state.designB : state.designA;
  if (!design || design.floors.length === 0) {
    return (
      <div data-testid="floor-inspector" className="text-xs text-neutral-500 p-4">
        No design computed. Draw a plot and select a design.
      </div>
    );
  }

  const { floors } = design;
  const selectedIdx = state.selectedFloor ?? 0;
  const floor = floors[selectedIdx] ?? floors[0]!;

  return (
    <div data-testid="floor-inspector" className="flex flex-col gap-4">
      {/* Level Scrubber */}
      <Section title={`Floor Selector (${floors.length} floors)`}>
        <input
          type="range"
          min={0}
          max={floors.length - 1}
          step={1}
          value={selectedIdx}
          onChange={(e) => dispatch({ type: 'SET_SELECTED_FLOOR', floor: Number(e.target.value) })}
          className="w-full accent-indigo-500"
          data-testid="floor-scrubber"
        />
        <div className="flex justify-between text-[10px] text-neutral-500 mt-1">
          <span>GF</span>
          <span>Floor {selectedIdx + 1}</span>
          <span>Top ({floors.length}F)</span>
        </div>
      </Section>

      {/* Floor Info */}
      <Section title={`Floor ${selectedIdx + 1} Details`}>
        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
          <Metric label="Elevation" value={`${floor.elevationM.toFixed(1)}m`} />
          <Metric label="Floor Height" value={`${floor.heightM.toFixed(1)}m`} />
          <Metric label="Floor Area" value={`${floor.areaSqm.toFixed(1)} sqm`} />
          <Metric
            label="% of Ground"
            value={
              floors[0]
                ? `${((floor.areaSqm / floors[0].areaSqm) * 100).toFixed(0)}%`
                : '—'
            }
          />
        </div>
      </Section>

      {/* Section Cutaway Toggle */}
      <button
        data-testid="section-cutaway-toggle"
        onClick={() => dispatch({ type: 'TOGGLE_SECTION_CUTAWAY' })}
        className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
          state.sectionCutaway
            ? 'bg-purple-500/20 border border-purple-500/50 text-purple-300'
            : 'bg-neutral-800 border border-neutral-700 text-neutral-400 hover:border-neutral-500'
        }`}
      >
        {state.sectionCutaway ? '🔪 Section Cut ON' : '🔪 Section Cut OFF'}
      </button>

      {/* 2D Floor Plan SVG */}
      <Section title="2D Floor Plan">
        <FloorPlanSVG
          plotPolygon={state.evaluation?.floors[0]?.polygon}
          floorPolygon={floor.polygon}
          roadEdges={state.roadEdges}
          elevation={floor.elevationM}
          area={floor.areaSqm}
        />
      </Section>

      {/* Floor Schedule */}
      <Section title="Floor Schedule">
        <div className="max-h-40 overflow-y-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-neutral-500">
                <th className="text-left py-0.5">Floor</th>
                <th className="text-right py-0.5">Elev</th>
                <th className="text-right py-0.5">Area</th>
              </tr>
            </thead>
            <tbody>
              {floors.map((f, i) => (
                <tr
                  key={i}
                  className={`cursor-pointer transition-colors ${
                    i === selectedIdx
                      ? 'bg-indigo-500/20 text-indigo-300'
                      : 'text-neutral-400 hover:bg-neutral-800'
                  }`}
                  onClick={() => dispatch({ type: 'SET_SELECTED_FLOOR', floor: i })}
                >
                  <td className="py-0.5">F{i + 1}</td>
                  <td className="text-right py-0.5">{f.elevationM.toFixed(1)}m</td>
                  <td className="text-right py-0.5">{f.areaSqm.toFixed(0)} sqm</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="text-white font-medium border-t border-neutral-700">
                <td className="py-1">Total</td>
                <td className="text-right py-1">{design.heightM}m</td>
                <td className="text-right py-1">{design.totalGFA.toLocaleString()} sqm</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Section>
    </div>
  );
}

// ─── 2D Floor Plan SVG ───
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

  // Compute bounds
  const allPts = [...floorPolygon, ...(plotPolygon ?? [])];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of allPts) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  const pad = 4;
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;
  const svgW = 200;
  const svgH = 200;
  const scale = Math.min((svgW - pad * 2) / w, (svgH - pad * 2) / h);

  const tx = (x: number) => pad + (x - minX) * scale;
  const ty = (y: number) => svgH - pad - (y - minY) * scale; // flip Y

  const plotPath = plotPolygon
    ? plotPolygon.map((p, i) => `${i === 0 ? 'M' : 'L'}${tx(p[0]).toFixed(1)},${ty(p[1]).toFixed(1)}`).join(' ') + ' Z'
    : '';

  const floorPath =
    floorPolygon.map((p, i) => `${i === 0 ? 'M' : 'L'}${tx(p[0]).toFixed(1)},${ty(p[1]).toFixed(1)}`).join(' ') + ' Z';

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full bg-neutral-900 rounded-lg border border-neutral-700">
      {/* Plot boundary */}
      {plotPath && (
        <path d={plotPath} fill="none" stroke="#525252" strokeWidth="1" strokeDasharray="4,2" />
      )}
      {/* Road edges highlighted */}
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
            strokeWidth="2"
          />
        );
      })}
      {/* Floor polygon */}
      <path d={floorPath} fill="rgba(99,102,241,0.3)" stroke="#818cf8" strokeWidth="1.5" />
      {/* Labels */}
      <text x={svgW / 2} y={svgH - 8} textAnchor="middle" fill="#a3a3a3" fontSize="8">
        +{elevation.toFixed(1)}m · {area.toFixed(0)} sqm
      </text>
    </svg>
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
