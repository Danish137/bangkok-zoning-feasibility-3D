// ─── MapContainer: MapLibre + Three.js Shared WebGL ───
import React, { useEffect, useRef, useCallback, useState } from 'react';
import maplibregl from 'maplibre-gl';
import * as THREE from 'three';
import { useAppState, useAppDispatch } from '../state';
import { anchorAtCentroid, polygonToMetric, toLngLat } from '../engine/geo';
import { ensureCCW, polygonArea } from '../engine/polygon';
import type { LngLat, LngLatPolygon, Polygon, FloorResult } from '../engine/types';
import { ZONE_YOR9 } from '../engine/types';

const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

// Camera presets for stages
const CAMERA_PRESETS = {
  site: { pitch: 45, bearing: -30, zoom: 16 },
  building: { pitch: 55, bearing: -45, zoom: 17 },
  floor: { pitch: 50, bearing: -30, zoom: 17.5 },
  compliance: { pitch: 55, bearing: -45, zoom: 17 },
  report: { pitch: 40, bearing: 0, zoom: 16.5 },
};

export function MapContainer() {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const threeRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.Camera;
  } | null>(null);
  const drawingRef = useRef<LngLatPolygon>([]);
  const [isDrawing, setIsDrawing] = useState(false);

  const state = useAppState();
  const dispatch = useAppDispatch();

  // Initialize MapLibre
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OPENFREEMAP_STYLE,
      center: [ZONE_YOR9.center[0], ZONE_YOR9.center[1]],
      zoom: 16,
      pitch: 45,
      bearing: -30,
      maxPitch: 70,
    } as maplibregl.MapOptions);

    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');

    map.on('load', () => {
      // Add 3D buildings layer
      const layers = map.getStyle().layers;
      if (layers) {
        // Enable 3D building extrusions if available
        for (const layer of layers) {
          if (layer.id.includes('building') && layer.type === 'fill') {
            map.setPaintProperty(layer.id, 'fill-opacity', 0.6);
          }
        }
      }

      // Add Three.js custom layer
      const customLayer: maplibregl.CustomLayerInterface = {
        id: 'three-layer',
        type: 'custom',
        renderingMode: '3d',
        onAdd(map, gl) {
          const renderer = new THREE.WebGLRenderer({
            canvas: map.getCanvas(),
            context: gl,
            antialias: true,
          });
          renderer.autoClear = false;

          const scene = new THREE.Scene();
          const camera = new THREE.Camera();

          // Lighting
          const ambient = new THREE.AmbientLight(0xffffff, 0.6);
          scene.add(ambient);
          const directional = new THREE.DirectionalLight(0xffffff, 0.8);
          directional.position.set(1, 1, 1);
          scene.add(directional);

          threeRef.current = { renderer, scene, camera };
        },
        render(gl, args) {
          if (!threeRef.current) return;
          const { renderer, scene, camera } = threeRef.current;

          // Sync camera from MapLibre's projection matrix
          camera.projectionMatrix = new THREE.Matrix4().fromArray(
            args.projectionMatrix as number[]
          );

          renderer.resetState();
          renderer.render(scene, camera);
        },
      };

      map.addLayer(customLayer);

      // Source and layers for plot polygon
      map.addSource('plot-polygon', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[]] }, properties: {} },
      });

      map.addLayer({
        id: 'plot-fill',
        type: 'fill',
        source: 'plot-polygon',
        paint: {
          'fill-color': '#6366f1',
          'fill-opacity': 0.15,
        },
      });

      map.addLayer({
        id: 'plot-outline',
        type: 'line',
        source: 'plot-polygon',
        paint: {
          'line-color': '#818cf8',
          'line-width': 2,
        },
      });

      // Source for road edges
      map.addSource('road-edges', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'road-edges-line',
        type: 'line',
        source: 'road-edges',
        paint: {
          'line-color': '#f59e0b',
          'line-width': 4,
        },
      });

      // Source for plot vertices
      map.addSource('plot-vertices', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'plot-vertices-circle',
        type: 'circle',
        source: 'plot-vertices',
        paint: {
          'circle-radius': 6,
          'circle-color': '#ffffff',
          'circle-stroke-color': '#6366f1',
          'circle-stroke-width': 2,
        },
      });

      // Drawing line source
      map.addSource('drawing-line', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} },
      });

      map.addLayer({
        id: 'drawing-line',
        type: 'line',
        source: 'drawing-line',
        paint: {
          'line-color': '#a5b4fc',
          'line-width': 2,
          'line-dasharray': [3, 2],
        },
      });
    });

    // Click handler for polygon drawing
    map.on('click', (e) => {
      const lngLat: LngLat = [e.lngLat.lng, e.lngLat.lat];

      // Check if clicking near first vertex to close polygon
      if (drawingRef.current.length >= 3) {
        const first = drawingRef.current[0]!;
        const pixel = map.project(new maplibregl.LngLat(first[0], first[1]));
        const clickPixel = e.point;
        const dist = Math.sqrt(
          (pixel.x - clickPixel.x) ** 2 + (pixel.y - clickPixel.y) ** 2
        );
        if (dist < 20) {
          // Close polygon
          dispatch({ type: 'SET_POLYGON', polygon: [...drawingRef.current] });
          drawingRef.current = [];
          setIsDrawing(false);
          return;
        }
      }

      // Add vertex
      drawingRef.current.push(lngLat);
      setIsDrawing(true);
      updateDrawingLine(map);
    });

    // Edge click for road frontage toggle
    map.on('click', 'plot-outline', (e) => {
      if (drawingRef.current.length > 0) return; // Don't toggle while drawing
      e.preventDefault();

      const clickPt = e.lngLat;
      const poly = (map.getSource('plot-polygon') as maplibregl.GeoJSONSource)
        ?._data as any;

      // Find closest edge — handled in state update
    });

    mapRef.current = map;

    return () => {
      // Cleanup Three.js
      if (threeRef.current) {
        threeRef.current.scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose();
            if (obj.material instanceof THREE.Material) obj.material.dispose();
          }
        });
      }
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update plot polygon on map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const poly = state.polygon;
    if (poly.length >= 3) {
      const coords = [...poly, poly[0]!]; // Close ring
      (map.getSource('plot-polygon') as maplibregl.GeoJSONSource)?.setData({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [coords] },
        properties: {},
      });

      // Update vertices
      (map.getSource('plot-vertices') as maplibregl.GeoJSONSource)?.setData({
        type: 'FeatureCollection',
        features: poly.map((p, i) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: p },
          properties: { index: i },
        })),
      });

      // Update road edges
      const roadFeatures = state.roadEdges.map((edgeIdx) => {
        const p1 = poly[edgeIdx];
        const p2 = poly[(edgeIdx + 1) % poly.length];
        if (!p1 || !p2) return null;
        return {
          type: 'Feature' as const,
          geometry: {
            type: 'LineString' as const,
            coordinates: [p1, p2],
          },
          properties: { edgeIndex: edgeIdx },
        };
      }).filter(Boolean);

      (map.getSource('road-edges') as maplibregl.GeoJSONSource)?.setData({
        type: 'FeatureCollection',
        features: roadFeatures as any[],
      });

      // Clear drawing line
      (map.getSource('drawing-line') as maplibregl.GeoJSONSource)?.setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [] },
        properties: {},
      });
    } else {
      // Clear all
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
    }

    map.triggerRepaint();
  }, [state.polygon, state.roadEdges]);

  // Update 3D buildings
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !threeRef.current) return;

    const { scene } = threeRef.current;

    // Clear previous buildings
    const toRemove: THREE.Object3D[] = [];
    scene.traverse((obj) => {
      if (obj.userData.isBuilding) toRemove.push(obj);
    });
    toRemove.forEach((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (obj.material instanceof THREE.Material) obj.material.dispose();
      }
      scene.remove(obj);
    });

    const design = state.activeDesign === 'b' ? state.designB : state.designA;
    if (!design || state.polygon.length < 3 || state.activeDesign === 'envelope') return;

    const anchor = anchorAtCentroid(state.polygon);
    const centerMerc = maplibregl.MercatorCoordinate.fromLngLat(
      { lng: anchor.lngDeg, lat: anchor.latDeg },
      0
    );
    const scale = centerMerc.meterInMercatorCoordinateUnits();

    // Create floor slabs
    design.floors.forEach((floor, i) => {
      if (floor.polygon.length < 3) return;

      // Skip floors above cutaway if section cut is active
      if (state.sectionCutaway && state.selectedFloor !== null && i > state.selectedFloor) return;

      const shape = new THREE.Shape();
      floor.polygon.forEach((pt, j) => {
        const x = pt[0] * scale;
        const y = pt[1] * scale;
        if (j === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      });
      shape.closePath();

      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: floor.heightM * scale * 0.95,
        bevelEnabled: false,
      });

      const isSelected = state.selectedFloor === i;
      const material = new THREE.MeshPhongMaterial({
        color: isSelected ? 0x818cf8 : 0x4f46e5,
        transparent: true,
        opacity: isSelected ? 0.95 : 0.75,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(centerMerc.x, centerMerc.y, floor.elevationM * scale);
      mesh.rotation.x = Math.PI / 2;
      mesh.userData = { isBuilding: true, floorIndex: i };

      scene.add(mesh);

      // Add edge lines for each slab
      const edges = new THREE.EdgesGeometry(geometry);
      const lineMat = new THREE.LineBasicMaterial({ color: 0xa5b4fc, linewidth: 1 });
      const lineSegments = new THREE.LineSegments(edges, lineMat);
      lineSegments.position.copy(mesh.position);
      lineSegments.rotation.copy(mesh.rotation);
      lineSegments.userData = { isBuilding: true };
      scene.add(lineSegments);
    });

    // Add setback guide planes if enabled
    if (state.showSetbacks && state.evaluation && state.polygon.length >= 3) {
      const plotMetric = polygonToMetric(anchor, state.polygon);
      const ccwPlot = ensureCCW(plotMetric);
      const groundFloor = design.floors[0];
      if (groundFloor) {
        // Setback boundary as a translucent plane at ground level
        const setbackShape = new THREE.Shape();
        groundFloor.polygon.forEach((pt, j) => {
          const x = pt[0] * scale;
          const y = pt[1] * scale;
          if (j === 0) setbackShape.moveTo(x, y);
          else setbackShape.lineTo(x, y);
        });
        setbackShape.closePath();

        const setbackGeo = new THREE.ShapeGeometry(setbackShape);
        const setbackMat = new THREE.MeshBasicMaterial({
          color: 0x22c55e,
          transparent: true,
          opacity: 0.15,
          side: THREE.DoubleSide,
        });
        const setbackMesh = new THREE.Mesh(setbackGeo, setbackMat);
        setbackMesh.position.set(centerMerc.x, centerMerc.y, 0.001);
        setbackMesh.rotation.x = -Math.PI / 2;
        setbackMesh.userData = { isBuilding: true };
        scene.add(setbackMesh);
      }
    }

    // Height cap plane
    if (state.showHeightCap && state.evaluation) {
      const capHeight = state.evaluation.maxAllowedHeightM;
      if (capHeight < 500) {
        const capGeo = new THREE.PlaneGeometry(200 * scale, 200 * scale);
        const capMat = new THREE.MeshBasicMaterial({
          color: 0xef4444,
          transparent: true,
          opacity: 0.08,
          side: THREE.DoubleSide,
        });
        const capMesh = new THREE.Mesh(capGeo, capMat);
        capMesh.position.set(centerMerc.x, centerMerc.y, capHeight * scale);
        capMesh.userData = { isBuilding: true };
        scene.add(capMesh);
      }
    }

    map.triggerRepaint();
  }, [
    state.activeDesign, state.designA, state.designB, state.polygon,
    state.selectedFloor, state.sectionCutaway,
    state.showSetbacks, state.showSkyPlane, state.showHeightCap, state.showOSR,
    state.evaluation,
  ]);

  // Camera animation on stage change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const preset = CAMERA_PRESETS[state.stage];
    if (preset) {
      map.easeTo({
        pitch: preset.pitch,
        bearing: preset.bearing,
        zoom: preset.zoom,
        duration: 800,
      });
    }
  }, [state.stage]);

  // Fly to preset plot
  useEffect(() => {
    const map = mapRef.current;
    if (!map || state.polygon.length < 3) return;

    const center = state.polygon.reduce(
      (acc, p) => [acc[0] + p[0] / state.polygon.length, acc[1] + p[1] / state.polygon.length] as LngLat,
      [0, 0] as LngLat
    );

    map.flyTo({
      center: { lng: center[0], lat: center[1] },
      zoom: 17,
      pitch: 50,
      bearing: -30,
      duration: 1200,
    });
  }, [state.activePresetId]);

  // Handle edge clicks for road frontage
  const handleEdgeClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Edge clicking is handled via MapLibre click events
  }, []);

  return (
    <div
      ref={containerRef}
      data-testid="map-container"
      className="absolute inset-0 w-full h-full"
      style={{ cursor: isDrawing ? 'crosshair' : 'grab' }}
    />
  );
}

function updateDrawingLine(map: maplibregl.Map) {
  // This would update the drawing line in real-time
  // Simplified for now — the polygon is set on close
}
