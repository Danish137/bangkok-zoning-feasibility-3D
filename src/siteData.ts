// ─── Static reference data (zoning layer, stations) for the browser ───
// Served from /data (public/), fetched once; used by the engine worker and the map overlays.
import type { LngLat, SiteData, StationPoint } from './engine/types';
import { buildZoningIndex } from './engine/zoning';

export const ZONING_URL = '/data/bkk-zoning-2556.geojson';
export const STATIONS_URL = '/data/bkk-rail-stations.geojson';

let promise: Promise<SiteData> | null = null;

export function loadSiteData(base: string = typeof location !== 'undefined' ? location.origin : ''): Promise<SiteData> {
  promise ??= (async () => {
    const get = async (p: string) => {
      const res = await fetch(new URL(p, base));
      if (!res.ok) throw new Error(`${p}: HTTP ${res.status}`);
      return res.json();
    };
    const [zoning, stations] = await Promise.all([get(ZONING_URL), get(STATIONS_URL)]);
    return {
      zones: buildZoningIndex(zoning),
      zoningSource: zoning.metadata?.source,
      stations: (stations.features as { properties: Record<string, string>; geometry: { coordinates: LngLat } }[]).map(
        (f): StationPoint => ({ name: f.properties.name ?? '', nameEn: f.properties.nameEn ?? '', network: f.properties.network ?? '', lngLat: f.geometry.coordinates }),
      ),
    };
  })().catch((err) => { promise = null; throw err; });
  return promise;
}
