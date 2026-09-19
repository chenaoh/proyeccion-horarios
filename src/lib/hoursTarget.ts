import type { FichaInput, Jornada, Timeline, TimelineJornada } from "./types";

export function weeklyHoursTarget(ficha: FichaInput): 20 | 30 {
  if (ficha.jornada === "NOCHE" && !ficha.saturday) return 20;
  return 30;
}

export function fichaJornadaKind(jornada: Jornada): TimelineJornada {
  return jornada === "NOCHE" ? "NOCHE" : "DIA";
}

export function jornadaMatchesTimeline(ficha: FichaInput, kind: TimelineJornada): boolean {
  return fichaJornadaKind(ficha.jornada) === kind;
}

export function timelineFitsFicha(ficha: FichaInput, timeline: Timeline): boolean {
  if (!jornadaMatchesTimeline(ficha, timeline.jornadaKind)) return false;
  if (ficha.trimestre == null) return false;
  return timeline.trimestres.includes(ficha.trimestre);
}
