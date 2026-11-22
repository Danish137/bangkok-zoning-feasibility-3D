// ─── Mass-transit proximity (Plan B.E. 2556 Cl. 16: "ภายในระยะ 500 เมตร จากบริเวณโดยรอบสถานีรถไฟฟ้าขนส่งมวลชน") ───
// Distances from bundled OpenStreetMap station points to the plot polygon, in a local metric frame.
// Conservative reading: the plot qualifies only when its FARTHEST point is within 500 m of one station.

import type { LngLatPolygon, StationPoint, TransitResult } from './types';
import { createAnchor, polygonToMetric, toMetric } from './geo';
import { pointInPolygon, pointSegmentDistance } from './polygon';
import { YOR9 } from './regulations';

export function computeTransit(polygon: LngLatPolygon, stations?: StationPoint[], declared?: boolean): TransitResult {
  if (!stations || stations.length === 0) {
    if (declared) {
      return { source: 'declared', within500: 'unknown', qualifies: true, message: 'Station proximity is declared by the user and not verified (station data not loaded).' };
    }
    return { source: 'none', within500: 'unknown', qualifies: false, message: 'Station data is not loaded, so station proximity is unknown.' };
  }
  let cx = 0, cy = 0;
  polygon.forEach(([x, y]) => { cx += x; cy += y; });
  const anchor = createAnchor([cx / polygon.length, cy / polygon.length]);
  const plot = polygonToMetric(anchor, polygon);
  let best: TransitResult['nearest'] | undefined;
  let bestQualifying: TransitResult['nearest'] | undefined;
  for (const s of stations) {
    const p = toMetric(anchor, s.lngLat);
    if (Math.hypot(p[0], p[1]) > 5000) continue;
    let minD = pointInPolygon(p, plot) ? 0 : Infinity;
    for (let i = 0; i < plot.length && minD > 0; i++) minD = Math.min(minD, pointSegmentDistance(p, plot[i]!, plot[(i + 1) % plot.length]!));
    // the farthest point of a polygon from a point is always a vertex
    const maxD = Math.max(...plot.map((v) => Math.hypot(v[0] - p[0], v[1] - p[1])));
    const cand = { name: s.name, nameEn: s.nameEn, network: s.network, lngLat: s.lngLat, minDistanceM: minD, maxDistanceM: maxD };
    if (!best || minD < best.minDistanceM) best = cand;
    if (maxD <= YOR9.transitRadiusM && (!bestQualifying || maxD < bestQualifying.maxDistanceM)) bestQualifying = cand;
  }
  if (!best) {
    return { source: 'station-data', within500: 'none', qualifies: false, message: 'No mass-transit station within 5 km.' };
  }
  const label = (n: NonNullable<TransitResult['nearest']>) => `${n.nameEn || n.name}${n.network ? ` (${n.network})` : ''}`;
  if (bestQualifying) {
    return {
      source: 'station-data', nearest: bestQualifying, within500: 'all', qualifies: true,
      message: `The whole plot is within 500 m of ${label(bestQualifying)}: nearest point ${bestQualifying.minDistanceM.toFixed(0)} m, farthest ${bestQualifying.maxDistanceM.toFixed(0)} m.`,
    };
  }
  if (best.minDistanceM <= YOR9.transitRadiusM) {
    return {
      source: 'station-data', nearest: best, within500: 'part', qualifies: false,
      message: `Only part of the plot is within 500 m of ${label(best)} (nearest ${best.minDistanceM.toFixed(0)} m, farthest ${best.maxDistanceM.toFixed(0)} m). The tool treats this as not qualifying; confirm how the BMA measures "บริเวณโดยรอบสถานี".`,
    };
  }
  return {
    source: 'station-data', nearest: best, within500: 'none', qualifies: false,
    message: `Nearest station: ${label(best)}, ${best.minDistanceM.toFixed(0)} m away (beyond 500 m).`,
  };
}
