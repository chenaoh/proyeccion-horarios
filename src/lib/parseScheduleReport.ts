import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { parseWorkbook } from "./parseExcel";
import { normalizeExtraRules } from "./rules";
import { DAY_LABEL, MANANA, NOCHE, SABADO, TARDE, WEEKDAYS, parseSlotKey, slotKey } from "./slots";
import type { Day, ExtraRules, FichaAssignment, FichaInput, OccupiedRange, ParsedWorkbook, Schedule, Slot } from "./types";

const ALL_SLOTS: Slot[] = [...MANANA, ...TARDE, ...NOCHE, ...SABADO];

function norm(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "richText" in value) {
    return value.richText.map((part) => part.text).join("").trim();
  }
  if (typeof value === "object" && "text" in value && value.text) return String(value.text).trim();
  if (typeof value === "object" && "result" in value) return cellText(value.result as ExcelJS.CellValue);
  return "";
}

function sheetRows(ws: ExcelJS.Worksheet): string[][] {
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const line: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      line[col - 1] = cellText(cell.value);
    });
    rows[rowNumber - 1] = line;
  });
  return rows;
}

function sheetByNorm(wb: ExcelJS.Workbook, name: string): ExcelJS.Worksheet | undefined {
  const target = norm(name);
  return wb.worksheets.find((ws) => norm(ws.name) === target);
}

function hourOf(raw: string): number | null {
  const match = raw.trim().toLowerCase().match(/(\d{1,2}):00\s*(am|pm|m)?/);
  if (!match) return null;
  let hour = Number(match[1]);
  const suffix = match[2] ?? "";
  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  if (suffix === "m") return 12;
  return hour;
}

function rangeFromLabel(label: string): { start: number; end: number } | null {
  const clean = label.replace(/^s[aá]bado\s+/i, "");
  const parts = clean.split(/\s+a\s+/i);
  if (parts.length < 2) return null;
  const suffix = parts[1].match(/(am|pm|m)\s*$/i)?.[1] ?? "";
  const startRaw = /(am|pm|m)/i.test(parts[0]) || !suffix ? parts[0] : `${parts[0]} ${suffix}`;
  const start = hourOf(startRaw);
  const end = hourOf(parts[1]);
  if (start == null || end == null) return null;
  return { start, end };
}

function findSlot(day: Day, start: number, end: number): Slot | undefined {
  return ALL_SLOTS.find((slot) => slot.day === day && slot.start === start && slot.end === end);
}

function isBlankName(value: string): boolean {
  const text = norm(value);
  return !text || text === "-" || text === "—" || text === "ver filas sabado" || text === "no se programa";
}

function parseOccupied(raw: string): OccupiedRange[] {
  if (!raw || raw === "—") return [];
  const ranges: OccupiedRange[] = [];
  for (const piece of raw.split(";")) {
    const text = piece.trim();
    if (!text || text === "—") continue;
    const dayEntry = (Object.entries(DAY_LABEL) as [Day, string][]).find(([, label]) =>
      norm(text).startsWith(norm(label)),
    );
    if (!dayEntry) continue;
    const times = text.slice(dayEntry[1].length).split("-").map((part) => hourOf(part));
    if (times[0] == null || times[1] == null) continue;
    ranges.push({ day: dayEntry[0], start: times[0], end: times[1], raw: text });
  }
  return ranges;
}

function parseRestrictions(ws: ExcelJS.Worksheet, instructorNames: string[]): ExtraRules {
  const occupied: ExtraRules["occupied"] = {};
  const maxSaturdayHours: ExtraRules["maxSaturdayHours"] = {};
  const allowSixHourBlocks: ExtraRules["allowSixHourBlocks"] = {};
  for (const name of instructorNames) {
    occupied[name] = [];
    maxSaturdayHours[name] = 6;
    allowSixHourBlocks[name] = false;
  }
  const extra: ExtraRules = { occupied, noNoche: [], noSabado: [], maxSaturdayHours, allowSixHourBlocks };
  const rows = sheetRows(ws);
  const header = rows.findIndex((row) => norm(row?.[0] ?? "") === "instructor" && norm(row?.[1] ?? "").includes("noche"));
  if (header < 0) return extra;
  for (let i = header + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const name = row[0]?.trim() ?? "";
    if (!name || norm(name) === "por ficha" || norm(name) === "ficha") break;
    if (!instructorNames.includes(name)) continue;
    if (norm(row[1] ?? "").startsWith("si")) extra.noNoche.push(name);
    if (norm(row[2] ?? "").startsWith("si")) extra.noSabado.push(name);
    extra.allowSixHourBlocks[name] = norm(row[3] ?? "").startsWith("si");
    extra.maxSaturdayHours[name] = norm(row[4] ?? "").includes("todo") ? 10 : Number((row[4] ?? "").replace(/[^\d]/g, "")) || 6;
    extra.occupied[name] = parseOccupied(row[5] ?? "");
  }
  extra.noNoche = [...new Set(extra.noNoche)];
  extra.noSabado = [...new Set(extra.noSabado)];
  return extra;
}

function readGrid(rows: string[][], ficha: FichaInput): Record<string, string> {
  const header = rows.findIndex((row) => norm(row?.[0] ?? "") === "franja" && norm(row?.[1] ?? "") === "lunes");
  if (header < 0) return {};
  const grid: Record<string, string> = {};
  for (let i = header + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const label = row[0]?.trim() ?? "";
    if (!label || norm(label).startsWith("horas asignadas") || norm(label).startsWith("asignacion")) break;
    const range = rangeFromLabel(label);
    if (!range) continue;
    const saturday = norm(label).startsWith("sabado");
    const days: Day[] = saturday ? ["sab"] : [...WEEKDAYS];
    days.forEach((day, index) => {
      const who = row[saturday ? 6 : index + 1] ?? "";
      if (isBlankName(who)) return;
      const slot = findSlot(day, range.start, range.end);
      if (!slot) return;
      if (slot.jornada !== ficha.jornada && !(ficha.jornada === "NOCHE" && day === "sab")) return;
      grid[slotKey(slot)] = who.trim();
    });
  }
  return grid;
}

function readAssignment(rows: string[][], fichaName: string): FichaAssignment | null {
  const header = rows.findIndex((row) => norm(row?.[0] ?? "") === "norma de competencia");
  if (header < 0) return null;
  const enfoqueRow = rows.findIndex((row) => norm(row?.[0] ?? "").startsWith("enfoque del trimestre"));
  const enfoque = enfoqueRow >= 0 ? (rows[enfoqueRow + 1]?.[0] ?? "").trim() : "";
  const assignmentRows = [];
  for (let i = header + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const norma = row[0]?.trim() ?? "";
    const result = row[1]?.trim() ?? "";
    const instructor = row[2]?.trim() ?? "";
    const hours = Number(String(row[3] ?? "").replace(",", "."));
    const observation = row[4]?.trim() ?? "";
    if (!norma && !result && !instructor) break;
    assignmentRows.push({
      id: `${fichaName}-${i}`,
      sourceResultId: `${fichaName}-${i}`,
      sourceTrimestre: 0,
      enfoque: assignmentRows.length === 0 ? enfoque : "",
      ap: observation,
      hours: Number.isFinite(hours) ? hours : 0,
      norma: norma === "—" ? "" : norma,
      codigo: "",
      resultados: result && result !== "—" ? result.split(/\n/) : [],
      instructor: instructor === "—" ? "" : instructor,
      observation,
    });
  }
  if (!assignmentRows.length) return null;
  return { fichaName, timelineId: "reporte", rows: assignmentRows, saved: true };
}

function hoursByDay(grid: Schedule["grid"]): Schedule["hoursByInstructorDay"] {
  const hours: Schedule["hoursByInstructorDay"] = {};
  for (const cells of Object.values(grid)) {
    for (const [key, name] of Object.entries(cells)) {
      const slot = parseSlotKey(key);
      if (!hours[name]) hours[name] = { lun: 0, mar: 0, mie: 0, jue: 0, vie: 0, sab: 0 };
      hours[name][slot.day] += slot.hours;
    }
  }
  return hours;
}

export async function parseScheduleReport(
  data: ArrayBuffer,
  fileName: string,
): Promise<{ parsed: ParsedWorkbook; schedule: Schedule; extra: ExtraRules; assignments: Record<string, FichaAssignment> }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  const assignSheet = sheetByNorm(wb, "Asignación");
  const restrictionSheet = sheetByNorm(wb, "Restricciones");
  if (!assignSheet || !restrictionSheet || !sheetByNorm(wb, "Horario por instructor")) {
    throw new Error("Ese archivo no es un reporte de horarios exportado desde la herramienta.");
  }

  const aoa = sheetRows(assignSheet).map((row) => row.map((cell) => (cell === "" ? null : cell)));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(aoa), "Asignación");
  const buffer = XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const parsed = parseWorkbook(buffer, fileName);
  const title = sheetRows(assignSheet)[0]?.[0] ?? "";
  const area = title.includes("·") ? title.split("·").pop()?.trim() ?? "" : parsed.area;
  if (area) parsed.area = area;

  const reserved = new Set(["asignacion", "horario por instructor", "restricciones"]);
  const grid: Schedule["grid"] = {};
  const assignments: Record<string, FichaAssignment> = {};
  for (const ws of wb.worksheets) {
    if (reserved.has(norm(ws.name))) continue;
    const rows = sheetRows(ws);
    const fichaRow = rows.find((row) => norm(row?.[0] ?? "") === "ficha");
    const fichaName = fichaRow?.[1]?.trim() || ws.name;
    const ficha = parsed.fichas.find((item) => item.name === fichaName);
    if (!ficha) continue;
    grid[ficha.name] = readGrid(rows, ficha);
    const assignment = readAssignment(rows, ficha.name);
    if (assignment) assignments[ficha.name] = assignment;
  }
  for (const ficha of parsed.fichas) {
    if (!grid[ficha.name]) grid[ficha.name] = {};
  }

  const extra = normalizeExtraRules(parseRestrictions(restrictionSheet, parsed.instructorNames), parsed.instructorNames, parsed.fichas);
  return {
    parsed,
    extra,
    assignments,
    schedule: { grid, hoursByInstructorDay: hoursByDay(grid) },
  };
}
