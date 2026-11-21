// ─── Geo Projection Utilities ───
// WGS84 ↔ local metric coordinate conversion
// Uses Web Mercator meter scaling anchored at plot centroid

import type { LngLat, MetricPoint, LngLatPolygon, Polygon } from './types';

const EARTH_RADIUS = 6378137; // WGS84 semi-major axis in meters

export interface ProjectionAnchor {
  lngDeg: number;
  latDeg: number;
  metersPerDegLng: number;
  metersPerDegLat: number;
}

/** Create a projection anchor at a given WGS84 point */
export function createAnchor(anchor: LngLat): ProjectionAnchor {
  const latRad = (anchor[1] * Math.PI) / 180;
  const metersPerDegLat = (Math.PI * EARTH_RADIUS) / 180; // ~111,320 m/deg
  const metersPerDegLng = metersPerDegLat * Math.cos(latRad);
  return {
    lngDeg: anchor[0],
    latDeg: anchor[1],
    metersPerDegLng,
    metersPerDegLat,
  };
}

/** Project WGS84 [lng, lat] → local metric [x, y] meters from anchor */
export function toMetric(anchor: ProjectionAnchor, lngLat: LngLat): MetricPoint {
  return [
    (lngLat[0] - anchor.lngDeg) * anchor.metersPerDegLng,
    (lngLat[1] - anchor.latDeg) * anchor.metersPerDegLat,
  ];
}

/** Unproject local metric [x, y] → WGS84 [lng, lat] */
export function toLngLat(anchor: ProjectionAnchor, metric: MetricPoint): LngLat {
  return [
    metric[0] / anchor.metersPerDegLng + anchor.lngDeg,
    metric[1] / anchor.metersPerDegLat + anchor.latDeg,
  ];
}

/** Convert entire WGS84 polygon to metric */
export function polygonToMetric(anchor: ProjectionAnchor, lngLats: LngLatPolygon): Polygon {
  return lngLats.map((ll) => toMetric(anchor, ll));
}

/** Convert metric polygon back to WGS84 */
export function polygonToLngLat(anchor: ProjectionAnchor, polygon: Polygon): LngLatPolygon {
  return polygon.map((pt) => toLngLat(anchor, pt));
}

/** Compute centroid of a WGS84 polygon (simple average) */
export function computeCentroid(polygon: LngLatPolygon): LngLat {
  const n = polygon.length;
  if (n === 0) return [0, 0];
  let sumLng = 0;
  let sumLat = 0;
  for (const [lng, lat] of polygon) {
    sumLng += lng;
    sumLat += lat;
  }
  return [sumLng / n, sumLat / n];
}

/** Create an anchor at the centroid of a polygon */
export function anchorAtCentroid(polygon: LngLatPolygon): ProjectionAnchor {
  return createAnchor(computeCentroid(polygon));
}

/** Convert sqm to Thai Rai-Ngan-Wah */
export function sqmToRaiNganWah(sqm: number): { rai: number; ngan: number; wah: number; display: string } {
  const totalWah = sqm / 4;
  const rai = Math.floor(totalWah / 400);
  const remaining = totalWah - rai * 400;
  const ngan = Math.floor(remaining / 100);
  const wah = remaining - ngan * 100;
  const parts: string[] = [];
  if (rai > 0) parts.push(`${rai} Rai`);
  if (ngan > 0) parts.push(`${ngan} Ngan`);
  parts.push(`${wah.toFixed(1)} Wah²`);
  return { rai, ngan, wah, display: parts.join(' ') };
}
