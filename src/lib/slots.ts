import type { Day, Jornada, Slot } from "./types";

export const DAYS: Day[] = ["lun", "mar", "mie", "jue", "vie", "sab"];
export const WEEKDAYS: Day[] = ["lun", "mar", "mie", "jue", "vie"];

export const DAY_LABEL: Record<Day, string> = {
  lun: "Lunes",
  mar: "Martes",
  mie: "Miércoles",
  jue: "Jueves",
  vie: "Viernes",
  sab: "Sábado",
};

function makeSlot(
  day: Day,
  label: string,
  start: number,
  end: number,
  jornada: Jornada,
): Slot {
  return { day, label, start, end, hours: end - start, jornada };
}

export const MANANA: Slot[] = WEEKDAYS.flatMap((d) => [
  makeSlot(d, "06-09", 6, 9, "MAÑANA"),
  makeSlot(d, "09-12", 9, 12, "MAÑANA"),
]);

export const TARDE: Slot[] = WEEKDAYS.flatMap((d) => [
  makeSlot(d, "12-15", 12, 15, "TARDE"),
  makeSlot(d, "15-18", 15, 18, "TARDE"),
]);

export const NOCHE: Slot[] = WEEKDAYS.flatMap((d) => [
  makeSlot(d, "18-20", 18, 20, "NOCHE"),
  makeSlot(d, "20-22", 20, 22, "NOCHE"),
]);

export const SABADO: Slot[] = [
  makeSlot("sab", "08-10", 8, 10, "NOCHE"),
  makeSlot("sab", "10-12", 10, 12, "NOCHE"),
  makeSlot("sab", "12-14", 12, 14, "NOCHE"),
  makeSlot("sab", "14-16", 14, 16, "NOCHE"),
  makeSlot("sab", "16-18", 16, 18, "NOCHE"),
];

/** Pairs of Saturday 2h indices that form a 4h block, plus the leftover 2h index. */
export const SAT_TILINGS: { two: number; fourA: [number, number]; fourB: [number, number] }[] = [
  { two: 0, fourA: [1, 2], fourB: [3, 4] },
  { two: 2, fourA: [0, 1], fourB: [3, 4] },
  { two: 4, fourA: [0, 1], fourB: [2, 3] },
];

export function slotKey(slot: Slot): string {
  return `${slot.day}|${slot.label}|${slot.start}|${slot.end}`;
}

export function parseSlotKey(key: string): Slot {
  const [day, label, start, end] = key.split("|");
  const s = Number(start);
  const e = Number(end);
  const jornada: Jornada =
    s >= 18 || day === "sab" ? "NOCHE" : s >= 12 ? "TARDE" : "MAÑANA";
  return { day: day as Day, label, start: s, end: e, hours: e - s, jornada };
}

export function slotsForFicha(jornada: Jornada, noSaturday: boolean): Slot[] {
  if (jornada === "MAÑANA") return MANANA;
  if (jornada === "TARDE") return TARDE;
  return noSaturday ? [...NOCHE] : [...NOCHE, ...SABADO];
}

export function formatHour(h: number): string {
  if (h === 12) return "12:00 m";
  if (h < 12) return `${h}:00 am`;
  return `${h - 12}:00 pm`;
}

export function formatRange(start: number, end: number): string {
  return `${formatHour(start)} – ${formatHour(end)}`;
}

export function overlap(a1: number, a2: number, b1: number, b2: number): boolean {
  return a1 < b2 && a2 > b1;
}
