// ─── Preset Bangkok Plots (Zone Yor.9) ───
import type { PresetPlot, LngLatPolygon } from './types';

/** Preset 1: L-shaped plot on a narrow 8m Sukhumvit soi (Soi Thonglor area) */
const PRESET_L_SHAPE: PresetPlot = {
  id: 'l-shape-soi-8m',
  label: 'L-Shape on 8m Soi',
  description: 'L-shaped plot on a narrow 8m Sukhumvit soi near Thonglor',
  polygon: [
    [100.5790, 13.7320],  // NW corner
    [100.5794, 13.7320],  // NE corner (top part)
    [100.5794, 13.7316],  // step in
    [100.5792, 13.7316],  // inner corner
    [100.5792, 13.7312],  // SE corner
    [100.5790, 13.7312],  // SW corner
  ],
  roadEdges: [5],  // south edge faces the soi
  roadWidth: 8,
  buildingType: 'low-rise-condo',
};

/** Preset 2: Irregular trapezoid on a 12m road (Phrom Phong area) */
const PRESET_TRAPEZOID: PresetPlot = {
  id: 'trapezoid-12m',
  label: 'Trapezoid on 12m Road',
  description: 'Irregular trapezoid plot on a 12m road near Phrom Phong BTS',
  polygon: [
    [100.5700, 13.7300],  // SW
    [100.5706, 13.7300],  // SE
    [100.5705, 13.7306],  // NE (slightly inward)
    [100.5701, 13.7305],  // NW (slightly inward)
  ],
  roadEdges: [0],  // south edge faces the road
  roadWidth: 12,
  buildingType: 'high-rise-condo',
};

/** Preset 3: Large corner plot on 18m main road (Sukhumvit main road) */
const PRESET_CORNER: PresetPlot = {
  id: 'corner-18m',
  label: 'Corner Plot on 18m Road',
  description: 'Large corner plot at intersection of 18m Sukhumvit and 12m soi',
  polygon: [
    [100.5755, 13.7305],  // SW
    [100.5762, 13.7305],  // SE  
    [100.5762, 13.7312],  // NE
    [100.5755, 13.7312],  // NW
  ],
  roadEdges: [0, 1],  // south (18m) and east (12m) face roads
  roadWidth: 18,
  buildingType: 'high-rise-condo',
};

export const PRESET_PLOTS: PresetPlot[] = [
  PRESET_L_SHAPE,
  PRESET_TRAPEZOID,
  PRESET_CORNER,
];

export function getPresetById(id: string): PresetPlot | undefined {
  return PRESET_PLOTS.find((p) => p.id === id);
}
