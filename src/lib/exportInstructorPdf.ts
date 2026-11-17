import { PDFDocument, StandardFonts, rgb, type PDFFont, type RGB } from "pdf-lib";
import { DAY_LABEL, SABADO, WEEKDAYS } from "./slots";
import type { Day } from "./types";

const PAGE_W = 841.89;
const PAGE_H = 595.28;
const MARGIN = 28;

const NAVY = rgb(0.122, 0.306, 0.475);
const HEADER = rgb(0.184, 0.459, 0.71);
const NAME_BG = rgb(0.776, 0.937, 0.808);
const NAME_FG = rgb(0.05, 0.35, 0.16);
const MUTED = rgb(0.949, 0.949, 0.949);
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

export type InstructorPdfTopic = {
  ficha: string;
  result: string;
  observation: string;
  hours: number;
};

export type InstructorPdfRow = {
  dayKey: Day;
  start: number;
  end: number;
  ficha: string;
};

const WEEK_BANDS = [
  { label: "6:00 a 9:00 am", start: 6, end: 9 },
  { label: "9:00 a 12:00 m", start: 9, end: 12 },
  { label: "12:00 m a 3:00 pm", start: 12, end: 15 },
  { label: "3:00 a 6:00 pm", start: 15, end: 18 },
  { label: "6:00 a 8:00 pm", start: 18, end: 20 },
  { label: "8:00 a 10:00 pm", start: 20, end: 22 },
];

const SATURDAY_LABELS: Record<string, string> = {
  "8-10": "Sábado 8:00 a 10:00 am",
  "10-12": "Sábado 10:00 a 12:00 m",
  "12-14": "Sábado 12:00 m a 2:00 pm",
  "14-16": "Sábado 2:00 a 4:00 pm",
  "16-18": "Sábado 4:00 a 6:00 pm",
};

function pdfSafe(value: string): string {
  return value.replace(/\u2013|\u2014/g, "-").replace(/\u00a0/g, " ").replace(/[^\n\r\t\x20-\xff]/g, "");
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const raw of pdfSafe(text).split(/\r?\n/)) {
    const words = raw.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (!current || font.widthOfTextAtSize(next, size) <= maxWidth) current = next;
      else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines.length ? lines : [""];
}

function fichasAt(rows: InstructorPdfRow[], day: Day, start: number, end: number): string {
  return rows
    .filter((row) => row.dayKey === day && row.start === start && row.end === end)
    .map((row) => row.ficha)
    .join("\n");
}

export async function exportInstructorPdf(input: {
  name: string;
  total: number;
  rows: InstructorPdfRow[];
  topics: InstructorPdfTopic[];
}): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular, bold };
  const tableW = PAGE_W - MARGIN * 2;
  const franjaW = 148;
  const dayW = (tableW - franjaW) / 6;
  const gridWidths = [franjaW, ...Array.from({ length: 6 }, () => dayW)];

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  function newPage() {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  }

  function drawRow(cells: Cell[], widths: number[]) {
    const padX = 4;
    const padY = 3;
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
    const rowH = Math.max(16, ...prepared.map((item) => item.lines.length * item.lineH + padY * 2));
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

  function nameCell(text: string): Cell {
    const value = text.trim();
    if (!value) return { text: "—", fill: WHITE, color: GRAY, font: "regular", size: 7, align: "center" };
    return { text: value, fill: NAME_BG, color: NAME_FG, font: "regular", size: 7, align: "center" };
  }

  drawRow(
    [{ text: `${input.name}  ·  ${input.total} h / semana`, span: 7, fill: NAVY, color: WHITE, font: "bold", size: 12 }],
    gridWidths,
  );
  drawRow(
    ["Franja", ...WEEKDAYS.map((day) => DAY_LABEL[day]), "Sábado"].map((text) => ({
      text,
      fill: HEADER,
      color: WHITE,
      font: "bold" as const,
      size: 8,
      align: "center" as const,
    })),
    gridWidths,
  );

  for (const band of WEEK_BANDS) {
    drawRow(
      [
        { text: band.label, fill: MUTED, color: LABEL, font: "bold", size: 7.5 },
        ...WEEKDAYS.map((day) => nameCell(fichasAt(input.rows, day, band.start, band.end))),
        band.start === 18
          ? { text: "ver filas sábado", fill: MUTED, color: GRAY, font: "regular" as const, size: 7, align: "center" as const }
          : nameCell(""),
      ],
      gridWidths,
    );
  }
  for (const slot of SABADO) {
    drawRow(
      [
        {
          text: SATURDAY_LABELS[`${slot.start}-${slot.end}`] ?? "Sábado",
          fill: MUTED,
          color: LABEL,
          font: "bold",
          size: 7.5,
        },
        ...WEEKDAYS.map(() => nameCell("")),
        nameCell(fichasAt(input.rows, "sab", slot.start, slot.end)),
      ],
      gridWidths,
    );
  }

  y -= 12;
  drawRow(
    [{ text: "Temáticas", span: 4, fill: NAVY, color: WHITE, font: "bold", size: 11 }],
    [tableW * 0.28, tableW * 0.1, tableW * 0.32, tableW * 0.3],
  );
  const topicWidths = [tableW * 0.28, tableW * 0.1, tableW * 0.32, tableW * 0.3];
  drawRow(
    ["Ficha", "Horas", "Resultado", "Observación"].map((text) => ({
      text,
      fill: HEADER,
      color: WHITE,
      font: "bold" as const,
      size: 8,
      align: "center" as const,
    })),
    topicWidths,
  );
  if (!input.topics.length) {
    drawRow(
      [{ text: "Este instructor todavía no tiene temas asignados.", span: 4, fill: WHITE, color: GRAY, font: "regular", size: 8 }],
      topicWidths,
    );
  }
  for (const topic of input.topics) {
    drawRow(
      [
        { text: topic.ficha, fill: MUTED, color: LABEL, font: "bold", size: 7.5 },
        { text: `${topic.hours} h`, fill: WHITE, color: INK, font: "regular", size: 8, align: "center" },
        { text: topic.result, fill: WHITE, color: INK, font: "regular", size: 7.5 },
        { text: topic.observation, fill: WHITE, color: INK, font: "regular", size: 7.5 },
      ],
      topicWidths,
    );
  }

  const bytes = await doc.save();
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}
