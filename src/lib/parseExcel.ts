import * as XLSX from "xlsx";
import { buildDefaultRules } from "./rules";
import type { FichaInput, Jornada, ParsedWorkbook } from "./types";

function cellStr(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function normHeader(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[:.]/g, "")
    .trim();
}

function parseJornada(raw: string): Jornada | null {
  const n = normHeader(raw).toUpperCase();
  if (n.includes("MANANA")) return "MAÑANA";
  if (n.includes("TARDE")) return "TARDE";
  if (n.includes("NOCHE")) return "NOCHE";
  return null;
}

function parseSaturday(raw: string, jornada: Jornada, totalHours: number, allowEmptyHours: boolean): boolean {
  const n = normHeader(raw);
  if (["si", "yes", "true", "1"].includes(n)) return true;
  if (["no", "false", "0"].includes(n)) return false;
  if (allowEmptyHours) return false;
  if (jornada === "NOCHE") return totalHours !== 20;
  return false;
}

function isMetaColumn(header: string): boolean {
  return /^(ficha|jornada|trimestre|sabado|director|ambiente|area|total|totales|total horas|horas totales)$/.test(
    normHeader(header),
  );
}

function sheetRows(wb: XLSX.WorkBook, name: string): unknown[][] {
  const sheet = wb.Sheets[name];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null }) as unknown[][];
}

function findAssignSheet(wb: XLSX.WorkBook): string {
  const hit = wb.SheetNames.find((n) =>
    ["asignacion", "asignación", "proyeccion", "proyección"].includes(normHeader(n)),
  );
  return hit ?? wb.SheetNames[0];
}

function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const cells = (rows[i] ?? []).map(cellStr);
    const hasFicha = cells.some((c) => normHeader(c) === "ficha");
    const hasJornada = cells.some((c) => normHeader(c) === "jornada");
    if (hasFicha && hasJornada) return i;
  }
  throw new Error("No se encontró una fila con las columnas FICHA y JORNADA.");
}

function parseArea(rows: unknown[][], headerRow: number): string {
  for (let i = 0; i < headerRow; i++) {
    const row = rows[i] ?? [];
    for (let c = 0; c < row.length; c++) {
      if (normHeader(cellStr(row[c])).startsWith("area")) {
        return cellStr(row[c + 1]) || cellStr(row[c]).replace(/area\s*:?/i, "").trim();
      }
    }
  }
  return "";
}

export function parseWorkbook(
  data: ArrayBuffer,
  fileName: string,
  options?: { allowEmptyHours?: boolean },
): ParsedWorkbook {
  const allowEmptyHours = Boolean(options?.allowEmptyHours);
  const wb = XLSX.read(data, { type: "array" });
  if (!wb.SheetNames.length) throw new Error("El Excel no tiene hojas.");
  const assignName = findAssignSheet(wb);
  const rows = sheetRows(wb, assignName);
  if (!rows.length) throw new Error("La hoja de asignación está vacía.");

  const headerRow = findHeaderRow(rows);
  const header = (rows[headerRow] ?? []).map(cellStr);
  const idx = (pred: (h: string) => boolean) => header.findIndex((h) => pred(normHeader(h)));

  const fichaIdx = idx((h) => h === "ficha");
  const jornadaIdx = idx((h) => h === "jornada");
  const trimestreIdx = idx((h) => h === "trimestre");
  const sabadoIdx = idx((h) => h === "sabado");
  const directorIdx = idx((h) => h === "director");
  const ambienteIdx = idx((h) => h === "ambiente");

  const instructorCols: { index: number; name: string }[] = [];
  header.forEach((name, index) => {
    if (!name || isMetaColumn(name)) return;
    instructorCols.push({ index, name });
  });
  if (!instructorCols.length) {
    throw new Error("No hay columnas de instructores. Debe haber al menos una al lado de FICHA/JORNADA.");
  }

  const warnings: string[] = [];
  const fichas: FichaInput[] = [];

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const name = cellStr(row[fichaIdx]);
    if (!name) continue;
    if (/^totales?$/i.test(name)) continue;
    const jornada = parseJornada(cellStr(row[jornadaIdx]));
    if (!jornada) {
      warnings.push(`Fila ${r + 1}: jornada no reconocida para ${name}.`);
      continue;
    }
    const hours: Record<string, number> = {};
    if (!allowEmptyHours) {
      for (const col of instructorCols) {
        const raw = row[col.index];
        const n = typeof raw === "number" ? raw : Number(cellStr(raw).replace(",", "."));
        if (Number.isFinite(n) && n > 0) hours[col.name] = n;
      }
    }
    const total = Object.values(hours).reduce((a, b) => a + b, 0);
    const trimestreRaw = trimestreIdx >= 0 ? row[trimestreIdx] : null;
    const trimestre =
      typeof trimestreRaw === "number"
        ? trimestreRaw
        : Number(cellStr(trimestreRaw)) || null;
    fichas.push({
      name,
      jornada,
      trimestre: Number.isFinite(trimestre) ? Number(trimestre) : null,
      saturday: parseSaturday(
        sabadoIdx >= 0 ? cellStr(row[sabadoIdx]) : "",
        jornada,
        total,
        allowEmptyHours,
      ),
      director: directorIdx >= 0 ? cellStr(row[directorIdx]) : "",
      ambiente: ambienteIdx >= 0 ? cellStr(row[ambienteIdx]) : "",
      hours,
    });
  }

  if (!fichas.length) throw new Error("No se encontraron fichas en el archivo.");

  const usedInstructors = instructorCols
    .map((c) => c.name)
    .filter((name) => fichas.some((f) => f.hours[name]));

  const instructorNames =
    allowEmptyHours || !usedInstructors.length
      ? instructorCols.map((c) => c.name)
      : usedInstructors;

  const sourceRows: (string | number | null)[][] = rows.map((row) =>
    (row ?? []).map((cell) => {
      if (cell == null || cell === "") return null;
      if (typeof cell === "number") return cell;
      const text = cellStr(cell);
      return text === "" ? null : text;
    }),
  );

  return {
    fileName,
    area: parseArea(rows, headerRow),
    sheetName: assignName,
    sourceRows,
    fichas,
    instructorNames,
    extraRules: buildDefaultRules(instructorNames, fichas),
    warnings,
  };
}
