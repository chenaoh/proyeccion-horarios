import { DEFAULT_NO_NOCHE, DEFAULT_NO_SABADO, inNameList, normName } from "./names";
import type { ExtraRules, FichaInput, OccupiedRange } from "./types";

export function fichaHasSaturday(ficha: FichaInput): boolean {
  return ficha.saturday;
}

export function activeInstructors(fichas: FichaInput[]): string[] {
  const names = new Set<string>();
  for (const ficha of fichas) {
    for (const name of Object.keys(ficha.hours)) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b, "es"));
}

export function hoursOf(ficha: FichaInput): number {
  return Object.values(ficha.hours).reduce((a, b) => a + b, 0);
}

export function occupiedOf(extra: ExtraRules, name: string): OccupiedRange[] {
  return extra.occupied[name] ?? [];
}

export function maxSaturdayOf(extra: ExtraRules, name: string): number {
  return extra.maxSaturdayHours[name] ?? 6;
}

export const DAILY_HOUR_CAP = 11;

export function allowsSixHours(extra: ExtraRules, instructorName: string): boolean {
  return Boolean(extra.allowSixHourBlocks[instructorName]);
}

export function normalizeExtraRules(extra: ExtraRules, instructorNames: string[], fichas: FichaInput[]): ExtraRules {
  const fichaNames = new Set(fichas.map((ficha) => normName(ficha.name)));
  const instructorSet = new Set(instructorNames.map((name) => normName(name)));
  const allowSixHourBlocks: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(extra.allowSixHourBlocks ?? {})) {
    if (fichaNames.has(normName(key)) && !instructorSet.has(normName(key))) continue;
    allowSixHourBlocks[key] = Boolean(value);
  }
  for (const name of instructorNames) {
    if (!(name in allowSixHourBlocks)) allowSixHourBlocks[name] = false;
  }
  const occupied = { ...extra.occupied };
  const maxSaturdayHours = { ...extra.maxSaturdayHours };
  for (const name of instructorNames) {
    if (!occupied[name]) occupied[name] = [];
    if (maxSaturdayHours[name] == null) maxSaturdayHours[name] = 6;
  }
  return {
    ...extra,
    occupied,
    maxSaturdayHours,
    allowSixHourBlocks,
  };
}

export function scheduleFeasibilityIssues(fichas: FichaInput[], extra: ExtraRules): string[] {
  const issues: string[] = [];
  for (const ficha of fichas) {
    const total = hoursOf(ficha);
    if (!total) continue;
    if (ficha.jornada === "NOCHE") {
      for (const [name, hours] of Object.entries(ficha.hours)) {
        if (![2, 4, 6, 8].includes(hours)) {
          issues.push(`${ficha.name}: ${name} tiene ${hours} h (en noche se esperan 2, 4, 6 u 8).`);
        }
      }
      continue;
    }
    for (const [name, hours] of Object.entries(ficha.hours)) {
      if (hours % 3 !== 0) {
        issues.push(`${ficha.name}: ${name} tiene ${hours} h (en mañana/tarde debe ser múltiplo de 3).`);
      }
      if (hours > 15 && !allowsSixHours(extra, name)) {
        issues.push(
          `${ficha.name}: ${name} tiene ${hours} h en esa ficha. Sin 6 h seguidas en la misma ficha el máximo es 15 h. Márcalo solo para ese instructor.`,
        );
      }
    }
  }
  return issues;
}

export function buildDefaultRules(instructorNames: string[], _fichas: FichaInput[]): ExtraRules {
  const occupied: Record<string, OccupiedRange[]> = {};
  const maxSaturdayHours: Record<string, number> = {};
  const allowSixHourBlocks: Record<string, boolean> = {};
  for (const name of instructorNames) {
    occupied[name] = [];
    maxSaturdayHours[name] = 6;
    allowSixHourBlocks[name] = false;
  }
  return {
    occupied,
    noNoche: DEFAULT_NO_NOCHE.filter((n) => inNameList(n, instructorNames)),
    noSabado: DEFAULT_NO_SABADO.filter((n) => inNameList(n, instructorNames)),
    maxSaturdayHours,
    allowSixHourBlocks,
  };
}
