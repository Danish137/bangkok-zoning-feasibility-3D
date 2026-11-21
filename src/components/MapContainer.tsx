// ─── MapContainer: MapLibre + Three.js Shared WebGL ───
import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import * as THREE from 'three';
import { useAppState, useAppDispatch } from '../state';
import { anchorAtCentroid, polygonToMetric, toLngLat } from '../engine/geo';
import { ensureCCW, polygonArea, edgeInwardNormal, edgeLength } from '../engine/polygon';
import type { LngLat, LngLatPolygon, Polygon, FloorResult } from '../engine/types';
import { ZONE_YOR9 } from '../engine/types';

const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

// Camera presets for stages
const CAMERA_PRESETS = {
  site: { pitch: 48, bearing: -25, zoom: 16.8 },
  building: { pitch: 58, bearing: -42, zoom: 17.2 },
  floor: { pitch: 52, bearing: -30, zoom: 17.8 },
  compliance: { pitch: 58, bearing: -45, zoom: 17.2 },
  report: { pitch: 35, bearing: 0, zoom: 16.5 },
};

export function MapContainer() {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
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

  // Ref to hold state for WebGL render callback without stale closures
  const stateRef = useRef(state);
  stateRef.current = state;

  // Initialize MapLibre
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialCenter = state.polygon.length >= 3
      ? anchorAtCentroid(state.polygon)
      : { lngDeg: ZONE_YOR9.center[0], latDeg: ZONE_YOR9.center[1] };

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OPENFREEMAP_STYLE,
      center: [initialCenter.lngDeg, initialCenter.latDeg],
      zoom: 16.8,
      pitch: 48,
      bearing: -25,
      maxPitch: 75,
    } as maplibregl.MapOptions);

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');

    map.on('load', () => {
      // Custom Three.js layer
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

          // Ambient & architectural directional lighting
          const ambient = new THREE.AmbientLight(0xffffff, 0.75);
          scene.add(ambient);

          const sun = new THREE.DirectionalLight(0xfff7ed, 1.2);
          sun.position.set(120, 150, 200);
          scene.add(sun);

          const fillLight = new THREE.DirectionalLight(0xdbeafe, 0.5);
          fillLight.position.set(-100, -120, 80);
          scene.add(fillLight);

          threeRef.current = { renderer, scene, camera, buildingMeshes: [] };
        },
        render(gl, args) {
          if (!threeRef.current) return;
          const { renderer, scene, camera } = threeRef.current;
          const currentState = stateRef.current;

          if (currentState.polygon.length < 3) return;

          // Compute local metric to Mercator matrix
          const anchor = anchorAtCentroid(currentState.polygon);
          const centerMerc = maplibregl.MercatorCoordinate.fromLngLat(
            { lng: anchor.lngDeg, lat: anchor.latDeg },
            0
          );
          const meterScale = centerMerc.meterInMercatorCoordinateUnits();

          // Metric coordinates: X = East (m), Y = North (m), Z = Up (m)
          // In Mercator: Y is inverted (South is positive Y)
          const localToMercator = new THREE.Matrix4()
            .makeTranslation(centerMerc.x, centerMerc.y, centerMerc.z)
            .scale(new THREE.Vector3(meterScale, -meterScale, meterScale));

          const mercatorToClip = new THREE.Matrix4().fromArray(
            args.projectionMatrix as number[]
          );

          camera.projectionMatrix = mercatorToClip.multiply(localToMercator);

          renderer.resetState();
          renderer.render(scene, camera);
        },
      };

      map.addLayer(customLayer);

      // Plot polygon GeoJSON source
      map.addSource('plot-polygon', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[]] }, properties: {} },
      });

      map.addLayer({
        id: 'plot-fill',
        type: 'fill',
        source: 'plot-polygon',
        paint: {
          'fill-color': '#4f46e5',
          'fill-opacity': 0.12,
        },
      });

      map.addLayer({
        id: 'plot-outline',
        type: 'line',
        source: 'plot-polygon',
        paint: {
          'line-color': '#818cf8',
          'line-width': 2.5,
        },
      });

      // Road edges source & layer
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
          'line-width': 5,
        },
      });

      // Vertices source & layer (for interactive dragging)
      map.addSource('plot-vertices', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'plot-vertices-circle',
        type: 'circle',
        source: 'plot-vertices',
        paint: {
          'circle-radius': 7,
          'circle-color': '#ffffff',
          'circle-stroke-color': '#6366f1',
          'circle-stroke-width': 2.5,
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
          'line-width': 2,
          'line-dasharray': [3, 2],
        },
      });
    });

    // ─── Interaction Handlers ───

    // Vertex dragging
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

      // Cursor styling
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

    // Map Click: Drawing OR Edge Frontage Toggle OR 3D Floor Raycasting
    map.on('click', (e) => {
      if (draggingVertexRef.current !== null) return;

      const currentState = stateRef.current;
      const clickedLngLat: LngLat = [e.lngLat.lng, e.lngLat.lat];

      // 1. If currently in drawing mode
      if (isDrawing || currentState.polygon.length < 3) {
        if (drawingRef.current.length >= 3) {
          const first = drawingRef.current[0]!;
          const firstPixel = map.project(new maplibregl.LngLat(first[0], first[1]));
          const dist = Math.hypot(firstPixel.x - e.point.x, firstPixel.y - e.point.y);
          if (dist < 25) {
            // Close polygon
            dispatch({ type: 'SET_POLYGON', polygon: [...drawingRef.current] });
            drawingRef.current = [];
            setIsDrawing(false);
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

      // 2. Check 3D Floor Slab Raycasting first
      if (threeRef.current && threeRef.current.buildingMeshes.length > 0) {
        const canvas = map.getCanvas();
        const rect = canvas.getBoundingClientRect();
        const ndcX = ((e.point.x) / rect.width) * 2 - 1;
        const ndcY = -((e.point.y) / rect.height) * 2 + 1;

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

  // ─── Update Map 2D Layers (Plot, Vertices, Roads) ───
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const poly = state.polygon;
    if (poly.length >= 3) {
      const closedCoords = [...poly, poly[0]!];
      (map.getSource('plot-polygon') as maplibregl.GeoJSONSource)?.setData({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [closedCoords] },
        properties: {},
      });

      // Update draggable vertices
      (map.getSource('plot-vertices') as maplibregl.GeoJSONSource)?.setData({
        type: 'FeatureCollection',
        features: poly.map((p, i) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: p },
          properties: { index: i },
        })),
      });

      // Update highlighted road edges
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
    }

    map.triggerRepaint();
  }, [state.polygon, state.roadEdges]);

  // ─── Update Three.js 3D Massing & Regulatory Guides ───
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !threeRef.current) return;

    const { scene } = threeRef.current;

    // Dispose existing meshes
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

    // ── 1. Clean Ground Site Pad (covers OSM ground & prevents clipping) ──
    const sitePadShape = new THREE.Shape();
    ccwPlot.forEach((pt, j) => {
      if (j === 0) sitePadShape.moveTo(pt[0], pt[1]);
      else sitePadShape.lineTo(pt[0], pt[1]);
    });
    sitePadShape.closePath();

    const sitePadGeo = new THREE.ShapeGeometry(sitePadShape);
    const sitePadMat = new THREE.MeshBasicMaterial({
      color: 0x1e293b,
      side: THREE.DoubleSide,
      depthWrite: true,
    });
    const sitePadMesh = new THREE.Mesh(sitePadGeo, sitePadMat);
    sitePadMesh.position.set(0, 0, 0.05);
    sitePadMesh.userData = { isCustom: true };
    scene.add(sitePadMesh);

    // Site boundary outline
    const siteEdgeGeo = new THREE.EdgesGeometry(sitePadGeo);
    const siteEdgeMat = new THREE.LineBasicMaterial({ color: 0x6366f1, linewidth: 2 });
    const siteEdgeLine = new THREE.LineSegments(siteEdgeGeo, siteEdgeMat);
    siteEdgeLine.position.set(0, 0, 0.08);
    siteEdgeLine.userData = { isCustom: true };
    scene.add(siteEdgeLine);

    // ── 2. OSR Open Space Footprint (Landscaped Green Zone) ──
    if (state.showOSR || state.hoveredRule === 'osr' || state.hoveredRule === 'bca-open-space') {
      const osrMat = new THREE.MeshBasicMaterial({
        color: 0x10b981,
        transparent: true,
        opacity: state.hoveredRule === 'osr' ? 0.45 : 0.22,
        side: THREE.DoubleSide,
      });
      const osrMesh = new THREE.Mesh(sitePadGeo, osrMat);
      osrMesh.position.set(0, 0, 0.06);
      osrMesh.userData = { isCustom: true };
      scene.add(osrMesh);
    }

    // ── 3. Setback Boundaries Guide ──
    if (state.showSetbacks || state.hoveredRule === 'setbacks' || state.hoveredRule === 'road-setback' || state.hoveredRule === 'side-rear-setback') {
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
          opacity: state.hoveredRule?.includes('setback') ? 0.35 : 0.12,
          side: THREE.DoubleSide,
        });
        const sbMesh = new THREE.Mesh(sbGeo, sbMat);
        sbMesh.position.set(0, 0, 0.09);
        sbMesh.userData = { isCustom: true };
        scene.add(sbMesh);

        const sbEdgeGeo = new THREE.EdgesGeometry(sbGeo);
        const sbEdgeMat = new THREE.LineBasicMaterial({
          color: 0x4ade80,
          linewidth: 2,
        });
        const sbEdgeLine = new THREE.LineSegments(sbEdgeGeo, sbEdgeMat);
        sbEdgeLine.position.set(0, 0, 0.1);
        sbEdgeLine.userData = { isCustom: true };
        scene.add(sbEdgeLine);
      }
    }

    // ── 4. 23m Height Limit Cap Plane ──
    if (state.showHeightCap || state.hoveredRule === 'height') {
      const capHeight = 23.0; // Bangkok standard low-rise cap
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

      const capEdges = new THREE.EdgesGeometry(capGeo);
      const capEdgeMat = new THREE.LineBasicMaterial({ color: 0xf87171 });
      const capLine = new THREE.LineSegments(capEdges, capEdgeMat);
      capLine.position.set(0, 0, capHeight);
      capLine.userData = { isCustom: true };
      scene.add(capLine);
    }

    // ── 5. 2:1 Sky Exposure Cut Plane ──
    if (state.showSkyPlane || state.hoveredRule === 'sky-plane') {
      state.roadEdges.forEach((edgeIdx) => {
        const p1 = ccwPlot[edgeIdx];
        const p2 = ccwPlot[(edgeIdx + 1) % ccwPlot.length];
        if (!p1 || !p2) return;

        const [nx, ny] = edgeInwardNormal(p1, p2);
        const rw = state.roadWidth;
        const skySlope = 2.0; // 2:1 vertical to horizontal

        // Oppsite road boundary: offset outward by rw
        const oppP1: [number, number] = [p1[0] - nx * rw, p1[1] - ny * rw];
        const oppP2: [number, number] = [p2[0] - nx * rw, p2[1] - ny * rw];

        // Sloping plane rises to height H=50m, penetrating inward by H/2 = 25m
        const topH = 45;
        const topInward = topH / skySlope;
        const topP1: [number, number] = [oppP1[0] + nx * topInward, oppP1[1] + ny * topInward];
        const topP2: [number, number] = [oppP2[0] + nx * topInward, oppP2[1] + ny * topInward];

        // Construct 3D quad plane
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

    // ── 6. Allowable Envelope Mode OR Active Design Massing ──
    const design = state.activeDesign === 'b' ? state.designB : state.designA;

    if (state.activeDesign === 'envelope') {
      // Render the maximum allowable envelope as translucent glowing volume
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

        const edges = new THREE.EdgesGeometry(geo);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x22d3ee }));
        line.position.copy(mesh.position);
        line.userData = { isCustom: true };
        scene.add(line);
      });
    } else if (design && design.floors.length > 0) {
      // Render architectural floor slabs for Design A or B
      design.floors.forEach((floor, i) => {
        if (floor.polygon.length < 3) return;

        // Section Cutaway logic: hide or ghost floors above selectedFloor
        const isCutawayHidden = state.sectionCutaway && state.selectedFloor !== null && i > state.selectedFloor;
        if (isCutawayHidden) return;

        const shape = new THREE.Shape();
        floor.polygon.forEach((pt, j) => {
          if (j === 0) shape.moveTo(pt[0], pt[1]);
          else shape.lineTo(pt[0], pt[1]);
        });
        shape.closePath();

        const geometry = new THREE.ExtrudeGeometry(shape, {
          depth: floor.heightM * 0.94, // slight slab gap for architectural articulation
          bevelEnabled: false,
        });

        const isSelected = state.selectedFloor === i;
        const isDesignB = state.activeDesign === 'b';

        // Architectural Studio Aesthetic: Slate & Indigo / Amber Gold for selected
        const baseColor = isDesignB ? 0x0284c7 : 0x4f46e5;
        const slabColor = isSelected ? 0xf59e0b : baseColor;

        const material = new THREE.MeshPhongMaterial({
          color: slabColor,
          transparent: true,
          opacity: isSelected ? 0.96 : 0.85,
          shininess: 40,
          side: THREE.DoubleSide,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(0, 0, floor.elevationM);
        mesh.userData = { isCustom: true, floorIndex: i };

        scene.add(mesh);
        threeRef.current!.buildingMeshes.push(mesh);

        // Crisp architectural edge lines
        const edgeGeo = new THREE.EdgesGeometry(geometry);
        const lineMat = new THREE.LineBasicMaterial({
          color: isSelected ? 0xfef08a : (isDesignB ? 0x7dd3fc : 0xa5b4fc),
          linewidth: isSelected ? 2 : 1,
        });
        const line = new THREE.LineSegments(edgeGeo, lineMat);
        line.position.copy(mesh.position);
        line.userData = { isCustom: true };
        scene.add(line);
      });
    }

    map.triggerRepaint();
  }, [
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

  // ─── Camera Animation on Stage Switch ───
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const preset = CAMERA_PRESETS[state.stage];
    if (preset) {
      map.easeTo({
        pitch: preset.pitch,
        bearing: preset.bearing,
        zoom: preset.zoom,
        duration: 750,
      });
    }
  }, [state.stage]);

  // ─── Fly to Preset Plot ───
  useEffect(() => {
    const map = mapRef.current;
    if (!map || state.polygon.length < 3 || !state.activePresetId) return;

    const anchor = anchorAtCentroid(state.polygon);
    map.flyTo({
      center: [anchor.lngDeg, anchor.latDeg],
      zoom: 17.2,
      pitch: 52,
      bearing: -32,
      duration: 1100,
    });
  }, [state.activePresetId]);

  return (
    <div
      ref={containerRef}
      data-testid="map-container"
      className="absolute inset-0 w-full h-full"
      style={{ cursor: isDrawing ? 'crosshair' : 'default' }}
    />
  );
}

// ─── Geometric Helper: Point to Line Segment Distance (pixels) ───
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
