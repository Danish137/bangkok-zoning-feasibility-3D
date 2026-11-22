// ─── Site stage panel ───
import React from 'react';
import { polygonKey, useAppDispatch, useAppState } from '../state';
import type { InputSource } from '../engine/types';
import { BUILDING_TYPES, type BuildingType } from '../engine/types';
import { PRESET_PLOTS } from '../engine/presets';
import { anchorAtCentroid, polygonToMetric } from '../engine/geo';
import { polygonArea } from '../engine/polygon';
import { Button, Callout, Metric, Section, fmtNum } from './ui';


export function SiteControls() {
  const s = useAppState();
  const dispatch = useAppDispatch();
  const r = s.result;
  const d = s.drawing;
  const analysis = s.roadAnalysis?.key === polygonKey(s.polygon) ? s.roadAnalysis.analysis : null;
  const draftArea = d.vertices.length >= 3 ? polygonArea(polygonToMetric(anchorAtCentroid(d.vertices), d.vertices)) : 0;

  return (
    <div data-testid="site-controls" className="flex flex-col gap-5 text-xs">
      <Section title="Plot">
        {d.active ? (
          <div data-testid="drawing-panel" className="flex flex-col gap-2 rounded-xl border border-sky-500/50 bg-sky-950/40 p-3">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold text-sky-200">Drawing a new plot</span>
              <span data-testid="draft-count" className="rounded bg-sky-900/70 px-1.5 py-0.5 font-mono text-[10.5px] text-sky-200">
                {d.vertices.length} point{d.vertices.length === 1 ? '' : 's'}{draftArea ? ` · ${fmtNum(draftArea)} m²` : ''}
              </span>
            </div>
            <ol className="list-decimal space-y-0.5 pl-4 text-[11px] text-slate-300">
              <li className={d.vertices.length === 0 ? 'text-sky-200 font-medium' : 'text-slate-500'}>Click the map to place the first corner</li>
              <li className={d.vertices.length > 0 && d.vertices.length < 3 ? 'text-sky-200 font-medium' : 'text-slate-500'}>Keep clicking to add corners (any shape)</li>
              <li className={d.vertices.length >= 3 ? 'text-sky-200 font-medium' : 'text-slate-500'}>Click the first point (yellow ring), press Enter, or Finish</li>
            </ol>
            {d.message && <Callout tone="warn" testId="drawing-message">{d.message}</Callout>}
            <div className="grid grid-cols-3 gap-1.5">
              <Button testId="undo-vertex-btn" onClick={() => dispatch({ type: 'UNDO_DRAFT_VERTEX' })} disabled={d.vertices.length === 0} title="Undo last point (Backspace)">Undo</Button>
              <Button testId="cancel-drawing-btn" onClick={() => dispatch({ type: 'CANCEL_DRAWING' })} title="Cancel (Esc)">Cancel</Button>
              <Button testId="finish-drawing-btn" variant="primary" onClick={() => dispatch({ type: 'FINISH_DRAWING' })} disabled={d.vertices.length < 3} title="Finish (Enter)">Finish</Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-1.5">
            <Button testId="draw-custom-plot-btn" variant="primary" className="flex-1" onClick={() => dispatch({ type: 'START_DRAWING' })}>
              {s.polygon.length >= 3 ? 'Draw new plot' : 'Draw plot'}
            </Button>
            <Button testId="clear-plot-btn" onClick={() => dispatch({ type: 'CLEAR_PLOT' })} disabled={s.polygon.length < 3}>Clear</Button>
          </div>
        )}
        {s.plotMessage && !d.active && (
          <Callout tone="info" testId="plot-message">
            <div className="flex justify-between gap-2"><span>{s.plotMessage}</span>
              <button className="text-sky-300 hover:text-white" onClick={() => dispatch({ type: 'DISMISS_PLOT_MESSAGE' })}>✕</button></div>
          </Callout>
        )}
        {!d.active && s.polygon.length < 3 && (
          <Callout tone="info">No plot yet. Draw one on the map, or start from a study plot below.</Callout>
        )}
        <div className="flex flex-col gap-1">
          {PRESET_PLOTS.map((p) => (
            <button
              key={p.id}
              data-testid={`preset-${p.id}`}
              onClick={() => dispatch({ type: 'SET_PRESET', presetId: p.id })}
              className={`rounded-lg border px-2.5 py-1.5 text-left transition-colors ${s.activePresetId === p.id ? 'border-indigo-500 bg-indigo-600/20' : 'border-slate-700/50 bg-slate-800/30 hover:bg-slate-800'}`}
            >
              <div className="text-[11.5px] font-medium text-slate-100">{p.label}</div>
              <div className="text-[10px] leading-snug text-slate-400">{p.description}</div>
            </button>
          ))}
          <div className="text-[9.5px] leading-snug text-slate-500">Study plots are synthetic test parcels, not surveyed title deeds.</div>
        </div>
      </Section>

      {r?.valid && !d.active && (
        <>
          <Section title="Zone & transit">
            <ZoneCard />
            <TransitCard />
          </Section>

          <Section title="Road frontage">
            <div className="text-[10.5px] text-slate-400">Frontages and widths are estimated automatically from the map. Click an edge (or its E-label) to add or remove one; type a surveyed width to replace an estimate.</div>
            <div className="flex flex-col gap-1" data-testid="edge-list">
              {r.edges.map((e) => {
                const road = s.roadEdges.find((x) => x.edgeIndex === e.index);
                const est = analysis?.edges.find((x) => x.edgeIndex === e.index);
                const acc = analysis?.access.find((x) => x.fromEdge === e.index);
                return (
                  <div
                    key={e.index}
                    data-testid={`edge-row-${e.index}`}
                    onMouseEnter={() => dispatch({ type: 'FOCUS_EDGE', edgeIndex: e.index })}
                    onMouseLeave={() => dispatch({ type: 'FOCUS_EDGE', edgeIndex: null })}
                    className={`rounded-lg border px-2 py-1.5 ${road ? 'border-amber-500/50 bg-amber-500/5' : 'border-slate-700/40 bg-slate-800/20'} ${s.focusedEdge === e.index ? 'ring-1 ring-rose-400/60' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex cursor-pointer items-center gap-2 text-[11.5px]">
                        <input type="checkbox" data-testid={`road-toggle-${e.index}`} checked={!!road}
                          onChange={() => dispatch({ type: 'TOGGLE_ROAD_EDGE', edgeIndex: e.index })} className="accent-amber-500" />
                        <span className="font-mono text-slate-200">E{e.index + 1}</span>
                        <span className="text-slate-400">{fmtNum(e.lengthM, 1)} m</span>
                      </label>
                      <span className="truncate text-[10px] text-slate-500">
                        {est?.facesRoad ? `${est.roadName ?? 'mapped road'} · ${est.roadClass}` : road ? 'road (manual)' : e.kind}
                      </span>
                    </div>
                    {road && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="w-16 text-[10px] text-slate-400">Reserve</span>
                        <input type="range" min={2} max={60} step={0.5} value={road.widthM} data-testid={`road-width-slider-${e.index}`}
                          onChange={(ev) => dispatch({ type: 'SET_ROAD_WIDTH', edgeIndex: e.index, widthM: Number(ev.target.value) })}
                          className="flex-1 accent-amber-500" />
                        <input type="number" min={2} max={120} step={0.5} value={road.widthM} data-testid={`road-width-input-${e.index}`}
                          onChange={(ev) => { const v = Number(ev.target.value); if (v >= 2 && v <= 120) dispatch({ type: 'SET_ROAD_WIDTH', edgeIndex: e.index, widthM: v }); }}
                          className="w-14 rounded border border-slate-600 bg-slate-900 px-1 py-0.5 text-right font-mono text-[11px] text-amber-200" />
                        <SourceBadge source={road.source} testId={`road-source-${e.index}`} />
                      </div>
                    )}
                    {road && (
                      <div className="mt-1 flex items-center gap-2">
                        <span className="w-16 text-[10px] text-slate-400" title="Narrowest road reserve between this frontage and the nearest ≥ 10 m public road (MR 33 Cl. 2 continuity, BMA 2544 Cl. 90)">Route min.</span>
                        <input type="number" min={0} max={120} step={0.5} value={road.accessMinWidthM ?? ''} placeholder="unknown"
                          data-testid={`access-width-input-${e.index}`}
                          onChange={(ev) => { const t = ev.target.value; const v = Number(t); dispatch({ type: 'SET_ACCESS_WIDTH', edgeIndex: e.index, widthM: t === '' ? undefined : v >= 0 && v <= 120 ? v : road.accessMinWidthM }); }}
                          className="w-16 rounded border border-slate-600 bg-slate-900 px-1 py-0.5 text-right font-mono text-[11px] text-amber-200" />
                        <span className="text-[10px] text-slate-400">m</span>
                        {road.accessMinWidthM !== undefined && <SourceBadge source={road.accessSource} />}
                      </div>
                    )}
                    {road && est?.facesRoad && (
                      <div className="mt-1 text-[9.5px] leading-snug text-slate-500" data-testid={`road-estimate-${e.index}`}>
                        Map estimate {est.estimatedWidthM} m (range {est.rangeM?.[0]}–{est.rangeM?.[1]} m, {est.confidence} confidence): {est.method}.
                        {acc && acc.lengthM > 0 && <> Route to the nearest {acc.reachedClass} road: {fmtNum(acc.lengthM, 0)} m, narrowest ≈ {acc.minWidthM} m.</>}
                        {road.source === 'user' && est.estimatedWidthM !== undefined && (
                          <button className="ml-1 text-sky-300 hover:underline" onClick={() => dispatch({ type: 'USE_ROAD_ESTIMATE', edgeIndex: e.index })}>Use estimate</button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {s.roadEdges.length === 0 && <Callout tone="warn" testId="no-road-warning">No road frontage selected. Road setbacks, the 2:1 plane and high-rise eligibility all depend on it.</Callout>}
            <div className="text-[9.5px] leading-snug text-slate-500">
              Map estimates come from OpenStreetMap centrelines and building footprints, not from the legal road reserve (เขตทาง). For a permit, enter the surveyed width from the title deed / BMA; checks that rely on estimates are marked "est. input".
            </div>
          </Section>

          <Section title="Building program">
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.entries(BUILDING_TYPES) as [BuildingType, (typeof BUILDING_TYPES)[BuildingType]][]).map(([key, cfg]) => (
                <button key={key} data-testid={`building-type-${key}`} title={cfg.description}
                  onClick={() => dispatch({ type: 'SET_BUILDING_TYPE', buildingType: key })}
                  className={`rounded-lg border px-2 py-1.5 text-left transition-colors ${s.buildingType === key ? 'border-indigo-500 bg-indigo-600/20' : 'border-slate-700/50 bg-slate-800/30 hover:bg-slate-800'}`}>
                  <div className="text-[11.5px] font-medium text-slate-100">{cfg.short}</div>
                  <div className="text-[9.5px] text-slate-400">{cfg.floorToFloor} m storeys{cfg.lowRiseOnly ? ' · < 23 m' : ''}</div>
                </button>
              ))}
            </div>
            <div className="text-[10px] leading-snug text-slate-400">{BUILDING_TYPES[s.buildingType].description}.</div>
            <div className="grid grid-cols-2 gap-1.5">
              <label className="flex flex-col gap-0.5 text-[10px] text-slate-400" title="Drives the unit count, parking (BMA 2544 Cl. 83(3): units ≥ 60 m² need 1 space each) and the EIA unit test">
                Average unit (net m²)
                <input type="number" min={15} max={500} step={1} value={s.avgUnitSizeSqm} data-testid="avg-unit-input"
                  onChange={(e) => { const v = Number(e.target.value); if (v >= 15 && v <= 500) dispatch({ type: 'SET_AVG_UNIT', sqm: v }); }}
                  className="rounded border border-slate-600 bg-slate-900 px-1.5 py-1 font-mono text-[11.5px] text-slate-100" />
              </label>
              <label className="flex flex-col gap-0.5 text-[10px] text-slate-400" title="Where the parking required by BMA 2544 Cl. 84 is placed. Both count in total floor area.">
                Parking
                <select value={s.parkingMode} data-testid="parking-mode" onChange={(e) => dispatch({ type: 'SET_PARKING_MODE', mode: e.target.value as 'podium' | 'basement' })}
                  className="rounded border border-slate-600 bg-slate-900 px-1.5 py-1 text-[11.5px] text-slate-100">
                  <option value="podium">Podium storeys</option>
                  <option value="basement">Basement levels</option>
                </select>
              </label>
            </div>
            {r.transit.source !== 'station-data' && BUILDING_TYPES[s.buildingType].use !== 'residential' && (
              <label className="flex cursor-pointer items-start gap-2 text-[10.5px] text-slate-300">
                <input type="checkbox" data-testid="transit-toggle" checked={s.nearTransitDeclared} onChange={(e) => dispatch({ type: 'SET_TRANSIT', value: e.target.checked })} className="mt-0.5 accent-indigo-500" />
                <span>Station data is unavailable: declare that the site is within 500 m of a mass-transit station (not verified).</span>
              </label>
            )}
          </Section>

          <Section title="Site">
            <div className="grid grid-cols-2 gap-1.5">
              <Metric label="Plot area" value={`${fmtNum(r.plotAreaSqm, 1)} m²`} sub={r.plotAreaThai} />
              <Metric label="Max floor area (FAR 7)" value={`${fmtNum(r.maxFARGFA)} m²`} />
              <Metric label="High-rise eligible" value={r.roadEligibility.mr33Allowed ? 'Yes' : 'No'} tone={r.roadEligibility.mr33Allowed ? 'good' : 'warn'} sub={r.roadEligibility.inputConfidence ? 'MR 33 Cl. 2 · est. input' : 'MR 33 Cl. 2'} />
              <Metric label="Edges" value={`${r.edges.length} (${s.roadEdges.length} road)`} />
            </div>
            <div className="text-[10px] leading-snug text-slate-400">{r.roadEligibility.reason}.</div>
            {r.warnings.map((w) => <Callout key={w} tone="warn">{w}</Callout>)}
          </Section>

          {s.roadAdvisory.length > 0 && (
            <Section title="Mapped road check (OpenStreetMap)">
              {s.roadAdvisory.map((a) => (
                <Callout key={a.roadName + a.type} tone={a.type === 'centerline_intersection' ? 'bad' : 'warn'} testId="road-encroachment-warning"
                  title={a.type === 'centerline_intersection' ? 'Mapped centreline inside plot' : 'Estimated road corridor overlap'}>
                  {a.description}
                  <div className="mt-1 text-[9.5px] opacity-75">OSM lines are navigation centrelines, not surveyed road boundaries. Corridor widths are estimates by road class; only a cadastral survey can confirm the road reserve.</div>
                </Callout>
              ))}
            </Section>
          )}
        </>
      )}
      {r && !r.valid && !d.active && r.errors.length > 0 && (
        <Callout tone="bad" title="Plot cannot be evaluated">{r.errors.join(' ')}</Callout>
      )}
    </div>
  );
}

function SourceBadge({ source, testId }: { source?: InputSource; testId?: string }) {
  const est = source === 'map-estimate';
  return (
    <span data-testid={testId} title={est ? 'Estimated from OpenStreetMap geometry' : 'Entered by you (use the surveyed road reserve)'}
      className={`shrink-0 rounded border px-1 text-[9px] font-semibold ${est ? 'border-sky-500/40 bg-sky-500/10 text-sky-300' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'}`}>
      {est ? 'EST.' : 'USER'}
    </span>
  );
}

function ZoneCard() {
  const s = useAppState();
  const j = s.result?.jurisdiction;
  if (!j) return null;
  const tone = j.status === 'PASS' ? 'good' : j.status === 'FAIL' ? 'bad' : 'warn';
  const title = j.status === 'PASS'
    ? `Zone ${j.zone} confirmed on the BMA GIS layer`
    : j.status === 'FAIL'
      ? (j.zone ? `Zone ${j.zone}: ย.9 rules do not apply` : 'Outside Bangkok')
      : 'Zone not confirmed';
  return (
    <Callout tone={tone} title={title} testId="zoning-status">
      <div>{j.message}</div>
      {j.overlaps.length > 0 && (
        <div className="mt-1 font-mono text-[10px] opacity-80">
          {j.overlaps.map((o) => `${o.zone} ${(o.fraction * 100).toFixed(o.fraction > 0.995 ? 1 : 0)}%`).join(' · ')}
          {j.boundaryMarginM !== undefined && Number.isFinite(j.boundaryMarginM) ? ` · ${j.boundaryMarginM.toFixed(0)} m to boundary` : ''}
        </div>
      )}
    </Callout>
  );
}

function TransitCard() {
  const s = useAppState();
  const t = s.result?.transit;
  if (!t || t.source === 'none') return null;
  const n = t.nearest;
  return (
    <div data-testid="transit-status" className="rounded-lg border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-[11px] text-sky-100">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{n ? `${n.nameEn || n.name}` : 'Station proximity'}</span>
        <span className={`rounded px-1.5 text-[9.5px] font-bold ${t.within500 === 'all' ? 'bg-emerald-500/20 text-emerald-300' : t.within500 === 'part' ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-700 text-slate-300'}`}>
          {t.within500 === 'all' ? 'WITHIN 500 m' : t.within500 === 'part' ? 'PARTLY ≤ 500 m' : t.within500 === 'none' ? '> 500 m' : 'DECLARED'}
        </span>
      </div>
      <div className="mt-0.5 text-[10px] leading-snug text-sky-200/80">{t.message}</div>
    </div>
  );
}
