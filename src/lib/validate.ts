import { inNameList, isRoleInstructor } from "./names";
import { allowsSixHours, DAILY_HOUR_CAP, hoursOf, maxSaturdayOf, occupiedOf } from "./rules";
import { overlap, parseSlotKey, slotsForFicha } from "./slots";
import type { ExtraRules, Issue, ParsedWorkbook, Schedule } from "./types";

export function validateSchedule(
  parsed: ParsedWorkbook,
  schedule: Schedule,
  extra: ExtraRules,
): Issue[] {
  const issues: Issue[] = [];
  const grid = schedule.grid;

  for (const ficha of parsed.fichas) {
    if (hoursOf(ficha) <= 0) continue;
    const slots = slotsForFicha(ficha.jornada, !ficha.saturday);
    const assigned = grid[ficha.name] ?? {};
    const counts: Record<string, number> = {};
    const dayHours: Record<string, Record<string, number>> = {};

    for (const slot of slots) {
      const key = `${slot.day}|${slot.label}|${slot.start}|${slot.end}`;
      const who = assigned[key];
      if (!who) {
        issues.push({
          severity: "error",
          message: `${ficha.name}: falta instructor en ${slot.day} ${slot.label}.`,
        });
        continue;
      }
      counts[who] = (counts[who] ?? 0) + slot.hours;
      if (!dayHours[who]) dayHours[who] = {};
      dayHours[who][slot.day] = (dayHours[who][slot.day] ?? 0) + slot.hours;
    }

    for (const [name, h] of Object.entries(ficha.hours)) {
      const got = counts[name] ?? 0;
      if (got !== h) {
        issues.push({
          severity: "error",
          message: `${ficha.name}: ${name} tiene ${got} h programadas y ${h} h en la matriz.`,
        });
      }
    }
    for (const [name, days] of Object.entries(dayHours)) {
      if (ficha.jornada === "NOCHE") continue;
      for (const [day, h] of Object.entries(days)) {
        if (allowsSixHours(extra, name)) {
          if (h > 6) {
            issues.push({
              severity: "error",
              message: `${ficha.name}: ${name} queda con ${h} h el ${day} (máximo 6 h seguidas).`,
            });
          }
        } else if (h >= 6) {
          issues.push({
            severity: "error",
            message: `${ficha.name}: ${name} queda con ${h} h el ${day} (este instructor no admite 6 h seguidas).`,
          });
        }
      }
    }
  }

  const busy: Record<string, { start: number; end: number; day: string; ficha: string }[]> = {};
  const ambBusy: Record<string, { start: number; end: number; day: string; ficha: string }[]> = {};
  const daily: Record<string, Record<string, number>> = {};

  for (const ficha of parsed.fichas) {
    const assigned = grid[ficha.name] ?? {};
    for (const [key, name] of Object.entries(assigned)) {
      const slot = parseSlotKey(key);
      if (slot.day === "sab" && inNameList(name, extra.noSabado)) {
        issues.push({ severity: "error", message: `${name} no puede programarse el sábado (${ficha.name}).` });
      }
      if (slot.day !== "sab" && slot.start >= 18 && inNameList(name, extra.noNoche)) {
        issues.push({
          severity: "error",
          message: `${name} no puede programarse de noche entre semana (${ficha.name}).`,
        });
      }
      const occ = occupiedOf(extra, name);
      if (occ.some((o) => o.day === slot.day && overlap(slot.start, slot.end, o.start, o.end))) {
        issues.push({
          severity: "error",
          message: `${name} está ocupado el ${slot.day} ${slot.start}:00-${slot.end}:00 (${ficha.name}).`,
        });
      }
      if (!busy[name]) busy[name] = [];
      const clash = busy[name].find(
        (b) => b.day === slot.day && overlap(slot.start, slot.end, b.start, b.end),
      );
      if (clash && !isRoleInstructor(name)) {
        issues.push({
          severity: "error",
          message: `Cruce de ${name}: ${ficha.name} y ${clash.ficha} el ${slot.day} ${slot.start}:00-${slot.end}:00.`,
        });
      }
      busy[name].push({ start: slot.start, end: slot.end, day: slot.day, ficha: ficha.name });
      if (ficha.ambiente) {
        if (!ambBusy[ficha.ambiente]) ambBusy[ficha.ambiente] = [];
        const ambClash = ambBusy[ficha.ambiente].find(
          (b) => b.day === slot.day && overlap(slot.start, slot.end, b.start, b.end),
        );
        if (ambClash) {
          issues.push({
            severity: "error",
            message: `Cruce de ambiente ${ficha.ambiente}: ${ficha.name} y ${ambClash.ficha} el ${slot.day} ${slot.start}:00-${slot.end}:00.`,
          });
        }
        ambBusy[ficha.ambiente].push({
          start: slot.start,
          end: slot.end,
          day: slot.day,
          ficha: ficha.name,
        });
      }
      if (!daily[name]) daily[name] = {};
      daily[name][slot.day] = (daily[name][slot.day] ?? 0) + slot.hours;
    }
  }

  for (const [name, days] of Object.entries(daily)) {
    for (const [day, h] of Object.entries(days)) {
      if (h > DAILY_HOUR_CAP) {
        issues.push({
          severity: "error",
          message: `${name} suma ${h} h el ${day} (máximo ${DAILY_HOUR_CAP} h en el día, en todas las jornadas).`,
        });
      }
      if (day === "sab" && h > maxSaturdayOf(extra, name)) {
        issues.push({
          severity: "error",
          message: `${name} suma ${h} h el sábado (tope ${maxSaturdayOf(extra, name)} h).`,
        });
      }
    }
  }

  const seen = new Set<string>();
  return issues.filter((i) => {
    if (seen.has(i.message)) return false;
    seen.add(i.message);
    return true;
  });
}

export function swapSlots(
  grid: Schedule["grid"],
  ficha: string,
  keyA: string,
  keyB: string,
): Schedule["grid"] {
  const next = { ...grid, [ficha]: { ...grid[ficha] } };
  const a = next[ficha][keyA];
  const b = next[ficha][keyB];
  next[ficha][keyA] = b;
  next[ficha][keyB] = a;
  return next;
}

export type SwapTarget = "ok" | "blocked";

export function previewSwapTargets(
  parsed: ParsedWorkbook,
  schedule: Schedule,
  extra: ExtraRules,
  fichaName: string,
  fromKey: string,
): Record<string, SwapTarget> {
  const ficha = parsed.fichas.find((item) => item.name === fichaName);
  if (!ficha) return {};
  const from = parseSlotKey(fromKey);
  const slots = slotsForFicha(ficha.jornada, !ficha.saturday);
  const out: Record<string, SwapTarget> = {};
  for (const slot of slots) {
    const key = `${slot.day}|${slot.label}|${slot.start}|${slot.end}`;
    if (key === fromKey) continue;
    if (slot.hours !== from.hours) {
      out[key] = "blocked";
      continue;
    }
    const next: Schedule = {
      ...schedule,
      grid: swapSlots(schedule.grid, fichaName, fromKey, key),
    };
    out[key] = validateSchedule(parsed, next, extra).length ? "blocked" : "ok";
  }
  return out;
}
