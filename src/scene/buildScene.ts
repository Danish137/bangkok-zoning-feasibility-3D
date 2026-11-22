// ─── Three.js scene construction (pure: result + view options → Group) ───
// All geometry is built in the engine's local metric frame (x east, y north, z up, metres),
// anchored at FeasibilityResult.anchor. The map layer applies the matching Mercator transform.

import * as THREE from 'three';
import type { DesignResult, FeasibilityResult, GeometryKey, MetricPoint, Polygon } from '../engine/types';
import { edgeInwardNormal, edgeOutwardNormal, intersectPolygons } from '../engine/polygon';
import { skyPlaneOffset } from '../engine/rules';

export interface SceneOptions {
  design: DesignResult | null;
  variant: 'a' | 'b';
  selectedFloor: number | null;
  sectionCutaway: boolean;
  floorMode: boolean;
  guides: { buildable: boolean; envelope: boolean; skyPlane: boolean; openSpace: boolean; threshold23: boolean; roads: boolean };
  focus: { geometry?: GeometryKey; edges?: number[] } | null;
  focusedEdge: number | null;
}

export const COLORS = {
  plot: 0xe2e8f0,
  road: 0x1e293b,
  roadEdge: 0xf59e0b,
  centre: 0xfacc15,
  buildable: 0x34d399,
  envelope: 0x22d3ee,
  designA: 0x6366f1,
  designB: 0x0ea5e9,
  commercial: 0xa78bfa,
  selected: 0xf59e0b,
  sky: 0xf59e0b,
  open: 0x10b981,
  threshold: 0xef4444,
  focus: 0xf43f5e,
  parking: 0x64748b,
};

function shapeFrom(poly: Polygon, holes: Polygon[] = []): THREE.Shape {
  const s = new THREE.Shape();
  poly.forEach((p, i) => (i === 0 ? s.moveTo(p[0], p[1]) : s.lineTo(p[0], p[1])));
  s.closePath();
  for (const h of holes) {
    if (h.length < 3) continue;
    const path = new THREE.Path();
    h.forEach((p, i) => (i === 0 ? path.moveTo(p[0], p[1]) : path.lineTo(p[0], p[1])));
    path.closePath();
    s.holes.push(path);
  }
  return s;
}

function lineLoop(poly: Polygon, z: number, color: number, opts: { dashed?: boolean; opacity?: number } = {}): THREE.Line {
  const pts = poly.map((p) => new THREE.Vector3(p[0], p[1], z));
  if (pts.length) pts.push(pts[0]!.clone());
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = opts.dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: 1.2, gapSize: 0.8, transparent: true, opacity: opts.opacity ?? 1 })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity: opts.opacity ?? 1 });
  const line = new THREE.Line(geo, mat);
  if (opts.dashed) line.computeLineDistances();
  return line;
}

function flat(poly: Polygon, z: number, color: number, opacity: number, holes: Polygon[] = []): THREE.Mesh {
  const geo = new THREE.ShapeGeometry(shapeFrom(poly, holes));
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
  const m = new THREE.Mesh(geo, mat);
  m.position.z = z;
  return m;
}

function quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, color: number, opacity: number): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z,
    a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z,
  ]), 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
  return new THREE.Mesh(geo, mat);
}

function segment(a: MetricPoint, b: MetricPoint, z: number, color: number, opacity = 1, dashed = false): THREE.Line {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a[0], a[1], z), new THREE.Vector3(b[0], b[1], z)]);
  const mat = dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: 2, gapSize: 1.5, transparent: true, opacity })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const l = new THREE.Line(geo, mat);
  if (dashed) l.computeLineDistances();
  return l;
}

/** Thick ground ribbon along a plot edge (WebGL lines are 1 px, so emphasis uses thin quads) */
function ribbon(a: MetricPoint, b: MetricPoint, inward: MetricPoint, width: number, z: number, color: number, opacity: number): THREE.Mesh {
  const A = new THREE.Vector3(a[0], a[1], z);
  const B = new THREE.Vector3(b[0], b[1], z);
  const C = new THREE.Vector3(b[0] + inward[0] * width, b[1] + inward[1] * width, z);
  const D = new THREE.Vector3(a[0] + inward[0] * width, a[1] + inward[1] * width, z);
  return quad(A, B, C, D, color, opacity);
}

export interface BuiltScene {
  group: THREE.Group;
  pickables: THREE.Mesh[];
}

export function buildScene(result: FeasibilityResult, o: SceneOptions): BuiltScene {
  const group = new THREE.Group();
  const pickables: THREE.Mesh[] = [];
  const plot = result.plotPolygon;
  if (plot.length < 3) return { group, pickables };
  const design = o.design;
  const env = design?.envelope;
  const fg = o.focus?.geometry;
  const focusEdges = new Set(o.focus?.edges ?? []);
  const topH = design && design.floors.length ? design.heightM : 30;

  // ── Layer 1: plot boundary (always) ──
  group.add(flat(plot, 0.03, 0x0b1120, 0.92));
  group.add(lineLoop(plot, 0.25, fg === 'plot' ? COLORS.focus : COLORS.plot));

  // ── Roads: corridor of the entered width, centreline, opposite boundary ──
  if (o.guides.roads || fg === 'frontage' || fg === 'road-setback' || fg === 'sky-plane') {
    for (const e of result.edges) {
      if (e.kind !== 'road' || e.roadWidthM === undefined) continue;
      const out = edgeOutwardNormal(e.start, e.end);
      const w = e.roadWidthM;
      const hl = focusEdges.has(e.index) || o.focusedEdge === e.index;
      const far: [MetricPoint, MetricPoint] = [
        [e.start[0] + out[0] * w, e.start[1] + out[1] * w],
        [e.end[0] + out[0] * w, e.end[1] + out[1] * w],
      ];
      group.add(quad(
        new THREE.Vector3(e.start[0], e.start[1], 0.08), new THREE.Vector3(e.end[0], e.end[1], 0.08),
        new THREE.Vector3(far[1][0], far[1][1], 0.08), new THREE.Vector3(far[0][0], far[0][1], 0.08),
        COLORS.road, 0.75,
      ));
      group.add(segment(
        [e.start[0] + out[0] * w / 2, e.start[1] + out[1] * w / 2],
        [e.end[0] + out[0] * w / 2, e.end[1] + out[1] * w / 2], 0.12, COLORS.centre, 0.7, true,
      ));
      group.add(segment(far[0], far[1], 0.12, COLORS.roadEdge, 0.6, true));
      group.add(ribbon(e.start, e.end, edgeInwardNormal(e.start, e.end), hl ? 0.9 : 0.45, 0.3, hl ? COLORS.focus : COLORS.roadEdge, 0.95));
    }
  }
  if (o.focusedEdge !== null && result.edges[o.focusedEdge]) {
    const e = result.edges[o.focusedEdge]!;
    group.add(ribbon(e.start, e.end, edgeInwardNormal(e.start, e.end), 0.9, 0.32, COLORS.focus, 0.95));
  }

  // ── Layer 2: buildable footprint after mandatory setbacks ──
  const setbackFocus = fg === 'road-setback' || fg === 'side-setback' || fg === 'rear-setback';
  if (env && env.buildablePolygon.length >= 3 && (o.guides.buildable || setbackFocus)) {
    group.add(lineLoop(env.buildablePolygon, 0.35, COLORS.buildable, { dashed: true }));
    group.add(flat(env.buildablePolygon, 0.1, COLORS.buildable, setbackFocus ? 0.12 : 0.06));
  }
  // Setback zone of focused edges: strip between the plot edge and the required distance, plus a vertical plane
  if (env && setbackFocus) {
    for (const idx of focusEdges) {
      const e = result.edges[idx];
      const sb = env.setbacks[idx];
      if (!e || !sb || sb.distanceM <= 0) continue;
      const inN = edgeInwardNormal(e.start, e.end);
      const d = sb.distanceM;
      const strip: Polygon = [
        e.start, e.end,
        [e.end[0] + inN[0] * d, e.end[1] + inN[1] * d],
        [e.start[0] + inN[0] * d, e.start[1] + inN[1] * d],
      ];
      const clipped = intersectPolygons(strip, plot).polygon;
      if (clipped.length >= 3) group.add(flat(clipped, 0.4, COLORS.focus, 0.35));
      const a = new THREE.Vector3(e.start[0] + inN[0] * d, e.start[1] + inN[1] * d, 0);
      const b = new THREE.Vector3(e.end[0] + inN[0] * d, e.end[1] + inN[1] * d, 0);
      group.add(quad(a, b, b.clone().setZ(topH + 3), a.clone().setZ(topH + 3), COLORS.focus, 0.12));
    }
  }

  // ── Open space (plot − footprint) ──
  if (design && (o.guides.openSpace || fg === 'open-space')) {
    const holes = design.footprintPolygon.length >= 3 ? [design.footprintPolygon] : [];
    group.add(flat(plot, 0.18, COLORS.open, fg === 'open-space' ? 0.5 : 0.22, holes));
  }

  // ── 2:1 sky-exposure planes ──
  if (env && (o.guides.skyPlane || fg === 'sky-plane')) {
    const H = topH + 6;
    for (const pl of env.skyPlanes) {
      const e = result.edges[pl.edgeIndex];
      if (!e) continue;
      const inN = edgeInwardNormal(e.start, e.end);
      const w = pl.roadWidthM;
      const along: MetricPoint = [e.end[0] - e.start[0], e.end[1] - e.start[1]];
      const len = Math.hypot(along[0], along[1]) || 1;
      const u: MetricPoint = [along[0] / len, along[1] / len];
      const ext = 4;
      const s0: MetricPoint = [e.start[0] - u[0] * ext, e.start[1] - u[1] * ext];
      const s1: MetricPoint = [e.end[0] + u[0] * ext, e.end[1] + u[1] * ext];
      const t = skyPlaneOffset(H, w); // inward offset at height H (negative = still over the road)
      const base = (p: MetricPoint) => new THREE.Vector3(p[0] - inN[0] * w, p[1] - inN[1] * w, 0);
      const top = (p: MetricPoint) => new THREE.Vector3(p[0] + inN[0] * t, p[1] + inN[1] * t, H);
      const op = pl.active ? (fg === 'sky-plane' ? 0.32 : 0.14) : 0.05;
      group.add(quad(base(s0), base(s1), top(s1), top(s0), pl.active ? COLORS.sky : 0x94a3b8, op));
      const g = new THREE.BufferGeometry().setFromPoints([base(s0), top(s0), top(s1), base(s1)]);
      group.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: pl.active ? COLORS.sky : 0x94a3b8, transparent: true, opacity: pl.active ? 0.8 : 0.3 })));
    }
  }

  // ── 23 m high-rise threshold ──
  if (o.guides.threshold23 || fg === 'height') {
    group.add(flat(plot, 23, COLORS.threshold, fg === 'height' ? 0.22 : 0.1));
    group.add(lineLoop(plot, 23, COLORS.threshold, { opacity: 0.8 }));
  }

  // ── Layer 3: allowable envelope per floor ──
  if (design && (o.guides.envelope || fg === 'envelope' || fg === 'sky-plane')) {
    const mat = new THREE.MeshBasicMaterial({ color: COLORS.envelope, transparent: true, opacity: fg ? 0.1 : 0.07, side: THREE.DoubleSide, depthWrite: false });
    const edgeMat = new THREE.LineBasicMaterial({ color: COLORS.envelope, transparent: true, opacity: 0.45 });
    for (const f of design.floors) {
      if (f.allowablePolygon.length < 3) continue;
      const geo = new THREE.ExtrudeGeometry(shapeFrom(f.allowablePolygon), { depth: f.heightM, bevelEnabled: false });
      const m = new THREE.Mesh(geo, mat);
      m.position.z = f.elevationM;
      group.add(m);
      const l = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), edgeMat);
      l.position.z = f.elevationM;
      group.add(l);
    }
  }

  // ── BMA 2544 Cl. 52(6)/53 front-space highlight: 20 m band in front of each road edge ──
  if (design && fg === 'front-space') {
    for (const e of result.edges) {
      if (e.kind !== 'road') continue;
      const inN = edgeInwardNormal(e.start, e.end);
      const band = (d: number): Polygon => [e.start, e.end, [e.end[0] + inN[0] * d, e.end[1] + inN[1] * d], [e.start[0] + inN[0] * d, e.start[1] + inN[1] * d]];
      const b20 = intersectPolygons(band(20), plot).polygon;
      if (b20.length >= 3) group.add(flat(b20, 0.42, COLORS.focus, 0.18));
      const w = design.frontSpace.requiredWidthM;
      const bw = intersectPolygons(band(w), plot).polygon;
      if (bw.length >= 3) group.add(lineLoop(bw, 0.45, COLORS.focus, { dashed: true }));
    }
    if (design.footprintPolygon.length >= 3) group.add(lineLoop(design.footprintPolygon, 0.5, COLORS.selected));
  }

  // ── Basement parking (below ground, translucent) ──
  if (design && design.basementFloors.length && (o.floorMode || fg === 'parking' || fg === 'floors')) {
    for (const f of design.basementFloors) {
      const geo = new THREE.ExtrudeGeometry(shapeFrom(f.polygon), { depth: f.heightM * 0.9, bevelEnabled: false });
      const isSel = o.selectedFloor === f.index;
      const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: isSel ? COLORS.selected : COLORS.parking, transparent: true, opacity: isSel ? 0.9 : 0.45, side: THREE.DoubleSide, depthWrite: false }));
      m.position.z = f.elevationM;
      m.userData = { floorIndex: f.index };
      group.add(m);
      pickables.push(m);
      const l = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineBasicMaterial({ color: 0xcbd5e1, transparent: true, opacity: 0.5 }));
      l.position.z = f.elevationM;
      group.add(l);
    }
  }

  // ── Layer 4: actual building floors ──
  if (design) {
    const base = o.variant === 'b' ? COLORS.designB : COLORS.designA;
    const floorsFocus = fg === 'floors';
    for (const f of design.floors) {
      if (f.polygon.length < 3) continue;
      const isSel = o.selectedFloor === f.index;
      if (o.sectionCutaway && o.selectedFloor !== null && f.index > o.selectedFloor) continue;
      const parkingFocus = fg === 'parking';
      const ghost = (o.floorMode && o.selectedFloor !== null && !isSel) || (fg && !floorsFocus && fg !== 'height' && !(parkingFocus && f.use === 'parking'));
      const color = isSel ? COLORS.selected : parkingFocus && f.use === 'parking' ? COLORS.focus : f.use === 'parking' ? COLORS.parking : f.use === 'commercial' ? COLORS.commercial : base;
      const geo = new THREE.ExtrudeGeometry(shapeFrom(f.polygon), { depth: f.heightM * 0.9, bevelEnabled: false });
      const mat = new THREE.MeshLambertMaterial({
        color, transparent: true, opacity: isSel ? 0.98 : ghost ? 0.22 : 0.9, side: THREE.DoubleSide, depthWrite: !ghost,
        emissive: isSel ? 0x3b2500 : 0x000000,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.z = f.elevationM;
      mesh.userData = { floorIndex: f.index };
      group.add(mesh);
      pickables.push(mesh);
      const lines = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo, 30),
        new THREE.LineBasicMaterial({ color: isSel ? 0xfef3c7 : 0xe0e7ff, transparent: true, opacity: ghost ? 0.25 : 0.55 }),
      );
      lines.position.z = f.elevationM;
      group.add(lines);
    }
  }

  group.traverse((obj) => { obj.frustumCulled = false; });
  return { group, pickables };
}

export function disposeGroup(group: THREE.Object3D) {
  group.traverse((obj) => {
    const anyObj = obj as THREE.Mesh;
    if (anyObj.geometry) anyObj.geometry.dispose();
    const mat = anyObj.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose();
  });
}
