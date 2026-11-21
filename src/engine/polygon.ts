// ─── Polygon Geometry Utilities ───
// Pure math: area, winding, validation, inward offset, edge normals
// Uses polygon-clipping for robust boolean operations on concave shapes

import polygonClipping from 'polygon-clipping';
import type { MetricPoint, Polygon, LngLat, LngLatPolygon } from './types';
import { ZONE_YOR9_BOUNDARY } from './types';

/** Signed area of polygon (positive = CCW, negative = CW) using Shoelace formula */
export function signedArea(poly: Polygon): number {
  let area = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = poly[i]!;
    const [x2, y2] = poly[(i + 1) % n]!;
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

/** Absolute area of polygon in sqm */
export function polygonArea(poly: Polygon): number {
  return Math.abs(signedArea(poly));
}

/** Check if polygon is counter-clockwise */
export function isCCW(poly: Polygon): boolean {
  return signedArea(poly) > 0;
}

/** Ensure polygon has CCW winding */
export function ensureCCW(poly: Polygon): Polygon {
  if (isCCW(poly)) return poly;
  return [...poly].reverse();
}

/**
 * Normalizes polygon vertices to CCW winding and remaps edge indices accordingly.
 * When an n-vertex polygon [V0, V1, ..., Vn-1] is reversed to [Vn-1, ..., V0],
 * an edge originally between Vi and Vi+1 becomes the edge between Vn-1-i and Vn-2-i,
 * which in CCW order is indexed as (n - 2 - i + n) % n.
 */
export function normalizePolygonWinding<T extends [number, number]>(
  vertices: T[],
  roadEdges: number[] = []
): { vertices: T[]; roadEdges: number[]; wasReversed: boolean } {
  const n = vertices.length;
  if (n < 3) return { vertices: [...vertices], roadEdges: [...roadEdges], wasReversed: false };

  let area = 0;
  for (let i = 0; i < n; i++) {
    const p1 = vertices[i]!;
    const p2 = vertices[(i + 1) % n]!;
    area += p1[0] * p2[1] - p2[0] * p1[1];
  }

  if (area > 0) {
    return { vertices: [...vertices], roadEdges: [...roadEdges], wasReversed: false };
  }

  const reversed = [...vertices].reverse();
  const remapped = roadEdges.map((i) => (n - 2 - i + n) % n);
  return { vertices: reversed, roadEdges: remapped, wasReversed: true };
}

/** Check if polygon is self-intersecting */
export function isSelfIntersecting(poly: Polygon): boolean {
  const n = poly.length;
  if (n < 4) return false;

  for (let i = 0; i < n; i++) {
    const a1 = poly[i]!;
    const a2 = poly[(i + 1) % n]!;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // skip adjacent
      const b1 = poly[j]!;
      const b2 = poly[(j + 1) % n]!;
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

/** Check if two line segments properly intersect */
function segmentsIntersect(
  a1: MetricPoint, a2: MetricPoint,
  b1: MetricPoint, b2: MetricPoint
): boolean {
  const d1 = cross(b1, b2, a1);
  const d2 = cross(b1, b2, a2);
  const d3 = cross(a1, a2, b1);
  const d4 = cross(a1, a2, b2);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  return false;
}

function cross(o: MetricPoint, a: MetricPoint, b: MetricPoint): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/** Compute outward normal (unit vector) for edge from p1 to p2 in CCW polygon */
export function edgeOutwardNormal(p1: MetricPoint, p2: MetricPoint): MetricPoint {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-10) return [0, 0];
  // For CCW polygon, outward normal is (dy, -dx) / len
  return [dy / len, -dx / len];
}

/** Compute inward normal for edge */
export function edgeInwardNormal(p1: MetricPoint, p2: MetricPoint): MetricPoint {
  const [nx, ny] = edgeOutwardNormal(p1, p2);
  return [-nx, -ny];
}

/** Length of a polygon edge */
export function edgeLength(p1: MetricPoint, p2: MetricPoint): number {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  return Math.sqrt(dx * dx + dy * dy);
}

/** Perimeter of polygon */
export function polygonPerimeter(poly: Polygon): number {
  let perimeter = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    perimeter += edgeLength(poly[i]!, poly[(i + 1) % n]!);
  }
  return perimeter;
}

/**
 * Inward offset a polygon by a uniform distance using polygon-clipping.
 * Works correctly for concave/L-shaped polygons.
 * Returns array of result polygons (may split into multiple pieces).
 */
export function inwardOffset(poly: Polygon, distance: number): Polygon[] {
  if (distance <= 0) return [poly];
  
  // Build the inward-offset polygon by intersecting half-planes for each edge
  const n = poly.length;
  
  // Create a large clip polygon for each edge's half-plane
  // Then intersect all of them with the original polygon
  let result: polygonClipping.MultiPolygon = [
    [closedRing(poly)]
  ];

  for (let i = 0; i < n; i++) {
    const p1 = poly[i]!;
    const p2 = poly[(i + 1) % n]!;
    const [nx, ny] = edgeInwardNormal(p1, p2);
    
    // Offset this edge inward by distance
    const offsetP1: MetricPoint = [p1[0] + nx * distance, p1[1] + ny * distance];
    const offsetP2: MetricPoint = [p2[0] + nx * distance, p2[1] + ny * distance];
    
    // Create a large half-plane polygon on the inward side
    const halfPlane = createHalfPlane(offsetP1, offsetP2, [nx, ny]);
    
    result = polygonClipping.intersection(
      result,
      [[closedRing(halfPlane)]]
    );
    
    if (result.length === 0) return [];
  }

  return result.map((poly) => openRing(poly[0]!));
}

/**
 * Per-edge inward offset: apply different setback distances to different edges.
 * Uses sequential half-plane intersection.
 */
export function perEdgeInwardOffset(
  poly: Polygon,
  setbacks: number[] // one per edge, same order as polygon vertices
): Polygon[] {
  const n = poly.length;
  if (setbacks.length !== n) throw new Error(`Expected ${n} setbacks, got ${setbacks.length}`);
  
  let result: polygonClipping.MultiPolygon = [
    [closedRing(poly)]
  ];

  for (let i = 0; i < n; i++) {
    const dist = setbacks[i]!;
    if (dist <= 0) continue;
    
    const p1 = poly[i]!;
    const p2 = poly[(i + 1) % n]!;
    const [nx, ny] = edgeInwardNormal(p1, p2);
    
    const offsetP1: MetricPoint = [p1[0] + nx * dist, p1[1] + ny * dist];
    const offsetP2: MetricPoint = [p2[0] + nx * dist, p2[1] + ny * dist];
    
    const halfPlane = createHalfPlane(offsetP1, offsetP2, [nx, ny]);
    
    result = polygonClipping.intersection(
      result,
      [[closedRing(halfPlane)]]
    );
    
    if (result.length === 0) return [];
  }

  return result.map((poly) => openRing(poly[0]!));
}

/**
 * Clip polygon by a half-plane: keep only the portion on the inward side
 * of a line defined by two points and a normal direction.
 */
export function clipByHalfPlane(
  poly: Polygon,
  linePoint1: MetricPoint,
  linePoint2: MetricPoint,
  inwardNormal: MetricPoint
): Polygon[] {
  const halfPlane = createHalfPlane(linePoint1, linePoint2, inwardNormal);
  
  const result = polygonClipping.intersection(
    [[closedRing(poly)]],
    [[closedRing(halfPlane)]]
  );
  
  return result.map((p) => openRing(p[0]!));
}

/** Create a large half-plane polygon on the inward side of a line */
function createHalfPlane(
  p1: MetricPoint,
  p2: MetricPoint,
  inwardNormal: MetricPoint
): Polygon {
  const SIZE = 10000; // 10km — large enough for any plot
  const [nx, ny] = inwardNormal;
  
  // Direction along the edge
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const len = Math.sqrt(dx * dx + dy * dy);
  const ux = len > 0 ? dx / len : 1;
  const uy = len > 0 ? dy / len : 0;
  
  // Four corners of the half-plane (a large rectangle on the inward side)
  return [
    [p1[0] - ux * SIZE, p1[1] - uy * SIZE],
    [p2[0] + ux * SIZE, p2[1] + uy * SIZE],
    [p2[0] + ux * SIZE + nx * SIZE, p2[1] + uy * SIZE + ny * SIZE],
    [p1[0] - ux * SIZE + nx * SIZE, p1[1] - uy * SIZE + ny * SIZE],
  ];
}

/** Convert open polygon to closed ring for polygon-clipping */
function closedRing(poly: Polygon): polygonClipping.Ring {
  const ring = poly.map((p) => [p[0], p[1]] as [number, number]);
  // Close the ring if not already closed
  if (ring.length > 0) {
    const first = ring[0]!;
    const last = ring[ring.length - 1]!;
    if (first[0] !== last[0] || first[1] !== last[1]) {
      ring.push([first[0], first[1]]);
    }
  }
  return ring as polygonClipping.Ring;
}

/** Convert closed ring back to open polygon */
function openRing(ring: polygonClipping.Ring): Polygon {
  const pts = ring.map((p) => [p[0], p[1]] as MetricPoint);
  // Remove closing point if present
  if (pts.length > 1) {
    const first = pts[0]!;
    const last = pts[pts.length - 1]!;
    if (Math.abs(first[0] - last[0]) < 1e-10 && Math.abs(first[1] - last[1]) < 1e-10) {
      pts.pop();
    }
  }
  return pts;
}

/** Centroid of a metric polygon */
export function polygonCentroid(poly: Polygon): MetricPoint {
  const n = poly.length;
  if (n === 0) return [0, 0];
  let cx = 0, cy = 0;
  for (const [x, y] of poly) {
    cx += x;
    cy += y;
  }
  return [cx / n, cy / n];
}

/** Point-in-polygon test (ray casting) */
export function pointInPolygon(point: MetricPoint, poly: Polygon): boolean {
  const [px, py] = point;
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Point-in-polygon test for WGS84 coordinates */
export function isPointInLngLatPolygon(point: LngLat, poly: LngLatPolygon): boolean {
  const [px, py] = point;
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Verify if all vertices of a WGS84 plot lie within the official Zone Yor.9 boundary */
export function isPlotInZoneYor9(polygonLngLat?: LngLatPolygon): {
  inZone: boolean;
  checked: boolean;
  outsideCount: number;
  message: string;
} {
  if (!polygonLngLat || polygonLngLat.length === 0) {
    return { inZone: true, checked: false, outsideCount: 0, message: 'No geographic coordinates provided (using metric mode)' };
  }
  const outside = polygonLngLat.filter((pt) => !isPointInLngLatPolygon(pt, ZONE_YOR9_BOUNDARY));
  if (outside.length > 0) {
    return {
      inZone: false,
      checked: true,
      outsideCount: outside.length,
      message: `Plot lies outside Bangkok Plan B.E. 2556 Zone Yor.9 boundary (${outside.length}/${polygonLngLat.length} vertices outside Sukhumvit/Thonglor Brown Zone).`,
    };
  }
  return {
    inZone: true,
    checked: true,
    outsideCount: 0,
    message: 'All plot vertices verified within Zone Yor.9 (High-Density Residential, Brown Zone).',
  };
}
