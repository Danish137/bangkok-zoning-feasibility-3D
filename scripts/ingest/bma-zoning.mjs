#!/usr/bin/env node
// ─── Ingest: Bangkok Comprehensive Plan B.E. 2556 land-use zones → public/data/bkk-zoning-2556.geojson ───
//
// Source of truth: BMA City Planning & Urban Development Dept., public ArcGIS 10.0 service
//   http://3d-cpd.bangkok.go.th/ArcGIS/rest/services/DOL/LupDolWms/MapServer/1  ("ผังเมืองรวม 2556", field ZONE)
// The host geo-blocks many non-Thai networks. Options:
//   1. Run from a Thai network, or with a Thai HTTPS proxy:  HTTPS_PROXY=… HTTP_PROXY=… node scripts/ingest/bma-zoning.mjs
//      (Node ≥ 24 honours NODE_USE_ENV_PROXY=1 with HTTP(S)_PROXY; older Node: use a system-wide VPN.)
//   2. Run it on GitHub Actions (.github/workflows/ingest-data.yml), whose runners can reach the service.
//   3. Offline: convert an existing GeoJSON export of the same layer:
//        node scripts/ingest/bma-zoning.mjs --from path/to/export.geojson
//
// Every run validates the per-zone polygon counts against the counts written in the Royal Gazette text
// (Vol. 130 Part 41 Kor, Clauses 7–17: "จำแนกเป็นบริเวณ ย.9-1 ถึง ย.9-30" …) and refuses to write on mismatch.
// Legal note: the plan map is part of a ministerial regulation; Copyright Act B.E. 2537 s.7(2)–(3) excludes laws
// and official regulations from copyright. The BMA publishes no separate data licence.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const SERVICE = 'http://3d-cpd.bangkok.go.th/ArcGIS/rest/services/DOL/LupDolWms/MapServer/1';
const OUT = 'public/data/bkk-zoning-2556.geojson';
const CHUNK = 100;

/** Polygon counts per zone stated in the Gazette text (only zones whose count was legible in the extracted text). */
export const GAZETTE_COUNTS = {
  'ย.1': 4, 'ย.2': 17, 'ย.4': 40, 'ย.5': 37, 'ย.6': 48, 'ย.7': 30, 'ย.8': 26, 'ย.9': 30,
  'พ.1': 21, 'พ.2': 5, 'พ.3': 43, 'พ.4': 5,
  'อ.1': 6, 'อ.2': 6, 'อ.3': 1,
  'ก.1': 16, 'ก.4': 38, 'ก.5': 13,
  'ศ.1': 6, 'ศ.2': 1,
};

const thaiDigits = (s) => s.replace(/[๐-๙]/g, (d) => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(d)));
export function normalizeZone(raw) {
  const z = thaiDigits(String(raw ?? '').trim()).replace(/\s+/g, '');
  const m = z.match(/^([กพยศอส])\.?(\d+)?/);
  if (!m) return null;
  return m[2] ? `${m[1]}.${m[2]}` : `${m[1]}.`;
}

const q6 = (v) => Math.round(v * 1e6) / 1e6; // ≈ 0.11 m at Bangkok
const ringArea = (r) => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return a / 2; };
function pip(pt, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function cleanRing(r) {
  const out = [];
  for (const p of r) { const q = [q6(p[0]), q6(p[1])]; const l = out[out.length - 1]; if (!l || l[0] !== q[0] || l[1] !== q[1]) out.push(q); }
  if (out.length && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) out.push([...out[0]]);
  return out.length >= 4 ? out : null;
}
/** Esri rings (outer clockwise, holes counter-clockwise) → GeoJSON (Multi)Polygon with RFC 7946 winding */
function esriToGeoJSON(rings) {
  const outers = [], holes = [];
  for (const r0 of rings) { const r = cleanRing(r0); if (!r) continue; (ringArea(r) < 0 ? outers : holes).push(r); }
  const polys = outers.map((o) => [o.slice().reverse()]); // CW → CCW outer
  for (const h of holes) {
    const owner = polys.find((p) => pip(h[0], p[0]));
    if (owner) owner.push(h.slice().reverse()); // CCW → CW hole
    else polys.push([h]); // ccw ring without owner: treat as outer (already CCW)
  }
  return polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
}
function quantizeGeometry(g) {
  const ring = (r) => cleanRing(r);
  if (g.type === 'Polygon') return { type: 'Polygon', coordinates: g.coordinates.map(ring).filter(Boolean) };
  if (g.type === 'MultiPolygon') return { type: 'MultiPolygon', coordinates: g.coordinates.map((p) => p.map(ring).filter(Boolean)).filter((p) => p.length) };
  throw new Error(`unexpected geometry ${g.type}`);
}

async function getJSON(url, params) {
  const u = new URL(url);
  for (const [k, v] of Object.entries({ ...params, f: 'json' })) u.searchParams.set(k, String(v));
  const res = await fetch(u, { headers: { 'User-Agent': 'bangkok-feasibility-studio-ingest' } });
  if (!res.ok) throw new Error(`${res.status} ${u}`);
  const j = await res.json();
  if (j.error) throw new Error(`ArcGIS error ${JSON.stringify(j.error)}`);
  return j;
}

async function fromService() {
  const info = await getJSON(SERVICE, {});
  console.log(`layer "${info.name}" fields: ${info.fields.map((f) => f.name).join(', ')}`);
  const { objectIds } = await getJSON(`${SERVICE}/query`, { where: '1=1', returnIdsOnly: 'true' });
  const features = [];
  for (let i = 0; i < objectIds.length; i += CHUNK) {
    const page = await getJSON(`${SERVICE}/query`, { objectIds: objectIds.slice(i, i + CHUNK).join(','), outFields: 'ZONE', outSR: 4326, returnGeometry: 'true' });
    for (const f of page.features) {
      const zone = normalizeZone(f.attributes.ZONE);
      if (zone && f.geometry?.rings) features.push({ zone, geometry: esriToGeoJSON(f.geometry.rings) });
    }
    console.log(`${Math.min(i + CHUNK, objectIds.length)}/${objectIds.length}`);
  }
  return { features, origin: SERVICE };
}

function fromFile(path) {
  const d = JSON.parse(readFileSync(path, 'utf8'));
  const features = d.features
    .map((f) => ({ zone: normalizeZone(f.properties.zone ?? f.properties.ZONE), geometry: quantizeGeometry(f.geometry) }))
    .filter((f) => f.zone);
  return { features, origin: `file:${path.split(/[\\/]/).pop()} (converted export of ${SERVICE})` };
}

export function validateCounts(features) {
  const counts = {};
  for (const f of features) counts[f.zone] = (counts[f.zone] ?? 0) + 1;
  const mismatches = Object.entries(GAZETTE_COUNTS).filter(([z, n]) => counts[z] !== n).map(([z, n]) => `${z}: gazette ${n}, data ${counts[z] ?? 0}`);
  return { counts, mismatches };
}

async function main() {
  const i = process.argv.indexOf('--from');
  const { features, origin } = i > 0 ? fromFile(process.argv[i + 1]) : await fromService();
  const { counts, mismatches } = validateCounts(features);
  console.log('zones:', Object.entries(counts).map(([z, n]) => `${z}=${n}`).join(' '));
  if (mismatches.length) {
    console.error('Gazette count mismatch, refusing to write:\n  ' + mismatches.join('\n  '));
    process.exit(1);
  }
  const fc = {
    type: 'FeatureCollection',
    metadata: {
      title: 'Bangkok Comprehensive Plan B.E. 2556 land-use zones',
      source: 'BMA City Planning and Urban Development Department, ArcGIS service DOL/LupDolWms layer 1 (ผังเมืองรวม 2556)',
      origin,
      retrieved: new Date().toISOString().slice(0, 10),
      validation: `Per-zone polygon counts match the Royal Gazette text for ${Object.keys(GAZETTE_COUNTS).length} zones (incl. ย.9 = 30).`,
      legalNote: 'Indicative GIS copy. The legally binding map is the one annexed to the Ministerial Regulation (Royal Gazette Vol. 130 Part 41 Kor, 16 May 2013). White (ขาว) and military areas are not in the service.',
      coordinatePrecision: '1e-6 degrees (≈ 0.11 m)',
    },
    features: features.map((f) => ({ type: 'Feature', properties: { zone: f.zone }, geometry: f.geometry })),
  };
  const json = JSON.stringify(fc);
  mkdirSync('public/data', { recursive: true });
  writeFileSync(OUT, json);
  console.log(`wrote ${OUT}: ${features.length} features, ${(json.length / 1024).toFixed(0)} KB, sha256 ${createHash('sha256').update(json).digest('hex').slice(0, 16)}`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('bma-zoning.mjs')) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
