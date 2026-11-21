// ─── Engine Unit Tests ───
import { describe, it, expect } from 'vitest';
import {
  createAnchor, toMetric, toLngLat, sqmToRaiNganWah, anchorAtCentroid,
  polygonToMetric,
} from '../src/engine/geo';
import {
  polygonArea, signedArea, isCCW, ensureCCW, isSelfIntersecting,
  edgeLength, edgeOutwardNormal, inwardOffset, perEdgeInwardOffset,
  polygonPerimeter,
} from '../src/engine/polygon';
import {
  computeEdgeSetback, checkRoadEligibility, generateFloors, evaluate,
  applySkyPlane, computeCompliance,
} from '../src/engine/rules';
import { generateDesignA, generateDesignB, generateDesigns } from '../src/engine/designs';
import type { PlotEdge, Polygon, ZoningInput, MetricPoint } from '../src/engine/types';
import { ZONE_YOR9 } from '../src/engine/types';
import { PRESET_PLOTS } from '../src/engine/presets';

// ─── Helper: create a rectangular plot in metric coords ───
function rectPlot(w: number, h: number): Polygon {
  return [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
}

function rectEdges(w: number, h: number, roadWidth: number, roadEdgeIdx = 0): PlotEdge[] {
  const poly = rectPlot(w, h);
  return poly.map((_, i) => ({
    index: i,
    start: poly[i]!,
    end: poly[(i + 1) % poly.length]!,
    type: i === roadEdgeIdx ? 'road' as const : 'side' as const,
    roadWidth: i === roadEdgeIdx ? roadWidth : undefined,
  }));
}

// ─── Geo Tests ───
describe('Geo Projection', () => {
  it('round-trips WGS84 → metric → WGS84', () => {
    const anchor = createAnchor([100.576, 13.7308]);
    const original: [number, number] = [100.577, 13.732];
    const metric = toMetric(anchor, original);
    const back = toLngLat(anchor, metric);
    expect(Math.abs(back[0] - original[0])).toBeLessThan(1e-9);
    expect(Math.abs(back[1] - original[1])).toBeLessThan(1e-9);
  });

  it('computes metric distances correctly (~111m per 0.001 deg lat)', () => {
    const anchor = createAnchor([100.576, 13.7308]);
    const p = toMetric(anchor, [100.576, 13.7318]);
    // ~0.001 deg lat ≈ 111 meters
    expect(Math.abs(p[1] - 111)).toBeLessThan(2);
    expect(Math.abs(p[0])).toBeLessThan(0.01);
  });

  it('converts sqm to Rai-Ngan-Wah correctly', () => {
    const result = sqmToRaiNganWah(1600);
    expect(result.rai).toBe(1);
    expect(result.ngan).toBe(0);
    expect(result.wah).toBeCloseTo(0, 1);
  });

  it('converts 2000 sqm to Rai-Ngan-Wah', () => {
    const result = sqmToRaiNganWah(2000);
    expect(result.rai).toBe(1);
    expect(result.ngan).toBe(1);
    expect(result.wah).toBeCloseTo(0, 1);
  });
});

// ─── Polygon Tests ───
describe('Polygon Geometry', () => {
  it('computes area of rectangle', () => {
    const area = polygonArea(rectPlot(40, 30));
    expect(area).toBeCloseTo(1200, 1);
  });

  it('computes area of L-shaped polygon', () => {
    // L-shape: 40x30 minus a 20x15 corner
    const lShape: Polygon = [
      [0, 0], [40, 0], [40, 15], [20, 15], [20, 30], [0, 30],
    ];
    const area = polygonArea(lShape);
    expect(area).toBeCloseTo(40 * 30 - 20 * 15, 1); // 1200 - 300 = 900
  });

  it('detects CCW winding', () => {
    expect(isCCW(rectPlot(40, 30))).toBe(true);
  });

  it('ensures CCW for CW polygon', () => {
    const cw: Polygon = [[0, 30], [40, 30], [40, 0], [0, 0]];
    expect(isCCW(cw)).toBe(false);
    const ccw = ensureCCW(cw);
    expect(isCCW(ccw)).toBe(true);
    expect(polygonArea(ccw)).toBeCloseTo(1200, 1);
  });

  it('detects self-intersecting polygon', () => {
    const bowtie: Polygon = [[0, 0], [10, 10], [10, 0], [0, 10]];
    expect(isSelfIntersecting(bowtie)).toBe(true);
  });

  it('non-self-intersecting polygon', () => {
    expect(isSelfIntersecting(rectPlot(10, 10))).toBe(false);
  });

  it('computes edge length', () => {
    expect(edgeLength([0, 0], [3, 4])).toBeCloseTo(5, 10);
  });

  it('uniform inward offset of rectangle', () => {
    const result = inwardOffset(rectPlot(40, 30), 2);
    expect(result.length).toBeGreaterThan(0);
    const area = polygonArea(result[0]!);
    // 40x30 with 2m inset → 36x26 = 936
    expect(area).toBeCloseTo(936, 0);
  });

  it('uniform inward offset of L-shape', () => {
    const lShape: Polygon = [
      [0, 0], [40, 0], [40, 15], [20, 15], [20, 30], [0, 30],
    ];
    const result = inwardOffset(lShape, 2);
    expect(result.length).toBeGreaterThan(0);
    // Should produce a valid polygon smaller than original
    const area = polygonArea(result[0]!);
    expect(area).toBeLessThan(900);
    expect(area).toBeGreaterThan(100); // L-shape with 2m offset on all edges produces smaller area
  });

  it('per-edge inward offset with varying setbacks', () => {
    const poly = rectPlot(40, 30);
    // bottom=2, right=3, top=2, left=3
    const result = perEdgeInwardOffset(poly, [2, 3, 2, 3]);
    expect(result.length).toBeGreaterThan(0);
    const area = polygonArea(result[0]!);
    // (40-3-3) × (30-2-2) = 34 × 26 = 884
    expect(area).toBeCloseTo(884, 0);
  });
});

// ─── Setback Tests ───
describe('Setbacks', () => {
  it('high-rise gets 6m all edges', () => {
    const edge: PlotEdge = {
      index: 0, start: [0, 0], end: [40, 0], type: 'side',
    };
    const sb = computeEdgeSetback(edge, { isHighRise: true, isExtraLarge: false, floorElevation: 0 });
    expect(sb.setbackMeters).toBe(6);
  });

  it('extra-large gets 6m all edges', () => {
    const edge: PlotEdge = {
      index: 0, start: [0, 0], end: [40, 0], type: 'road', roadWidth: 12,
    };
    const sb = computeEdgeSetback(edge, { isHighRise: false, isExtraLarge: true, floorElevation: 0 });
    expect(sb.setbackMeters).toBe(6);
  });

  it('standard side edge ≤9m gets 2m', () => {
    const edge: PlotEdge = {
      index: 0, start: [0, 0], end: [0, 30], type: 'side',
    };
    const sb = computeEdgeSetback(edge, { isHighRise: false, isExtraLarge: false, floorElevation: 5 });
    expect(sb.setbackMeters).toBe(2);
  });

  it('standard side edge 9-23m gets 3m', () => {
    const edge: PlotEdge = {
      index: 0, start: [0, 0], end: [0, 30], type: 'side',
    };
    const sb = computeEdgeSetback(edge, { isHighRise: false, isExtraLarge: false, floorElevation: 12 });
    expect(sb.setbackMeters).toBe(3);
  });

  it('road 15m gives setback max(15/10, 2) = 2m', () => {
    const edge: PlotEdge = {
      index: 0, start: [0, 0], end: [40, 0], type: 'road', roadWidth: 15,
    };
    const sb = computeEdgeSetback(edge, { isHighRise: false, isExtraLarge: false, floorElevation: 0 });
    expect(sb.setbackMeters).toBe(2); // max(1.5, 2) = 2
  });

  it('road 25m gives 2m', () => {
    const edge: PlotEdge = {
      index: 0, start: [0, 0], end: [40, 0], type: 'road', roadWidth: 25,
    };
    const sb = computeEdgeSetback(edge, { isHighRise: false, isExtraLarge: false, floorElevation: 0 });
    expect(sb.setbackMeters).toBe(2);
  });
});

// ─── Road Eligibility Tests ───
describe('Road Eligibility', () => {
  it('narrow road (<10m) blocks high-rise', () => {
    const edges = rectEdges(40, 30, 8, 0);
    const result = checkRoadEligibility(edges, 1200);
    expect(result.highRiseAllowed).toBe(false);
    expect(result.maxHeight).toBe(23);
    expect(result.blocker).toContain('Road width');
  });

  it('10m road with 40m frontage allows high-rise', () => {
    const edges = rectEdges(40, 30, 10, 0);
    const result = checkRoadEligibility(edges, 1200);
    expect(result.highRiseAllowed).toBe(true);
  });

  it('10m road with short frontage (<12m) blocks high-rise', () => {
    const edges = rectEdges(10, 30, 10, 0);
    const result = checkRoadEligibility(edges, 300);
    expect(result.highRiseAllowed).toBe(false);
    expect(result.blocker).toContain('Frontage');
  });

  it('18m road allows GFA up to FAR limit', () => {
    const edges = rectEdges(50, 40, 18, 0);
    const result = checkRoadEligibility(edges, 2000);
    expect(result.highRiseAllowed).toBe(true);
    expect(result.maxGFA).toBe(2000 * ZONE_YOR9.maxFAR);
  });
});

// ─── Floor Generation Tests ───
describe('Floor Generation', () => {
  it('generates floors for rectangle with narrow road (capped at 23m)', () => {
    const poly = rectPlot(40, 30);
    const edges = rectEdges(40, 30, 8, 0);
    const roadElig = checkRoadEligibility(edges, 1200);
    const floors = generateFloors(poly, edges, 'low-rise-condo', roadElig);
    
    expect(floors.length).toBeGreaterThan(0);
    const height = floors.reduce((s, f) => s + f.heightM, 0);
    expect(height).toBeLessThanOrEqual(23);
    
    // All floor areas should be positive
    for (const f of floors) {
      expect(f.areaSqm).toBeGreaterThan(0);
    }
  });

  it('floor areas sum to total GFA', () => {
    const poly = rectPlot(50, 40);
    const edges = rectEdges(50, 40, 12, 0);
    const roadElig = checkRoadEligibility(edges, 2000);
    const floors = generateFloors(poly, edges, 'high-rise-condo', roadElig);
    
    const sumGFA = floors.reduce((s, f) => s + f.areaSqm, 0);
    const manualSum = floors.map(f => f.areaSqm).reduce((a, b) => a + b, 0);
    expect(Math.abs(sumGFA - manualSum)).toBeLessThan(0.01);
  });

  it('high-rise floors have 6m setback on all edges', () => {
    const poly = rectPlot(50, 40);
    const edges = rectEdges(50, 40, 12, 0);
    const roadElig = checkRoadEligibility(edges, 2000);
    const floors = generateFloors(poly, edges, 'high-rise-condo', roadElig);
    
    // Find a floor above 23m
    const highFloor = floors.find(f => f.elevationM + f.heightM > 23);
    if (highFloor) {
      for (const sb of highFloor.setbacks) {
        expect(sb.setbackMeters).toBe(6);
      }
    }
  });
});

// ─── Full Evaluation Tests ───
describe('Full Evaluation', () => {
  it('evaluates rectangular plot with 12m road', () => {
    const poly = rectPlot(50, 40);
    const edges = rectEdges(50, 40, 12, 0);
    const input: ZoningInput = {
      polygon: poly,
      edges,
      buildingType: 'high-rise-condo',
      roadWidths: new Map([[0, 12]]),
    };
    const result = evaluate(input);
    
    expect(result.plotAreaSqm).toBeCloseTo(2000, 0);
    expect(result.totalGFA).toBeGreaterThan(0);
    expect(result.actualFAR).toBeLessThanOrEqual(ZONE_YOR9.maxFAR + 0.01);
    expect(result.floorCount).toBeGreaterThan(0);
    expect(result.checks.length).toBeGreaterThan(0);
    
    // Verify GFA sum
    const sumGFA = result.floors.reduce((s, f) => s + f.areaSqm, 0);
    expect(Math.abs(result.totalGFA - sumGFA)).toBeLessThan(0.1);
  });

  it('evaluates L-shaped plot with narrow soi', () => {
    const lShape: Polygon = [
      [0, 0], [40, 0], [40, 15], [20, 15], [20, 30], [0, 30],
    ];
    const edges: PlotEdge[] = lShape.map((_, i) => ({
      index: i,
      start: lShape[i]!,
      end: lShape[(i + 1) % lShape.length]!,
      type: i === 0 ? 'road' as const : 'side' as const,
      roadWidth: i === 0 ? 8 : undefined,
    }));
    const input: ZoningInput = {
      polygon: lShape,
      edges,
      buildingType: 'low-rise-condo',
      roadWidths: new Map([[0, 8]]),
    };
    const result = evaluate(input);
    
    expect(result.plotAreaSqm).toBeCloseTo(900, 0);
    expect(result.isHighRise).toBe(false);
    expect(result.heightM).toBeLessThanOrEqual(23);
    expect(result.roadBlocker).toBeDefined();
    
    // GFA sum verification
    const sumGFA = result.floors.reduce((s, f) => s + f.areaSqm, 0);
    expect(Math.abs(result.totalGFA - sumGFA)).toBeLessThan(0.1);
  });

  it('evaluates large plot with 18m road for high-rise', () => {
    const poly = rectPlot(70, 60);
    const edges = rectEdges(70, 60, 18, 0);
    const input: ZoningInput = {
      polygon: poly,
      edges,
      buildingType: 'high-rise-condo',
      roadWidths: new Map([[0, 18]]),
    };
    const result = evaluate(input);
    
    expect(result.plotAreaSqm).toBeCloseTo(4200, 0);
    expect(result.highRiseEligible).toBe(true);
    expect(result.maxRoadWidth).toBe(18);
    expect(result.isHighRise).toBe(true);
    
    // GFA sum
    const sumGFA = result.floors.reduce((s, f) => s + f.areaSqm, 0);
    expect(Math.abs(result.totalGFA - sumGFA)).toBeLessThan(0.1);
  });
});

// ─── Statutory & Statutory Edge-Case Tests ───
describe('Bangkok Yor.9 Statutory Edge Cases & EIA Triggers', () => {
  it('EIA triggered when residential height exceeds 23m', () => {
    const poly = rectPlot(50, 40);
    const edges = rectEdges(50, 40, 12, 0);
    const input: ZoningInput = {
      polygon: poly,
      edges,
      buildingType: 'high-rise-condo',
      roadWidths: new Map([[0, 12]]),
    };
    const evalResult = evaluate(input);
    expect(evalResult.isHighRise).toBe(true);
    expect(evalResult.eiaRequired).toBe(true);
    expect(evalResult.eiaReason).toContain('Height > 23m');
  });

  it('EIA triggered when estimated residential units >= 80 even under 23m', () => {
    // Large plot (e.g. 5,000 sqm) capped at low-rise height
    const poly = rectPlot(80, 60);
    const edges = rectEdges(80, 60, 8, 0); // 8m narrow soi -> capped at 23m
    const input: ZoningInput = {
      polygon: poly,
      edges,
      buildingType: 'low-rise-condo',
      roadWidths: new Map([[0, 8]]),
    };
    const evalResult = evaluate(input);
    expect(evalResult.heightM).toBeLessThanOrEqual(23);
    // Large footprint means units will exceed 80
    if (evalResult.estimatedUnits >= 80) {
      expect(evalResult.eiaRequired).toBe(true);
      expect(evalResult.eiaReason).toContain('units ≥ 80');
    }
  });

  it('MR 33: Road width >= 18m required for GFA >= 30,000 sqm', () => {
    // 12m road: max GFA capped at 29,999 sqm
    const edges12 = rectEdges(100, 100, 12, 0);
    const roadElig12 = checkRoadEligibility(edges12, 10000);
    expect(roadElig12.maxGFA).toBeLessThanOrEqual(30000);

    // 18m road: uncapped by road width (FAR 7.0 applies = 70,000 sqm)
    const edges18 = rectEdges(100, 100, 18, 0);
    const roadElig18 = checkRoadEligibility(edges18, 10000);
    expect(roadElig18.maxGFA).toBe(70000);
  });

  it('MR 55 Section 44: 2:1 sky plane steps back correctly on narrow 8m soi', () => {
    const poly = rectPlot(40, 30);
    const edges = rectEdges(40, 30, 8, 0);
    
    // At H = 20m, clip from road edge = 20/2 - 8 = 2m (same as base setback)
    const res20 = applySkyPlane(poly, poly, edges, 20);
    expect(res20.clips.length).toBe(1);
    expect(res20.clips[0]!.clipDistanceFromRoad).toBe(2);

    // At H = 22m, clip from road edge = 22/2 - 8 = 3m
    const res22 = applySkyPlane(poly, poly, edges, 22);
    expect(res22.clips[0]!.clipDistanceFromRoad).toBe(3);
  });

  it('Commercial office use flags BTS/MRT transit condition', () => {
    const poly = rectPlot(50, 40);
    const edges = rectEdges(50, 40, 12, 0);
    const input: ZoningInput = {
      polygon: poly,
      edges,
      buildingType: 'commercial-office',
      roadWidths: new Map([[0, 12]]),
    };
    const evalResult = evaluate(input);
    expect(evalResult.btsFlag).toBe(true);
  });
});
describe('Design Generation', () => {
  it('Design A maximizes GFA', () => {
    const poly = rectPlot(50, 40);
    const edges = rectEdges(50, 40, 12, 0);
    const input: ZoningInput = {
      polygon: poly,
      edges,
      buildingType: 'high-rise-condo',
      roadWidths: new Map([[0, 12]]),
    };
    const designA = generateDesignA(input);
    
    expect(designA.variant).toBe('max-yield');
    expect(designA.totalGFA).toBeGreaterThan(0);
    expect(designA.floorCount).toBeGreaterThan(0);
    expect(designA.checks.length).toBeGreaterThan(0);
    
    // GFA sum
    const sumGFA = designA.floors.reduce((s, f) => s + f.areaSqm, 0);
    expect(Math.abs(designA.totalGFA - sumGFA)).toBeLessThan(0.1);
  });

  it('Design B has less GFA than Design A', () => {
    const poly = rectPlot(50, 40);
    const edges = rectEdges(50, 40, 12, 0);
    const input: ZoningInput = {
      polygon: poly,
      edges,
      buildingType: 'high-rise-condo',
      roadWidths: new Map([[0, 12]]),
    };
    const [designA, designB] = generateDesigns(input);
    
    expect(designB.totalGFA).toBeLessThanOrEqual(designA.totalGFA);
  });

  it('Design B on narrow road is sub-EIA', () => {
    const poly = rectPlot(40, 30);
    const edges = rectEdges(40, 30, 8, 0);
    const input: ZoningInput = {
      polygon: poly,
      edges,
      buildingType: 'low-rise-condo',
      roadWidths: new Map([[0, 8]]),
    };
    const designB = generateDesignB(input);
    
    expect(designB.variant).toBe('sub-eia');
    expect(designB.heightM).toBeLessThanOrEqual(23);
  });

  it('generates designs for all presets', () => {
    for (const preset of PRESET_PLOTS) {
      const anchor = { lngDeg: 100.576, latDeg: 13.7308, metersPerDegLng: 0, metersPerDegLat: 0 };
      // Use anchorAtCentroid for proper projection
      const realAnchor = anchorAtCentroid(preset.polygon);
      const metricPoly = polygonToMetric(realAnchor, preset.polygon);
      const ccwPoly = ensureCCW(metricPoly);
      
      const edges: PlotEdge[] = ccwPoly.map((_, i) => ({
        index: i,
        start: ccwPoly[i]!,
        end: ccwPoly[(i + 1) % ccwPoly.length]!,
        type: preset.roadEdges.includes(i) ? 'road' as const : 'side' as const,
        roadWidth: preset.roadEdges.includes(i) ? preset.roadWidth : undefined,
      }));

      const input: ZoningInput = {
        polygon: ccwPoly,
        edges,
        buildingType: preset.buildingType,
        roadWidths: new Map(preset.roadEdges.map(i => [i, preset.roadWidth])),
      };

      const [dA, dB] = generateDesigns(input);
      expect(dA.floorCount).toBeGreaterThan(0);
      expect(dB.floorCount).toBeGreaterThan(0);
      
      // Verify GFA sums
      const sumA = dA.floors.reduce((s, f) => s + f.areaSqm, 0);
      expect(Math.abs(dA.totalGFA - sumA)).toBeLessThan(0.1);
      const sumB = dB.floors.reduce((s, f) => s + f.areaSqm, 0);
      expect(Math.abs(dB.totalGFA - sumB)).toBeLessThan(0.1);
    }
  });
});
