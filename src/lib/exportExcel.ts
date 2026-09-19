import ExcelJS from "exceljs";
import { inNameList } from "./names";
import { allowsSixHours, hoursOf, maxSaturdayOf } from "./rules";
import {
  DAY_LABEL,
  DAYS,
  MANANA,
  NOCHE,
  SABADO,
  TARDE,
  WEEKDAYS,
  formatHour,
  parseSlotKey,
  slotKey,
} from "./slots";
import type { ExtraRules, FichaAssignment, FichaInput, ParsedWorkbook, Schedule } from "./types";

const NAVY = "1F4E79";
const HEADER = "2E75B6";
const NAME_BG = "C6EFCE";
const NAME_FG = "006100";
const MUTED = "F2F2F2";
const FOOTER_BG = "D6EAF8";
const WHITE = "FFFFFF";
const TITLE_BLUE = "1F4E79";
const THIN = "BDD7EE";

function argb(hex: string) {
  return `FF${hex}`;
}

function solid(hex: string): ExcelJS.FillPattern {
  return { type: "pattern", pattern: "solid", fgColor: { argb: argb(hex) } };
}

function font(opts: Partial<ExcelJS.Font>): Partial<ExcelJS.Font> {
  return { name: "Calibri", size: 11, ...opts };
}

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: argb(THIN) } },
  left: { style: "thin", color: { argb: argb(THIN) } },
  bottom: { style: "thin", color: { argb: argb(THIN) } },
  right: { style: "thin", color: { argb: argb(THIN) } },
};

function prettyRange(start: number, end: number): string {
  const n = (h: number) => (h === 12 || h === 0 ? 12 : h > 12 ? h - 12 : h);
  const suf = (h: number) => (h === 12 ? "m" : h < 12 ? "am" : "pm");
  const a = suf(start);
  const b = suf(end === 12 ? 12 : end);
  if (a === b) return `${n(start)}:00 a ${n(end)}:00 ${b}`;
  if (start < 12 && end === 12) return `${n(start)}:00 a 12:00 m`;
  return `${n(start)}:00 ${a} a ${n(end)}:00 ${b}`;
}

function styleCell(
  cell: ExcelJS.Cell,
  value: string | number,
  kind: "title" | "header" | "label" | "name" | "empty" | "muted" | "footer" | "plain" | "meta",
) {
  cell.value = value;
  cell.border = thinBorder;
  cell.alignment = {
    vertical: "middle",
    horizontal: kind === "label" || kind === "footer" || kind === "meta" ? "left" : "center",
    wrapText: true,
  };
  if (kind === "title") {
    cell.font = font({ bold: true, size: 14, color: { argb: argb(WHITE) } });
    cell.fill = solid(NAVY);
    cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  } else if (kind === "header") {
    cell.font = font({ bold: true, size: 11, color: { argb: argb(WHITE) } });
    cell.fill = solid(HEADER);
  } else if (kind === "label") {
    cell.font = font({ bold: true, size: 10, color: { argb: argb(TITLE_BLUE) } });
    cell.fill = solid(MUTED);
    cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  } else if (kind === "name") {
    cell.font = font({ size: 11, color: { argb: argb(NAME_FG) } });
    cell.fill = solid(NAME_BG);
  } else if (kind === "empty") {
    cell.font = font({ size: 11, color: { argb: "FF9CA3AF" } });
    cell.fill = solid(WHITE);
  } else if (kind === "muted") {
    cell.font = font({ italic: true, size: 10, color: { argb: "FF6B7280" } });
    cell.fill = solid(MUTED);
  } else if (kind === "footer") {
    cell.font = font({ italic: true, size: 9, color: { argb: "FF334155" } });
    cell.fill = solid(FOOTER_BG);
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
  } else if (kind === "meta") {
    cell.font = font({ size: 11 });
    cell.fill = solid(WHITE);
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
  } else {
    cell.font = font({ size: 11 });
    cell.fill = solid(WHITE);
  }
}

function mergeTitle(ws: ExcelJS.Worksheet, row: number, cols: number, text: string) {
  ws.mergeCells(row, 1, row, cols);
  styleCell(ws.getCell(row, 1), text, "title");
  for (let c = 2; c <= cols; c++) {
    ws.getCell(row, c).fill = solid(NAVY);
    ws.getCell(row, c).border = thinBorder;
  }
  ws.getRow(row).height = 22;
}

function mergeFooter(ws: ExcelJS.Worksheet, row: number, cols: number, text: string) {
  ws.mergeCells(row, 1, row, cols);
  styleCell(ws.getCell(row, 1), text, "footer");
  for (let c = 2; c <= cols; c++) {
    ws.getCell(row, c).fill = solid(FOOTER_BG);
    ws.getCell(row, c).border = thinBorder;
  }
  ws.getRow(row).height = 28;
}

function setWidths(ws: ExcelJS.Worksheet, cols: number) {
  ws.getColumn(1).width = 26;
  for (let c = 2; c <= cols; c++) ws.getColumn(c).width = 18;
}

function hoursLine(ficha: FichaInput, extra: ExtraRules): string {
  const hours = Object.entries(ficha.hours)
    .map(([n, h]) => `${n} ${h}h`)
    .join(" · ");
  const sixNames = Object.keys(ficha.hours).filter((name) => allowsSixHours(extra, name));
  const six = sixNames.length
    ? `6 h seguidas: ${sixNames.join(", ")}`
    : "Nadie de esta ficha tiene 6 h seguidas";
  return `Horas asignadas: ${hours}  |  ${six}`;
}

function writeMetaRow(
  ws: ExcelJS.Worksheet,
  row: number,
  cols: number,
  label: string,
  value: string,
) {
  styleCell(ws.getCell(row, 1), label, "label");
  ws.mergeCells(row, 2, row, cols);
  styleCell(ws.getCell(row, 2), value.trim() || "—", "meta");
  for (let c = 3; c <= cols; c++) {
    ws.getCell(row, c).fill = solid(WHITE);
    ws.getCell(row, c).border = thinBorder;
  }
  ws.getRow(row).height = 20;
}

function uniqueSheetName(raw: string, used: Set<string>): string {
  const cleaned = raw.replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim() || "Ficha";
  const fit = (value: string) => value.slice(0, 31);
  let candidate = fit(cleaned);
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` ${n}`;
    candidate = fit(cleaned.slice(0, 31 - suffix.length) + suffix);
    n += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function assignmentEnfoque(assignment?: FichaAssignment): string {
  return assignment?.rows.find((row) => row.enfoque.trim())?.enfoque ?? "";
}

function writeEnfoqueBox(
  ws: ExcelJS.Worksheet,
  startRow: number,
  cols: number,
  ficha: FichaInput,
  assignment?: FichaAssignment,
): number {
  let r = startRow;
  const title =
    ficha.trimestre != null ? `Enfoque del trimestre ${ficha.trimestre}` : "Enfoque del trimestre";
  mergeTitle(ws, r, cols, title);
  r += 1;
  const text = assignmentEnfoque(assignment).trim() || "—";
  const lines = text.split(/\r?\n/).length;
  ws.mergeCells(r, 1, r, cols);
  styleCell(ws.getCell(r, 1), text, "meta");
  ws.getCell(r, 1).alignment = { vertical: "top", horizontal: "left", wrapText: true, indent: 1 };
  for (let c = 2; c <= cols; c++) {
    ws.getCell(r, c).fill = solid(WHITE);
    ws.getCell(r, c).border = thinBorder;
  }
  ws.getRow(r).height = Math.max(40, 16 * lines + 14);
  r += 2;
  return r;
}

function writeAssignmentTable(ws: ExcelJS.Worksheet, startRow: number, assignment: FichaAssignment): number {
  const cols = 5;
  let r = startRow;
  mergeTitle(ws, r, cols, "Asignación de instructores y resultados");
  r += 1;
  ["Norma de competencia", "Resultado", "Instructor", "Horas", "Observación"].forEach((h, i) =>
    styleCell(ws.getCell(r, i + 1), h, "header"),
  );
  ws.getRow(r).height = 18;
  r += 1;
  for (const row of assignment.rows) {
    styleCell(ws.getCell(r, 1), row.norma || "—", row.norma ? "label" : "empty");
    styleCell(ws.getCell(r, 2), row.resultados.join("\n") || "—", row.resultados.length ? "meta" : "empty");
    styleCell(ws.getCell(r, 3), row.instructor || "—", row.instructor ? "name" : "empty");
    styleCell(ws.getCell(r, 4), row.hours, "plain");
    styleCell(ws.getCell(r, 5), row.observation || row.ap || "—", row.observation || row.ap ? "meta" : "empty");
    ws.getRow(r).height = Math.max(28, 16 * Math.max(1, row.resultados.length));
    r += 1;
  }
  r += 1;
  return r;
}

function writeFichaSheet(
  wb: ExcelJS.Workbook,
  name: string,
  ficha: FichaInput,
  assigned: Record<string, string>,
  extra: ExtraRules,
  area: string,
  assignment?: FichaAssignment,
) {
  const night = ficha.jornada === "NOCHE";
  const cols = Math.max(night ? 7 : 6, assignment ? 5 : 0);
  const ws = wb.addWorksheet(name, {
    views: [{ showGridLines: false, state: "frozen", ySplit: 1 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, paperSize: 9 },
  });
  setWidths(ws, cols);
  ws.getColumn(1).width = 36;
  if (assignment) {
    ws.getColumn(2).width = 42;
    ws.getColumn(5).width = 42;
  }
  writeFichaBlock(ws, 1, ficha, assigned, extra, area, assignment);
}

function writeFichaBlock(
  ws: ExcelJS.Worksheet,
  startRow: number,
  ficha: FichaInput,
  assigned: Record<string, string>,
  extra: ExtraRules,
  area = "",
  assignment?: FichaAssignment,
): number {
  const night = ficha.jornada === "NOCHE";
  const cols = night ? 7 : 6;
  let r = startRow;
  mergeTitle(ws, r, Math.max(cols, assignment ? 5 : cols), ficha.name);
  r += 1;
  writeMetaRow(ws, r, cols, "Ficha", ficha.name);
  r += 1;
  writeMetaRow(
    ws,
    r,
    cols,
    "Jornada",
    `${ficha.jornada}${ficha.saturday ? "  ·  con sábado" : "  ·  sin sábado"}`,
  );
  r += 1;
  writeMetaRow(
    ws,
    r,
    cols,
    "Trimestre",
    ficha.trimestre != null ? String(ficha.trimestre) : "—",
  );
  r += 1;
  writeMetaRow(ws, r, cols, "Ambiente asignado", ficha.ambiente);
  r += 1;
  writeMetaRow(ws, r, cols, "Director de grupo", ficha.director);
  r += 1;
  writeMetaRow(ws, r, cols, "Área", area);
  r += 2;
  r = writeEnfoqueBox(ws, r, cols, ficha, assignment);

  const headers = night
    ? ["Franja", ...WEEKDAYS.map((d) => DAY_LABEL[d]), "Sábado"]
    : ["Franja", ...WEEKDAYS.map((d) => DAY_LABEL[d])];
  headers.forEach((h, i) => styleCell(ws.getCell(r, i + 1), h, "header"));
  ws.getRow(r).height = 18;
  r += 1;

  if (night) {
    const nightBands = [
      { label: prettyRange(18, 20), start: 18, end: 20, key: "18-20" },
      { label: prettyRange(20, 22), start: 20, end: 22, key: "20-22" },
    ];
    for (const band of nightBands) {
      styleCell(ws.getCell(r, 1), band.label, "label");
      WEEKDAYS.forEach((d, i) => {
        const slot = NOCHE.find((s) => s.day === d && s.label === band.key)!;
        const who = assigned[slotKey(slot)] ?? "";
        styleCell(ws.getCell(r, i + 2), who || "—", who ? "name" : "empty");
      });
      styleCell(ws.getCell(r, 7), "ver filas sábado", "muted");
      ws.getRow(r).height = 20;
      r += 1;
    }
    for (const slot of SABADO) {
      styleCell(ws.getCell(r, 1), `Sábado ${prettyRange(slot.start, slot.end)}`, "label");
      for (let c = 2; c <= 6; c++) styleCell(ws.getCell(r, c), "", "empty");
      const who = !ficha.saturday ? "No se programa" : assigned[slotKey(slot)] ?? "";
      styleCell(
        ws.getCell(r, 7),
        who || "—",
        !ficha.saturday ? "muted" : who ? "name" : "empty",
      );
      ws.getRow(r).height = 20;
      r += 1;
    }
  } else {
    const pool = ficha.jornada === "MAÑANA" ? MANANA : TARDE;
    const bands =
      ficha.jornada === "MAÑANA"
        ? [
            [prettyRange(6, 9), "06-09"],
            [prettyRange(9, 12), "09-12"],
          ]
        : [
            [prettyRange(12, 15), "12-15"],
            [prettyRange(15, 18), "15-18"],
          ];
    for (const [label, lab] of bands) {
      styleCell(ws.getCell(r, 1), label, "label");
      WEEKDAYS.forEach((d, i) => {
        const slot = pool.find((s) => s.day === d && s.label === lab)!;
        const who = assigned[slotKey(slot)] ?? "";
        styleCell(ws.getCell(r, i + 2), who || "—", who ? "name" : "empty");
      });
      ws.getRow(r).height = 20;
      r += 1;
    }
  }

  mergeFooter(ws, r, cols, hoursLine(ficha, extra));
  r += 2;
  if (assignment) {
    r = writeAssignmentTable(ws, r, assignment);
  }
  return r;
}

function writeInstructorSheet(wb: ExcelJS.Workbook, parsed: ParsedWorkbook, schedule: Schedule) {
  const ws = wb.addWorksheet("Horario por instructor", {
    views: [{ showGridLines: false, state: "frozen", ySplit: 3 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, paperSize: 9 },
  });
  const area = parsed.area?.trim();
  mergeTitle(ws, 1, 7, area ? `Horario por instructor  ·  ${area}` : "Horario por instructor");
  ws.mergeCells(2, 1, 2, 7);
  styleCell(
    ws.getCell(2, 1),
    "Cada bloque muestra la ficha. El sábado queda en la última columna, igual que en las fichas de noche.",
    "footer",
  );
  for (let c = 2; c <= 7; c++) {
    ws.getCell(2, c).fill = solid(FOOTER_BG);
    ws.getCell(2, c).border = thinBorder;
  }
  setWidths(ws, 7);

  const byInst: Record<string, { key: string; ficha: string }[]> = {};
  for (const ficha of parsed.fichas) {
    for (const [key, name] of Object.entries(schedule.grid[ficha.name] ?? {})) {
      if (!byInst[name]) byInst[name] = [];
      byInst[name].push({ key, ficha: ficha.name });
    }
  }

  const weekdayBands: { label: string; start: number; end: number }[] = [
    { label: prettyRange(6, 9), start: 6, end: 9 },
    { label: prettyRange(9, 12), start: 9, end: 12 },
    { label: prettyRange(12, 15), start: 12, end: 15 },
    { label: prettyRange(15, 18), start: 15, end: 18 },
    { label: prettyRange(18, 20), start: 18, end: 20 },
    { label: prettyRange(20, 22), start: 20, end: 22 },
  ];

  let r = 4;
  const names = Object.keys(byInst).sort((a, b) => a.localeCompare(b, "es"));
  for (const name of names) {
    const items = byInst[name].map((x) => ({ ...x, slot: parseSlotKey(x.key) }));
    const total = items.reduce((s, i) => s + i.slot.hours, 0);
    mergeTitle(ws, r, 7, `${name}  ·  ${total} h / semana`);
    r += 1;
    ["Franja", ...WEEKDAYS.map((d) => DAY_LABEL[d]), "Sábado"].forEach((h, i) =>
      styleCell(ws.getCell(r, i + 1), h, "header"),
    );
    r += 1;

    function whoAt(day: (typeof DAYS)[number], start: number, end: number): string {
      const hit = items.find((i) => i.slot.day === day && i.slot.start === start && i.slot.end === end);
      return hit?.ficha ?? "";
    }

    for (const band of weekdayBands) {
      styleCell(ws.getCell(r, 1), band.label, "label");
      WEEKDAYS.forEach((d, i) => {
        const who = whoAt(d, band.start, band.end);
        styleCell(ws.getCell(r, i + 2), who || "—", who ? "name" : "empty");
      });
      if (band.start === 18) styleCell(ws.getCell(r, 7), "ver filas sábado", "muted");
      else styleCell(ws.getCell(r, 7), "—", "empty");
      ws.getRow(r).height = 20;
      r += 1;
    }
    for (const slot of SABADO) {
      styleCell(ws.getCell(r, 1), `Sábado ${prettyRange(slot.start, slot.end)}`, "label");
      for (let c = 2; c <= 6; c++) styleCell(ws.getCell(r, c), "", "empty");
      const who = whoAt("sab", slot.start, slot.end);
      styleCell(ws.getCell(r, 7), who || "—", who ? "name" : "empty");
      ws.getRow(r).height = 20;
      r += 1;
    }
    r += 1;
  }
}

function writeRestrictionsSheet(wb: ExcelJS.Workbook, parsed: ParsedWorkbook, extra: ExtraRules) {
  const ws = wb.addWorksheet("Restricciones", {
    views: [{ showGridLines: false, state: "frozen", ySplit: 3 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, paperSize: 9 },
  });
  const area = parsed.area?.trim();
  mergeTitle(ws, 1, 6, area ? `Restricciones  ·  ${area}` : "Restricciones");
  ws.mergeCells(2, 1, 2, 6);
  styleCell(ws.getCell(2, 1), "Reglas usadas al generar el horario. No salen del Excel de entrada: se definen en la herramienta.", "footer");
  for (let c = 2; c <= 6; c++) {
    ws.getCell(2, c).fill = solid(FOOTER_BG);
    ws.getCell(2, c).border = thinBorder;
  }

  let r = 4;
  mergeTitle(ws, r, 6, "Por instructor");
  r += 1;
  ["Instructor", "Sin noche L–V", "Sin sábado", "6 h seguidas", "Máx. h sábado", "Franjas ocupadas"].forEach(
    (h, i) => styleCell(ws.getCell(r, i + 1), h, "header"),
  );
  r += 1;
  for (const name of parsed.instructorNames) {
    const occ = (extra.occupied[name] ?? [])
      .map((o) => `${DAY_LABEL[o.day]} ${formatHour(o.start)}-${formatHour(o.end)}`)
      .join("; ");
    styleCell(ws.getCell(r, 1), name, "label");
    const noN = inNameList(name, extra.noNoche);
    const noS = inNameList(name, extra.noSabado);
    const six = allowsSixHours(extra, name);
    styleCell(ws.getCell(r, 2), noN ? "SI" : "NO", noN ? "name" : "empty");
    styleCell(ws.getCell(r, 3), noS ? "SI" : "NO", noS ? "name" : "empty");
    styleCell(ws.getCell(r, 4), six ? "SI" : "NO (solo 3 h)", six ? "name" : "plain");
    const max = maxSaturdayOf(extra, name);
    styleCell(ws.getCell(r, 5), max >= 10 ? "Todo el sábado" : `${max} h`, "plain");
    styleCell(ws.getCell(r, 6), occ || "—", occ ? "plain" : "empty");
    ws.getRow(r).height = 20;
    r += 1;
  }

  r += 1;
  mergeTitle(ws, r, 4, "Por ficha");
  r += 1;
  ["Ficha", "Jornada", "Sábado", "Horas"].forEach((h, i) => styleCell(ws.getCell(r, i + 1), h, "header"));
  r += 1;
  for (const ficha of parsed.fichas) {
    styleCell(ws.getCell(r, 1), ficha.name, "label");
    styleCell(ws.getCell(r, 2), ficha.jornada, "plain");
    styleCell(ws.getCell(r, 3), ficha.saturday ? "SI" : "NO", ficha.saturday ? "name" : "empty");
    styleCell(ws.getCell(r, 4), hoursOf(ficha), "plain");
    ws.getRow(r).height = 20;
    r += 1;
  }

  ws.getColumn(1).width = 42;
  ws.getColumn(2).width = 16;
  ws.getColumn(3).width = 16;
  ws.getColumn(4).width = 18;
  ws.getColumn(5).width = 18;
  ws.getColumn(6).width = 42;
}

function writeAssignSheet(wb: ExcelJS.Workbook, parsed: ParsedWorkbook) {
  const ws = wb.addWorksheet("Asignación", {
    views: [{ showGridLines: false, state: "frozen", ySplit: 3 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, paperSize: 9 },
  });
  const instructors = parsed.instructorNames;
  const cols = 6 + instructors.length;
  const area = parsed.area?.trim() || "";
  mergeTitle(ws, 1, Math.max(cols, 6), area ? `Asignación  ·  ${area}` : "Asignación");
  const header = ["FICHA", "JORNADA", "TRIMESTRE", "SABADO", "Director", "Ambiente", ...instructors];
  header.forEach((h, i) => styleCell(ws.getCell(3, i + 1), h, "header"));
  let r = 4;
  const totals: Record<string, number> = {};
  for (const ficha of parsed.fichas) {
    const values: (string | number)[] = [
      ficha.name,
      ficha.jornada,
      ficha.trimestre ?? "",
      ficha.saturday ? "SI" : "NO",
      ficha.director,
      ficha.ambiente,
    ];
    for (const name of instructors) {
      const h = ficha.hours[name];
      values.push(h ?? "");
      if (h) totals[name] = (totals[name] ?? 0) + h;
    }
    values.forEach((v, i) => styleCell(ws.getCell(r, i + 1), v, i === 0 ? "label" : v ? "plain" : "empty"));
    r += 1;
  }
  const totalRow: (string | number)[] = ["TOTALES", "", "", "", "", ""];
  for (const name of instructors) totalRow.push(totals[name] ?? 0);
  totalRow.forEach((v, i) => styleCell(ws.getCell(r, i + 1), v, "header"));
  ws.getColumn(1).width = 38;
  for (let c = 2; c <= 6; c++) ws.getColumn(c).width = 14;
  for (let c = 7; c <= cols; c++) ws.getColumn(c).width = 16;
}

export async function exportScheduleWorkbook(
  parsed: ParsedWorkbook,
  schedule: Schedule,
  extra: ExtraRules,
  assignments?: Record<string, FichaAssignment>,
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Area Soft";
  wb.created = new Date();
  const area = parsed.area?.trim();

  writeAssignSheet(wb, parsed);
  writeInstructorSheet(wb, parsed, schedule);
  writeRestrictionsSheet(wb, parsed, extra);

  const usedNames = new Set(["horario por instructor", "restricciones", "asignación"]);
  for (const ficha of parsed.fichas) {
    writeFichaSheet(
      wb,
      uniqueSheetName(ficha.name, usedNames),
      ficha,
      schedule.grid[ficha.name] ?? {},
      extra,
      area ?? "",
      assignments?.[ficha.name],
    );
  }

  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}

export function downloadText(text: string, fileName: string) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadBuffer(buffer: ArrayBuffer, fileName: string) {
  const blob = new Blob([new Uint8Array(buffer)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
