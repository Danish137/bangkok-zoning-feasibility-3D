// ─── MapContainer: MapLibre GL (real Bangkok context) + Three.js custom layer (massing) ───
import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import * as THREE from 'three';
import { useAppDispatch, useAppState, type AppState } from '../state';
import type { LngLat, LngLatPolygon, RoadAdvisory } from '../engine/types';
import { pointInPolygon, polygonArea, segmentsIntersect, signedArea } from '../engine/polygon';
import { anchorAtCentroid, polygonToMetric } from '../engine/geo';
import { buildScene, disposeGroup } from '../scene/buildScene';

const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const FALLBACK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    carto: {
      type: 'raster',
      tiles: ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', 'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors © CARTO',
    },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#0b0f19' } },
    { id: 'carto', type: 'raster', source: 'carto' },
  ],
};
const DEFAULT_CENTER: LngLat = [100.5760, 13.7308];
const STAGE_PITCH: Record<AppState['stage'], number> = { site: 45, building: 60, floor: 55, compliance: 58, report: 50 };

type GeoSrc = maplibregl.GeoJSONSource;
const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features });
const closed = (p: LngLatPolygon) => (p.length ? [...p, p[0]!] : []);

/** Approximate local metres for small-distance screen-independent checks */
function metresBetween(a: LngLat, b: LngLat): number {
  const lat = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const dx = (b[0] - a[0]) * 111320 * Math.cos(lat);
  const dy = (b[1] - a[1]) * 110574;
  return Math.hypot(dx, dy);
}

function lngLatArea(p: LngLat[]): number {
  if (p.length < 3) return 0;
  const a = anchorAtCentroid(p);
  return polygonArea(polygonToMetric(a, p));
}

export function MapContainer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<SVGSVGElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const state = useAppState();
  const dispatch = useAppDispatch();
  const stateRef = useRef(state);
  stateRef.current = state;

  const three = useRef<{
    renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.Camera;
    content: THREE.Group | null; pickables: THREE.Mesh[];
  } | null>(null);
  const anchorRef = useRef<LngLat | null>(state.result?.anchor ?? null);
  const cursorRef = useRef<LngLat | null>(null);
  const dragRef = useRef<{ index: number; poly: LngLatPolygon; lastDispatch: number; invalid: boolean } | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  /** Last applied building filter / advisory, so idle events don't re-trigger work (avoids an idle → setFilter → idle loop) */
  const filterKeyRef = useRef<string>('');
  const advisoryKeyRef = useRef<string>('');

  // ─── 1. Map initialisation ───
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const start = state.polygon.length >= 3 ? anchorAtCentroid(state.polygon) : null;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OPENFREEMAP_STYLE,
      center: start ? [start.lngDeg, start.latDeg] : DEFAULT_CENTER,
      zoom: 17.4,
      pitch: 50,
      bearing: -25,
      maxPitch: 80,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    (window as unknown as { __map__: maplibregl.Map }).__map__ = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');

    let fellBack = false;
    map.on('error', (e) => {
      const msg = String(e?.error?.message ?? '');
      if (!fellBack && !map.isStyleLoaded() && /style|fetch|Failed|NetworkError|tiles/i.test(msg)) {
        fellBack = true;
        setUsingFallback(true);
        map.setStyle(FALLBACK_STYLE);
      } else if (/Failed to fetch|NetworkError/i.test(msg)) {
        setMapError('Some map tiles failed to load (network). Calculations are unaffected.');
      }
    });

    // Basemap POI icons that are missing from the sprite would otherwise re-trigger symbol placement
    // and repaint continuously (measured: ~30 events/s while idle). Register a transparent placeholder once.
    map.on('styleimagemissing', (e: { id: string }) => {
      if (!map.hasImage(e.id)) map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
    });
    map.on('move', () => drawOverlay());
    map.on('resize', () => drawOverlay());
    map.on('style.load', () => {
      setupLayers(map);
      setMapLoaded(true);
      map.triggerRepaint();
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      if (three.current?.content) disposeGroup(three.current.content);
      three.current?.renderer.dispose();
      three.current = null;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setupLayers(map: maplibregl.Map) {
    // Context buildings: restyle the style's own extrusion layer (or add one) in a studio palette
    try {
      if (map.getLayer('building-3d')) {
        map.setPaintProperty('building-3d', 'fill-extrusion-color', '#334155');
        map.setPaintProperty('building-3d', 'fill-extrusion-opacity', 0.55);
      } else if (map.getSource('openmaptiles')) {
        map.addLayer({
          id: 'building-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14,
          paint: {
            'fill-extrusion-color': '#334155',
            'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 10],
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
            'fill-extrusion-opacity': 0.55,
          },
        });
      }
    } catch (err) { console.debug('building layer', err); }

    const add = (id: string) => { if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: fc([]) }); };
    ['plot', 'road-edges', 'edge-hit', 'vertices'].forEach(add);

    map.addLayer({ id: 'plot-fill', type: 'fill', source: 'plot', paint: { 'fill-color': '#6366f1', 'fill-opacity': 0.08 } });
    map.addLayer({ id: 'plot-line', type: 'line', source: 'plot', paint: { 'line-color': '#c7d2fe', 'line-width': 2 } });
    map.addLayer({ id: 'road-edges-line', type: 'line', source: 'road-edges', paint: { 'line-color': '#f59e0b', 'line-width': 5 } });
    map.addLayer({ id: 'edge-hit', type: 'line', source: 'edge-hit', paint: { 'line-color': '#ffffff', 'line-opacity': ['case', ['boolean', ['get', 'hover'], false], 0.35, 0.0], 'line-width': 16 } });
    map.addLayer({
      id: 'vertices', type: 'circle', source: 'vertices',
      paint: { 'circle-radius': 6.5, 'circle-color': '#ffffff', 'circle-stroke-color': '#6366f1', 'circle-stroke-width': 2.5 },
    });

    // Three.js custom layer sharing MapLibre's WebGL context
    const layer: maplibregl.CustomLayerInterface = {
      id: 'three-massing',
      type: 'custom',
      renderingMode: '3d',
      onAdd(m, gl) {
        const renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
        renderer.autoClear = false;
        const scene = new THREE.Scene();
        scene.add(new THREE.AmbientLight(0xffffff, 1.6));
        const sun = new THREE.DirectionalLight(0xfff7ed, 2.2);
        sun.position.set(80, -120, 200);
        scene.add(sun);
        const fill = new THREE.DirectionalLight(0x93c5fd, 0.8);
        fill.position.set(-120, 140, 90);
        scene.add(fill);
        three.current = { renderer, scene, camera: new THREE.Camera(), content: null, pickables: [] };
        rebuildScene();
      },
      render(_gl, args) {
        const t = three.current;
        const anchor = anchorRef.current;
        if (!t || !anchor || !t.content) return;
        const opts = args as unknown as { defaultProjectionData?: { mainMatrix: ArrayLike<number> } };
        const raw = opts.defaultProjectionData?.mainMatrix ?? (args as unknown as ArrayLike<number>);
        if (!raw || (raw as ArrayLike<number>).length < 16) return;
        const merc = maplibregl.MercatorCoordinate.fromLngLat({ lng: anchor[0], lat: anchor[1] }, 0);
        const s = merc.meterInMercatorCoordinateUnits();
        const local = new THREE.Matrix4().makeTranslation(merc.x, merc.y, 0).scale(new THREE.Vector3(s, -s, s));
        const proj = new THREE.Matrix4().fromArray(Array.from(raw as ArrayLike<number>)).multiply(local);
        t.camera.projectionMatrix.copy(proj);
        t.camera.projectionMatrixInverse.copy(proj).invert();
        t.renderer.resetState();
        t.renderer.render(t.scene, t.camera);
      },
    };
    map.addLayer(layer);
    syncPlotLayers();
  }

  // ─── 2. 2D plot / draft layers ───
  function syncPlotLayers() {
    const map = mapRef.current;
    if (!map || !map.getSource('plot')) return;
    const s = stateRef.current;
    const poly = dragRef.current?.poly ?? s.polygon;
    const showPlot = poly.length >= 3 && !s.drawing.active;
    (map.getSource('plot') as GeoSrc).setData(fc(showPlot ? [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [closed(poly)] } }] : []));
    const roadSet = new Set(s.roadEdges.map((r) => r.edgeIndex));
    const edgeFeatures = (onlyRoads: boolean): GeoJSON.Feature[] => !showPlot ? [] : poly.flatMap((p, i) => {
      if (onlyRoads && !roadSet.has(i)) return [];
      return [{ type: 'Feature', properties: { index: i, hover: s.focusedEdge === i }, geometry: { type: 'LineString', coordinates: [p, poly[(i + 1) % poly.length]!] } } as GeoJSON.Feature];
    });
    (map.getSource('road-edges') as GeoSrc).setData(fc(edgeFeatures(true)));
    (map.getSource('edge-hit') as GeoSrc).setData(fc(s.stage === 'site' ? edgeFeatures(false) : []));
    (map.getSource('vertices') as GeoSrc).setData(fc(showPlot && s.stage === 'site' ? poly.map((p, i) => ({ type: 'Feature', properties: { index: i }, geometry: { type: 'Point', coordinates: p } })) : []));
    drawOverlay();
  }

  /**
   * Drawing & drag feedback is an SVG overlay projected every camera move. It is immediate,
   * unlike GeoJSON source updates, which pass through MapLibre's worker tiling queue (measured
   * at 450–1,100 ms per update under load, the cause of the "first click does nothing" report).
   */
  function drawOverlay() {
    const svg = overlayRef.current;
    const map = mapRef.current;
    if (!svg || !map) return;
    const s = stateRef.current;
    const P = (ll: LngLat) => map.project(ll);
    const pts = (a: { x: number; y: number }[]) => a.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    let html = '';
    const drag = dragRef.current;
    if (drag) {
      const q = drag.poly.map(P);
      html += `<polygon class="ov-drag${drag.invalid ? ' ov-invalid' : ''}" points="${pts(q)}"/>`;
      q.forEach((p, i) => { html += `<circle class="${i === drag.index ? 'ov-active' : 'ov-v'}" cx="${p.x}" cy="${p.y}" r="${i === drag.index ? 7 : 5}"/>`; });
    }
    const v = s.drawing.active ? s.drawing.vertices : [];
    const cur = s.drawing.active ? cursorRef.current : null;
    if (s.drawing.active) {
      const q = v.map(P);
      const c = cur ? P(cur) : null;
      const ring = c ? [...q, c] : q;
      if (ring.length >= 3) html += `<polygon class="ov-fill" points="${pts(ring)}"/>`;
      if (q.length >= 2) html += `<polyline class="ov-line" points="${pts(q)}"/>`;
      if (c && q.length >= 1) {
        const l = q[q.length - 1]!;
        html += `<line class="ov-preview" x1="${l.x}" y1="${l.y}" x2="${c.x}" y2="${c.y}"/>`;
        if (q.length >= 2) html += `<line class="ov-close" x1="${c.x}" y1="${c.y}" x2="${q[0]!.x}" y2="${q[0]!.y}"/>`;
      }
      q.forEach((p, i) => {
        const cls = i === 0 ? (v.length >= 3 ? 'ov-first ov-closable' : 'ov-first') : 'ov-v';
        html += `<circle data-vertex="${i}" class="${cls}" cx="${p.x}" cy="${p.y}" r="${i === 0 ? 8 : 5.5}"/>`;
      });
    }
    svg.innerHTML = html;
  }

  useEffect(() => {
    if (!mapLoaded) return;
    syncPlotLayers();
    filterContextBuildings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, state.polygon, state.roadEdges, state.drawing, state.stage, state.focusedEdge]);

  // ─── 3. Edge labels (HTML markers) ───
  useEffect(() => {
    const map = mapRef.current;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    if (!map || !mapLoaded || state.drawing.active || state.polygon.length < 3 || state.stage !== 'site') return;
    const poly = state.polygon;
    poly.forEach((p, i) => {
      const q = poly[(i + 1) % poly.length]!;
      const road = state.roadEdges.find((r) => r.edgeIndex === i);
      const el = document.createElement('button');
      el.className = `edge-label ${road ? 'edge-label--road' : ''}`;
      el.textContent = road ? `E${i + 1} · ${road.widthM} m road` : `E${i + 1}`;
      el.title = road ? 'Road frontage. Click to unmark' : 'Click to mark this edge as road frontage';
      el.setAttribute('data-testid', `edge-label-${i}`);
      el.addEventListener('click', (ev) => { ev.stopPropagation(); dispatch({ type: 'TOGGLE_ROAD_EDGE', edgeIndex: i }); });
      el.addEventListener('mouseenter', () => dispatch({ type: 'FOCUS_EDGE', edgeIndex: i }));
      el.addEventListener('mouseleave', () => dispatch({ type: 'FOCUS_EDGE', edgeIndex: null }));
      const marker = new maplibregl.Marker({ element: el }).setLngLat([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]).addTo(map);
      markersRef.current.push(marker);
    });
  }, [mapLoaded, state.polygon, state.roadEdges, state.drawing.active, state.stage, dispatch]);

  // ─── 4. Interaction ───
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const canvas = map.getCanvas();

    const updateTooltip = (pt: maplibregl.Point | null, text: string | null) => {
      const el = tooltipRef.current;
      if (!el) return;
      if (!pt || !text) { el.style.display = 'none'; return; }
      el.style.display = 'block';
      el.style.transform = `translate(${pt.x + 16}px, ${pt.y + 16}px)`;
      el.textContent = text;
    };

    const nearFirst = (pt: maplibregl.Point) => {
      const v = stateRef.current.drawing.vertices;
      if (v.length < 3) return false;
      const fp = map.project(v[0]!);
      return Math.hypot(fp.x - pt.x, fp.y - pt.y) < 14;
    };

    const onMove = (e: maplibregl.MapMouseEvent) => {
      const s = stateRef.current;
      const ll: LngLat = [e.lngLat.lng, e.lngLat.lat];
      if (s.drawing.active) {
        const v = s.drawing.vertices;
        const snapFirst = nearFirst(e.point);
        cursorRef.current = snapFirst ? v[0]! : ll;
        drawOverlay();
        canvas.style.cursor = snapFirst ? 'pointer' : 'crosshair';
        const last = v[v.length - 1];
        const seg = last ? metresBetween(last, cursorRef.current) : 0;
        const area = lngLatArea(snapFirst ? v : [...v, ll]);
        updateTooltip(e.point, v.length === 0 ? 'Click to place the first corner'
          : snapFirst ? `Click to close the plot · ${area.toFixed(0)} m²`
          : `${seg.toFixed(1)} m · click to add point${v.length >= 2 ? ` · area ${area.toFixed(0)} m²` : ''}`);
        return;
      }
      if (dragRef.current) {
        const d = dragRef.current;
        d.poly = d.poly.map((p, i) => (i === d.index ? ll : p)) as LngLatPolygon;
        const bad = segmentsCrossAny(d.poly);
        d.invalid = bad;
        drawOverlay();
        updateTooltip(e.point, bad ? 'Edges would cross. Release to cancel' : `${lngLatArea(d.poly).toFixed(0)} m²`);
        const now = performance.now();
        if (!bad && now - d.lastDispatch > 140) {
          d.lastDispatch = now;
          commitDrag(false);
        }
        return;
      }
      updateTooltip(null, null);
      if (s.stage === 'site' && s.polygon.length >= 3) {
        const hit = map.queryRenderedFeatures(e.point, { layers: ['vertices', 'edge-hit'] });
        canvas.style.cursor = hit.some((f) => f.layer.id === 'vertices') ? 'grab' : hit.length ? 'pointer' : '';
        const edge = hit.find((f) => f.layer.id === 'edge-hit');
        const idx = edge ? Number(edge.properties?.index) : null;
        if (idx !== s.focusedEdge) dispatch({ type: 'FOCUS_EDGE', edgeIndex: idx });
      } else if (s.stage === 'building' || s.stage === 'floor') {
        canvas.style.cursor = pickFloor(e.point) !== null ? 'pointer' : '';
      }
    };

    /** Commit a drag; tracks the dragged vertex if the reducer reverses winding */
    const commitDrag = (final: boolean) => {
      const d = dragRef.current;
      if (!d) return;
      const n = d.poly.length;
      const reversed = signedArea(d.poly as unknown as [number, number][]) < 0;
      dispatch({ type: 'MOVE_VERTEX', index: d.index, coord: d.poly[d.index]! });
      if (reversed && !final) {
        d.poly = [...d.poly].reverse() as LngLatPolygon;
        d.index = n - 1 - d.index;
      }
    };

    const onDown = (e: maplibregl.MapMouseEvent) => {
      const s = stateRef.current;
      if (s.drawing.active || s.stage !== 'site' || s.polygon.length < 3) return;
      const hit = map.queryRenderedFeatures(e.point, { layers: ['vertices'] });
      if (!hit.length) return;
      e.preventDefault();
      dragRef.current = { index: Number(hit[0]!.properties?.index), poly: [...s.polygon], lastDispatch: 0, invalid: false };
      map.dragPan.disable();
      canvas.style.cursor = 'grabbing';
    };

    const onUp = () => {
      const d = dragRef.current;
      if (!d) return;
      if (!segmentsCrossAny(d.poly)) commitDrag(true);
      dragRef.current = null;
      map.dragPan.enable();
      canvas.style.cursor = '';
      updateTooltip(null, null);
      syncPlotLayers();
    };

    const onClick = (e: maplibregl.MapMouseEvent) => {
      const s = stateRef.current;
      if (s.drawing.active) {
        if (nearFirst(e.point)) { dispatch({ type: 'FINISH_DRAWING' }); cursorRef.current = null; updateTooltip(null, null); return; }
        dispatch({ type: 'ADD_DRAFT_VERTEX', coord: [e.lngLat.lng, e.lngLat.lat] });
        return;
      }
      if (s.stage === 'site' && s.polygon.length >= 3) {
        const hit = map.queryRenderedFeatures(e.point, { layers: ['vertices', 'edge-hit'] });
        if (hit.some((f) => f.layer.id === 'vertices')) return;
        const edge = hit.find((f) => f.layer.id === 'edge-hit');
        if (edge) { dispatch({ type: 'TOGGLE_ROAD_EDGE', edgeIndex: Number(edge.properties?.index) }); return; }
      }
      if (s.stage !== 'site') {
        const f = pickFloor(e.point);
        if (f !== null) dispatch({ type: 'SET_SELECTED_FLOOR', floor: f });
      }
    };

    const onDbl = (e: maplibregl.MapMouseEvent) => {
      if (stateRef.current.drawing.active) { e.preventDefault(); dispatch({ type: 'FINISH_DRAWING' }); }
    };
    const onLeave = () => updateTooltip(null, null);

    map.on('mousemove', onMove);
    map.on('mousedown', onDown);
    map.on('mouseup', onUp);
    map.on('click', onClick);
    map.on('dblclick', onDbl);
    canvas.addEventListener('mouseleave', onLeave);
    return () => {
      map.off('mousemove', onMove);
      map.off('mousedown', onDown);
      map.off('mouseup', onUp);
      map.off('click', onClick);
      map.off('dblclick', onDbl);
      canvas.removeEventListener('mouseleave', onLeave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, dispatch]);

  // Drawing mode: keyboard shortcuts, double-click zoom off, crosshair
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    if (state.drawing.active) {
      map.doubleClickZoom.disable();
      map.getCanvas().style.cursor = 'crosshair';
    } else {
      map.doubleClickZoom.enable();
      map.getCanvas().style.cursor = '';
      cursorRef.current = null;
      if (tooltipRef.current) tooltipRef.current.style.display = 'none';
    }
    drawOverlay();
    const onKey = (e: KeyboardEvent) => {
      if (!stateRef.current.drawing.active) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') dispatch({ type: 'CANCEL_DRAWING' });
      else if (e.key === 'Enter') dispatch({ type: 'FINISH_DRAWING' });
      else if (e.key === 'Backspace' || (e.key === 'z' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); dispatch({ type: 'UNDO_DRAFT_VERTEX' }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, state.drawing.active, state.drawing.vertices, dispatch]);

  function pickFloor(pt: { x: number; y: number }): number | null {
    const t = three.current;
    const map = mapRef.current;
    if (!t || !map || !t.pickables.length) return null;
    const rect = map.getCanvas().getBoundingClientRect();
    const x = (pt.x / rect.width) * 2 - 1;
    const y = -(pt.y / rect.height) * 2 + 1;
    // The camera's projection matrix is MapLibre's full MVP (camera world matrix = identity), so
    // Raycaster.setFromCamera (Perspective/Orthographic only) cannot be used: unproject manually.
    const inv = t.camera.projectionMatrixInverse;
    const near = new THREE.Vector3(x, y, -1).applyMatrix4(inv);
    const far = new THREE.Vector3(x, y, 1).applyMatrix4(inv);
    const ray = new THREE.Raycaster(near, far.sub(near).normalize());
    const hits = ray.intersectObjects(t.pickables, false);
    const idx = hits[0]?.object.userData.floorIndex;
    return typeof idx === 'number' ? idx : null;
  }

  // ─── 5. Three.js content ───
  function rebuildScene() {
    const t = three.current;
    if (!t) return;
    const s = stateRef.current;
    if (t.content) { t.scene.remove(t.content); disposeGroup(t.content); t.content = null; t.pickables = []; }
    const r = s.result;
    if (!r || !r.valid || s.drawing.active || s.polygon.length < 3) { mapRef.current?.triggerRepaint(); return; }
    anchorRef.current = r.anchor;
    const design = s.activeDesign === 'b' ? r.designB : r.designA;
    const focusId = s.hoveredCheck ?? s.focusedCheck;
    const check = focusId ? design?.checks.find((c) => c.id === focusId) : undefined;
    const built = buildScene(r, {
      design,
      variant: s.activeDesign,
      selectedFloor: s.stage === 'floor' || s.stage === 'building' ? s.selectedFloor : null,
      sectionCutaway: s.sectionCutaway && s.stage === 'floor',
      floorMode: s.stage === 'floor',
      guides: s.stage === 'site' ? { ...s.guides, envelope: false } : s.guides,
      focus: check ? { geometry: check.geometry, edges: check.edges } : null,
      focusedEdge: s.focusedEdge,
    });
    t.content = built.group;
    t.pickables = built.pickables;
    t.scene.add(built.group);
    mapRef.current?.triggerRepaint();
  }

  useEffect(() => {
    if (mapLoaded) rebuildScene();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, state.result, state.activeDesign, state.selectedFloor, state.sectionCutaway, state.guides,
    state.hoveredCheck, state.focusedCheck, state.focusedEdge, state.stage, state.drawing.active]);

  // ─── 6. Context buildings inside the plot are hidden; OSM road advisory ───
  function filterContextBuildings() {
    const map = mapRef.current;
    if (!map || !map.getLayer('building-3d')) return;
    const poly = stateRef.current.polygon;
    const apply = (ids: (string | number)[]) => {
      const key = ids.map(String).sort().join(',');
      if (key === filterKeyRef.current) return;
      filterKeyRef.current = key;
      map.setFilter('building-3d', ids.length ? ['!', ['in', ['id'], ['literal', ids]]] : null);
    };
    if (poly.length < 3 || stateRef.current.drawing.active) { apply([]); return; }
    try {
      const ids: (string | number)[] = [];
      // querySourceFeatures (not queryRenderedFeatures): hidden buildings must stay discoverable,
      // otherwise filtering hides them → next query misses them → filter cleared → loop.
      const layer = map.getLayer('building-3d') as unknown as { source: string; sourceLayer?: string };
      for (const f of map.querySourceFeatures(layer.source, { sourceLayer: layer.sourceLayer ?? 'building' })) {
        if (f.id === undefined) continue;
        const g = f.geometry;
        const rings = g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat(1) : [];
        const overlaps = rings.some((ring) => ring.some((pt) => pointInPolygon(pt, poly)))
          || poly.some((pt) => rings.some((ring) => pointInPolygon(pt, ring)));
        if (overlaps) ids.push(f.id);
      }
      apply(ids);
    } catch (err) { console.debug('building filter', err); }
  }

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        filterContextBuildings();
        const adv = detectRoadConflicts(map, stateRef.current.polygon);
        const key = JSON.stringify(adv);
        if (key !== advisoryKeyRef.current) {
          advisoryKeyRef.current = key;
          dispatch({ type: 'SET_ROAD_ADVISORY', advisory: adv });
        }
      }, 250);
    };
    advisoryKeyRef.current = ' '; // plot changed: always publish the next advisory result
    map.on('idle', run);
    run();
    return () => { map.off('idle', run); if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, state.polygon]);

  // ─── 7. Camera ───
  useEffect(() => {
    const map = mapRef.current;
    const cmd = state.cameraCommand;
    if (!map || !mapLoaded || !cmd) return;
    const poly = state.polygon;
    if (cmd.kind === 'reset' && poly.length >= 3) {
      const b = new maplibregl.LngLatBounds();
      poly.forEach((p) => b.extend(p));
      map.fitBounds(b, { padding: { top: 120, bottom: 120, left: 80, right: 420 }, pitch: STAGE_PITCH[state.stage], bearing: -25, duration: 900, maxZoom: 18.2 });
    } else if (cmd.kind === 'rotate-left') map.easeTo({ bearing: map.getBearing() - 45, duration: 500 });
    else if (cmd.kind === 'rotate-right') map.easeTo({ bearing: map.getBearing() + 45, duration: 500 });
    else if (cmd.kind === 'top') map.easeTo({ pitch: 0, duration: 500 });
    else if (cmd.kind === 'perspective') map.easeTo({ pitch: 62, duration: 500 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.cameraCommand, mapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    map.easeTo({ pitch: STAGE_PITCH[state.stage], duration: 700 });
  }, [state.stage, mapLoaded]);

  return (
    <>
      <div ref={containerRef} data-testid="map-container" className="absolute inset-0 w-full h-full" />
      <svg ref={overlayRef} data-testid="draw-overlay" className="draw-overlay" />
      <div ref={tooltipRef} data-testid="draw-tooltip" className="map-tooltip" style={{ display: 'none' }} />
      {(usingFallback || mapError) && (
        <div className="fixed bottom-24 left-5 z-40 max-w-sm rounded-lg border border-amber-500/40 bg-amber-950/80 px-3 py-2 text-[11px] text-amber-200">
          {usingFallback ? 'Vector tiles were unavailable, so a raster basemap is shown without 3D context buildings.' : mapError}
        </div>
      )}
    </>
  );
}

function segmentsCrossAny(poly: LngLatPolygon): boolean {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsIntersect(poly[i]!, poly[(i + 1) % n]!, poly[j]!, poly[(j + 1) % n]!)) return true;
    }
  }
  return false;
}

// ── OSM road conflicts ──
// OpenStreetMap lines are navigation centrelines, not legal road boundaries. Two advisory levels:
//  • centreline_intersection: a mapped centreline crosses or lies inside the plot
//  • corridor_overlap: the plot comes within an *estimated* half-width (by road class) of a centreline
const HALF_WIDTH_BY_CLASS: Record<string, number> = {
  motorway: 15, trunk: 12, primary: 10, secondary: 8, tertiary: 6, minor: 4, service: 3, track: 2, path: 1.5,
};

function detectRoadConflicts(map: maplibregl.Map, poly: LngLatPolygon): RoadAdvisory[] {
  if (poly.length < 3) return [];
  let feats: maplibregl.MapGeoJSONFeature[] = [];
  try {
    const layers = (map.getStyle().layers ?? [])
      .filter((l) => l.type === 'line' && (l as { 'source-layer'?: string })['source-layer'] === 'transportation')
      .map((l) => l.id);
    if (!layers.length) return [];
    feats = map.queryRenderedFeatures({ layers });
  } catch { return []; }
  const anchor = anchorAtCentroid(poly);
  const plotM = polygonToMetric(anchor, poly);
  const out = new Map<string, RoadAdvisory>();
  for (const f of feats) {
    const cls = String(f.properties?.class ?? 'minor');
    if (cls === 'path' || cls === 'track' || f.properties?.brunnel === 'tunnel') continue;
    const g = f.geometry;
    const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
    const name = String(f.properties?.name ?? f.properties?.['name:en'] ?? f.properties?.name_en ?? `Unnamed ${cls} road`);
    const half = HALF_WIDTH_BY_CLASS[cls] ?? 4;
    for (const line of lines) {
      const lm = polygonToMetric(anchor, line as LngLat[]);
      let crosses = false;
      let minD = Infinity;
      for (let i = 0; i < lm.length - 1 && !crosses; i++) {
        const a = lm[i]!, b = lm[i + 1]!;
        if (pointInPolygon(a, plotM)) { crosses = true; break; }
        for (let j = 0; j < plotM.length; j++) {
          const p = plotM[j]!, q = plotM[(j + 1) % plotM.length]!;
          if (segmentsIntersect(a, b, p, q)) { crosses = true; break; }
          minD = Math.min(minD, segDist(a, b, p, q));
        }
      }
      const key = `${name}|${crosses ? 'x' : 'c'}`;
      if (crosses && !out.has(key)) {
        out.set(key, { type: 'centerline_intersection', roadName: name, roadClass: cls, description: `The mapped centreline of ${name} (${cls}) crosses or lies inside the drawn plot. A public road cannot be part of a private plot; redraw the boundary or check the title deed.` });
      } else if (!crosses && minD < half && !out.has(key) && !out.has(`${name}|x`)) {
        out.set(key, { type: 'corridor_overlap', roadName: name, roadClass: cls, estimatedHalfWidthM: half, description: `The plot comes within ${minD.toFixed(1)} m of the ${name} centreline. That is inside its estimated ${half} m half-width for a ${cls} road, so the boundary may overlap the road reserve.` });
      }
    }
  }
  return [...out.values()].slice(0, 4);
}

function segDist(a: [number, number], b: [number, number], c: [number, number], d: [number, number]): number {
  const pd = (p: [number, number], s: [number, number], e: [number, number]) => {
    const dx = e[0] - s[0], dy = e[1] - s[1];
    const l2 = dx * dx + dy * dy || 1e-12;
    const t = Math.max(0, Math.min(1, ((p[0] - s[0]) * dx + (p[1] - s[1]) * dy) / l2));
    return Math.hypot(p[0] - s[0] - t * dx, p[1] - s[1] - t * dy);
  };
  return Math.min(pd(a, c, d), pd(b, c, d), pd(c, a, b), pd(d, a, b));
}
