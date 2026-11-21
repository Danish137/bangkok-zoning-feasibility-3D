// ─── MapContainer: MapLibre + Three.js Shared WebGL ───
import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import * as THREE from 'three';
import { useAppState, useAppDispatch } from '../state';
import { anchorAtCentroid, polygonToMetric, toLngLat } from '../engine/geo';
import { ensureCCW, polygonArea, edgeInwardNormal, edgeLength } from '../engine/polygon';
import type { LngLat, LngLatPolygon, Polygon, RoadAdvisory } from '../engine/types';
import { ZONE_YOR9, ZONE_YOR9_BOUNDARY } from '../engine/types';

// High-reliability Vector & Raster Tile Styles
const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

const FALLBACK_DARK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  name: 'Bangkok Dark Studio',
  sources: {
    'carto-dark': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap, &copy; CARTO',
    },
  },
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#0b0f19' },
    },
    {
      id: 'carto-dark-layer',
      type: 'raster',
      source: 'carto-dark',
      paint: { 'raster-opacity': 0.85, 'raster-brightness-max': 0.9 },
    },
  ],
};

const CAMERA_PRESETS = {
  site: { pitch: 50, bearing: -25, zoom: 17.2 },
  building: { pitch: 60, bearing: -40, zoom: 17.5 },
  floor: { pitch: 52, bearing: -30, zoom: 18.0 },
  compliance: { pitch: 60, bearing: -42, zoom: 17.5 },
  report: { pitch: 35, bearing: 0, zoom: 16.8 },
};

export function MapContainer() {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  const threeRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.Camera;
    buildingMeshes: THREE.Mesh[];
  } | null>(null);

  const drawingRef = useRef<LngLatPolygon>([]);
  const draggingVertexRef = useRef<number | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const state = useAppState();
  const dispatch = useAppDispatch();
  const stateRef = useRef(state);
  stateRef.current = state;

  // ─── 1. Map Initialization ───
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialCenter = state.polygon.length >= 3
      ? anchorAtCentroid(state.polygon)
      : { lngDeg: ZONE_YOR9.center[0], latDeg: ZONE_YOR9.center[1] };

    let currentStyle: any = OPENFREEMAP_STYLE;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: currentStyle,
      center: [initialCenter.lngDeg, initialCenter.latDeg],
      zoom: 17.2,
      pitch: 50,
      bearing: -25,
      maxPitch: 75,
    } as maplibregl.MapOptions);

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');

    (window as any).__map__ = map;

    map.on('error', (e) => {
      if (e?.error?.message?.includes('style') || e?.error?.message?.includes('tiles')) {
        console.warn('Switching to dark fallback style:', e.error);
        if (currentStyle !== FALLBACK_DARK_STYLE) {
          currentStyle = FALLBACK_DARK_STYLE;
          map.setStyle(FALLBACK_DARK_STYLE);
        }
      }
    });

    map.on('load', () => {
      // 3D Building Extrusions from OpenMapTiles
      try {
        const layers = map.getStyle().layers;
        const labelLayer = layers?.find(
          (l) => l.type === 'symbol' && l.layout?.['text-field']
        );

        if (!map.getLayer('3d-buildings') && map.getSource('openmaptiles')) {
          map.addLayer(
            {
              id: '3d-buildings',
              source: 'openmaptiles',
              'source-layer': 'building',
              type: 'fill-extrusion',
              minzoom: 14,
              paint: {
                'fill-extrusion-color': '#1e293b',
                'fill-extrusion-height': [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  14,
                  0,
                  14.05,
                  ['case', ['has', 'height'], ['get', 'height'], ['has', 'render_height'], ['get', 'render_height'], 15],
                ],
                'fill-extrusion-base': [
                  'case',
                  ['has', 'min_height'],
                  ['get', 'min_height'],
                  ['has', 'render_min_height'],
                  ['get', 'render_min_height'],
                  0,
                ],
                'fill-extrusion-opacity': 0.45,
              },
            },
            labelLayer?.id
          );
        }
      } catch (err) {
        console.debug('3D building extrusion setup:', err);
      }

      // Add Zone Yor.9 Official Boundary Layer (Bangkok Comprehensive Plan B.E. 2556)
      try {
        const closedBoundary = [...ZONE_YOR9_BOUNDARY, ZONE_YOR9_BOUNDARY[0]!];
        map.addSource('yor9-boundary-source', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: { name: 'Zone Yor.9 (High-Density Residential, Brown Zone)' },
            geometry: {
              type: 'Polygon',
              coordinates: [closedBoundary],
            },
          },
        });

        map.addLayer({
          id: 'yor9-boundary-fill',
          type: 'fill',
          source: 'yor9-boundary-source',
          paint: {
            'fill-color': '#d97706',
            'fill-opacity': 0.05,
          },
        });

        map.addLayer({
          id: 'yor9-boundary-line',
          type: 'line',
          source: 'yor9-boundary-source',
          paint: {
            'line-color': '#d97706',
            'line-width': 2,
            'line-dasharray': [3, 2],
            'line-opacity': 0.75,
          },
        });
      } catch (err) {
        console.debug('Yor.9 boundary layer setup:', err);
      }

      // Shared WebGL2 Custom Layer for Three.js
      const customLayer: maplibregl.CustomLayerInterface = {
        id: 'three-layer',
        type: 'custom',
        renderingMode: '3d',
        onAdd(mapInstance, gl) {
          const renderer = new THREE.WebGLRenderer({
            canvas: mapInstance.getCanvas(),
            context: gl,
            antialias: true,
          });
          renderer.autoClear = false;

          const scene = new THREE.Scene();
          const camera = new THREE.Camera();

          // Lighting
          const ambient = new THREE.AmbientLight(0xffffff, 0.9);
          scene.add(ambient);

          const hemi = new THREE.HemisphereLight(0xe0e7ff, 0x1e293b, 0.7);
          scene.add(hemi);

          const sun = new THREE.DirectionalLight(0xfffbeb, 1.5);
          sun.position.set(120, 160, 220);
          scene.add(sun);

          const fill = new THREE.DirectionalLight(0x38bdf8, 0.5);
          fill.position.set(-120, -140, 90);
          scene.add(fill);

          threeRef.current = { renderer, scene, camera, buildingMeshes: [] };
        },
        render(gl, options) {
          if (!threeRef.current) return;
          const { renderer, scene, camera } = threeRef.current;
          const currentState = stateRef.current;

          if (currentState.polygon.length < 3) return;

          let rawMatrix: any = null;
          if ((options as any)?.defaultProjectionData?.mainMatrix) {
            const m = (options as any).defaultProjectionData.mainMatrix;
            rawMatrix = (Array.isArray(m) || ArrayBuffer.isView(m)) ? m : Array.from({ length: 16 }, (_, i) => m[i]);
          } else if (Array.isArray(options) || ArrayBuffer.isView(options)) {
            rawMatrix = options;
          } else if ((options as any)?.modelViewProjectionMatrix) {
            rawMatrix = (options as any).modelViewProjectionMatrix;
          }

          if (!rawMatrix || rawMatrix.length < 16) return;

          const anchor = anchorAtCentroid(currentState.polygon);
          const centerMerc = maplibregl.MercatorCoordinate.fromLngLat(
            { lng: anchor.lngDeg, lat: anchor.latDeg },
            0
          );
          const meterScale = centerMerc.meterInMercatorCoordinateUnits();

          // Matrix transform: meters in local space -> Mercator
          // Y is inverted in Mercator (South is positive)
          const localToMercator = new THREE.Matrix4()
            .makeTranslation(centerMerc.x, centerMerc.y, centerMerc.z)
            .scale(new THREE.Vector3(meterScale, -meterScale, meterScale));

          const mercatorToClip = new THREE.Matrix4().fromArray(rawMatrix);
          camera.projectionMatrix = mercatorToClip.multiply(localToMercator);

          // Disable frustum culling on all custom objects so MapLibre projection doesn't discard them
          scene.traverse((obj) => {
            obj.frustumCulled = false;
          });

          renderer.resetState();
          renderer.render(scene, camera);
        },
      };

      map.addLayer(customLayer);

      // Initialize sources with initial polygon data
      const initPoly = stateRef.current.polygon;
      const closedInit = initPoly.length >= 3 ? [...initPoly, initPoly[0]!] : [];

      map.addSource('plot-polygon', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: closedInit.length ? [closedInit] : [[]] },
          properties: {},
        },
      });

      map.addLayer({
        id: 'plot-fill',
        type: 'fill',
        source: 'plot-polygon',
        paint: {
          'fill-color': '#6366f1',
          'fill-opacity': 0.25,
        },
      });

      map.addLayer({
        id: 'plot-outline',
        type: 'line',
        source: 'plot-polygon',
        paint: {
          'line-color': '#a5b4fc',
          'line-width': 3,
        },
      });

      // Road edges source & layer
      const initRoadFeatures = initPoly.length >= 3
        ? stateRef.current.roadEdges.map((edgeIdx) => {
            const p1 = initPoly[edgeIdx];
            const p2 = initPoly[(edgeIdx + 1) % initPoly.length];
            if (!p1 || !p2) return null;
            return {
              type: 'Feature' as const,
              geometry: { type: 'LineString' as const, coordinates: [p1, p2] },
              properties: { edgeIndex: edgeIdx },
            };
          }).filter(Boolean)
        : [];

      map.addSource('road-edges', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: initRoadFeatures as any[] },
      });

      map.addLayer({
        id: 'road-edges-line',
        type: 'line',
        source: 'road-edges',
        paint: {
          'line-color': '#f59e0b',
          'line-width': 6,
        },
      });

      // Vertices source & layer (for interactive dragging)
      const initVertices = initPoly.map((p, i) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: p },
        properties: { index: i },
      }));

      map.addSource('plot-vertices', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: initVertices },
      });

      map.addLayer({
        id: 'plot-vertices-circle',
        type: 'circle',
        source: 'plot-vertices',
        paint: {
          'circle-radius': 8,
          'circle-color': '#ffffff',
          'circle-stroke-color': '#6366f1',
          'circle-stroke-width': 3,
        },
      });

      // Drawing line preview source
      map.addSource('drawing-line', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} },
      });

      map.addLayer({
        id: 'drawing-line',
        type: 'line',
        source: 'drawing-line',
        paint: {
          'line-color': '#38bdf8',
          'line-width': 2.5,
          'line-dasharray': [3, 2],
        },
      });

      const filterOverlappingBuildings = () => {
        try {
          if (!map.getLayer('building-3d')) return;
          const poly = stateRef.current.polygon;
          if (poly.length < 3) return;

          const features = map.queryRenderedFeatures(undefined, { layers: ['building-3d'] });
          const bbox = poly.reduce(
            (acc, [lng, lat]) => ({
              minLng: Math.min(acc.minLng, lng),
              maxLng: Math.max(acc.maxLng, lng),
              minLat: Math.min(acc.minLat, lat),
              maxLat: Math.max(acc.maxLat, lat),
            }),
            { minLng: Infinity, maxLng: -Infinity, minLat: Infinity, maxLat: -Infinity }
          );

          const overlappingIds: (string | number)[] = [];
          features.forEach((f) => {
            if (!f.geometry || f.id === undefined) return;
            const geom = f.geometry as any;
            let inside = false;
            if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
              const rings = geom.type === 'Polygon' ? geom.coordinates : geom.coordinates.flat(1);
              for (const ring of rings) {
                for (const pt of ring) {
                  const lng = pt[0];
                  const lat = pt[1];
                  if (
                    lng >= bbox.minLng - 0.0001 &&
                    lng <= bbox.maxLng + 0.0001 &&
                    lat >= bbox.minLat - 0.0001 &&
                    lat <= bbox.maxLat + 0.0001
                  ) {
                    inside = true;
                    break;
                  }
                }
                if (inside) break;
              }
            }
            if (inside && f.id !== undefined) {
              overlappingIds.push(f.id);
            }
          });

          if (overlappingIds.length > 0) {
            map.setFilter('building-3d', ['!in', ['id'], ['literal', overlappingIds]] as any);
          }
        } catch (err) {
          console.debug('OSM building filter:', err);
        }
      };

      map.on('idle', filterOverlappingBuildings);
      setMapLoaded(true);

      // Jump directly to plot centroid
      if (stateRef.current.polygon.length >= 3) {
        const anchor = anchorAtCentroid(stateRef.current.polygon);
        map.jumpTo({
          center: [anchor.lngDeg, anchor.latDeg],
          zoom: 17.5,
          pitch: 52,
          bearing: -32,
        });
      }
    });

    // ─── Interaction Handlers ───
    map.on('mousedown', 'plot-vertices-circle', (e) => {
      e.preventDefault();
      const features = map.queryRenderedFeatures(e.point, { layers: ['plot-vertices-circle'] });
      if (features.length > 0) {
        const idx = features[0]?.properties?.index;
        if (typeof idx === 'number') {
          draggingVertexRef.current = idx;
          map.getCanvas().style.cursor = 'grabbing';
          map.dragPan.disable();
        }
      }
    });

    map.on('mousemove', (e) => {
      if (draggingVertexRef.current !== null) {
        const idx = draggingVertexRef.current;
        const newCoords: LngLat = [e.lngLat.lng, e.lngLat.lat];
        dispatch({ type: 'UPDATE_VERTEX', index: idx, coord: newCoords });
        return;
      }

      if (map.getLayer('plot-vertices-circle')) {
        const features = map.queryRenderedFeatures(e.point, { layers: ['plot-vertices-circle', 'plot-outline'] });
        map.getCanvas().style.cursor = features.length > 0 ? 'pointer' : '';
      }
    });

    map.on('mouseup', () => {
      if (draggingVertexRef.current !== null) {
        draggingVertexRef.current = null;
        map.getCanvas().style.cursor = '';
        map.dragPan.enable();
      }
    });

    map.on('click', (e) => {
      if (draggingVertexRef.current !== null) return;

      const currentState = stateRef.current;
      const clickedLngLat: LngLat = [e.lngLat.lng, e.lngLat.lat];

      // 1. Drawing mode
      if (currentState.isDrawing || isDrawing || currentState.polygon.length < 3) {
        if (drawingRef.current.length >= 3) {
          const first = drawingRef.current[0]!;
          const firstPixel = map.project(new maplibregl.LngLat(first[0], first[1]));
          const dist = Math.hypot(firstPixel.x - e.point.x, firstPixel.y - e.point.y);
          if (dist < 30) {
            const finalPoly = [...drawingRef.current];
            drawingRef.current = [];
            setIsDrawing(false);
            dispatch({ type: 'FINISH_DRAWING', polygon: finalPoly });

            // Center camera on newly drawn plot
            const anchor = anchorAtCentroid(finalPoly);
            map.flyTo({
              center: [anchor.lngDeg, anchor.latDeg],
              zoom: 17.5,
              pitch: 52,
              bearing: -28,
              duration: 900,
            });
            return;
          }
        }
        drawingRef.current.push(clickedLngLat);
        setIsDrawing(true);
        (map.getSource('drawing-line') as maplibregl.GeoJSONSource)?.setData({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: drawingRef.current },
          properties: {},
        });
        return;
      }

      // 2. 3D Floor Slab Raycasting
      if (threeRef.current && threeRef.current.buildingMeshes.length > 0) {
        const canvas = map.getCanvas();
        const rect = canvas.getBoundingClientRect();
        const ndcX = (e.point.x / rect.width) * 2 - 1;
        const ndcY = -(e.point.y / rect.height) * 2 + 1;

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), threeRef.current.camera);

        const intersects = raycaster.intersectObjects(threeRef.current.buildingMeshes, false);
        if (intersects.length > 0) {
          const hit = intersects[0]!;
          const floorIdx = hit.object.userData.floorIndex;
          if (typeof floorIdx === 'number') {
            dispatch({ type: 'SET_SELECTED_FLOOR', floor: floorIdx });
            return;
          }
        }
      }

      // 3. Edge click check: toggle road frontage on closest edge
      if (currentState.stage === 'site' && currentState.polygon.length >= 3) {
        const poly = currentState.polygon;
        const n = poly.length;
        let closestEdge = -1;
        let minPixelDist = Infinity;

        for (let i = 0; i < n; i++) {
          const p1 = poly[i]!;
          const p2 = poly[(i + 1) % n]!;
          const pix1 = map.project(new maplibregl.LngLat(p1[0], p1[1]));
          const pix2 = map.project(new maplibregl.LngLat(p2[0], p2[1]));

          const dist = distanceToSegment(e.point, pix1, pix2);
          if (dist < minPixelDist) {
            minPixelDist = dist;
            closestEdge = i;
          }
        }

        if (minPixelDist < 20 && closestEdge !== -1) {
          dispatch({ type: 'TOGGLE_ROAD_EDGE', edgeIndex: closestEdge });
          return;
        }
      }
    });

    mapRef.current = map;

    return () => {
      if (threeRef.current) {
        threeRef.current.scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose();
            if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
            else if (obj.material) obj.material.dispose();
          }
        });
      }
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ─── 2. Update Map 2D Layers (Plot, Vertices, Roads) ───
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !map.isStyleLoaded()) return;

    if (state.isDrawing) {
      drawingRef.current = [];
      setIsDrawing(true);
      (map.getSource('drawing-line') as maplibregl.GeoJSONSource)?.setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [] },
        properties: {},
      });
      (map.getSource('plot-polygon') as maplibregl.GeoJSONSource)?.setData({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[]] },
        properties: {},
      });
      (map.getSource('plot-vertices') as maplibregl.GeoJSONSource)?.setData({
        type: 'FeatureCollection',
        features: [],
      });
      (map.getSource('road-edges') as maplibregl.GeoJSONSource)?.setData({
        type: 'FeatureCollection',
        features: [],
      });
      map.triggerRepaint();
      return;
    }

    const poly = state.polygon;
    if (poly.length < 3) {
      (map.getSource('plot-polygon') as maplibregl.GeoJSONSource)?.setData({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[]] },
        properties: {},
      });
      (map.getSource('plot-vertices') as maplibregl.GeoJSONSource)?.setData({
        type: 'FeatureCollection',
        features: [],
      });
      (map.getSource('road-edges') as maplibregl.GeoJSONSource)?.setData({
        type: 'FeatureCollection',
        features: [],
      });
      map.triggerRepaint();
      return;
    }

    if (poly.length >= 3) {
      const closedCoords = [...poly, poly[0]!];
      (map.getSource('plot-polygon') as maplibregl.GeoJSONSource)?.setData({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [closedCoords] },
        properties: {},
      });

      (map.getSource('plot-vertices') as maplibregl.GeoJSONSource)?.setData({
        type: 'FeatureCollection',
        features: poly.map((p, i) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: p },
          properties: { index: i },
        })),
      });

      const roadFeatures = state.roadEdges.map((edgeIdx) => {
        const p1 = poly[edgeIdx];
        const p2 = poly[(edgeIdx + 1) % poly.length];
        if (!p1 || !p2) return null;
        return {
          type: 'Feature' as const,
          geometry: { type: 'LineString' as const, coordinates: [p1, p2] },
          properties: { edgeIndex: edgeIdx },
        };
      }).filter(Boolean);

      (map.getSource('road-edges') as maplibregl.GeoJSONSource)?.setData({
        type: 'FeatureCollection',
        features: roadFeatures as any[],
      });

      (map.getSource('drawing-line') as maplibregl.GeoJSONSource)?.setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [] },
        properties: {},
      });

      // Filter overlapping OSM 3D buildings inside plot polygon to prevent Z-fighting
      try {
        if (map.getLayer('building-3d')) {
          const features = map.queryRenderedFeatures(undefined, { layers: ['building-3d'] });
          const bbox = poly.reduce(
            (acc, [lng, lat]) => ({
              minLng: Math.min(acc.minLng, lng),
              maxLng: Math.max(acc.maxLng, lng),
              minLat: Math.min(acc.minLat, lat),
              maxLat: Math.max(acc.maxLat, lat),
            }),
            { minLng: Infinity, maxLng: -Infinity, minLat: Infinity, maxLat: -Infinity }
          );

          const overlappingIds: (string | number)[] = [];
          features.forEach((f) => {
            if (!f.geometry || f.id === undefined) return;
            const geom = f.geometry as any;
            let inside = false;
            if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
              const rings = geom.type === 'Polygon' ? geom.coordinates : geom.coordinates.flat(1);
              for (const ring of rings) {
                for (const pt of ring) {
                  const lng = pt[0];
                  const lat = pt[1];
                  if (
                    lng >= bbox.minLng - 0.0001 &&
                    lng <= bbox.maxLng + 0.0001 &&
                    lat >= bbox.minLat - 0.0001 &&
                    lat <= bbox.maxLat + 0.0001
                  ) {
                    inside = true;
                    break;
                  }
                }
                if (inside) break;
              }
            }
            if (inside && f.id !== undefined) {
              overlappingIds.push(f.id);
            }
          });

          if (overlappingIds.length > 0) {
            map.setFilter('building-3d', ['!in', ['id'], ['literal', overlappingIds]] as any);
          }
        }
      } catch (err) {
        console.debug('OSM building filter:', err);
      }

      // Check for road right-of-way intersections
      try {
        const roadLayers = (map.getStyle().layers || [])
          .filter((l) => l.id.includes('road') || l.id.includes('highway') || l.id.includes('tunnel'))
          .map((l) => l.id);

        const roadFeatures = map.queryRenderedFeatures(undefined, { layers: roadLayers });
        let encroachingRoad: string | null = null;
        let count = 0;

        for (const rf of roadFeatures) {
          if (!rf.geometry) continue;
          const geom = rf.geometry as any;
          const lines = geom.type === 'LineString' ? [geom.coordinates] : (geom.type === 'MultiLineString' ? geom.coordinates : []);
          for (const line of lines) {
            for (let i = 0; i < line.length - 1; i++) {
              const r1 = line[i] as [number, number];
              const r2 = line[i + 1] as [number, number];
              for (let j = 0; j < poly.length; j++) {
                const p1 = poly[j]!;
                const p2 = poly[(j + 1) % poly.length]!;
                if (segmentsCross(r1, r2, p1, p2)) {
                  count++;
                  const name = rf.properties?.name || rf.properties?.name_en;
                  if (name) encroachingRoad = name;
                  break;
                }
              }
              if (encroachingRoad) break;
            }
            if (encroachingRoad) break;
          }
          if (encroachingRoad) break;
        }

        if (count > 0) {
          const street = encroachingRoad || 'Mapped Street';
          const advisory: RoadAdvisory = {
            type: 'centerline_intersection',
            roadName: street,
            count,
            description: `Drawn plot boundary directly crosses the mapped street centerline of ${street}. A public roadway alignment must not bisect or encroach on private deed parcels.`,
            legalReference: 'MR 55 Clause 40 (prohibits structures or parts of buildings from protruding into or over public roads/spaces) & Clause 41 (regulates statutory setbacks from road boundaries).',
            cadastralDisclaimer: 'Note: OpenStreetMap road geometry represents indicative urban navigation centerlines, not certified cadastral parcel surveys (Chanote) from the Department of Lands.',
          };
          dispatch({
            type: 'SET_ROAD_ENCROACHMENT',
            encroachment: advisory,
          });
        } else if (stateRef.current.roadEncroachment !== null) {
          dispatch({ type: 'SET_ROAD_ENCROACHMENT', encroachment: null });
        }
      } catch (err) {
        console.debug('Road encroachment check:', err);
      }
    }

    map.triggerRepaint();
  }, [mapLoaded, state.polygon, state.roadEdges, state.isDrawing]);

  // ─── 3. Update Three.js 3D Massing & Regulatory Guides ───
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !threeRef.current) return;

    const { scene } = threeRef.current;

    const toRemove: THREE.Object3D[] = [];
    scene.traverse((obj) => {
      if (obj.userData.isCustom) toRemove.push(obj);
    });
    toRemove.forEach((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else if (obj.material) obj.material.dispose();
      }
      scene.remove(obj);
    });

    threeRef.current.buildingMeshes = [];

    if (state.polygon.length < 3) {
      map.triggerRepaint();
      return;
    }

    const anchor = anchorAtCentroid(state.polygon);
    const metricPlot = polygonToMetric(anchor, state.polygon);
    const ccwPlot = ensureCCW(metricPlot);

    // ── 1. Clean Ground Site Pad ──
    const sitePadShape = new THREE.Shape();
    ccwPlot.forEach((pt, j) => {
      if (j === 0) sitePadShape.moveTo(pt[0], pt[1]);
      else sitePadShape.lineTo(pt[0], pt[1]);
    });
    sitePadShape.closePath();

    const sitePadGeo = new THREE.ShapeGeometry(sitePadShape);
    const sitePadMat = new THREE.MeshBasicMaterial({
      color: 0x0f172a,
      side: THREE.DoubleSide,
      depthWrite: true,
    });
    const sitePadMesh = new THREE.Mesh(sitePadGeo, sitePadMat);
    sitePadMesh.position.set(0, 0, 0.05);
    sitePadMesh.userData = { isCustom: true };
    scene.add(sitePadMesh);

    // Site boundary outline
    const siteEdgeGeo = new THREE.EdgesGeometry(sitePadGeo);
    const siteEdgeMat = new THREE.LineBasicMaterial({ color: 0x818cf8, linewidth: 2 });
    const siteEdgeLine = new THREE.LineSegments(siteEdgeGeo, siteEdgeMat);
    siteEdgeLine.position.set(0, 0, 0.08);
    siteEdgeLine.userData = { isCustom: true };
    scene.add(siteEdgeLine);

    // ── 2. Road Frontage 3D Edge Articulation ──
    state.roadEdges.forEach((edgeIdx) => {
      const p1 = ccwPlot[edgeIdx];
      const p2 = ccwPlot[(edgeIdx + 1) % ccwPlot.length];
      if (!p1 || !p2) return;

      const roadEdgeGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(p1[0], p1[1], 0.12),
        new THREE.Vector3(p2[0], p2[1], 0.12),
      ]);
      const roadEdgeMat = new THREE.LineBasicMaterial({
        color: 0xf59e0b,
        linewidth: 4,
      });
      const roadEdgeLine = new THREE.Line(roadEdgeGeo, roadEdgeMat);
      roadEdgeLine.userData = { isCustom: true };
      scene.add(roadEdgeLine);
    });

    // ── 3. OSR Open Space Footprint (Landscaped Green Zone) ──
    if (state.showOSR || state.hoveredRule === 'osr' || state.hoveredRule === 'bca-open-space') {
      const osrMat = new THREE.MeshBasicMaterial({
        color: 0x10b981,
        transparent: true,
        opacity: state.hoveredRule === 'osr' ? 0.5 : 0.25,
        side: THREE.DoubleSide,
      });
      const osrMesh = new THREE.Mesh(sitePadGeo, osrMat);
      osrMesh.position.set(0, 0, 0.06);
      osrMesh.userData = { isCustom: true };
      scene.add(osrMesh);
    }

    // ── 4. Setback Boundaries Guide ──
    if (state.showSetbacks || state.hoveredRule?.includes('setback')) {
      const groundFloor = state.designA?.floors[0];
      if (groundFloor && groundFloor.polygon.length >= 3) {
        const sbShape = new THREE.Shape();
        groundFloor.polygon.forEach((pt, j) => {
          if (j === 0) sbShape.moveTo(pt[0], pt[1]);
          else sbShape.lineTo(pt[0], pt[1]);
        });
        sbShape.closePath();

        const sbGeo = new THREE.ShapeGeometry(sbShape);
        const sbMat = new THREE.MeshBasicMaterial({
          color: 0x22c55e,
          transparent: true,
          opacity: state.hoveredRule?.includes('setback') ? 0.35 : 0.14,
          side: THREE.DoubleSide,
        });
        const sbMesh = new THREE.Mesh(sbGeo, sbMat);
        sbMesh.position.set(0, 0, 0.09);
        sbMesh.userData = { isCustom: true };
        scene.add(sbMesh);

        const sbEdgeLine = new THREE.LineSegments(
          new THREE.EdgesGeometry(sbGeo),
          new THREE.LineBasicMaterial({ color: 0x4ade80, linewidth: 2 })
        );
        sbEdgeLine.position.set(0, 0, 0.1);
        sbEdgeLine.userData = { isCustom: true };
        scene.add(sbEdgeLine);
      }
    }

    // ── 5. 23m Height Limit Cap Plane ──
    if (state.showHeightCap || state.hoveredRule === 'height') {
      const capHeight = 23.0;
      const capGeo = new THREE.PlaneGeometry(160, 160);
      const capMat = new THREE.MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: state.hoveredRule === 'height' ? 0.28 : 0.10,
        side: THREE.DoubleSide,
      });
      const capMesh = new THREE.Mesh(capGeo, capMat);
      capMesh.position.set(0, 0, capHeight);
      capMesh.userData = { isCustom: true };
      scene.add(capMesh);

      const capLine = new THREE.LineSegments(
        new THREE.EdgesGeometry(capGeo),
        new THREE.LineBasicMaterial({ color: 0xf87171 })
      );
      capLine.position.set(0, 0, capHeight);
      capLine.userData = { isCustom: true };
      scene.add(capLine);
    }

    // ── 6. 2:1 Sky Exposure Cut Plane ──
    if (state.showSkyPlane || state.hoveredRule === 'sky-plane') {
      state.roadEdges.forEach((edgeIdx) => {
        const p1 = ccwPlot[edgeIdx];
        const p2 = ccwPlot[(edgeIdx + 1) % ccwPlot.length];
        if (!p1 || !p2) return;

        const [nx, ny] = edgeInwardNormal(p1, p2);
        const rw = state.roadWidth;
        const skySlope = 2.0;

        const oppP1: [number, number] = [p1[0] - nx * rw, p1[1] - ny * rw];
        const oppP2: [number, number] = [p2[0] - nx * rw, p2[1] - ny * rw];

        const topH = 45;
        const topInward = topH / skySlope;
        const topP1: [number, number] = [oppP1[0] + nx * topInward, oppP1[1] + ny * topInward];
        const topP2: [number, number] = [oppP2[0] + nx * topInward, oppP2[1] + ny * topInward];

        const skyGeo = new THREE.BufferGeometry();
        const vertices = new Float32Array([
          oppP1[0], oppP1[1], 0,
          oppP2[0], oppP2[1], 0,
          topP2[0], topP2[1], topH,

          oppP1[0], oppP1[1], 0,
          topP2[0], topP2[1], topH,
          topP1[0], topP1[1], topH,
        ]);
        skyGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        skyGeo.computeVertexNormals();

        const skyMat = new THREE.MeshBasicMaterial({
          color: 0xf59e0b,
          transparent: true,
          opacity: state.hoveredRule === 'sky-plane' ? 0.35 : 0.14,
          side: THREE.DoubleSide,
        });
        const skyMesh = new THREE.Mesh(skyGeo, skyMat);
        skyMesh.userData = { isCustom: true };
        scene.add(skyMesh);
      });
    }

    // ── 7. Building Massing Slabs ──
    const design = state.activeDesign === 'b' ? state.designB : state.designA;

    if (state.activeDesign === 'envelope') {
      const envFloors = state.designA?.floors ?? [];
      envFloors.forEach((floor, i) => {
        if (floor.polygon.length < 3) return;

        const shape = new THREE.Shape();
        floor.polygon.forEach((pt, j) => {
          if (j === 0) shape.moveTo(pt[0], pt[1]);
          else shape.lineTo(pt[0], pt[1]);
        });
        shape.closePath();

        const geo = new THREE.ExtrudeGeometry(shape, {
          depth: floor.heightM,
          bevelEnabled: false,
        });

        const mat = new THREE.MeshPhongMaterial({
          color: 0x06b6d4,
          transparent: true,
          opacity: 0.32,
          side: THREE.DoubleSide,
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(0, 0, floor.elevationM);
        mesh.userData = { isCustom: true, floorIndex: i };
        scene.add(mesh);

        const line = new THREE.LineSegments(
          new THREE.EdgesGeometry(geo),
          new THREE.LineBasicMaterial({ color: 0x22d3ee })
        );
        line.position.copy(mesh.position);
        line.userData = { isCustom: true };
        scene.add(line);
      });
    } else if (design && design.floors.length > 0) {
      design.floors.forEach((floor, i) => {
        if (floor.polygon.length < 3) return;

        const isCutawayHidden = state.sectionCutaway && state.selectedFloor !== null && i > state.selectedFloor;
        if (isCutawayHidden) return;

        const shape = new THREE.Shape();
        floor.polygon.forEach((pt, j) => {
          if (j === 0) shape.moveTo(pt[0], pt[1]);
          else shape.lineTo(pt[0], pt[1]);
        });
        shape.closePath();

        const geometry = new THREE.ExtrudeGeometry(shape, {
          depth: floor.heightM * 0.94,
          bevelEnabled: false,
        });

        const isSelected = state.selectedFloor === i;
        const isDesignB = state.activeDesign === 'b';

        // Architectural Studio Palette: Indigo for Design A, Sky Blue for Design B, Gold for Selected
        const baseColor = isDesignB ? 0x0284c7 : 0x4f46e5;
        const slabColor = isSelected ? 0xf59e0b : baseColor;

        const material = new THREE.MeshPhongMaterial({
          color: slabColor,
          transparent: true,
          opacity: isSelected ? 0.98 : 0.88,
          shininess: 60,
          side: THREE.DoubleSide,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(0, 0, floor.elevationM);
        mesh.userData = { isCustom: true, floorIndex: i };

        scene.add(mesh);
        threeRef.current!.buildingMeshes.push(mesh);

        // Crisp edge articulation
        const edgeMat = new THREE.LineBasicMaterial({
          color: isSelected ? 0xfef08a : (isDesignB ? 0xbae6fd : 0xc7d2fe),
          linewidth: isSelected ? 2 : 1,
        });
        const line = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMat);
        line.position.copy(mesh.position);
        line.userData = { isCustom: true };
        scene.add(line);
      });
    }

    map.triggerRepaint();
  }, [
    mapLoaded,
    state.polygon,
    state.roadEdges,
    state.roadWidth,
    state.activeDesign,
    state.designA,
    state.designB,
    state.selectedFloor,
    state.sectionCutaway,
    state.showSetbacks,
    state.showSkyPlane,
    state.showHeightCap,
    state.showOSR,
    state.hoveredRule,
  ]);

  // ─── 4. Camera Animation on Stage Change ───
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const preset = CAMERA_PRESETS[state.stage];
    if (preset) {
      map.easeTo({
        pitch: preset.pitch,
        bearing: preset.bearing,
        zoom: preset.zoom,
        duration: 750,
      });
    }
  }, [mapLoaded, state.stage]);

  // ─── 5. Fly to Preset Plot ───
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || state.polygon.length < 3 || !state.activePresetId) return;

    const anchor = anchorAtCentroid(state.polygon);
    map.flyTo({
      center: [anchor.lngDeg, anchor.latDeg],
      zoom: 17.5,
      pitch: 55,
      bearing: -35,
      duration: 1100,
    });
  }, [mapLoaded, state.activePresetId]);

  return (
    <div
      ref={containerRef}
      data-testid="map-container"
      className="absolute inset-0 w-full h-full"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100%',
        cursor: isDrawing ? 'crosshair' : 'default',
      }}
    />
  );
}

function distanceToSegment(
  p: { x: number; y: number },
  v: { x: number; y: number },
  w: { x: number; y: number }
): number {
  const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
  if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
}

function segmentsCross(
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  p4: [number, number]
): boolean {
  const ccw = (a: [number, number], b: [number, number], c: [number, number]) =>
    (c[1] - a[1]) * (b[0] - a[0]) > (b[1] - a[1]) * (c[0] - a[0]);
  return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
}
