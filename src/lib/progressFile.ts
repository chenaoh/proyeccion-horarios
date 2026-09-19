import type {
  ExtraRules,
  FichaAssignment,
  ManualPhase,
  ParsedWorkbook,
  Schedule,
  Timeline,
} from "./types";

export const PROGRESS_VERSION = 1;
const START = "<!-- HORARIOS-SENA-AVANCE";
const END = "HORARIOS-SENA-AVANCE -->";

export type ProgressPayload = {
  version: number;
  mode: "manual";
  parsed: ParsedWorkbook;
  extra: ExtraRules;
  phase: ManualPhase;
  timelines: Timeline[];
  fichaTimelineId: Record<string, string>;
  assignments: Record<string, FichaAssignment>;
  schedule: Schedule | null;
};

export function serializeProgress(payload: ProgressPayload): string {
  const saved = Object.values(payload.assignments).filter((a) => a.saved).length;
  const lines = [
    "# Avance · Proyección horarios",
    "",
    `- Área: ${payload.parsed.area || "—"}`,
    `- Archivo: ${payload.parsed.fileName}`,
    `- Paso: ${payload.phase}`,
    `- Fichas: ${payload.parsed.fichas.length}`,
    `- Líneas de tiempo: ${payload.timelines.length}`,
    `- Fichas guardadas: ${saved}/${payload.parsed.fichas.length}`,
    "",
    "## Fichas",
    "",
  ];
  for (const ficha of payload.parsed.fichas) {
    const timeline = payload.timelines.find((t) => t.id === payload.fichaTimelineId[ficha.name]);
    const assignment = payload.assignments[ficha.name];
    lines.push(`### ${ficha.name}`);
    lines.push(`- Jornada: ${ficha.jornada}${ficha.saturday ? " · con sábado" : " · sin sábado"}`);
    lines.push(`- Trimestre: ${ficha.trimestre ?? "—"}`);
    lines.push(`- Línea de tiempo: ${timeline ? timeline.title : "sin asignar"}`);
    lines.push(`- Asignación: ${assignment?.saved ? "guardada" : assignment ? "en curso" : "pendiente"}`);
    lines.push("");
  }
  lines.push("Este archivo se puede volver a cargar en Proyección horarios para continuar.");
  lines.push("");
  lines.push(START);
  lines.push(JSON.stringify({ ...payload, version: PROGRESS_VERSION }));
  lines.push(END);
  lines.push("");
  return lines.join("\n");
}

export function parseProgressMarkdown(text: string): ProgressPayload {
  const start = text.indexOf(START);
  const end = text.indexOf(END, start + START.length);
  if (start < 0 || end < 0) {
    throw new Error("El archivo de avance no tiene el bloque de datos de Proyección horarios.");
  }
  const json = text.slice(start + START.length, end).trim();
  const payload = JSON.parse(json) as ProgressPayload;
  if (payload.mode !== "manual" || !payload.parsed?.fichas) {
    throw new Error("El archivo de avance no corresponde a una asignación manual.");
  }
  return payload;
}
