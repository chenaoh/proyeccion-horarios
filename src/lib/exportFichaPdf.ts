import { PDFDocument, StandardFonts, rgb, type PDFFont, type RGB } from "pdf-lib";
import { allowsSixHours } from "./rules";
import { DAY_LABEL, MANANA, NOCHE, SABADO, TARDE, WEEKDAYS, slotKey } from "./slots";
import type { ExtraRules, FichaAssignment, FichaInput } from "./types";

const PAGE_W = 841.89;
const PAGE_H = 595.28;
const MARGIN = 28;

const NAVY = rgb(0.122, 0.306, 0.475);
const HEADER = rgb(0.18, 0.459, 0.714);
const NAME_BG = rgb(0.776, 0.937, 0.808);
const NAME_FG = rgb(0, 0.38, 0);
const MUTED = rgb(0.949, 0.949, 0.949);
const FOOTER = rgb(0.839, 0.918, 0.973);
const WHITE = rgb(1, 1, 1);
const INK = rgb(0.12, 0.16, 0.22);
const LABEL = rgb(0.122, 0.306, 0.475);
const GRAY = rgb(0.42, 0.45, 0.5);
const LINE = rgb(0.741, 0.843, 0.933);

type Cell = {
  text: string;
  span?: number;
  fill: RGB;
  color: RGB;
  font: "regular" | "bold";
  size?: number;
  align?: "left" | "center";
};

function pdfSafe(value: string): string {
  return value
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/[^\n\r\t\x20-\xff]/g, "");
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  const chunks = pdfSafe(text).split(/\r?\n/);
  for (const raw of chunks) {
    const words = raw.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const pieces = breakWord(word, font, size, maxWidth);
      for (const piece of pieces) {
        const next = current ? `${current} ${piece}` : piece;
        if (!current || font.widthOfTextAtSize(next, size) <= maxWidth) current = next;
        else {
          lines.push(current);
          current = piece;
        }
      }
    }
    if (current) lines.push(current);
  }
  return lines.length ? lines : [""];
}

function breakWord(word: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (font.widthOfTextAtSize(word, size) <= maxWidth) return [word];
  const parts: string[] = [];
  let current = "";
  for (const char of word) {
    const next = current + char;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) current = next;
    else {
      if (current) parts.push(current);
      current = char;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function prettyRange(start: number, end: number): string {
  const n = (h: number) => (h === 12 || h === 0 ? 12 : h > 12 ? h - 12 : h);
  const suf = (h: number) => (h === 12 ? "m" : h < 12 ? "am" : "pm");
  const a = suf(start);
  const b = suf(end === 12 ? 12 : end);
  if (a === b) return `${n(start)}:00 a ${n(end)}:00 ${b}`;
  if (start < 12 && end === 12) return `${n(start)}:00 a 12:00 m`;
  return `${n(start)}:00 ${a} a ${n(end)}:00 ${b}`;
}

function hoursLine(ficha: FichaInput, extra?: ExtraRules): string {
  const hours = Object.entries(ficha.hours)
    .map(([name, value]) => `${name} ${value}h`)
    .join(" · ");
  if (!extra) return `Horas asignadas: ${hours || "—"}`;
  const sixNames = Object.keys(ficha.hours).filter((name) => allowsSixHours(extra, name));
  const six = sixNames.length ? `6 h seguidas: ${sixNames.join(", ")}` : "Nadie de esta ficha tiene 6 h seguidas";
  return `Horas asignadas: ${hours || "—"}  |  ${six}`;
}

export async function exportFichaPdf(
  ficha: FichaInput,
  assigned: Record<string, string>,
  area: string,
  assignment?: FichaAssignment,
  extra?: ExtraRules,
): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular, bold };
  const night = ficha.jornada === "NOCHE";
  const cols = night ? 7 : 6;
  const tableW = PAGE_W - MARGIN * 2;
  const franjaW = 132;
  const dayW = (tableW - franjaW) / (cols - 1);
  const gridWidths = [franjaW, ...Array.from({ length: cols - 1 }, () => dayW)];

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  function newPage() {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  }

  function drawRow(cells: Cell[], widths: number[]) {
    const padX = 4;
    const padY = 4;
    let column = 0;
    const prepared = cells.map((cell) => {
      const span = cell.span ?? 1;
      const width = widths.slice(column, column + span).reduce((sum, value) => sum + value, 0);
      column += span;
      const size = cell.size ?? 8;
      const font = fonts[cell.font];
      const lines = wrap(cell.text, font, size, Math.max(12, width - padX * 2));
      return { cell, width, size, font, lines, lineH: size + 2 };
    });
    const rowH = Math.max(18, ...prepared.map((item) => item.lines.length * item.lineH + padY * 2));
    if (y - rowH < MARGIN) newPage();
    let x = MARGIN;
    for (const item of prepared) {
      page.drawRectangle({
        x,
        y: y - rowH,
        width: item.width,
        height: rowH,
        color: item.cell.fill,
        borderColor: LINE,
        borderWidth: 0.6,
      });
      const visible = item.lines.filter((line) => line.trim());
      const blockH = Math.max(item.lineH, visible.length * item.lineH);
      let textY = y - (rowH - blockH) / 2 - item.size;
      for (const line of visible) {
        const lineW = item.font.widthOfTextAtSize(line, item.size);
        const textX = item.cell.align === "center" ? x + Math.max(padX, (item.width - lineW) / 2) : x + padX;
        page.drawText(line, { x: textX, y: textY, size: item.size, font: item.font, color: item.cell.color });
        textY -= item.lineH;
      }
      x += item.width;
    }
    y -= rowH;
  }

  function title(text: string) {
    drawRow(
      [{ text, span: cols, fill: NAVY, color: WHITE, font: "bold", size: 11, align: "left" }],
      gridWidths,
    );
  }

  function meta(label: string, value: string) {
    drawRow(
      [
        { text: label, fill: MUTED, color: LABEL, font: "bold", size: 8 },
        { text: value.trim() || "—", span: cols - 1, fill: WHITE, color: INK, font: "regular", size: 8 },
      ],
      gridWidths,
    );
  }

  title(ficha.name);
  meta("Ficha", ficha.name);
  meta("Jornada", `${ficha.jornada}${ficha.saturday ? "  ·  con sábado" : "  ·  sin sábado"}`);
  meta("Trimestre", ficha.trimestre != null ? String(ficha.trimestre) : "—");
  meta("Ambiente asignado", ficha.ambiente || "—");
  meta("Director de grupo", ficha.director || "—");
  meta("Área", area || "—");
  y -= 8;

  title(ficha.trimestre != null ? `Enfoque del trimestre ${ficha.trimestre}` : "Enfoque del trimestre");
  const enfoque = assignment?.rows.find((row) => row.enfoque.trim())?.enfoque.trim() || "—";
  drawRow(
    [{ text: enfoque, span: cols, fill: WHITE, color: INK, font: "regular", size: 8 }],
    gridWidths,
  );
  y -= 8;

  const headers = night ? ["Franja", ...WEEKDAYS.map((day) => DAY_LABEL[day]), "Sábado"] : ["Franja", ...WEEKDAYS.map((day) => DAY_LABEL[day])];
  drawRow(
    headers.map((text) => ({ text, fill: HEADER, color: WHITE, font: "bold" as const, size: 8, align: "center" as const })),
    gridWidths,
  );

  function nameCell(who: string): Cell {
    const text = who.trim();
    if (!text) return { text: "—", fill: WHITE, color: GRAY, font: "regular", size: 7.5, align: "center" };
    return { text, fill: NAME_BG, color: NAME_FG, font: "regular", size: 7.5, align: "center" };
  }

  if (night) {
    for (const band of [
      { label: prettyRange(18, 20), key: "18-20" },
      { label: prettyRange(20, 22), key: "20-22" },
    ]) {
      const dayCells = WEEKDAYS.map((day) => {
        const slot = NOCHE.find((item) => item.day === day && item.label === band.key);
        return nameCell(slot ? (assigned[slotKey(slot)] ?? "") : "");
      });
      drawRow(
        [
          { text: band.label, fill: MUTED, color: LABEL, font: "bold", size: 7.5 },
          ...dayCells,
          { text: "ver filas sábado", fill: MUTED, color: GRAY, font: "regular", size: 7, align: "center" },
        ],
        gridWidths,
      );
    }
    for (const slot of SABADO) {
      const who = !ficha.saturday ? "" : (assigned[slotKey(slot)] ?? "");
      drawRow(
        [
          { text: `Sábado ${prettyRange(slot.start, slot.end)}`, fill: MUTED, color: LABEL, font: "bold", size: 7.5 },
          ...WEEKDAYS.map(() => ({ text: "", fill: WHITE, color: GRAY, font: "regular" as const, size: 7.5 })),
          ficha.saturday
            ? nameCell(who)
            : { text: "No se programa", fill: MUTED, color: GRAY, font: "regular", size: 7, align: "center" },
        ],
        gridWidths,
      );
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
    for (const [label, key] of bands) {
      drawRow(
        [
          { text: label, fill: MUTED, color: LABEL, font: "bold", size: 8 },
          ...WEEKDAYS.map((day) => {
            const slot = pool.find((item) => item.day === day && item.label === key);
            return nameCell(slot ? (assigned[slotKey(slot)] ?? "") : "");
          }),
        ],
        gridWidths,
      );
    }
  }

  drawRow(
    [{ text: hoursLine(ficha, extra), span: cols, fill: FOOTER, color: INK, font: "regular", size: 8 }],
    gridWidths,
  );

  if (assignment) {
    y -= 10;
    title("Asignación de instructores y resultados");
    const assignHeaders = ["Norma de competencia", "Resultado", "Instructor", "Horas", "Observación"];
    const assignWidths = [150, 190, 120, 46, tableW - 150 - 190 - 120 - 46];
    drawRow(
      assignHeaders.map((text) => ({
        text,
        fill: HEADER,
        color: WHITE,
        font: "bold" as const,
        size: 8,
        align: "center" as const,
      })),
      assignWidths,
    );
    for (const row of assignment.rows) {
      drawRow(
        [
          { text: row.norma || "—", fill: row.norma ? MUTED : WHITE, color: row.norma ? LABEL : GRAY, font: "bold", size: 7.5 },
          { text: row.resultados.join("\n") || "—", fill: WHITE, color: INK, font: "regular", size: 7.5 },
          row.instructor
            ? { text: row.instructor, fill: NAME_BG, color: NAME_FG, font: "regular", size: 7.5, align: "center" }
            : { text: "—", fill: WHITE, color: GRAY, font: "regular", size: 7.5, align: "center" },
          { text: String(row.hours), fill: WHITE, color: INK, font: "regular", size: 8, align: "center" },
          { text: row.observation || row.ap || "—", fill: WHITE, color: INK, font: "regular", size: 7.5 },
        ],
        assignWidths,
      );
    }
  }

  const bytes = await doc.save();
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}
