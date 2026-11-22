// ─── Zoning jurisdiction ───
// The 2013 Bangkok plan defines 30 separate ย.9 areas (ย.9-1 … ย.9-30) only on its annexed
// land-use map. No official machine-readable boundary is published (BMA GIS services were not
// publicly reachable during research), so this tool NEVER reports a plot as "verified ย.9".
// It can only prove a plot is definitely NOT in Bangkok (outside a coarse bounding box that
// encloses the whole Bangkok Metropolitan Administration).

import type { JurisdictionResult, LngLatPolygon } from './types';

/** Coarse box enclosing the BMA (≈ 100.33–100.94 E, 13.49–13.96 N) — conservative, includes neighbours */
export const BMA_BBOX = { minLng: 100.32, maxLng: 100.94, minLat: 13.49, maxLat: 13.96 } as const;

export function checkJurisdiction(polygon: LngLatPolygon): JurisdictionResult {
  const inside = polygon.every(([lng, lat]) =>
    lng >= BMA_BBOX.minLng && lng <= BMA_BBOX.maxLng && lat >= BMA_BBOX.minLat && lat <= BMA_BBOX.maxLat);
  if (!inside) {
    return {
      status: 'FAIL',
      insideBangkok: false,
      message: 'The plot is (at least partly) outside Bangkok, so the Bangkok Comprehensive Plan and its ย.9 rules cannot apply.',
    };
  }
  return {
    status: 'UNVERIFIED',
    insideBangkok: true,
    message: 'You have declared this plot as ย.9. It has not been checked against the official land-use map: no machine-readable boundary is published. Confirm the zone with the BMA City Planning Department (zoning certificate) before relying on these figures.',
  };
}
