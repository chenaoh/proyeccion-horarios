import { inNameList } from "./names";
import {
  allowsSixHours,
  DAILY_HOUR_CAP,
  hoursOf,
  isNightInstructorHours,
  maxSaturdayOf,
  occupiedOf,
  scheduleFeasibilityIssues,
} from "./rules";
import { MANANA, NOCHE, SABADO, TARDE, WEEKDAYS, overlap, slotKey } from "./slots";
import type { Day, ExtraRules, FichaInput, OccupiedRange, ParsedWorkbook, Schedule, Slot } from "./types";

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function assignSaturdayBlocks(
  st: State,
  ficha: FichaInput,
  extra: ExtraRules,
  blocks: { name: string; hours: 2 | 4 }[],
): boolean {
  const total = blocks.reduce((sum, block) => sum + block.hours, 0);
  if (total !== SABADO.reduce((sum, slot) => sum + slot.hours, 0)) return false;

  function dfs(index: number, remaining: { name: string; hours: 2 | 4 }[]): boolean {
    if (index === SABADO.length) return remaining.length === 0;
    const slot = SABADO[index];
    const ordered = shuffle(remaining);
    for (let i = 0; i < ordered.length; i++) {
      const block = ordered[i];
      const rest = ordered.filter((_, j) => j !== i);
      if (block.hours === 2) {
        if (!st.can(block.name, slot, ficha, extra)) continue;
        st.put(block.name, slot, ficha);
        if (dfs(index + 1, rest)) return true;
        st.pop(block.name, slot, ficha);
        continue;
      }
      if (index + 1 >= SABADO.length) continue;
      const next = SABADO[index + 1];
      if (!st.can(block.name, slot, ficha, extra)) continue;
      st.put(block.name, slot, ficha);
      if (!st.can(block.name, next, ficha, extra)) {
        st.pop(block.name, slot, ficha);
        continue;
      }
      st.put(block.name, next, ficha);
      if (dfs(index + 2, rest)) return true;
      st.pop(block.name, slot, ficha);
      st.pop(block.name, next, ficha);
    }
    return false;
  }

  return dfs(0, blocks);
}

function slotBlocked(name: string, slot: Slot, occupied: OccupiedRange[], extra: ExtraRules): boolean {
  if (slot.day === "sab" && inNameList(name, extra.noSabado)) return true;
  if (slot.day !== "sab" && slot.start >= 18 && inNameList(name, extra.noNoche)) return true;
  return occupied.some((o) => o.day === slot.day && overlap(slot.start, slot.end, o.start, o.end));
}

type Interval = { a: number; b: number; ficha: string };
type Busy = Record<string, Record<Day, Interval[]>>;
type HoursDay = Record<string, Record<Day, number>>;
type FichaDay = Record<string, Record<string, Record<Day, number>>>;

function emptyDayMap(): Record<Day, number> {
  return { lun: 0, mar: 0, mie: 0, jue: 0, vie: 0, sab: 0 };
}

function emptyBusy(): Record<Day, Interval[]> {
  return { lun: [], mar: [], mie: [], jue: [], vie: [], sab: [] };
}

class State {
  hours: HoursDay = {};
  busy: Busy = {};
  ambBusy: Busy = {};
  grid: Record<string, Record<string, string>> = {};
  fichaDay: FichaDay = {};

  ensure(name: string) {
    if (!this.hours[name]) this.hours[name] = emptyDayMap();
    if (!this.busy[name]) this.busy[name] = emptyBusy();
  }

  can(name: string, slot: Slot, ficha: FichaInput, extra: ExtraRules, maxh = DAILY_HOUR_CAP): boolean {
    this.ensure(name);
    const occupied = occupiedOf(extra, name);
    if (slotBlocked(name, slot, occupied, extra)) return false;
    if (this.hours[name][slot.day] + slot.hours > maxh) return false;
    if (slot.day === "sab" && this.hours[name].sab + slot.hours > maxSaturdayOf(extra, name)) {
      return false;
    }
    const already = this.fichaDay[ficha.name]?.[name]?.[slot.day] ?? 0;
    const next = already + slot.hours;
    if (ficha.jornada !== "NOCHE") {
      if (allowsSixHours(extra, name)) {
        if (next > 6) return false;
      } else if (next >= 6) {
        return false;
      }
    }
    if (this.busy[name][slot.day].some((b) => overlap(slot.start, slot.end, b.a, b.b))) return false;
    if (ficha.ambiente) {
      const amb = this.ambBusy[ficha.ambiente]?.[slot.day] ?? [];
      if (amb.some((b) => overlap(slot.start, slot.end, b.a, b.b))) return false;
    }
    return true;
  }

  put(name: string, slot: Slot, ficha: FichaInput) {
    this.ensure(name);
    this.hours[name][slot.day] += slot.hours;
    this.busy[name][slot.day].push({ a: slot.start, b: slot.end, ficha: ficha.name });
    if (!this.grid[ficha.name]) this.grid[ficha.name] = {};
    this.grid[ficha.name][slotKey(slot)] = name;
    if (!this.fichaDay[ficha.name]) this.fichaDay[ficha.name] = {};
    if (!this.fichaDay[ficha.name][name]) this.fichaDay[ficha.name][name] = emptyDayMap();
    this.fichaDay[ficha.name][name][slot.day] += slot.hours;
    if (ficha.ambiente) {
      if (!this.ambBusy[ficha.ambiente]) this.ambBusy[ficha.ambiente] = emptyBusy();
      this.ambBusy[ficha.ambiente][slot.day].push({ a: slot.start, b: slot.end, ficha: ficha.name });
    }
  }

  pop(name: string, slot: Slot, ficha: FichaInput) {
    this.hours[name][slot.day] -= slot.hours;
    this.busy[name][slot.day] = this.busy[name][slot.day].filter(
      (b) => !(b.a === slot.start && b.b === slot.end && b.ficha === ficha.name),
    );
    delete this.grid[ficha.name][slotKey(slot)];
    this.fichaDay[ficha.name][name][slot.day] -= slot.hours;
    if (ficha.ambiente && this.ambBusy[ficha.ambiente]) {
      this.ambBusy[ficha.ambiente][slot.day] = this.ambBusy[ficha.ambiente][slot.day].filter(
        (b) => !(b.a === slot.start && b.b === slot.end && b.ficha === ficha.name),
      );
    }
  }
}

type NightShape = {
  wd4: number;
  wd2: number;
  sat4: number;
  sat2: number;
};

type NightPack = {
  wd4: string[];
  wd2: string[];
  sat4: string[];
  sat2: string[];
  score: number;
};

type NightBlock = { name: string; hours: 2 | 4 };

function shapesFor(name: string, hours: number, noSat: boolean, extra: ExtraRules): NightShape[] {
  const noN = inNameList(name, extra.noNoche);
  const noS = noSat || inNameList(name, extra.noSabado);
  const candidates: NightShape[] = [];
  if (isNightInstructorHours(hours)) {
    for (let wd4 = 0; wd4 <= 5; wd4++) {
      for (let wd2 = 0; wd2 <= 6; wd2++) {
        for (let sat4 = 0; sat4 <= 2; sat4++) {
          for (let sat2 = 0; sat2 <= 3; sat2++) {
            const wdH = 4 * wd4 + 2 * wd2;
            const satH = 4 * sat4 + 2 * sat2;
            if (wdH > 20 || satH > 10 || wdH + satH !== hours) continue;
            candidates.push({ wd4, wd2, sat4, sat2 });
          }
        }
      }
    }
  }
  if (!candidates.length) {
    throw new Error(`${name} tiene ${hours} h en una ficha de noche (se esperaban de 2 a 12 h, en bloques de 2).`);
  }
  return candidates
    .filter((shape) => {
      if (noN && shape.wd4 + shape.wd2 > 0) return false;
      if (noS && shape.sat4 + shape.sat2 > 0) return false;
      return 4 * shape.wd4 + 2 * shape.wd2 + 4 * shape.sat4 + 2 * shape.sat2 === hours;
    })
    .sort((a, b) => b.wd4 * 10 - b.wd2 - (a.wd4 * 10 - a.wd2))
    .slice(0, 10);
}

function pushNamed(list: string[], name: string, count: number) {
  for (let i = 0; i < count; i++) list.push(name);
}

function nightPacks(hours: Record<string, number>, noSat: boolean, extra: ExtraRules): NightPack[] {
  const people = Object.entries(hours);
  const packs: NightPack[] = [];
  const satNeed = noSat ? 0 : 10;

  function rec(index: number, wd4: string[], wd2: string[], sat4: string[], sat2: string[]) {
    if (index === people.length) {
      const wdH = 4 * wd4.length + 2 * wd2.length;
      const satH = 4 * sat4.length + 2 * sat2.length;
      if (wdH === 20 && satH === satNeed) {
        packs.push({
          wd4,
          wd2,
          sat4,
          sat2,
          score: wd4.length * 10 - wd2.length,
        });
      }
      return;
    }
    const [name, h] = people[index];
    const options = shapesFor(name, h, noSat, extra);
    if (!options.length) return;
    for (const shape of options) {
      const nextWd4 = [...wd4];
      const nextWd2 = [...wd2];
      const nextSat4 = [...sat4];
      const nextSat2 = [...sat2];
      pushNamed(nextWd4, name, shape.wd4);
      pushNamed(nextWd2, name, shape.wd2);
      pushNamed(nextSat4, name, shape.sat4);
      pushNamed(nextSat2, name, shape.sat2);
      const wdH = 4 * nextWd4.length + 2 * nextWd2.length;
      const satH = 4 * nextSat4.length + 2 * nextSat2.length;
      if (wdH > 20 || satH > satNeed) continue;
      rec(index + 1, nextWd4, nextWd2, nextSat4, nextSat2);
    }
  }

  rec(0, [], [], [], []);
  packs.sort((a, b) => b.score - a.score);
  if (!packs.length) return [];
  const best = packs[0].score;
  const preferred = packs.filter((pack) => pack.score === best);
  const fallback = packs.filter((pack) => pack.score < best);
  return [...shuffle(preferred), ...shuffle(fallback).slice(0, 24)];
}

function nightPair(day: Day): [Slot, Slot] {
  const first = NOCHE.find((slot) => slot.day === day && slot.start === 18);
  const second = NOCHE.find((slot) => slot.day === day && slot.start === 20);
  if (!first || !second) throw new Error(`No hay franjas de noche para ${day}.`);
  return [first, second];
}

function assignWeeknightBlocks(
  st: State,
  ficha: FichaInput,
  extra: ExtraRules,
  blocks: NightBlock[],
): boolean {
  const total = blocks.reduce((sum, block) => sum + block.hours, 0);
  if (total !== 20) return false;
  const days = shuffle(WEEKDAYS);

  function dfs(dayIndex: number, remaining: NightBlock[]): boolean {
    if (dayIndex === days.length) return remaining.length === 0;
    const [slotA, slotB] = nightPair(days[dayIndex]);
    const fours = remaining
      .map((block, index) => ({ block, index }))
      .filter((item) => item.block.hours === 4);
    for (const item of shuffle(fours)) {
      if (!st.can(item.block.name, slotA, ficha, extra)) continue;
      st.put(item.block.name, slotA, ficha);
      if (!st.can(item.block.name, slotB, ficha, extra)) {
        st.pop(item.block.name, slotA, ficha);
        continue;
      }
      st.put(item.block.name, slotB, ficha);
      if (dfs(dayIndex + 1, remaining.filter((_, i) => i !== item.index))) return true;
      st.pop(item.block.name, slotA, ficha);
      st.pop(item.block.name, slotB, ficha);
    }
    const twos = remaining
      .map((block, index) => ({ block, index }))
      .filter((item) => item.block.hours === 2);
    for (let i = 0; i < twos.length; i++) {
      for (let j = 0; j < twos.length; j++) {
        if (i === j) continue;
        const left = twos[i];
        const right = twos[j];
        if (!st.can(left.block.name, slotA, ficha, extra)) continue;
        st.put(left.block.name, slotA, ficha);
        if (!st.can(right.block.name, slotB, ficha, extra)) {
          st.pop(left.block.name, slotA, ficha);
          continue;
        }
        st.put(right.block.name, slotB, ficha);
        const used = new Set([left.index, right.index]);
        if (dfs(dayIndex + 1, remaining.filter((_, idx) => !used.has(idx)))) return true;
        st.pop(left.block.name, slotA, ficha);
        st.pop(right.block.name, slotB, ficha);
      }
    }
    return false;
  }

  return dfs(0, blocks);
}

function popAssignedNightWeekdays(st: State, ficha: FichaInput) {
  for (const slot of NOCHE) {
    const name = st.grid[ficha.name]?.[slotKey(slot)];
    if (name) st.pop(name, slot, ficha);
  }
}

function tryAssignList(st: State, ficha: FichaInput, slots: Slot[], names: string[], extra: ExtraRules): boolean {
  const order = shuffle(slots.map((_, i) => i));
  function candidates(slot: Slot, remaining: string[]): string[] {
    const shuffled = shuffle(remaining);
    const continuing: string[] = [];
    const rest: string[] = [];
    for (const name of shuffled) {
      if (allowsSixHours(extra, name) && (st.fichaDay[ficha.name]?.[name]?.[slot.day] ?? 0) > 0) {
        continuing.push(name);
      } else {
        rest.push(name);
      }
    }
    return [...continuing, ...rest];
  }
  function dfs(k: number, remaining: string[]): boolean {
    if (k === order.length) return true;
    const slot = slots[order[k]];
    const ordered = candidates(slot, remaining);
    for (let i = 0; i < ordered.length; i++) {
      const name = ordered[i];
      if (st.can(name, slot, ficha, extra)) {
        st.put(name, slot, ficha);
        if (dfs(k + 1, ordered.filter((_, j) => j !== i))) return true;
        st.pop(name, slot, ficha);
      }
    }
    return false;
  }
  return dfs(0, names);
}

function assignNight(st: State, ficha: FichaInput, extra: ExtraRules): boolean {
  const noSat = !ficha.saturday;
  const packs = nightPacks(ficha.hours, noSat, extra);
  for (const pack of packs) {
    const weekdayBlocks: NightBlock[] = [
      ...pack.wd4.map((name) => ({ name, hours: 4 as const })),
      ...pack.wd2.map((name) => ({ name, hours: 2 as const })),
    ];
    if (!assignWeeknightBlocks(st, ficha, extra, weekdayBlocks)) continue;
    if (noSat) return true;
    const saturdayBlocks: NightBlock[] = [
      ...pack.sat4.map((name) => ({ name, hours: 4 as const })),
      ...pack.sat2.map((name) => ({ name, hours: 2 as const })),
    ];
    if (assignSaturdayBlocks(st, ficha, extra, saturdayBlocks)) return true;
    popAssignedNightWeekdays(st, ficha);
  }
  return false;
}

function assignDay(st: State, ficha: FichaInput, slots: Slot[], extra: ExtraRules): boolean {
  const names: string[] = [];
  for (const [name, h] of Object.entries(ficha.hours)) {
    if (h % 3 !== 0) throw new Error(`${ficha.name}: ${name} tiene ${h} h (debe ser múltiplo de 3).`);
    for (let i = 0; i < h / 3; i++) names.push(name);
  }
  return tryAssignList(st, ficha, slots, names, extra);
}

export type SolveResult =
  | { ok: true; schedule: Schedule }
  | { ok: false; failedFicha?: string; message: string };

export type SolveProgress = {
  attempt: number;
  attempts: number;
};

type AttemptResult =
  | { ok: true; schedule: Schedule }
  | { ok: false; lastFail?: string; error?: string };

function failResult(lastFail?: string): SolveResult {
  return {
    ok: false,
    failedFicha: lastFail,
    message: lastFail
      ? `No se encontró un horario sin cruces. Se trabó en: ${lastFail}. Revisa restricciones, ambientes o tope de sábado.`
      : "No se pudo generar un horario con las restricciones actuales.",
  };
}

function tryOneAttempt(parsed: ParsedWorkbook, extra: ExtraRules): AttemptResult {
  const nights = parsed.fichas.filter((f) => f.jornada === "NOCHE");
  const mornings = parsed.fichas.filter((f) => f.jornada === "MAÑANA");
  const afternoons = parsed.fichas.filter((f) => f.jornada === "TARDE");
  const st = new State();
  const seq = [...shuffle(nights), ...shuffle(mornings), ...shuffle(afternoons)].filter(
    (ficha) => hoursOf(ficha) > 0,
  );
  for (const ficha of seq) {
    let good = false;
    try {
      if (ficha.jornada === "NOCHE") good = assignNight(st, ficha, extra);
      else if (ficha.jornada === "MAÑANA") good = assignDay(st, ficha, MANANA, extra);
      else good = assignDay(st, ficha, TARDE, extra);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    if (!good) return { ok: false, lastFail: ficha.name };
  }
  return { ok: true, schedule: { grid: st.grid, hoursByInstructorDay: st.hours } };
}

function consumeAttempt(
  parsed: ParsedWorkbook,
  extra: ExtraRules,
): SolveResult | { continue: true; lastFail?: string } {
  const result = tryOneAttempt(parsed, extra);
  if (result.ok) return { ok: true, schedule: result.schedule };
  if (result.error) return { ok: false, message: result.error };
  return { continue: true, lastFail: result.lastFail };
}

export function solveSchedule(
  parsed: ParsedWorkbook,
  extra: ExtraRules,
  attempts = 2500,
  onProgress?: (progress: SolveProgress) => void,
): SolveResult {
  const blocked = scheduleFeasibilityIssues(parsed.fichas, extra);
  if (blocked.length) {
    return { ok: false, message: blocked[0] };
  }
  let lastFail: string | undefined;
  let lastReport = 0;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const now = Date.now();
    if (onProgress && (attempt === 0 || now - lastReport >= 80 || attempt === attempts - 1)) {
      lastReport = now;
      onProgress({ attempt: attempt + 1, attempts });
    }
    const step = consumeAttempt(parsed, extra);
    if ("continue" in step) {
      lastFail = step.lastFail;
      continue;
    }
    return step;
  }
  return failResult(lastFail);
}

export async function solveScheduleAsync(
  parsed: ParsedWorkbook,
  extra: ExtraRules,
  attempts = 2500,
  onProgress?: (progress: SolveProgress) => void,
): Promise<SolveResult> {
  const blocked = scheduleFeasibilityIssues(parsed.fichas, extra);
  if (blocked.length) {
    return { ok: false, message: blocked[0] };
  }
  let lastFail: string | undefined;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt === 0 || attempt % 8 === 0 || attempt === attempts - 1) {
      onProgress?.({ attempt: attempt + 1, attempts });
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    }
    const step = consumeAttempt(parsed, extra);
    if ("continue" in step) {
      lastFail = step.lastFail;
      continue;
    }
    return step;
  }
  return failResult(lastFail);
}
