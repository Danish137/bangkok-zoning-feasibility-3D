// ─── Parking: BMA Building Control Ordinance B.E. 2544 Cl. 83–88 and MR 7 Cl. 3(1) ───
// Required spaces by use (Cl. 84), large-building rule (Cl. 84(16)), "greater of" + round-up (Cl. 85),
// bay and aisle geometry (Cl. 86, 88). Pure functions.

import type { BuildingType, FloorResult } from './types';
import { BUILDING_TYPES } from './types';
import { BMA2544, NET_TO_GROSS_RESIDENTIAL, PARKING } from './regulations';
import { minimumWidth } from './polygon';
import { fmt } from './rules';

export interface ParkingDemandInput {
  buildingType: BuildingType;
  residentialSqm: number;
  commercialSqm: number;
  /** All storeys incl. parking & basements (Cl. 84(16) base, literal reading) */
  totalBuildingSqm: number;
  heightM: number;
  avgUnitSizeSqm: number;
}

export interface ParkingDemand {
  spaces: number;
  units: number;
  isLargeBuilding: boolean;
  basis: string[];
}

export function unitsFor(residentialSqm: number, avgUnitSizeSqm: number): number {
  return Math.floor((residentialSqm * NET_TO_GROSS_RESIDENTIAL) / avgUnitSizeSqm);
}

export function isLargeBuilding(totalSqm: number, heightM: number): boolean {
  return totalSqm > BMA2544.largeBuildingAreaSqm || (heightM >= BMA2544.largeBuildingHeightM && totalSqm > BMA2544.largeBuildingAreaIfTallSqm);
}

/** Required spaces for given areas (greater of use-based sum and large-building rate) */
export function parkingDemand(i: ParkingDemandInput): ParkingDemand {
  const cfg = BUILDING_TYPES[i.buildingType];
  const basis: string[] = [];
  const units = cfg.use === 'office' ? 0 : unitsFor(i.residentialSqm, i.avgUnitSizeSqm);
  let byUse = 0;
  if (cfg.use !== 'office' && i.residentialSqm > 0) {
    if (i.avgUnitSizeSqm >= PARKING.condoUnitThresholdSqm) {
      byUse += units * PARKING.spacesPerCondoUnit;
      basis.push(`Condominium, units ≥ 60 m² (Cl. 83(3), 84(3)): 1 × ${units} units = ${units}`);
    } else {
      basis.push(`Condominium, average unit ${fmt(i.avgUnitSizeSqm, 0)} m² < 60 m²: no per-unit requirement under Cl. 83(3)`);
    }
  }
  if (cfg.use === 'office' && i.commercialSqm >= PARKING.useThresholdSqm) {
    const n = Math.ceil(i.commercialSqm / PARKING.officeSqmPerSpace);
    byUse += n;
    basis.push(`Office (Cl. 84(6)): ${fmt(i.commercialSqm, 0)} m² ÷ 60 = ${n}`);
  }
  if (cfg.use === 'mixed' && i.commercialSqm >= PARKING.useThresholdSqm) {
    const n = Math.ceil(i.commercialSqm / PARKING.commercialSqmPerSpace);
    byUse += n;
    basis.push(`Retail / commercial (Cl. 84(18)): ${fmt(i.commercialSqm, 0)} m² ÷ 60 = ${n}`);
  }
  const large = isLargeBuilding(i.totalBuildingSqm, i.heightM);
  let spaces = byUse;
  if (large) {
    const n = Math.ceil(i.totalBuildingSqm / PARKING.largeBuildingSqmPerSpace);
    basis.push(`Large building (Cl. 84(16), MR 7 Cl. 3(1)(ซ)): ${fmt(i.totalBuildingSqm, 0)} m² ÷ 120 = ${n}`);
    if (n > byUse) spaces = n;
    basis.push(`Cl. 85: the greater of ${byUse} (by use) and ${n} (large building) → ${spaces}`);
  } else {
    basis.push(`Not a large building (≤ 2,000 m², or < 15 m / ≤ 1,000 m²): total ${byUse}`);
  }
  return { spaces, units, isLargeBuilding: large, basis };
}

/** Spaces a storey can hold, from its floor plate (ramped parking, Cl. 86 + Cl. 88 geometry) */
export function storeyCapacity(floor: Pick<FloorResult, 'polygon' | 'areaSqm'>): { spaces: number; mode: 'double' | 'single' | 'none' } {
  const w = minimumWidth(floor.polygon);
  if (w >= PARKING.minWidthDoubleLoadedM) return { spaces: Math.floor(floor.areaSqm / PARKING.grossSqmPerSpace), mode: 'double' };
  if (w >= PARKING.minWidthSingleLoadedM) return { spaces: Math.floor(floor.areaSqm / PARKING.singleLoadedGrossSqmPerSpace), mode: 'single' };
  return { spaces: 0, mode: 'none' };
}

/**
 * Podium allocation: turn the lowest non-retail storeys into parking until provided ≥ required.
 * Required depends on the remaining residential/commercial area, so the loop recomputes it each time.
 * Returns new floors (uses updated) and the demand. Total floor area is unchanged.
 */
export function allocatePodiumParking(
  floors: FloorResult[], buildingType: BuildingType, avgUnitSizeSqm: number, extraTotalSqm = 0,
): { floors: FloorResult[]; demand: ParkingDemand; provided: number; parkingSqm: number; warnings: string[] } {
  const total = floors.reduce((s, f) => s + f.areaSqm, 0) + extraTotalSqm;
  const heightM = floors.length ? floors[floors.length - 1]!.topM : 0;
  const cfg = BUILDING_TYPES[buildingType];
  const eligible = floors.filter((f) => f.use !== 'commercial' || cfg.use === 'office').map((f) => f.index);
  const warnings: string[] = [];
  const areasFor = (parkingSet: Set<number>) => {
    let res = 0, com = 0;
    for (const f of floors) {
      if (parkingSet.has(f.index)) continue;
      if (f.use === 'commercial') com += f.areaSqm; else res += f.areaSqm;
    }
    if (cfg.use === 'office') { com += res; res = 0; }
    return { res, com };
  };
  const parkingSet = new Set<number>();
  let provided = 0;
  let demand = parkingDemand({ buildingType, residentialSqm: areasFor(parkingSet).res, commercialSqm: areasFor(parkingSet).com, totalBuildingSqm: total, heightM, avgUnitSizeSqm });
  for (const idx of eligible) {
    if (provided >= demand.spaces) break;
    const f = floors.find((x) => x.index === idx)!;
    const cap = storeyCapacity(f);
    if (cap.mode === 'none') { warnings.push(`L${idx + 1} is too narrow (< ${PARKING.minWidthSingleLoadedM} m) for ramped parking; mechanical parking would be needed.`); continue; }
    parkingSet.add(idx);
    provided += cap.spaces;
    const a = areasFor(parkingSet);
    demand = parkingDemand({ buildingType, residentialSqm: a.res, commercialSqm: a.com, totalBuildingSqm: total, heightM, avgUnitSizeSqm });
  }
  let parkingSqm = 0;
  const out = floors.map((f) => {
    if (!parkingSet.has(f.index)) return f;
    parkingSqm += f.areaSqm;
    return { ...f, use: 'parking' as const, parkingSpaces: storeyCapacity(f).spaces };
  });
  return { floors: out, demand, provided, parkingSqm, warnings };
}
