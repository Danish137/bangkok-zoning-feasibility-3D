#!/usr/bin/env node
// ─── Ingest: Bangkok mass-transit (electric rail) stations from OpenStreetMap → public/data/bkk-rail-stations.geojson ───
// Data © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright). The output file is a
// derivative database and is published under ODbL with attribution.
//
// Used for Bangkok Plan B.E. 2556 Clause 16 conditions "ภายในระยะ 500 เมตร จากบริเวณโดยรอบสถานีรถไฟฟ้าขนส่งมวลชน".
// Included: operating BTS, MRT (Blue/Purple), Airport Rail Link, SRT Red Lines, Gold Line, Pink/Yellow monorails.
// Excluded: conventional SRT railway halts, stations under construction / proposed / disused.
//   node scripts/ingest/osm-stations.mjs            (queries the public Overpass API)
//   node scripts/ingest/osm-stations.mjs --from x.json   (re-process a saved Overpass JSON response)

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const OUT = 'public/data/bkk-rail-stations.geojson';
// BMA bounding box (+ ~1 km), so stations just outside Bangkok that are within 500 m of a Bangkok plot are kept
const BBOX = '13.48,100.31,13.97,100.95';
const QUERY = `[out:json][timeout:120];
( nwr["railway"="station"](${BBOX}); nwr["public_transport"="station"]["station"~"subway|light_rail|monorail"](${BBOX}); );
out center tags;`;

const MASS_TRANSIT = /BTS|MRT|Metropolitan Rapid|ARL|Airport Rail|ทางด่วนและรถไฟฟ้า|ระบบขนส่งมวลชนกรุงเทพ|กรุงเทพธนาคม|Krungthep Thanakom|Gold Line|สายสีทอง|สายสีแดง|Red Line|SRT Electrified|โมโนเรล|Monorail|Sukhumvit Line|Silom Line/i;

export function isMassTransit(tags) {
  if (tags.railway === 'construction' || tags.construction || tags['disused:railway'] || tags.proposed || tags.disused === 'yes') return false;
  // airside people-movers (e.g. Suvarnabhumi SAT-1 APM) are not public mass transit
  if (/ท่าอากาศยานไทย|Airports of Thailand|people.?mover/i.test([tags.operator, tags['operator:en'], tags.network, tags.name].filter(Boolean).join(' '))) return false;
  if (/^(subway|light_rail|monorail)$/.test(tags.station ?? '')) return true;
  const net = [tags.network, tags['network:en'], tags.operator, tags['operator:en'], tags.line, tags.name].filter(Boolean).join(' ');
  return MASS_TRANSIT.test(net);
}

function haversine(a, b) {
  const R = 6371008.8, r = Math.PI / 180;
  const dLat = (b[1] - a[1]) * r, dLng = (b[0] - a[0]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function toStations(overpass) {
  const raw = [];
  for (const e of overpass.elements) {
    const t = e.tags ?? {};
    if (!isMassTransit(t)) continue;
    const ll = e.type === 'node' ? [e.lon, e.lat] : e.center ? [e.center.lon, e.center.lat] : null;
    if (!ll) continue;
    raw.push({ ll, name: t['name:th'] ?? t.name ?? '', nameEn: t['name:en'] ?? '', network: t['network:en'] ?? t.network ?? t['operator:en'] ?? t.operator ?? '' });
  }
  // merge duplicates (node + station area of the same station) within 150 m and same name
  const out = [];
  for (const s of raw) {
    const twin = out.find((o) => o.name === s.name && haversine(o.ll, s.ll) < 150);
    if (twin) { twin.ll = [(twin.ll[0] + s.ll[0]) / 2, (twin.ll[1] + s.ll[1]) / 2]; twin.network ||= s.network; continue; }
    out.push({ ...s });
  }
  return out.sort((a, b) => a.nameEn.localeCompare(b.nameEn));
}

async function main() {
  const i = process.argv.indexOf('--from');
  let data;
  if (i > 0) data = JSON.parse(readFileSync(process.argv[i + 1], 'utf8'));
  else {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'bangkok-feasibility-studio-ingest' },
      body: new URLSearchParams({ data: QUERY }),
    });
    if (!res.ok) throw new Error(`Overpass ${res.status}`);
    data = await res.json();
  }
  const stations = toStations(data);
  const fc = {
    type: 'FeatureCollection',
    metadata: {
      title: 'Bangkok operating mass-transit (electric rail) stations',
      attribution: '© OpenStreetMap contributors, ODbL 1.0',
      licence: 'ODbL 1.0 (https://opendatacommons.org/licenses/odbl/1-0/)',
      retrieved: new Date().toISOString().slice(0, 10),
      note: 'Point = OSM station node or station-area centre; typical positional error ±30 m. Distances from these points are indicative.',
    },
    features: stations.map((s) => ({
      type: 'Feature',
      properties: { name: s.name, nameEn: s.nameEn, network: s.network },
      geometry: { type: 'Point', coordinates: [Math.round(s.ll[0] * 1e6) / 1e6, Math.round(s.ll[1] * 1e6) / 1e6] },
    })),
  };
  mkdirSync('public/data', { recursive: true });
  writeFileSync(OUT, JSON.stringify(fc));
  const nets = {};
  stations.forEach((s) => { nets[s.network] = (nets[s.network] ?? 0) + 1; });
  console.log(`wrote ${OUT}: ${stations.length} stations`, nets);
}

if (process.argv[1]?.endsWith('osm-stations.mjs')) main().catch((e) => { console.error(e.message); process.exit(1); });
