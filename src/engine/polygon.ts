// ─── Polygon geometry ───
// Pure math on local metric polygons. Boolean operations use polygon-clipping.
//
// Setbacks are computed as true distance setbacks: buildable = plot − ⋃ capsule(edge_i, d_i),
// where capsule(edge, d) is the set of points within distance d of the edge segment. This is
// exact for concave plots (an infinite half-plane per edge would wrongly delete whole arms of
// an L-shaped plot).

import polygonClipping from 'polygon-clipping';
import type { MetricPoint, Polygon } from './types';

type PCRing = polygonClipping.Ring;
type PCMulti = polygonClipping.MultiPolygon;

export const GEOM_EPS = 1e-7;

// ── Basic measures ──

/** Signed area (Shoelace). Positive = CCW. */
export function signedArea(poly: readonly MetricPoint[]): number {
  let a = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % n]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

export function polygonArea(poly: readonly MetricPoint[]): number {
  return Math.abs(signedArea(poly));
}

export function isCCW(poly: readonly MetricPoint[]): boolean {
  return signedArea(poly) > 0;
}

export function ensureCCW(poly: Polygon): Polygon {
  return isCCW(poly) ? poly : [...poly].reverse();
}

export function edgeLength(p1: MetricPoint, p2: MetricPoint): number {
  return Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
}

export function polygonPerimeter(poly: Polygon): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) s += edgeLength(poly[i]!, poly[(i + 1) % poly.length]!);
  return s;
}

/** Area-weighted centroid */
export function polygonCentroid(poly: Polygon): MetricPoint {
  const n = poly.length;
  if (n === 0) return [0, 0];
  const a = signedArea(poly);
  if (Math.abs(a) < GEOM_EPS) {
    let sx = 0, sy = 0;
    for (const [x, y] of poly) { sx += x; sy += y; }
    return [sx / n, sy / n];
  }
  let cx = 0, cy = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = poly[i]!;
    const [x2, y2] = poly[(i + 1) % n]!;
    const f = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  return [cx / (6 * a), cy / (6 * a)];
}

/** Outward unit normal of edge p1→p2 of a CCW polygon */
export function edgeOutwardNormal(p1: MetricPoint, p2: MetricPoint): MetricPoint {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const len = Math.hypot(dx, dy);
  if (len < GEOM_EPS) return [0, 0];
  return [dy / len, -dx / len];
}

export function edgeInwardNormal(p1: MetricPoint, p2: MetricPoint): MetricPoint {
  const [nx, ny] = edgeOutwardNormal(p1, p2);
  return [-nx, -ny];
}

// ── Winding normalisation with edge-index remapping ──

/**
 * Reversing [V0..Vn-1] → [Vn-1..V0] maps edge i (Vi→Vi+1) to edge (n-2-i) mod n.
 * Returns the CCW vertex list and a function that remaps original edge indices.
 */
export function normalizePolygonWinding<T extends [number, number]>(
  vertices: T[],
  roadEdges: number[] = [],
): { vertices: T[]; roadEdges: number[]; wasReversed: boolean; remap: (i: number) => number } {
  const n = vertices.length;
  const identity = (i: number) => i;
  if (n < 3 || signedArea(vertices as unknown as MetricPoint[]) > 0) {
    return { vertices: [...vertices], roadEdges: [...roadEdges], wasReversed: false, remap: identity };
  }
  const remap = (i: number) => (((n - 2 - i) % n) + n) % n;
  return {
    vertices: [...vertices].reverse(),
    roadEdges: roadEdges.map(remap),
    wasReversed: true,
    remap,
  };
}

/** Remove consecutive duplicate vertices (and a duplicated closing vertex). */
export function dedupeVertices<T extends [number, number]>(pts: T[], eps = 1e-9): T[] {
  const out: T[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last[0] - p[0]) > eps || Math.abs(last[1] - p[1]) > eps) out.push(p);
  }
  if (out.length > 1) {
    const f = out[0]!;
    const l = out[out.length - 1]!;
    if (Math.abs(f[0] - l[0]) <= eps && Math.abs(f[1] - l[1]) <= eps) out.pop();
  }
  return out;
}

// ── Segment predicates ──

function orient(a: readonly number[], b: readonly number[], c: readonly number[]): number {
  return (b[0]! - a[0]!) * (c[1]! - a[1]!) - (b[1]! - a[1]!) * (c[0]! - a[0]!);
}

function onSegment(a: readonly number[], b: readonly number[], p: readonly number[], eps: number): boolean {
  return (
    Math.min(a[0]!, b[0]!) - eps <= p[0]! && p[0]! <= Math.max(a[0]!, b[0]!) + eps &&
    Math.min(a[1]!, b[1]!) - eps <= p[1]! && p[1]! <= Math.max(a[1]!, b[1]!) + eps
  );
}

/** Segments intersect, including touching / collinear overlap */
export function segmentsIntersect(
  a1: readonly number[], a2: readonly number[], b1: readonly number[], b2: readonly number[],
): boolean {
  const scale = Math.max(1, Math.abs(a1[0]!), Math.abs(a1[1]!), Math.abs(b1[0]!), Math.abs(b1[1]!));
  const eps = 1e-12 * scale * scale;
  const d1 = orient(b1, b2, a1);
  const d2 = orient(b1, b2, a2);
  const d3 = orient(a1, a2, b1);
  const d4 = orient(a1, a2, b2);
  if (((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) &&
      ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps))) return true;
  const e = 1e-12 * scale;
  if (Math.abs(d1) <= eps && onSegment(b1, b2, a1, e)) return true;
  if (Math.abs(d2) <= eps && onSegment(b1, b2, a2, e)) return true;
  if (Math.abs(d3) <= eps && onSegment(a1, a2, b1, e)) return true;
  if (Math.abs(d4) <= eps && onSegment(a1, a2, b2, e)) return true;
  return false;
}

/** True if any two non-adjacent edges intersect (or touch). Works for metric or lng/lat rings. */
export function isSelfIntersecting(poly: readonly (readonly number[])[]): boolean {
  const n = poly.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a1 = poly[i]!;
    const a2 = poly[(i + 1) % n]!;
    for (let j = i + 1; j < n; j++) {
      // adjacent edges share a vertex
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      const b1 = poly[j]!;
      const b2 = poly[(j + 1) % n]!;
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

/** Would adding `next` to an open drawing path create a crossing? (closing edge not included) */
export function pathSegmentCrosses(path: readonly (readonly number[])[], next: readonly number[]): boolean {
  const n = path.length;
  if (n < 2) return false;
  const a1 = path[n - 1]!;
  for (let i = 0; i < n - 2; i++) {
    if (segmentsIntersect(a1, next, path[i]!, path[i + 1]!)) return true;
  }
  return false;
}

// ── Distances ──

export function pointSegmentDistance(p: MetricPoint, a: MetricPoint, b: MetricPoint): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  if (l2 < GEOM_EPS * GEOM_EPS) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

export function segmentSegmentDistance(a1: MetricPoint, a2: MetricPoint, b1: MetricPoint, b2: MetricPoint): number {
  if (segmentsIntersect(a1, a2, b1, b2)) return 0;
  return Math.min(
    pointSegmentDistance(a1, b1, b2),
    pointSegmentDistance(a2, b1, b2),
    pointSegmentDistance(b1, a1, a2),
    pointSegmentDistance(b2, a1, a2),
  );
}

/** Minimum distance between a polygon's boundary and a segment */
export function polygonSegmentDistance(poly: Polygon, a: MetricPoint, b: MetricPoint): number {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) {
    d = Math.min(d, segmentSegmentDistance(poly[i]!, poly[(i + 1) % poly.length]!, a, b));
    if (d === 0) return 0;
  }
  return d;
}

/** Signed distance from point to the infinite line through edge p1→p2 (positive = inside a CCW polygon) */
export function signedDistanceToEdgeLine(p: MetricPoint, p1: MetricPoint, p2: MetricPoint): number {
  const [nx, ny] = edgeInwardNormal(p1, p2);
  return (p[0] - p1[0]) * nx + (p[1] - p1[1]) * ny;
}

export function pointInPolygon(point: readonly number[], poly: readonly (readonly number[])[]): boolean {
  const px = point[0]!, py = point[1]!;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i]![0]!, yi = poly[i]![1]!;
    const xj = poly[j]![0]!, yj = poly[j]![1]!;
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ── polygon-clipping adapters ──

// polygon-clipping 0.15 can throw ("Unable to complete output ring") on near-degenerate input.
// Deterministic fallbacks: (1) scale the clip shapes about their centroid by 1 + k·1e-6
// (micrometre-level, outward → conservative for setback buffers), (2) rotate the whole problem by
// a tiny angle and rotate the result back. Both are far below planning precision.
type PCOp = 'union' | 'intersection' | 'difference';
function mapMulti(g: PCMulti, f: (p: [number, number]) => [number, number]): PCMulti {
  return g.map((poly) => poly.map((ring) => ring.map((pt) => f([pt[0], pt[1]]))));
}
function scaleAbout(g: PCMulti, s: number): PCMulti {
  let cx = 0, cy = 0, n = 0;
  for (const poly of g) for (const pt of poly[0] ?? []) { cx += pt[0]; cy += pt[1]; n++; }
  if (n === 0) return g;
  cx /= n; cy /= n;
  return mapMulti(g, ([x, y]) => [cx + (x - cx) * s, cy + (y - cy) * s]);
}
function rotate(g: PCMulti, a: number): PCMulti {
  const c = Math.cos(a), s = Math.sin(a);
  return mapMulti(g, ([x, y]) => [x * c - y * s, x * s + y * c]);
}
function snap(g: PCMulti, q: number): PCMulti {
  return g.map((poly) => poly.map((ring) => {
    const out: [number, number][] = [];
    for (const pt of ring) {
      const p: [number, number] = [Math.round(pt[0] / q) * q, Math.round(pt[1] / q) * q];
      const l = out[out.length - 1];
      if (!l || l[0] !== p[0] || l[1] !== p[1]) out.push(p);
    }
    return out;
  }));
}
export function safeClip(op: PCOp, subject: PCMulti, ...clips: PCMulti[]): PCMulti {
  const fn = polygonClipping[op] as (g: PCMulti, ...gs: PCMulti[]) => PCMulti;
  try {
    return fn(subject, ...clips);
  } catch (err) {
    // Nearly-coincident vertices (e.g. adjacent capsules sharing a plot vertex) → make them identical
    for (const q of [1e-7, 1e-6, 1e-5]) {
      try {
        return fn(snap(subject, q), ...clips.map((c) => snap(c, q)));
      } catch { /* next fallback */ }
    }
    for (const k of [1, 3, 10]) {
      try {
        return fn(subject, ...clips.map((c) => scaleAbout(c, 1 + k * 1e-6)));
      } catch { /* next fallback */ }
    }
    for (const a of [1e-7, -3e-7, 1e-6]) {
      try {
        return rotate(fn(rotate(subject, a), ...clips.map((c) => rotate(c, a))), -a);
      } catch { /* next fallback */ }
    }
    throw err;
  }
}

function toRing(poly: readonly MetricPoint[]): PCRing {
  const ring = poly.map((p) => [p[0], p[1]] as [number, number]);
  if (ring.length > 0) {
    const f = ring[0]!;
    const l = ring[ring.length - 1]!;
    if (f[0] !== l[0] || f[1] !== l[1]) ring.push([f[0], f[1]]);
  }
  return ring;
}

function fromRing(ring: PCRing): Polygon {
  const pts = ring.map((p) => [p[0], p[1]] as MetricPoint);
  if (pts.length > 1) {
    const f = pts[0]!;
    const l = pts[pts.length - 1]!;
    if (Math.abs(f[0] - l[0]) < 1e-12 && Math.abs(f[1] - l[1]) < 1e-12) pts.pop();
  }
  return ensureCCW(pts);
}

/** Area of a polygon-clipping multipolygon (outer rings minus holes) */
export function multiArea(mp: PCMulti): number {
  let a = 0;
  for (const poly of mp) {
    poly.forEach((ring, k) => {
      const r = fromRing(ring);
      a += k === 0 ? polygonArea(r) : -polygonArea(r);
    });
  }
  return a;
}

export interface PieceResult {
  polygon: Polygon;
  areaSqm: number;
  /** Area of other disconnected pieces dropped because only one building mass is modelled */
  discardedAreaSqm: number;
  pieceCount: number;
}

const EMPTY_PIECE: PieceResult = { polygon: [], areaSqm: 0, discardedAreaSqm: 0, pieceCount: 0 };

/** Select the largest piece (by area) of a multipolygon. Holes are subtracted from piece areas. */
export function largestPiece(mp: PCMulti): PieceResult {
  if (mp.length === 0) return EMPTY_PIECE;
  let best = -1;
  let bestArea = -Infinity;
  let total = 0;
  const areas = mp.map((poly) => {
    let a = 0;
    poly.forEach((ring, k) => {
      const r = polygonArea(fromRing(ring));
      a += k === 0 ? r : -r;
    });
    return a;
  });
  areas.forEach((a, i) => {
    total += a;
    if (a > bestArea) { bestArea = a; best = i; }
  });
  const outer = fromRing(mp[best]![0]!);
  return {
    polygon: outer,
    areaSqm: bestArea,
    discardedAreaSqm: Math.max(0, total - bestArea),
    pieceCount: mp.length,
  };
}

/**
 * Capsule (stadium) polygon containing all points within distance d of segment a–b.
 * Straight sides lie exactly at distance d; the end caps are circumscribed polygons
 * (vertices at half-steps, radius d / cos(step/2)) whose edges are tangent to the true
 * circle, so the capsule always contains the exact buffer (conservative, never encroaches).
 */
export function capsule(a: MetricPoint, b: MetricPoint, d: number, arcSegments = 8): Polygon {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const ang = len < GEOM_EPS ? 0 : Math.atan2(dy, dx);
  const step = Math.PI / arcSegments;
  const r = d / Math.cos(step / 2);
  const pts: Polygon = [];
  for (let k = 0; k < arcSegments; k++) {
    const t = ang - Math.PI / 2 + (k + 0.5) * step;
    pts.push([b[0] + r * Math.cos(t), b[1] + r * Math.sin(t)]);
  }
  for (let k = 0; k < arcSegments; k++) {
    const t = ang + Math.PI / 2 + (k + 0.5) * step;
    pts.push([a[0] + r * Math.cos(t), a[1] + r * Math.sin(t)]);
  }
  return pts;
}

/**
 * Distance setback: plot minus the d_i-buffer of each edge. The arc approximation is
 * conservative (chords lie outside the true circle), so the result never encroaches.
 */
export function setbackPolygon(poly: Polygon, distances: number[]): PieceResult {
  const n = poly.length;
  if (distances.length !== n) throw new Error(`Expected ${n} setbacks, got ${distances.length}`);
  const caps: PCMulti[] = [];
  for (let i = 0; i < n; i++) {
    const d = distances[i]!;
    if (d <= 0) continue;
    caps.push([[toRing(capsule(poly[i]!, poly[(i + 1) % n]!, d, 8))]]);
  }
  if (caps.length === 0) return { polygon: poly, areaSqm: polygonArea(poly), discardedAreaSqm: 0, pieceCount: 1 };
  // Subtract one capsule at a time: many small operations are far more robust in polygon-clipping
  // than one operation with many overlapping inputs.
  let result: PCMulti = [[toRing(poly)]];
  for (const cap of caps) {
    result = safeClip('difference', result, cap);
    if (result.length === 0) break;
  }
  return largestPiece(result);
}

/** Uniform inward offset by d (distance-exact, concave-safe) */
export function insetPolygon(poly: Polygon, d: number): PieceResult {
  if (d <= 0) return { polygon: poly, areaSqm: polygonArea(poly), discardedAreaSqm: 0, pieceCount: 1 };
  return setbackPolygon(poly, poly.map(() => d));
}

/** Large rectangle covering the half-plane on the inward side of the line through p1→p2 */
function halfPlaneRect(p1: MetricPoint, p2: MetricPoint, inward: MetricPoint, size = 20000): Polygon {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const [nx, ny] = inward;
  return [
    [p1[0] - ux * size, p1[1] - uy * size],
    [p2[0] + ux * size, p2[1] + uy * size],
    [p2[0] + ux * size + nx * size, p2[1] + uy * size + ny * size],
    [p1[0] - ux * size + nx * size, p1[1] - uy * size + ny * size],
  ];
}

/** Keep the part of `poly` on the inward side of the line through p1→p2 (inward normal given) */
export function clipByHalfPlane(poly: Polygon, p1: MetricPoint, p2: MetricPoint, inward: MetricPoint): PieceResult {
  const hp = halfPlaneRect(p1, p2, inward);
  return largestPiece(safeClip('intersection', [[toRing(poly)]], [[toRing(hp)]]));
}

export function intersectPolygons(a: Polygon, b: Polygon): PieceResult {
  if (a.length < 3 || b.length < 3) return EMPTY_PIECE;
  return largestPiece(safeClip('intersection', [[toRing(a)]], [[toRing(b)]]));
}

/** Area of a − b (≥ 0). Used to verify containment. */
export function differenceArea(a: Polygon, b: Polygon): number {
  if (a.length < 3) return 0;
  if (b.length < 3) return polygonArea(a);
  return multiArea(safeClip('difference', [[toRing(a)]], [[toRing(b)]]));
}

/** Area of the union of several polygons */
export function unionArea(polys: Polygon[]): number {
  const valid = polys.filter((p) => p.length >= 3);
  if (valid.length === 0) return 0;
  const [first, ...rest] = valid;
  return multiArea(safeClip('union', [[toRing(first!)]], ...rest.map((p) => [[toRing(p)]] as PCMulti)));
}

/** Union of polygons as the largest outer ring (used for the building's ground projection) */
export function unionLargest(polys: Polygon[]): PieceResult {
  const valid = polys.filter((p) => p.length >= 3);
  if (valid.length === 0) return EMPTY_PIECE;
  const [first, ...rest] = valid;
  return largestPiece(safeClip('union', [[toRing(first!)]], ...rest.map((p) => [[toRing(p)]] as PCMulti)));
}

/** Extent of a polygon projected onto a direction (unit vector) */
export function projectedExtent(poly: Polygon, dir: MetricPoint): number {
  let lo = Infinity, hi = -Infinity;
  for (const [x, y] of poly) {
    const t = x * dir[0] + y * dir[1];
    lo = Math.min(lo, t);
    hi = Math.max(hi, t);
  }
  return poly.length ? hi - lo : 0;
}

/** Minimum width of a polygon (smallest projected extent over its edge normals) */
export function minimumWidth(poly: Polygon): number {
  let w = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const n = edgeOutwardNormal(poly[i]!, poly[(i + 1) % poly.length]!);
    if (n[0] === 0 && n[1] === 0) continue;
    w = Math.min(w, projectedExtent(poly, n));
  }
  return Number.isFinite(w) ? w : 0;
}
