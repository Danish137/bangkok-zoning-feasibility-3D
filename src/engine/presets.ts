// ─── Preset study plots ───
// Synthetic test parcels placed in the Sukhumvit inner-city area, which the 2013 plan
// designates largely as high-density residential. They are NOT surveyed title-deed (โฉนด) boundaries,
// their ย.9 status is not verified, and the road widths are scenario inputs rather than measured
// rights-of-way. They exist to exercise the rules on different plot shapes.

import type { PresetPlot } from './types';

export const PRESET_PLOTS: PresetPlot[] = [
  {
    id: 'l-shape-soi-8m',
    label: 'L-shape · 8 m soi',
    description: 'Concave L-shaped plot on a narrow soi: low-rise only (MR 33 needs a ≥ 10 m road)',
    polygon: [
      [100.5790, 13.7316],
      [100.5794, 13.7316],
      [100.5794, 13.7320],
      [100.5792, 13.7320],
      [100.5792, 13.7324],
      [100.5790, 13.7324],
    ],
    roadEdges: [{ edgeIndex: 0, widthM: 8 }],
    buildingType: 'low-rise-condo',
  },
  {
    id: 'trapezoid-12m',
    label: 'Trapezoid · 12 m road',
    description: 'Irregular trapezoid on a 12 m road: high-rise allowed, capped at 30,000 m²',
    polygon: [
      [100.5700, 13.7300],
      [100.5706, 13.7300],
      [100.5705, 13.7306],
      [100.5701, 13.7305],
    ],
    roadEdges: [{ edgeIndex: 0, widthM: 12 }],
    buildingType: 'high-rise-condo',
  },
  {
    id: 'corner-18m-12m',
    label: 'Corner · 18 m + 12 m roads',
    description: 'Corner plot on an 18 m main road and a 12 m soi; MR 55 Cl. 46 corner relief',
    polygon: [
      [100.5755, 13.7305],
      [100.5762, 13.7305],
      [100.5762, 13.7312],
      [100.5755, 13.7312],
    ],
    roadEdges: [
      { edgeIndex: 0, widthM: 18 },
      { edgeIndex: 1, widthM: 12 },
    ],
    buildingType: 'high-rise-condo',
  },
];

export function getPresetById(id: string): PresetPlot | undefined {
  return PRESET_PLOTS.find((p) => p.id === id);
}
