import { weeklyHoursTarget } from "./hoursTarget";
import { resultLabel, resultsForTrimestre } from "./parseTimeline";
import type { AssignmentRow, FichaAssignment, FichaInput, Timeline, TimelineResult } from "./types";

export function hoursOfRows(rows: AssignmentRow[]): number {
  return rows.reduce((sum, row) => sum + (Number.isFinite(row.hours) ? row.hours : 0), 0);
}

export function rowFromResult(fichaName: string, result: TimelineResult, index: number): AssignmentRow {
  return {
    id: `${fichaName}:${result.id}:${index}`,
    sourceResultId: result.id,
    sourceTrimestre: result.trimestre,
    enfoque: result.enfoque,
    ap: result.ap,
    hours: result.hours,
    norma: result.norma,
    codigo: result.codigo,
    resultados: [...result.resultados],
    instructor: "",
    observation: result.ap,
  };
}

export function createFichaAssignment(
  ficha: FichaInput,
  timeline: Timeline,
): FichaAssignment {
  if (ficha.trimestre == null) {
    throw new Error(`${ficha.name}: la proyección no trae trimestre.`);
  }
  if (!timeline.trimestres.includes(ficha.trimestre)) {
    throw new Error(
      `${ficha.name}: la línea de tiempo tiene trimestres ${timeline.trimestres.join(", ")}, no el T${ficha.trimestre}.`,
    );
  }
  const source = resultsForTrimestre(timeline, ficha.trimestre);
  if (!source.length) {
    throw new Error(`${ficha.name}: no hay resultados en el trimestre ${ficha.trimestre} de esa línea de tiempo.`);
  }
  return {
    fichaName: ficha.name,
    timelineId: timeline.id,
    rows: source.map((result, index) => rowFromResult(ficha.name, result, index)),
    saved: false,
  };
}

export function hoursByInstructor(rows: AssignmentRow[]): Record<string, number> {
  const hours: Record<string, number> = {};
  for (const row of rows) {
    if (!row.instructor || row.hours <= 0) continue;
    hours[row.instructor] = (hours[row.instructor] ?? 0) + row.hours;
  }
  return hours;
}

export const INSTRUCTOR_HOUR_ALERT = 40;

export function instructorTotals(assignments: Record<string, FichaAssignment>): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const assignment of Object.values(assignments)) {
    for (const [name, hours] of Object.entries(hoursByInstructor(assignment.rows))) {
      totals[name] = (totals[name] ?? 0) + hours;
    }
  }
  return totals;
}

export function instructorTotalForRow(
  assignments: Record<string, FichaAssignment>,
  instructor: string,
  row: AssignmentRow,
): number {
  if (!instructor) return 0;
  let total = 0;
  for (const assignment of Object.values(assignments)) {
    for (const item of assignment.rows) {
      if (item.id === row.id) continue;
      if (item.instructor === instructor && item.hours > 0) total += item.hours;
    }
  }
  if (row.instructor === instructor && row.hours > 0) total += row.hours;
  return total;
}

export function overloadedInstructors(
  assignments: Record<string, FichaAssignment>,
  limit = INSTRUCTOR_HOUR_ALERT,
): { name: string; hours: number }[] {
  return Object.entries(instructorTotals(assignments))
    .filter(([, hours]) => hours > limit)
    .map(([name, hours]) => ({ name, hours }))
    .sort((a, b) => b.hours - a.hours);
}

export function assignmentIssues(ficha: FichaInput, assignment: FichaAssignment): string[] {
  const target = weeklyHoursTarget(ficha);
  const total = hoursOfRows(assignment.rows);
  const issues: string[] = [];
  if (total > target) issues.push(`Las horas (${total}) superan el tope de ${target} h.`);
  if (total !== target) issues.push(`La ficha debe sumar ${target} h y ahora suma ${total} h.`);
  for (const row of assignment.rows) {
    if (!row.instructor) {
      issues.push(`Falta instructor en: ${resultLabel(row)}.`);
    }
  }
  return issues;
}

export function setRowHours(
  assignment: FichaAssignment,
  ficha: FichaInput,
  rowId: string,
  hours: number,
): { ok: true; assignment: FichaAssignment } | { ok: false; message: string } {
  const target = weeklyHoursTarget(ficha);
  const nextRows = assignment.rows.map((row) => (row.id === rowId ? { ...row, hours } : row));
  const total = hoursOfRows(nextRows);
  if (total > target) {
    return { ok: false, message: `No se puede dejar ${hours} h: el total quedaría en ${total} y el tope es ${target} h.` };
  }
  return { ok: true, assignment: { ...assignment, rows: nextRows, saved: false } };
}

export function setRowInstructor(assignment: FichaAssignment, rowId: string, instructor: string): FichaAssignment {
  return {
    ...assignment,
    saved: false,
    rows: assignment.rows.map((row) => (row.id === rowId ? { ...row, instructor } : row)),
  };
}

export function swapAssignmentRow(
  assignment: FichaAssignment,
  ficha: FichaInput,
  rowId: string,
  incoming: TimelineResult,
): { ok: true; assignment: FichaAssignment } | { ok: false; message: string } {
  const current = assignment.rows.find((row) => row.id === rowId);
  if (!current) return { ok: false, message: "No se encontró la fila a reemplazar." };
  if (incoming.trimestre === ficha.trimestre && incoming.id === current.sourceResultId) {
    return { ok: false, message: "Ese es el mismo resultado." };
  }
  if (assignment.rows.some((row) => row.id !== rowId && row.sourceResultId === incoming.id)) {
    return { ok: false, message: "Ese resultado ya está en esta ficha." };
  }
  const removed = resultLabel(current);
  const nextRow: AssignmentRow = {
    ...current,
    sourceResultId: incoming.id,
    sourceTrimestre: incoming.trimestre,
    enfoque: incoming.enfoque,
    ap: incoming.ap,
    hours: incoming.hours,
    norma: incoming.norma,
    codigo: incoming.codigo,
    resultados: [...incoming.resultados],
    observation: [
      incoming.ap,
      `Este resultado pertenecía al trimestre ${incoming.trimestre}${incoming.trimestreLabel ? ` (${incoming.trimestreLabel})` : ""}.`,
      `El resultado “${removed}” se programa más adelante.`,
    ]
      .filter(Boolean)
      .join(" "),
  };
  const nextRows = assignment.rows.map((row) => (row.id === rowId ? nextRow : row));
  const target = weeklyHoursTarget(ficha);
  const total = hoursOfRows(nextRows);
  if (total > target) {
    return {
      ok: false,
      message: `Ese resultado trae ${incoming.hours} h y el total quedaría en ${total} (tope ${target} h). Ajusta horas antes de traerlo.`,
    };
  }
  return { ok: true, assignment: { ...assignment, rows: nextRows, saved: false } };
}

export function applyAssignmentsToFichas(
  fichas: FichaInput[],
  assignments: Record<string, FichaAssignment>,
): FichaInput[] {
  return fichas.map((ficha) => {
    const assignment = assignments[ficha.name];
    if (!assignment?.saved) return { ...ficha, hours: {} };
    return { ...ficha, hours: hoursByInstructor(assignment.rows) };
  });
}

export function allAssignmentsSaved(fichas: FichaInput[], assignments: Record<string, FichaAssignment>): boolean {
  return fichas.every((ficha) => assignments[ficha.name]?.saved);
}
