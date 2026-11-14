"use client";

import { useMemo, useState } from "react";
import { AddInstructorForm } from "@/components/AddInstructorForm";
import {
  assignmentIssues,
  hoursByInstructor,
  hoursOfRows,
  INSTRUCTOR_HOUR_ALERT,
  instructorTotalForRow,
  instructorTotals,
  overloadedInstructors,
} from "@/lib/assignment";
import { weeklyHoursTarget } from "@/lib/hoursTarget";
import { resultLabel, trimestreEnfoque, trimestreResultCount } from "@/lib/parseTimeline";
import type { AssignmentRow, FichaAssignment, FichaInput, Timeline } from "@/lib/types";

type Props = {
  fichas: FichaInput[];
  instructors: string[];
  timelines: Timeline[];
  assignments: Record<string, FichaAssignment>;
  openFicha: string | null;
  onOpen: (name: string | null) => void;
  onHours: (fichaName: string, rowId: string, hours: number) => void;
  onInstructor: (fichaName: string, rowId: string, instructor: string) => void;
  onDirector: (fichaName: string, director: string) => void;
  onSaturday: (fichaName: string, saturday: boolean) => void;
  onObservation: (fichaName: string, rowId: string, observation: string) => void;
  onAddInstructor: (name: string) => string | null;
  onSwap: (fichaName: string, rowId: string, resultId: string) => void;
  onSave: (fichaName: string) => void;
  onContinue: () => void;
  onBackToTimelines?: () => void;
  message?: string | null;
};

function otherResults(timeline: Timeline, assignment: FichaAssignment, row: AssignmentRow) {
  return timeline.results.filter(
    (result) =>
      result.id !== row.sourceResultId &&
      !assignment.rows.some((other) => other.id !== row.id && other.sourceResultId === result.id),
  );
}

function OverloadAlert({ items }: { items: { name: string; hours: number }[] }) {
  if (!items.length) return null;
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p className="font-semibold">Alerta: hay instructores por encima de {INSTRUCTOR_HOUR_ALERT} h</p>
      <p className="mt-1 text-xs">
        Se puede dejar así; es solo un aviso de carga. No bloquea guardar ni generar.
      </p>
      <ul className="mt-2 list-disc pl-5">
        {items.map((item) => (
          <li key={item.name}>
            {item.name}: <span className="font-semibold">{item.hours} h</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function InstructorProgress({
  instructors,
  assignments,
}: {
  instructors: string[];
  assignments: Record<string, FichaAssignment>;
}) {
  const totals = instructorTotals(assignments);
  const rows = instructors
    .map((name) => ({ name, hours: totals[name] ?? 0 }))
    .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name, "es"));

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="bg-slate-900 px-4 py-3 text-white">
        <h3 className="text-sm font-semibold">Avance por instructor</h3>
        <p className="text-xs text-slate-300">Horas totales en todas las fichas. El aviso es a partir de {INSTRUCTOR_HOUR_ALERT} h.</p>
      </header>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
              <th className="px-4 py-2">Instructor</th>
              <th className="px-4 py-2">Horas totales</th>
              <th className="px-4 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const over = row.hours > INSTRUCTOR_HOUR_ALERT;
              return (
                <tr key={row.name} className={over ? "bg-amber-50" : ""}>
                  <td className="border-t border-slate-100 px-4 py-2 font-medium">{row.name}</td>
                  <td className="border-t border-slate-100 px-4 py-2">{row.hours} h</td>
                  <td className="border-t border-slate-100 px-4 py-2 text-xs">
                    {over ? (
                      <span className="font-semibold text-amber-800">Más de {INSTRUCTOR_HOUR_ALERT} h</span>
                    ) : row.hours > 0 ? (
                      <span className="text-slate-500">Dentro del aviso</span>
                    ) : (
                      <span className="text-slate-400">Sin horas</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function AssignmentBoard({
  fichas,
  instructors,
  timelines,
  assignments,
  openFicha,
  onOpen,
  onHours,
  onInstructor,
  onDirector,
  onSaturday,
  onObservation,
  onAddInstructor,
  onSwap,
  onSave,
  onContinue,
  onBackToTimelines,
  message,
}: Props) {
  const [view, setView] = useState<"fichas" | "instructores">("fichas");
  const allSaved = fichas.every((ficha) => assignments[ficha.name]?.saved);
  const open = openFicha ? fichas.find((f) => f.name === openFicha) : null;
  const openAssignment = open ? assignments[open.name] : null;
  const openTimeline = openAssignment
    ? timelines.find((t) => t.id === openAssignment.timelineId)
    : null;
  const overload = useMemo(() => overloadedInstructors(assignments), [assignments]);

  const missingTimelines = fichas.filter((ficha) => !assignments[ficha.name]).map((ficha) => ficha.name);

  if (open && openAssignment) {
    const target = weeklyHoursTarget(open);
    const total = hoursOfRows(openAssignment.rows);
    const issues = assignmentIssues(open, openAssignment);
    const enfoque =
      openTimeline && open.trimestre != null
        ? trimestreEnfoque(openTimeline, open.trimestre)
        : openAssignment.rows.find((row) => row.enfoque.trim())?.enfoque ?? "";
    const resultCount =
      openTimeline && open.trimestre != null
        ? trimestreResultCount(openTimeline, open.trimestre)
        : openAssignment.rows.reduce((sum, row) => sum + Math.max(row.resultados.length, 1), 0);
    const directorOptions = [...new Set([...instructors, open.director].filter(Boolean))];
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <button type="button" className="text-sm font-semibold text-teal-700 hover:underline" onClick={() => onOpen(null)}>
            ← Todas las fichas
          </button>
          {onBackToTimelines ? (
            <button type="button" className="text-sm font-semibold text-teal-700 hover:underline" onClick={onBackToTimelines}>
              Volver a líneas de tiempo
            </button>
          ) : null}
        </div>
        <header className="rounded-xl bg-slate-900 px-5 py-4 text-white">
          <h2 className="text-lg font-semibold">{open.name}</h2>
          <p className="mt-1 text-xs text-slate-300">
            {open.jornada}
            {open.trimestre != null ? ` · T${open.trimestre}` : ""}
            {open.saturday ? " · con sábado" : " · sin sábado"}
            {open.ambiente ? ` · ${open.ambiente}` : ""}
            {` · ${total} / ${target} h`}
          </p>
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-300">Enfoque</p>
            {enfoque ? (
              <p className="mt-1 whitespace-pre-wrap text-sm font-medium leading-relaxed text-teal-100">{enfoque}</p>
            ) : (
              <p className="mt-1 text-sm text-slate-400">No viene en la línea de tiempo para este trimestre</p>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <p className="text-sm text-slate-200">
              {resultCount} {resultCount === 1 ? "resultado" : "resultados"} en el trimestre
              {open.trimestre != null ? ` T${open.trimestre}` : ""}
            </p>
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={open.saturday}
                onChange={(event) => onSaturday(open.name, event.target.checked)}
              />
              Programar sábado
            </label>
            <label className="text-xs font-semibold text-slate-300">
              Director de grupo
              <select
                value={open.director}
                onChange={(e) => onDirector(open.name, e.target.value)}
                className="mt-1 block min-w-[14rem] rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm font-medium text-white"
              >
                <option value="">Sin director</option>
                {directorOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-4 rounded-lg bg-slate-800 px-3 py-3">
            <AddInstructorForm tone="dark" onAdd={onAddInstructor} />
          </div>
        </header>
        {message ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{message}</div>
        ) : null}
        <OverloadAlert items={overload} />
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
                <th className="border border-slate-200 px-3 py-2">Norma de competencia</th>
                <th className="border border-slate-200 px-3 py-2">Resultados</th>
                <th className="border border-slate-200 px-3 py-2">Horas</th>
                <th className="border border-slate-200 px-3 py-2">Instructor</th>
                <th className="border border-slate-200 px-3 py-2">Observación</th>
                <th className="border border-slate-200 px-3 py-2">Otro trimestre</th>
              </tr>
            </thead>
            <tbody>
              {openAssignment.rows.map((row) => {
                const selectedTotal = row.instructor
                  ? instructorTotalForRow(assignments, row.instructor, row)
                  : 0;
                const selectedOver = selectedTotal > INSTRUCTOR_HOUR_ALERT;
                return (
                  <tr key={row.id} className="align-top">
                    <td className="border border-slate-200 px-3 py-2">
                      <p className="font-medium text-slate-900">{row.norma || "—"}</p>
                      {row.codigo ? <p className="mt-1 text-[11px] text-slate-500">{row.codigo}</p> : null}
                    </td>
                    <td className="border border-slate-200 px-3 py-2">
                      {row.resultados.length ? (
                        <ul className="list-disc space-y-1 pl-4 text-xs text-slate-700">
                          {row.resultados.map((rap) => (
                            <li key={rap}>{rap}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="border border-slate-200 px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={row.hours}
                        onChange={(e) => onHours(open.name, row.id, Number(e.target.value) || 0)}
                        className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="border border-slate-200 px-3 py-2">
                      <select
                        value={row.instructor}
                        onChange={(e) => onInstructor(open.name, row.id, e.target.value)}
                        className="max-w-[14rem] rounded border border-slate-300 px-2 py-1 text-sm"
                      >
                        <option value="">Elegir…</option>
                        {instructors.map((name) => {
                          const current = instructorTotalForRow(assignments, name, row);
                          return (
                            <option key={name} value={name}>
                              {name} · {current} h
                            </option>
                          );
                        })}
                      </select>
                      {row.instructor ? (
                        <p className={`mt-1 text-xs ${selectedOver ? "font-semibold text-amber-800" : "text-slate-500"}`}>
                          Total actual: {selectedTotal} h
                          {selectedOver ? ` · más de ${INSTRUCTOR_HOUR_ALERT} h` : ""}
                        </p>
                      ) : null}
                    </td>
                    <td className="border border-slate-200 px-3 py-2">
                      <textarea
                        value={row.observation}
                        rows={2}
                        onChange={(event) => onObservation(open.name, row.id, event.target.value)}
                        className="w-full min-w-[12rem] rounded border border-slate-300 px-2 py-1 text-xs text-slate-800"
                      />
                    </td>
                    <td className="border border-slate-200 px-3 py-2">
                      <select
                        className="max-w-[14rem] rounded border border-slate-300 px-2 py-1 text-xs"
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) onSwap(open.name, row.id, e.target.value);
                          e.target.value = "";
                        }}
                      >
                        <option value="">Traer otro resultado…</option>
                        {openTimeline
                          ? otherResults(openTimeline, openAssignment, row).map((result) => (
                              <option key={result.id} value={result.id}>
                                T{result.trimestre} · {result.hours}h · {resultLabel(result).slice(0, 60)}
                              </option>
                            ))
                          : null}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={`text-sm ${total === target ? "text-emerald-700" : "text-amber-800"}`}>
            Total {total} h de {target} h en esta ficha
          </p>
          <button
            type="button"
            disabled={issues.length > 0}
            onClick={() => onSave(open.name)}
            className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-40"
            title={issues[0]}
          >
            Guardar asignación de esta ficha
          </button>
        </div>
        {issues.length ? (
          <ul className="list-disc rounded-lg border border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-900">
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Asignación por ficha</h2>
        <p className="mt-1 text-sm text-slate-600">
          Consulta el avance por ficha o por instructor. Entra a cada ficha para asignar. El total de la ficha
          debe cerrar en 20 o 30 h; si un instructor pasa de {INSTRUCTOR_HOUR_ALERT} h solo se avisa.
        </p>
      </div>
      <AddInstructorForm onAdd={onAddInstructor} />
      {message ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{message}</div>
      ) : null}
      {missingTimelines.length ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Primero debe definir una línea de tiempo: {missingTimelines.join(", ")}.
        </div>
      ) : null}
      <OverloadAlert items={overload} />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setView("fichas")}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
            view === "fichas" ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"
          }`}
        >
          Avance por fichas
        </button>
        <button
          type="button"
          onClick={() => setView("instructores")}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
            view === "instructores" ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"
          }`}
        >
          Avance por instructores
        </button>
      </div>

      {view === "instructores" ? (
        <InstructorProgress instructors={instructors} assignments={assignments} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {fichas.map((ficha) => {
            const assignment = assignments[ficha.name];
            const total = assignment ? hoursOfRows(assignment.rows) : 0;
            const target = weeklyHoursTarget(ficha);
            const byInst = assignment ? hoursByInstructor(assignment.rows) : {};
            const hasTimeline = Boolean(assignment);
            const body = (
              <>
                <h3 className="font-semibold text-slate-900">{ficha.name}</h3>
                <p className="mt-1 text-sm font-medium text-slate-700">
                  Director de grupo: {ficha.director || "Sin director"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {ficha.jornada}
                  {ficha.trimestre != null ? ` · T${ficha.trimestre}` : ""}
                  {` · ${total} / ${target} h asignadas`}
                </p>
                {hasTimeline ? (
                  Object.keys(byInst).length ? (
                    <p className="mt-2 text-xs text-slate-600">
                      {Object.entries(byInst)
                        .sort((a, b) => b[1] - a[1])
                        .map(([name, hours]) => `${name} ${hours}h`)
                        .join(" · ")}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-slate-400">Todavía sin instructores</p>
                  )
                ) : (
                  <p className="mt-2 text-xs font-semibold text-amber-800">
                    Primero debe definir una línea de tiempo
                  </p>
                )}
                {hasTimeline ? (
                  <p className={`mt-2 text-xs font-semibold ${assignment?.saved ? "text-emerald-700" : "text-amber-700"}`}>
                    {assignment?.saved ? "Asignación guardada" : "Pendiente de guardar"}
                  </p>
                ) : null}
              </>
            );
            if (!hasTimeline) {
              return (
                <article
                  key={ficha.name}
                  className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-left shadow-sm"
                >
                  {body}
                </article>
              );
            }
            return (
              <button
                key={ficha.name}
                type="button"
                onClick={() => onOpen(ficha.name)}
                className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-teal-400"
              >
                {body}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {onBackToTimelines ? (
          <button
            type="button"
            className="text-sm font-semibold text-teal-700 hover:underline"
            onClick={onBackToTimelines}
          >
            ← Volver a líneas de tiempo
          </button>
        ) : null}
        <button
          type="button"
          disabled={!allSaved}
          onClick={onContinue}
          className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Continuar a restricciones
        </button>
      </div>
    </div>
  );
}
