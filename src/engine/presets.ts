// ─── Preset Bangkok Plots (Zone Yor.9) ───
// Note: Presets are synthetic architectural feasibility archetypes situated in Zone Yor.9
// for evaluating regulatory math (FAR, OSR, MR 33, MR 55).
// They are indicative spatial test parcels and do NOT represent legally surveyed
// cadastral boundaries (Chanote title deeds) or certified curb alignments from the Department of Lands or BMA.

import type { PresetPlot, LngLatPolygon } from './types';

/** Preset 1: L-shaped plot on a narrow 8m Sukhumvit soi (Synthetic scenario archetype near Thonglor 9) */
const PRESET_L_SHAPE: PresetPlot = {
  id: 'l-shape-soi-8m',
  label: 'L-Shape on 8m Soi',
  description: 'Synthetic L-shaped study plot on an 8m Sukhumvit soi (Thonglor area)',
  polygon: [
    [100.5790, 13.7316],  // SW corner fronting 8m soi
    [100.5794, 13.7316],  // SE corner fronting 8m soi
    [100.5794, 13.7320],  // East step
    [100.5792, 13.7320],  // Inner corner
    [100.5792, 13.7324],  // NE corner
    [100.5790, 13.7324],  // NW corner
  ],
  roadEdges: [0],  // Edge 0 (SW to SE) fronts the 8m soi
  roadWidth: 8,
  buildingType: 'low-rise-condo',
};

/** Preset 2: Irregular trapezoid on a 12m road (Synthetic scenario archetype near Phrom Phong) */
const PRESET_TRAPEZOID: PresetPlot = {
  id: 'trapezoid-12m',
  label: 'Trapezoid on 12m Road',
  description: 'Synthetic irregular trapezoid study plot on a 12m road near Phrom Phong',
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

/** Preset 3: Large corner plot on 18m main road (Synthetic scenario archetype at Sukhumvit intersection) */
const PRESET_CORNER: PresetPlot = {
  id: 'corner-18m',
  label: 'Corner Plot on 18m Road',
  description: 'Synthetic corner study plot at intersection of 18m main road and 12m soi',
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
