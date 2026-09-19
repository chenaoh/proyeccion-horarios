import * as XLSX from "xlsx";
import type { Timeline, TimelineJornada, TimelineResult } from "./types";

function cellStr(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function cellPreserve(value: unknown): string {
  if (value == null) return "";
  return String(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function norm(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[:.]/g, "")
    .trim();
}

function parseHoursCell(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = cellStr(value).replace(",", ".");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function parseTrimestreNumber(raw: string): number | null {
  const n = norm(raw);
  if (!n) return null;
  const named: Record<string, number> = {
    primero: 1,
    segundo: 2,
    tercero: 3,
    cuarto: 4,
    quinto: 5,
    sexto: 6,
    septimo: 7,
  };
  for (const [name, value] of Object.entries(named)) {
    if (n.includes(name)) return value;
  }
  const roman: Record<string, number> = {
    vii: 7,
    vi: 6,
    iv: 4,
    v: 5,
    iii: 3,
    ii: 2,
    i: 1,
  };
  for (const [token, value] of Object.entries(roman)) {
    if (n === token || n.startsWith(`${token} `) || n.startsWith(`${token}(`)) return value;
  }
  const digit = n.match(/\b([1-7])\b/);
  if (digit) return Number(digit[1]);
  return null;
}

function detectJornadaKind(title: string): TimelineJornada {
  const n = norm(title);
  if (n.includes("noche")) return "NOCHE";
  return "DIA";
}

function detectCodigo(title: string): string {
  const hit = title.match(/\b(\d{5,8})\b/);
  return hit?.[1] ?? "";
}

function detectProgram(title: string): string {
  return title
    .replace(/\b(dia|noche|diurno|manana|tarde)\b/gi, " ")
    .replace(/\b\d{5,8}\b/g, " ")
    .replace(/[-–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findRow(rows: unknown[][], pred: (label: string) => boolean): number {
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    if (pred(norm(cellStr(rows[r]?.[0])))) return r;
  }
  return -1;
}

function lastUsedCol(rows: unknown[][], hoursRow: number): number {
  let last = 1;
  const limitR = Math.min(rows.length, 50);
  for (let r = 0; r < limitR; r++) {
    const row = rows[r] ?? [];
    const maxC = Math.min(row.length, 80);
    for (let c = 1; c < maxC; c++) {
      const raw = row[c];
      if (raw == null || raw === "") continue;
      if (r === hoursRow) {
        const n = parseHoursCell(raw);
        if (n == null) continue;
        last = Math.max(last, c);
        continue;
      }
      if (cellStr(raw)) last = Math.max(last, c);
    }
  }
  return last;
}

function collectResultados(rows: unknown[][], startRow: number, col: number): string[] {
  const out: string[] = [];
  for (let r = startRow; r < Math.min(rows.length, startRow + 12); r++) {
    const label = norm(cellStr(rows[r]?.[0]));
    if (r > startRow && label && !label.startsWith("resultado")) break;
    const text = cellStr(rows[r]?.[col]);
    if (text) out.push(text);
  }
  return out;
}

function timelineId(fileName: string, title: string, kind: TimelineJornada, trimestres: number[]): string {
  return [fileName, title, kind, trimestres.join("-")].join("::");
}

export function parseTimelineWorkbook(data: ArrayBuffer, fileName: string): Timeline {
  const wb = XLSX.read(data, { type: "array" });
  if (!wb.SheetNames.length) throw new Error("El Excel de línea de tiempo no tiene hojas.");
  const sheetName =
    wb.SheetNames.find((n) => /l\.?\s*t/i.test(n)) ??
    wb.SheetNames.find((n) => /linea|tiempo/i.test(n)) ??
    wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    raw: true,
    defval: null,
  }) as unknown[][];
  if (!rows.length) throw new Error("La línea de tiempo está vacía.");

  const title = cellStr(rows[0]?.[0]) || fileName.replace(/\.[^.]+$/, "");
  const jornadaKind = detectJornadaKind(title);
  const warnings: string[] = [];

  const triRow = findRow(rows, (l) => l === "trimestre");
  if (triRow < 0) throw new Error("No se encontró la fila Trimestre en la línea de tiempo.");
  const hoursRow = findRow(rows, (l) => l.includes("hora"));
  if (hoursRow < 0) throw new Error("No se encontró la fila Horas semanales en la línea de tiempo.");
  const enfoqueRow = findRow(rows, (l) => l === "enfoque");
  const apRow = findRow(rows, (l) => l === "ap");
  const normaRow = findRow(rows, (l) => l.includes("norma") || l.includes("unidad de competencia"));
  const codigoRow = findRow(rows, (l) => l.includes("codigo"));
  const rapRow = findRow(rows, (l) => l.includes("resultado"));
  const phaseRow = rows.findIndex((row, i) => i > 0 && i < triRow && cellStr(row?.[1]) && !cellStr(row?.[0]));

  const lastCol = lastUsedCol(rows, hoursRow);
  const starts: { col: number; trimestre: number; label: string }[] = [];
  for (let c = 1; c <= lastCol; c++) {
    const label = cellStr(rows[triRow]?.[c]);
    const num = parseTrimestreNumber(label);
    if (num != null) starts.push({ col: c, trimestre: num, label });
  }
  if (!starts.length) throw new Error("No se detectaron trimestres en la línea de tiempo.");

  const bounds = starts.map((s, i) => ({
    ...s,
    end: i + 1 < starts.length ? starts[i + 1].col - 1 : lastCol,
  }));
  const trimestres = [...new Set(bounds.map((b) => b.trimestre))].sort((a, b) => a - b);

  const results: TimelineResult[] = [];
  let lastEnfoque = "";
  let lastPhase = "";
  for (const bound of bounds) {
    for (let c = bound.col; c <= bound.end; c++) {
      const hours = parseHoursCell(rows[hoursRow]?.[c]);
      const ap =
        apRow >= 0
          ? cellStr(rows[apRow]?.[c])
          : hoursRow - 1 > triRow
            ? cellStr(rows[hoursRow - 1]?.[c])
            : "";
      const norma = normaRow >= 0 ? cellStr(rows[normaRow]?.[c]) : "";
      const phase = phaseRow >= 0 ? cellStr(rows[phaseRow]?.[c]) : "";
      if (phase) lastPhase = phase;
      const enfoqueCell = enfoqueRow >= 0 ? cellPreserve(rows[enfoqueRow]?.[c]) : "";
      if (enfoqueCell.trim()) lastEnfoque = enfoqueCell;
      const enfoque = enfoqueCell.trim() ? enfoqueCell : lastEnfoque || lastPhase;
      const resultados = rapRow >= 0 ? collectResultados(rows, rapRow, c) : [];
      if (hours == null && !ap && !norma && !resultados.length) continue;
      if (hours == null) warnings.push(`Trimestre ${bound.trimestre}, columna ${c + 1}: horas no numéricas.`);
      results.push({
        id: `${fileName}:${bound.trimestre}:${c}`,
        col: c,
        trimestre: bound.trimestre,
        trimestreLabel: bound.label,
        enfoque,
        ap,
        hours: hours ?? 0,
        norma,
        codigo: codigoRow >= 0 ? cellStr(rows[codigoRow]?.[c]) : "",
        resultados,
      });
    }
  }

  if (!results.length) throw new Error("No se encontraron resultados en la línea de tiempo.");

  return {
    id: timelineId(fileName, title, jornadaKind, trimestres),
    fileName,
    title,
    program: detectProgram(title),
    jornadaKind,
    codigoPrograma: detectCodigo(title),
    trimestres,
    results,
    warnings,
  };
}

export function resultsForTrimestre(timeline: Timeline, trimestre: number): TimelineResult[] {
  return timeline.results.filter((r) => r.trimestre === trimestre);
}

export function trimestreEnfoque(timeline: Timeline, trimestre: number): string {
  const hit = resultsForTrimestre(timeline, trimestre).find((result) => result.enfoque.trim());
  return hit?.enfoque ?? "";
}

export function trimestreResultCount(timeline: Timeline, trimestre: number): number {
  const results = resultsForTrimestre(timeline, trimestre);
  const raps = results.reduce((sum, result) => sum + result.resultados.length, 0);
  return raps > 0 ? raps : results.length;
}

export function resultLabel(result: Pick<TimelineResult, "resultados" | "ap" | "norma">): string {
  return result.resultados[0] || result.ap || result.norma || "Resultado";
}
