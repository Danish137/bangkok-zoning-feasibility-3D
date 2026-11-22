// ─── Preset study plots ───
// Synthetic test parcels drawn against real OpenStreetMap streets inside a ย.9 area of the 2013 plan
// (the zone north of Sukhumvit around Thong Lo / Ekkamai), each ≥ 140 m from the zone boundary on the
// BMA GIS layer. They are NOT surveyed title-deed (โฉนด) boundaries. Road widths and access-route widths
// are the tool's own map estimates (source 'map-estimate'), not surveyed road reserves.
// (The previous presets, labelled "Yor.9 Sukhumvit", actually lie in ย.10 on the BMA layer.)

import type { PresetPlot } from './types';

export const PRESET_PLOTS: PresetPlot[] = [
  {
    id: 'thonglor-soi-l',
    label: 'L-shape · Thong Lo side soi',
    description: 'Concave L-plot on a soi (≈ 10 m est.); the route out narrows to ≈ 8 m, so MR 33 high-rise is refused',
    polygon: [
      [100.583659, 13.738348], [100.583263, 13.738441], [100.583212, 13.738237],
      [100.58341, 13.73819], [100.583347, 13.73794], [100.583545, 13.737894],
    ],
    roadEdges: [{ edgeIndex: 0, widthM: 10, source: 'map-estimate', accessMinWidthM: 8, accessSource: 'map-estimate' }],
    buildingType: 'low-rise-condo',
  },
  {
    id: 'thonglor-trapezoid',
    label: 'Trapezoid · Thong Lo road',
    description: 'Irregular trapezoid on a ≈ 15 m road (est.): high-rise allowed, capped at 30,000 m² below an 18 m road',
    polygon: [[100.583038, 13.73496], [100.58288, 13.734518], [100.583317, 13.734428], [100.583416, 13.734785]],
    roadEdges: [{ edgeIndex: 0, widthM: 15, source: 'map-estimate', accessMinWidthM: 15, accessSource: 'map-estimate' }],
    buildingType: 'high-rise-condo',
  },
  {
    id: 'ekkamai-corner',
    label: 'Corner · Ekkamai road + lane',
    description: 'Corner plot on a ≈ 20 m road and a ≈ 7 m lane (est.): two frontages, MR 55 Cl. 46 corner rule',
    polygon: [[100.589817, 13.74061], [100.589645, 13.740117], [100.5901, 13.739967], [100.590272, 13.740461]],
    roadEdges: [
      { edgeIndex: 0, widthM: 20, source: 'map-estimate', accessMinWidthM: 20, accessSource: 'map-estimate' },
      { edgeIndex: 1, widthM: 7, source: 'map-estimate', accessMinWidthM: 5, accessSource: 'map-estimate' },
    ],
    buildingType: 'high-rise-condo',
  },
];

export function getPresetById(id: string): PresetPlot | undefined {
  return PRESET_PLOTS.find((p) => p.id === id);
}
