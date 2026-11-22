// ─── Floor stage panel ───
import React from 'react';
import { useActiveDesign, useAppDispatch, useAppState } from '../state';
import type { FeasibilityResult, FloorResult, Polygon } from '../engine/types';
import { Button, Callout, Metric, Section, fmtNum } from './ui';

export function FloorInspector() {
  const s = useAppState();
  const dispatch = useAppDispatch();
  const design = useActiveDesign();
  const r = s.result;
  if (!r || !design || design.floors.length === 0) return <Callout tone="warn">No floors to inspect. Select or draw a plot first.</Callout>;
  const floors = design.floors;
  const idx = s.selectedFloor !== null && s.selectedFloor < floors.length ? s.selectedFloor : 0;
  const f = floors[idx]!;
  const sum = floors.reduce((a, x) => a + x.areaSqm, 0);
  const select = (i: number) => dispatch({ type: 'SET_SELECTED_FLOOR', floor: Math.max(0, Math.min(floors.length - 1, i)) });

  return (
    <div data-testid="floor-inspector" className="flex flex-col gap-5 text-xs">
      <div className="flex rounded-lg border border-slate-700/60 bg-slate-900/80 p-0.5">
        {(['a', 'b'] as const).map((k) => (
          <button key={k} data-testid={`floor-design-${k}`} disabled={k === 'b' && !r.designB}
            onClick={() => dispatch({ type: 'SET_ACTIVE_DESIGN', design: k })}
            className={`flex-1 rounded-md py-1 text-[11px] font-medium ${s.activeDesign === k ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'} disabled:opacity-30`}>
            {k === 'a' ? 'A · Max yield' : 'B · Open space'}
          </button>
        ))}
      </div>

      <Section title={`Storey ${idx + 1} of ${floors.length}`} aside={
        <div className="flex gap-1">
          <Button testId="floor-down" onClick={() => select(idx - 1)} disabled={idx === 0}>▼</Button>
          <Button testId="floor-up" onClick={() => select(idx + 1)} disabled={idx === floors.length - 1}>▲</Button>
        </div>
      }>
        <input type="range" min={0} max={floors.length - 1} value={idx} data-testid="floor-scrubber"
          onChange={(e) => select(Number(e.target.value))} className="w-full accent-amber-500" />
        <div className="grid grid-cols-3 gap-1.5">
          <Metric label="Floor area" value={`${fmtNum(f.areaSqm, 1)} m²`} tone="accent" sub={f.isPartial ? 'trimmed to cap' : undefined} />
          <Metric label="Allowable" value={`${fmtNum(f.allowableAreaSqm, 1)} m²`} sub={`${((f.areaSqm / f.allowableAreaSqm) * 100).toFixed(0)} % used`} />
          <Metric label="Use" value={f.use === 'commercial' ? 'Retail/office' : 'Residential'} />
          <Metric label="Slab level" value={`+${fmtNum(f.elevationM, 2)} m`} />
          <Metric label="Roof of storey" value={`+${fmtNum(f.topM, 2)} m`} />
          <Metric label="Storey height" value={`${fmtNum(f.heightM, 2)} m`} />
        </div>
        <div className="text-[10.5px] leading-snug text-slate-400" data-testid="floor-restrictions">
          Setbacks: {design.envelope.setbacks.map((sb) => `E${sb.edgeIndex + 1} ${fmtNum(sb.distanceM, 1)} m`).join(' · ')}.{' '}
          {f.skyPlaneEdges.length
            ? `2:1 plane from ${f.skyPlaneEdges.map((e) => `E${e + 1}`).join(', ')} trims this storey (roof at ${fmtNum(f.topM, 1)} m needs ≥ ${fmtNum(f.topM / 2, 1)} m to the opposite road boundary).`
            : 'The 2:1 plane does not trim this storey.'}
        </div>
        <Button testId="section-cutaway-toggle" variant={s.sectionCutaway ? 'primary' : 'secondary'} onClick={() => dispatch({ type: 'TOGGLE_SECTION_CUTAWAY' })}>
          {s.sectionCutaway ? 'Cutaway on: storeys above are hidden' : 'Cut away storeys above'}
        </Button>
      </Section>

      <Section title="Floor plan">
        <FloorPlan result={r} floor={f} buildable={design.envelope.buildablePolygon} />
      </Section>

      <Section title="Floor-area schedule">
        <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-700/60">
          <table data-testid="floor-schedule" className="w-full text-[10.5px] tabular-nums">
            <thead className="sticky top-0 bg-slate-800 text-slate-400">
              <tr><th className="px-2 py-1 text-left">Storey</th><th className="px-2 py-1 text-right">Level</th><th className="px-2 py-1 text-right">Allowable</th><th className="px-2 py-1 text-right">Area m²</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {floors.map((x) => (
                <tr key={x.index} onClick={() => select(x.index)}
                  className={`cursor-pointer ${x.index === idx ? 'bg-amber-500/15 text-amber-100' : 'text-slate-300 hover:bg-slate-800/60'}`}>
                  <td className="px-2 py-0.5">L{x.index + 1}{x.use === 'commercial' ? ' · R' : ''}{x.isPartial ? ' *' : ''}</td>
                  <td className="px-2 py-0.5 text-right text-slate-400">+{x.elevationM.toFixed(1)}</td>
                  <td className="px-2 py-0.5 text-right text-slate-500">{x.allowableAreaSqm.toFixed(1)}</td>
                  <td className="px-2 py-0.5 text-right">{x.areaSqm.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 bg-slate-800 font-semibold text-white">
              <tr><td className="px-2 py-1" colSpan={3}>Σ storeys = total floor area</td><td data-testid="schedule-total" className="px-2 py-1 text-right text-indigo-200">{sum.toFixed(2)}</td></tr>
            </tfoot>
          </table>
        </div>
        <div className="text-[9.5px] text-slate-500">Gross floor area inside the outer walls (MR 33 "พื้นที่อาคาร"), not sellable area. R = retail storey, * = trimmed to the floor-area cap.</div>
      </Section>
    </div>
  );
}

function FloorPlan({ result, floor, buildable }: { result: FeasibilityResult; floor: FloorResult; buildable: Polygon }) {
  const plot = result.plotPolygon;
  const pts = [...plot];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  const W = 300, H = 230, pad = 18;
  const sc = Math.min((W - 2 * pad) / (maxX - minX || 1), (H - 2 * pad) / (maxY - minY || 1));
  const ox = (W - (maxX - minX) * sc) / 2, oy = (H - (maxY - minY) * sc) / 2;
  const tx = (x: number) => ox + (x - minX) * sc;
  const ty = (y: number) => H - oy - (y - minY) * sc;
  const path = (p: Polygon) => (p.length < 3 ? '' : p.map((q, i) => `${i ? 'L' : 'M'}${tx(q[0]).toFixed(1)},${ty(q[1]).toFixed(1)}`).join(' ') + 'Z');
  const scaleBar = [5, 10, 20, 50].find((m) => m * sc > 40) ?? 50;
  return (
    <div className="rounded-lg border border-slate-700/60 bg-slate-950/80 p-2">
      <svg data-testid="floor-plan-svg" viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
        <path d={path(plot)} fill="#0f172a" stroke="#e2e8f0" strokeWidth={1.4} />
        {result.edges.filter((e) => e.kind === 'road').map((e) => (
          <line key={e.index} x1={tx(e.start[0])} y1={ty(e.start[1])} x2={tx(e.end[0])} y2={ty(e.end[1])} stroke="#f59e0b" strokeWidth={4} />
        ))}
        <path d={path(buildable)} fill="none" stroke="#34d399" strokeWidth={1.2} strokeDasharray="4 3" />
        <path d={path(floor.allowablePolygon)} fill="rgba(34,211,238,0.10)" stroke="#22d3ee" strokeWidth={1} strokeDasharray="2 2" />
        <path d={path(floor.polygon)} fill="rgba(245,158,11,0.35)" stroke="#f59e0b" strokeWidth={1.6} />
        {result.edges.map((e) => (
          <text key={e.index} x={tx((e.start[0] + e.end[0]) / 2)} y={ty((e.start[1] + e.end[1]) / 2)} fill="#94a3b8" fontSize={8} textAnchor="middle" dy={-3}>E{e.index + 1}</text>
        ))}
        <g transform={`translate(${pad},${H - 8})`}>
          <line x1={0} y1={0} x2={scaleBar * sc} y2={0} stroke="#cbd5e1" strokeWidth={1.5} />
          <text x={scaleBar * sc + 4} y={3} fill="#cbd5e1" fontSize={8}>{scaleBar} m</text>
        </g>
        <text x={W - 6} y={12} fill="#cbd5e1" fontSize={9} textAnchor="end">N ↑</text>
      </svg>
      <div className="mt-1 grid grid-cols-2 gap-x-2 text-[9.5px] text-slate-400">
        <span><span className="text-slate-200">━</span> ① Plot</span>
        <span><span className="text-emerald-400">┅</span> ② Buildable (setbacks)</span>
        <span><span className="text-cyan-300">┅</span> ③ Allowable at this level</span>
        <span><span className="text-amber-400">■</span> ④ This storey</span>
      </div>
    </div>
  );
}
