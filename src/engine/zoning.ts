// ─── Zoning jurisdiction ───
// With the bundled BMA GIS layer (public/data/bkk-zoning-2556.geojson) the plot is overlaid on every
// zone polygon whose bounding box touches it, and the share of the plot's AREA in each zone is measured
// (not just vertices). Without the data the tool can only prove "outside Bangkok".

import type { JurisdictionResult, LngLat, LngLatPolygon, Polygon, ZoneFeature } from './types';
import { createAnchor, polygonToMetric } from './geo';
import { intersectionAreaWithRings, polygonArea, segmentSegmentDistance } from './polygon';
import { YOR9, ZONE_BOUNDARY_MARGIN_M } from './regulations';

/** Coarse box enclosing the BMA (≈ 100.33–100.94 E, 13.49–13.96 N): conservative, includes neighbours */
export const BMA_BBOX = { minLng: 100.32, maxLng: 100.94, minLat: 13.49, maxLat: 13.96 } as const;

interface GeoJSONLike {
  features: { properties: Record<string, unknown>; geometry: { type: string; coordinates: unknown } }[];
  metadata?: { source?: string; retrieved?: string };
}

/** Build the zone index from the bundled GeoJSON */
export function buildZoningIndex(fc: GeoJSONLike): ZoneFeature[] {
  const out: ZoneFeature[] = [];
  for (const f of fc.features) {
    const zone = String(f.properties.zone ?? '');
    if (!zone) continue;
    const g = f.geometry;
    const polygons = (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []) as LngLat[][][];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of polygons) for (const [x, y] of p[0] ?? []) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
    out.push({ zone, polygons, bbox: [minX, minY, maxX, maxY] });
  }
  return out;
}

function insideBangkokBox(polygon: LngLatPolygon): boolean {
  return polygon.every(([lng, lat]) => lng >= BMA_BBOX.minLng && lng <= BMA_BBOX.maxLng && lat >= BMA_BBOX.minLat && lat <= BMA_BBOX.maxLat);
}

export function checkJurisdiction(polygon: LngLatPolygon, zones?: ZoneFeature[], dataSource?: string): JurisdictionResult {
  const insideBangkok = insideBangkokBox(polygon);
  if (!insideBangkok) {
    return {
      status: 'FAIL', insideBangkok, overlaps: [], dataSource,
      message: 'The plot is (at least partly) outside Bangkok, so the Bangkok Comprehensive Plan and its ย.9 rules cannot apply.',
    };
  }
  if (!zones || zones.length === 0 || polygon.length < 3) {
    return {
      status: 'UNVERIFIED', insideBangkok, overlaps: [],
      message: 'Zoning data is not loaded, so the zone is assumed to be ย.9 without verification.',
    };
  }

  // Local metric frame around the plot
  let cx = 0, cy = 0;
  polygon.forEach(([x, y]) => { cx += x; cy += y; });
  const anchor = createAnchor([cx / polygon.length, cy / polygon.length]);
  const plot = polygonToMetric(anchor, polygon);
  const plotArea = polygonArea(plot);
  const pad = 0.002; // ≈ 200 m, for the boundary-distance search
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  polygon.forEach(([x, y]) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); });
  const near = zones.filter((z) => z.bbox[0] <= maxX + pad && z.bbox[2] >= minX - pad && z.bbox[1] <= maxY + pad && z.bbox[3] >= minY - pad);

  const byZone = new Map<string, number>();
  const toMetric = (rings: LngLat[][]): Polygon[] => rings.map((r) => polygonToMetric(anchor, r));
  for (const z of near) {
    if (z.bbox[0] > maxX || z.bbox[2] < minX || z.bbox[1] > maxY || z.bbox[3] < minY) continue;
    const a = intersectionAreaWithRings(plot, z.polygons.map(toMetric));
    if (a > 1e-6) byZone.set(z.zone, (byZone.get(z.zone) ?? 0) + a);
  }
  const overlaps = [...byZone.entries()].map(([zone, a]) => ({ zone, fraction: a / plotArea })).sort((x, y) => y.fraction - x.fraction);
  const yor9 = overlaps.find((o) => o.zone === YOR9.code)?.fraction ?? 0;
  const main = overlaps[0];
  const pct = (f: number) => `${(f * 100).toFixed(f > 0.995 && f < 1 ? 2 : 0)} %`;
  const src = dataSource ?? 'BMA GIS layer (2013 plan)';

  if (yor9 >= 0.999) {
    // distance from the plot boundary to every ย.9 / other-zone boundary edge nearby
    let margin = Infinity;
    for (const z of near) {
      for (const poly of z.polygons) for (const ring of poly) {
        const m = polygonToMetric(anchor, ring);
        for (let i = 0; i < m.length - 1; i++) {
          for (let j = 0; j < plot.length; j++) {
            margin = Math.min(margin, segmentSegmentDistance(m[i]!, m[i + 1]!, plot[j]!, plot[(j + 1) % plot.length]!));
          }
        }
      }
    }
    if (margin < ZONE_BOUNDARY_MARGIN_M) {
      return {
        status: 'UNVERIFIED', insideBangkok, zone: YOR9.code, overlaps, boundaryMarginM: margin, dataSource: src,
        message: `The plot is inside ย.9 on the BMA GIS layer, but only ${margin.toFixed(1)} m from a zone boundary (< ${ZONE_BOUNDARY_MARGIN_M} m). GIS boundaries are indicative at this precision; confirm with a BMA land-use certificate.`,
      };
    }
    return {
      status: 'PASS', insideBangkok, zone: YOR9.code, overlaps, boundaryMarginM: margin, dataSource: src,
      message: `The whole plot is inside a ย.9 area on the BMA GIS layer of the 2013 plan, ${Number.isFinite(margin) ? `${margin.toFixed(0)} m from the nearest zone boundary` : 'well away from any zone boundary'}. The layer matches the Gazette's area counts. The legally binding map is the one annexed to the regulation, so obtain a BMA land-use certificate for a permit.`,
    };
  }
  if (yor9 > 0) {
    return {
      status: 'FAIL', insideBangkok, zone: main?.zone, overlaps, dataSource: src,
      message: `The plot straddles zones: ${overlaps.map((o) => `${o.zone} ${pct(o.fraction)}`).join(', ')}. Each part follows its own zone's rules; this tool models ย.9 only, so these results do not apply to the part outside ย.9.`,
    };
  }
  if (!main) {
    return {
      status: 'UNVERIFIED', insideBangkok, overlaps, dataSource: src,
      message: 'The plot is not inside any zone polygon of the GIS layer (white/unzoned areas, waterways or military land are not in the layer). Check the official map.',
    };
  }
  return {
    status: 'FAIL', insideBangkok, zone: main.zone, overlaps, dataSource: src,
    message: `The plot is in zone ${main.zone}${main.fraction < 0.999 ? ` (${overlaps.map((o) => `${o.zone} ${pct(o.fraction)}`).join(', ')})` : ''}, not ย.9. Zone ${main.zone} has its own FAR, open-space and use rules, which this tool does not model, so these ย.9 results do not apply.`,
  };
}
