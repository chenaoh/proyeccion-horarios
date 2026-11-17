"use client";

import { useState } from "react";
import { INSTRUCTOR_HOUR_ALERT } from "@/lib/assignment";
import { namesMatch } from "@/lib/names";
import { DAY_LABEL, SABADO, WEEKDAYS } from "@/lib/slots";
import type { Day, FichaAssignment, FichaInput } from "@/lib/types";

export type InstructorAgenda = {
  name: string;
  total: number;
  rows: {
    dayKey: Day;
    start: number;
    end: number;
    ficha: string;
    hours: number;
  }[];
};

export type InstructorTopic = {
  ficha: string;
  result: string;
  observation: string;
  hours: number;
};

const WEEK_BANDS = [
  { label: "6:00 a 9:00 am", start: 6, end: 9 },
  { label: "9:00 a 12:00 m", start: 9, end: 12 },
  { label: "12:00 m a 3:00 pm", start: 12, end: 15 },
  { label: "3:00 a 6:00 pm", start: 15, end: 18 },
  { label: "6:00 a 8:00 pm", start: 18, end: 20 },
  { label: "8:00 a 10:00 pm", start: 20, end: 22 },
];

function fichasAt(rows: InstructorAgenda["rows"], day: Day, start: number, end: number): string[] {
  return rows.filter((row) => row.dayKey === day && row.start === start && row.end === end).map((row) => row.ficha);
}

function Cell({ names }: { names: string[] }) {
  if (!names.length) {
    return <td className="border border-slate-200 bg-white px-2 py-2 text-center text-sm text-slate-300">—</td>;
  }
  return (
    <td className="border border-emerald-200 bg-emerald-100 px-2 py-2 text-center text-xs font-medium leading-snug text-emerald-950">
      {names.map((name) => (
        <span key={name} className="block">
          {name}
        </span>
      ))}
    </td>
  );
}

export function topicsForInstructor(
  name: string,
  fichas: FichaInput[],
  assignments: Record<string, FichaAssignment>,
): InstructorTopic[] {
  const topics: InstructorTopic[] = [];
  for (const ficha of fichas) {
    const assignment = assignments[ficha.name];
    if (!assignment) continue;
    for (const row of assignment.rows) {
      if (!namesMatch(row.instructor, name)) continue;
      topics.push({
        ficha: ficha.name,
        result: row.resultados.filter(Boolean).join("\n") || "Sin resultado",
        observation: (row.observation || row.ap).trim() || "Sin observación",
        hours: row.hours,
      });
    }
  }
  return topics;
}

export function InstructorPanel({
  agenda,
  fichas,
  assignments,
  onExportPdf,
}: {
  agenda: InstructorAgenda[];
  fichas: FichaInput[];
  assignments: Record<string, FichaAssignment>;
  onExportPdf: (name: string) => void;
}) {
  const [openName, setOpenName] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {agenda.map((inst) => {
        const open = openName === inst.name;
        const over = inst.total > INSTRUCTOR_HOUR_ALERT;
        const topics = open ? topicsForInstructor(inst.name, fichas, assignments) : [];
        return (
          <article key={inst.name} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <header className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 px-4 py-3 text-white">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenName(open ? null : inst.name)}
                className="text-left"
              >
                <h3 className="font-semibold underline decoration-white/40 underline-offset-2">{inst.name}</h3>
                <p className="text-xs text-slate-300">
                  {inst.total} h / semana
                  {over ? ` · más de ${INSTRUCTOR_HOUR_ALERT} h` : inst.total > 0 ? " · dentro del aviso" : ""}
                </p>
              </button>
              {open ? (
                <button
                  type="button"
                  onClick={() => onExportPdf(inst.name)}
                  className="rounded-lg border border-white/30 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                >
                  PDF de este instructor
                </button>
              ) : null}
            </header>
            {open ? (
              <div className="space-y-4 p-4">
                <InstructorGrid rows={inst.rows} />
                <div>
                  <p className="mb-2 text-sm font-semibold text-slate-800">Temáticas</p>
                  {topics.length ? (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {topics.map((topic, index) => (
                        <article
                          key={`${topic.ficha}-${topic.result}-${index}`}
                          className="rounded-lg border border-teal-200 bg-teal-50/40 p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">{topic.ficha}</p>
                            <p className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-teal-900">
                              {topic.hours} h
                            </p>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-xs text-slate-500">{topic.result}</p>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-slate-800">{topic.observation}</p>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">Este instructor todavía no tiene temas asignados.</p>
                  )}
                </div>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function InstructorGrid({ rows }: { rows: InstructorAgenda["rows"] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-sky-700 text-xs uppercase tracking-wide text-white">
            <th className="border border-sky-800 px-3 py-2 text-left font-semibold">Franja</th>
            {WEEKDAYS.map((day) => (
              <th key={day} className="border border-sky-800 px-3 py-2 font-semibold">
                {DAY_LABEL[day]}
              </th>
            ))}
            <th className="border border-sky-800 px-3 py-2 font-semibold">Sábado</th>
          </tr>
        </thead>
        <tbody>
          {WEEK_BANDS.map((band) => (
            <tr key={band.label}>
              <th className="border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-medium text-slate-700">
                {band.label}
              </th>
              {WEEKDAYS.map((day) => (
                <Cell key={day} names={fichasAt(rows, day, band.start, band.end)} />
              ))}
              {band.start === 18 ? (
                <td className="border border-slate-200 bg-slate-50 px-2 py-2 text-center text-xs text-slate-400">
                  ver filas sábado
                </td>
              ) : (
                <Cell names={[]} />
              )}
            </tr>
          ))}
          {SABADO.map((slot) => (
            <tr key={slot.label}>
              <th className="border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-medium text-slate-700">
                Sábado {saturdayLabel(slot.start, slot.end)}
              </th>
              {WEEKDAYS.map((day) => (
                <Cell key={day} names={[]} />
              ))}
              <Cell names={fichasAt(rows, "sab", slot.start, slot.end)} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function saturdayLabel(start: number, end: number): string {
  const labels: Record<string, string> = {
    "8-10": "8:00 a 10:00 am",
    "10-12": "10:00 a 12:00 m",
    "12-14": "12:00 m a 2:00 pm",
    "14-16": "2:00 a 4:00 pm",
    "16-18": "4:00 a 6:00 pm",
  };
  return labels[`${start}-${end}`] ?? "";
}
