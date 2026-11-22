// ─── Automatic road-width & access-route estimation from map geometry (OpenStreetMap) ───
// Pure functions: the map component feeds road centrelines and building footprints from the vector tiles
// it has already loaded; nothing here touches the network.
//
// Why these are ESTIMATES (never "verified"): OSM stores road centrelines and a class, not the legal road
// reserve (เขตทาง). Bangkok sois often have buildings set back from the reserve, and centrelines can be
// several metres off. The legal width comes from the title deed / BMA survey. What geometry CAN tell us:
//   • distance from the plot edge to the centreline c → a symmetric road is ≈ 2c wide;
//   • building-to-building clearance across the street → an upper bound on the reserve;
//   • the road class → a plausible range.
// The estimate combines the three and reports its range and confidence.

import type { LngLat, MetricPoint } from '../engine/types';
import { createAnchor, polygonToMetric, toLngLat } from '../engine/geo';
import { edgeOutwardNormal, signedArea } from '../engine/polygon';

export interface RoadLine { coords: LngLat[]; cls: string; name?: string }
export interface Footprint { ring: LngLat[] }

/** Plausible road-reserve ranges by OpenMapTiles class (m): [min, typical, max] */
export const CLASS_WIDTHS: Record<string, [number, number, number]> = {
  motorway: [30, 40, 100], trunk: [30, 40, 80], primary: [20, 30, 60], secondary: [12, 20, 40],
  tertiary: [8, 12, 24], minor: [4, 8, 16], service: [3, 5, 10], busway: [8, 12, 24], raceway: [6, 8, 12],
};
export const ARTERIAL = new Set(['tertiary', 'secondary', 'primary', 'trunk', 'motorway']);

export interface EdgeRoadEstimate {
  edgeIndex: number;
  facesRoad: boolean;
  roadClass?: string;
  roadName?: string;
  /** Distance from the plot edge to the mapped centreline (median of samples) */
  centrelineOffsetM?: number;
  /** Building-to-building clearance measured from the plot edge across the street (upper bound) */
  clearanceM?: number;
  estimatedWidthM?: number;
  rangeM?: [number, number];
  confidence?: 'medium' | 'low';
  method: string;
}

export interface AccessRoute {
  fromEdge: number;
  minWidthM: number;
  bottleneck: LngLat;
  lengthM: number;
  reachedClass: string;
  viaNames: string[];
  path: LngLat[];
  method: string;
}

export interface RoadAnalysis {
  edges: EdgeRoadEstimate[];
  access: AccessRoute[];
}

interface Seg { a: MetricPoint; b: MetricPoint; line: number }

function raySeg(o: MetricPoint, d: MetricPoint, a: MetricPoint, b: MetricPoint): number | null {
  const ex = b[0] - a[0], ey = b[1] - a[1];
  const den = d[0] * ey - d[1] * ex;
  if (Math.abs(den) < 1e-12) return null;
  const ax = a[0] - o[0], ay = a[1] - o[1];
  const t = (ax * ey - ay * ex) / den;
  const u = (ax * d[1] - ay * d[0]) / den;
  return t > 1e-6 && u >= 0 && u <= 1 ? t : null;
}
const median = (v: number[]) => { const s = [...v].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };
const round05 = (v: number) => Math.round(v * 2) / 2;

/** Uniform grid of segments for fast ray queries */
class SegGrid {
  private cells = new Map<string, Seg[]>();
  constructor(private size: number) {}
  private key(x: number, y: number) { return `${Math.floor(x / this.size)},${Math.floor(y / this.size)}`; }
  add(s: Seg) {
    const x0 = Math.min(s.a[0], s.b[0]), x1 = Math.max(s.a[0], s.b[0]), y0 = Math.min(s.a[1], s.b[1]), y1 = Math.max(s.a[1], s.b[1]);
    for (let x = Math.floor(x0 / this.size); x <= Math.floor(x1 / this.size); x++) {
      for (let y = Math.floor(y0 / this.size); y <= Math.floor(y1 / this.size); y++) {
        const k = `${x},${y}`;
        (this.cells.get(k) ?? this.cells.set(k, []).get(k)!).push(s);
      }
    }
  }
  /** Segments near the ray from o along d up to `len` */
  along(o: MetricPoint, d: MetricPoint, len: number): Set<Seg> {
    const out = new Set<Seg>();
    const steps = Math.ceil(len / (this.size / 2)) + 1;
    for (let i = 0; i <= steps; i++) {
      const p: MetricPoint = [o[0] + (d[0] * len * i) / steps, o[1] + (d[1] * len * i) / steps];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        for (const s of this.cells.get(this.key(p[0] + dx * this.size, p[1] + dy * this.size)) ?? []) out.add(s);
      }
    }
    return out;
  }
}

export interface AnalysisOptions {
  /** Max distance from a plot edge to a centreline to count as frontage */
  maxCentrelineM?: number;
  maxAccessSearchM?: number;
}

export function analyzeRoads(plotLngLat: LngLat[], roads: RoadLine[], buildings: Footprint[], opts: AnalysisOptions = {}): RoadAnalysis {
  if (plotLngLat.length < 3) return { edges: [], access: [] };
  let cx = 0, cy = 0;
  plotLngLat.forEach(([x, y]) => { cx += x; cy += y; });
  const anchor = createAnchor([cx / plotLngLat.length, cy / plotLngLat.length]);
  let plot = polygonToMetric(anchor, plotLngLat);
  const reversed = signedArea(plot) < 0;
  if (reversed) plot = [...plot].reverse();
  const n = plot.length;
  const maxReach = opts.maxCentrelineM ?? 40;

  const roadLines = roads
    .filter((r) => CLASS_WIDTHS[r.cls])
    .map((r) => ({ ...r, m: polygonToMetric(anchor, r.coords) }))
    .filter((r) => r.m.some(([x, y]) => Math.hypot(x, y) < (opts.maxAccessSearchM ?? 1500)));
  const roadGrid = new SegGrid(25);
  roadLines.forEach((r, li) => { for (let i = 0; i < r.m.length - 1; i++) roadGrid.add({ a: r.m[i]!, b: r.m[i + 1]!, line: li }); });
  const bGrid = new SegGrid(15);
  buildings.forEach((b, bi) => {
    const m = polygonToMetric(anchor, b.ring);
    if (!m.some(([x, y]) => Math.hypot(x, y) < 600)) return;
    for (let i = 0; i < m.length; i++) bGrid.add({ a: m[i]!, b: m[(i + 1) % m.length]!, line: bi });
  });

  /** Building clearance along a ray between distances [from, to] */
  const facadeHit = (o: MetricPoint, d: MetricPoint, from: number, to: number) => {
    let best: number | null = null;
    for (const s of bGrid.along(o, d, to)) {
      const t = raySeg(o, d, s.a, s.b);
      if (t !== null && t > from && t <= to && (best === null || t < best)) best = t;
    }
    return best;
  };

  const edges: EdgeRoadEstimate[] = [];
  const edgeRoad: (number | null)[] = [];
  for (let i = 0; i < n; i++) {
    const a = plot[i]!, b = plot[(i + 1) % n]!;
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const u: MetricPoint = [(b[0] - a[0]) / (L || 1), (b[1] - a[1]) / (L || 1)];
    const out = edgeOutwardNormal(a, b);
    const origIndex = reversed ? (((n - 2 - i) % n) + n) % n : i;
    if (L < 4) { edges.push({ edgeIndex: origIndex, facesRoad: false, method: 'edge too short to sample' }); edgeRoad.push(null); continue; }
    const hits: { line: number; c: number; p: MetricPoint }[] = [];
    for (const t of [0.2, 0.35, 0.5, 0.65, 0.8]) {
      const p: MetricPoint = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      let best: { line: number; c: number } | null = null;
      for (const s of roadGrid.along(p, out, maxReach)) {
        const sx = s.b[0] - s.a[0], sy = s.b[1] - s.a[1];
        const sl = Math.hypot(sx, sy) || 1;
        if (Math.abs((sx * u[0] + sy * u[1]) / sl) < Math.cos(Math.PI / 6)) continue; // roughly parallel only
        const c = raySeg(p, out, s.a, s.b);
        if (c !== null && c <= maxReach && (!best || c < best.c)) best = { line: s.line, c };
      }
      if (best) hits.push({ ...best, p });
    }
    const counts = new Map<number, number>();
    hits.forEach((h) => counts.set(h.line, (counts.get(h.line) ?? 0) + 1));
    const top = [...counts.entries()].sort((x, y) => y[1] - x[1])[0];
    if (!top || top[1] < 3) { edges.push({ edgeIndex: origIndex, facesRoad: false, method: 'no parallel road centreline within 40 m' }); edgeRoad.push(null); continue; }
    const line = roadLines[top[0]]!;
    const [pMin, , pMax] = CLASS_WIDTHS[line.cls]!;
    const own = hits.filter((h) => h.line === top[0]);
    const c = median(own.map((h) => h.c));
    if (c > pMax / 2 + 3) { edges.push({ edgeIndex: origIndex, facesRoad: false, roadClass: line.cls, centrelineOffsetM: c, method: `centreline ${c.toFixed(1)} m away: too far for this edge to be the road boundary` }); edgeRoad.push(null); continue; }
    const far = own.map((h) => facadeHit(h.p, out, c + 0.5, c + pMax)).filter((x): x is number => x !== null);
    const clearance = far.length >= 2 ? median(far) : undefined;
    const fromCentre = 2 * c;
    let est = Math.min(Math.max(fromCentre, pMin), pMax);
    if (clearance !== undefined) est = Math.min(est, clearance);
    est = Math.max(round05(est), 2);
    const lo = Math.min(pMin, est), hi = Math.min(pMax, clearance ?? pMax);
    const confidence: 'medium' | 'low' = clearance !== undefined && Math.abs(fromCentre - clearance) <= 4 ? 'medium' : 'low';
    edges.push({
      edgeIndex: origIndex, facesRoad: true, roadClass: line.cls, roadName: line.name, centrelineOffsetM: c, clearanceM: clearance,
      estimatedWidthM: est, rangeM: [round05(lo), round05(Math.max(hi, est))], confidence,
      method: `2 × centreline offset ${fromCentre.toFixed(1)} m, class "${line.cls}" ${pMin}–${pMax} m${clearance !== undefined ? `, building-to-building clearance ${clearance.toFixed(1)} m` : ', no facade found across the street'}`,
    });
    edgeRoad.push(top[0]);
  }

  // ── Access route: from each frontage road to the nearest arterial, tracking the narrowest point ──
  const snap = 2;
  const key = (p: MetricPoint) => `${Math.round(p[0] / snap)},${Math.round(p[1] / snap)}`;
  const adj = new Map<string, { to: string; len: number; line: number; a: MetricPoint; b: MetricPoint }[]>();
  const pos = new Map<string, MetricPoint>();
  roadLines.forEach((r, li) => {
    for (let i = 0; i < r.m.length - 1; i++) {
      const a = r.m[i]!, b = r.m[i + 1]!;
      const ka = key(a), kb = key(b);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      pos.set(ka, a); pos.set(kb, b);
      (adj.get(ka) ?? adj.set(ka, []).get(ka)!).push({ to: kb, len, line: li, a, b });
      (adj.get(kb) ?? adj.set(kb, []).get(kb)!).push({ to: ka, len, line: li, a, b });
    }
  });
  // T-junctions: vector tiles may drop the shared junction vertex, so join line endpoints lying within 3 m
  // of another line's segment to both ends of that segment.
  const segDist = (p: MetricPoint, a: MetricPoint, b: MetricPoint) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1e-12;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
    return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
  };
  roadLines.forEach((r, li) => {
    for (const p of [r.m[0]!, r.m[r.m.length - 1]!]) {
      const kp = key(p);
      for (const sg of roadGrid.along(p, [1, 0], 1)) {
        if (sg.line === li || segDist(p, sg.a, sg.b) > 3) continue;
        for (const q of [sg.a, sg.b]) {
          const kq = key(q);
          if (kq === kp) continue;
          const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
          (adj.get(kp) ?? adj.set(kp, []).get(kp)!).push({ to: kq, len, line: sg.line, a: p, b: q });
          (adj.get(kq) ?? adj.set(kq, []).get(kq)!).push({ to: kp, len, line: sg.line, a: q, b: p });
        }
      }
    }
  });
  const segWidth = new Map<string, number>();
  const widthOf = (e: { line: number; a: MetricPoint; b: MetricPoint }) => {
    const k = `${e.line}:${key(e.a)}:${key(e.b)}`;
    const hit = segWidth.get(k);
    if (hit !== undefined) return hit;
    const r = roadLines[e.line]!;
    const [, typ, max] = CLASS_WIDTHS[r.cls]!;
    const dx = e.b[0] - e.a[0], dy = e.b[1] - e.a[1], l = Math.hypot(dx, dy) || 1;
    const nrm: MetricPoint = [-dy / l, dx / l];
    // sample every ~15 m along the segment; the narrowest building-to-building clearance bounds the reserve
    const samples = Math.min(40, Math.max(1, Math.round(l / 15)));
    let w = typ;
    for (let j = 0; j < samples; j++) {
      const t = (j + 0.5) / samples;
      const p: MetricPoint = [e.a[0] + dx * t, e.a[1] + dy * t];
      const left = facadeHit(p, nrm, 0.5, max), right = facadeHit(p, [-nrm[0], -nrm[1]], 0.5, max);
      if (left !== null && right !== null) w = Math.min(w, left + right);
    }
    segWidth.set(k, w);
    return w;
  };

  const access: AccessRoute[] = [];
  const done = new Set<number>();
  edges.forEach((er, i) => {
    const li = edgeRoad[i];
    if (li === null || li === undefined || done.has(li)) return;
    done.add(li);
    const start = roadLines[li]!;
    const ownWidth = er.estimatedWidthM ?? CLASS_WIDTHS[start.cls]![1];
    if (ARTERIAL.has(start.cls)) {
      access.push({ fromEdge: er.edgeIndex, minWidthM: ownWidth, bottleneck: toLngLat(anchor, plot[i]!), lengthM: 0, reachedClass: start.cls, viaNames: start.name ? [start.name] : [], path: [], method: `frontage road is itself a ${start.cls} road` });
      return;
    }
    // Dijkstra on length from the frontage road's nodes nearest the plot edge midpoint
    const mid: MetricPoint = [(plot[i]![0] + plot[(i + 1) % n]![0]) / 2, (plot[i]![1] + plot[(i + 1) % n]![1]) / 2];
    const dist = new Map<string, number>();
    const prev = new Map<string, { from: string; e: { line: number; a: MetricPoint; b: MetricPoint } }>();
    const heap: [number, string][] = [];
    // enter the graph at the point of the frontage road nearest the edge midpoint
    let bestSeg = -1, bestD = Infinity, bestProj: MetricPoint = mid;
    for (let k = 0; k < start.m.length - 1; k++) {
      const a = start.m[k]!, b = start.m[k + 1]!;
      const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1e-12;
      const t = Math.max(0, Math.min(1, ((mid[0] - a[0]) * dx + (mid[1] - a[1]) * dy) / l2));
      const pr: MetricPoint = [a[0] + dx * t, a[1] + dy * t];
      const d = Math.hypot(pr[0] - mid[0], pr[1] - mid[1]);
      if (d < bestD) { bestD = d; bestSeg = k; bestProj = pr; }
    }
    if (bestSeg < 0) return;
    const startEdge = new Map<string, { line: number; a: MetricPoint; b: MetricPoint }>();
    for (const p of [start.m[bestSeg]!, start.m[bestSeg + 1]!]) {
      const d0 = bestD + Math.hypot(p[0] - bestProj[0], p[1] - bestProj[1]);
      if (d0 < (dist.get(key(p)) ?? Infinity)) { dist.set(key(p), d0); heap.push([d0, key(p)]); startEdge.set(key(p), { line: li, a: bestProj, b: p }); }
    }
    let goal: string | null = null;
    const limit = opts.maxAccessSearchM ?? 1500;
    while (heap.length) {
      heap.sort((x, y) => x[0] - y[0]);
      const [d, k] = heap.shift()!;
      if (d > (dist.get(k) ?? Infinity) + 1e-9 || d > limit) continue;
      const inc = adj.get(k) ?? [];
      if (inc.some((e) => ARTERIAL.has(roadLines[e.line]!.cls))) { goal = k; break; }
      for (const e of inc) {
        const nd = d + e.len;
        if (nd < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, nd); prev.set(e.to, { from: k, e }); heap.push([nd, e.to]); }
      }
    }
    if (!goal) return;
    const path: MetricPoint[] = [pos.get(goal)!];
    let minW = ownWidth, bott: MetricPoint = mid;
    const names = new Set<string>();
    if (start.name) names.add(start.name);
    let cur = goal;
    while (prev.has(cur)) {
      const { from, e } = prev.get(cur)!;
      const w = widthOf(e);
      if (w < minW) { minW = w; bott = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2]; }
      const nm = roadLines[e.line]!.name;
      if (nm) names.add(nm);
      path.push(pos.get(from)!);
      cur = from;
    }
    // the stretch of frontage road between the plot and the first graph node
    const se = startEdge.get(cur);
    if (se) {
      const w = widthOf(se);
      if (w < minW) { minW = w; bott = [(se.a[0] + se.b[0]) / 2, (se.a[1] + se.b[1]) / 2]; }
      path.push(se.a);
    }
    const reached = (adj.get(goal) ?? []).map((e) => roadLines[e.line]!.cls).find((c) => ARTERIAL.has(c)) ?? 'arterial';
    access.push({
      fromEdge: er.edgeIndex, minWidthM: round05(minW), bottleneck: toLngLat(anchor, bott), lengthM: dist.get(goal) ?? 0,
      reachedClass: reached, viaNames: [...names], path: path.reverse().map((p) => toLngLat(anchor, p)),
      method: `shortest street path to the nearest ${reached} road; per-segment width = min(class typical, building-to-building clearance)`,
    });
  });
  return { edges, access };
}
