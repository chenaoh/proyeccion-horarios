"use client";

import { DropZone } from "@/components/DropZone";
import { fichaJornadaKind, timelineFitsFicha, weeklyHoursTarget } from "@/lib/hoursTarget";
import type { FichaInput, Timeline } from "@/lib/types";

type Props = {
  fichas: FichaInput[];
  timelines: Timeline[];
  fichaTimelineId: Record<string, string>;
  onUpload: (fichaName: string, file: File) => void;
  onSelect: (fichaName: string, timelineId: string) => void;
  onContinue: () => void;
  onBackToAssign?: () => void;
  error?: string | null;
};

export function TimelineLinkPanel({
  fichas,
  timelines,
  fichaTimelineId,
  onUpload,
  onSelect,
  onContinue,
  onBackToAssign,
  error,
}: Props) {
  const linkedCount = fichas.filter((ficha) => {
    const timeline = timelines.find((t) => t.id === fichaTimelineId[ficha.name]);
    return Boolean(timeline && timelineFitsFicha(ficha, timeline));
  }).length;
  const missing = fichas
    .filter((ficha) => {
      const timeline = timelines.find((t) => t.id === fichaTimelineId[ficha.name]);
      return !(timeline && timelineFitsFicha(ficha, timeline));
    })
    .map((ficha) => ficha.name);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Líneas de tiempo por ficha
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Cada ficha necesita su línea de tiempo. En el listado solo aparecen las que coinciden
          con la jornada y el trimestre de esa ficha. Puedes volver desde la asignación sin perder
          el avance; si cambias la LT de una ficha, solo se reinicia esa ficha.
        </p>
      </div>
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}
      {missing.length ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Primero debe definir una línea de tiempo
          {missing.length === fichas.length
            ? " en cada ficha."
            : `: ${missing.join(", ")}.`}
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        {fichas.map((ficha) => {
          const compatible = timelines.filter((timeline) => timelineFitsFicha(ficha, timeline));
          const selected = compatible.find((t) => t.id === fichaTimelineId[ficha.name]);
          return (
            <DropZone
              key={ficha.name}
              onFile={(file) => onUpload(ficha.name, file)}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              activeClassName="border-teal-500 bg-teal-50 ring-2 ring-teal-200"
            >
            <article>
              <h3 className="font-semibold text-slate-900">{ficha.name}</h3>
              <p className="mt-1 text-xs text-slate-500">
                {ficha.jornada} ({fichaJornadaKind(ficha.jornada)})
                {ficha.trimestre != null ? ` · T${ficha.trimestre}` : ""}
                {ficha.saturday ? " · con sábado" : " · sin sábado"}
                {` · ${weeklyHoursTarget(ficha)} h`}
                {ficha.ambiente ? ` · ${ficha.ambiente}` : ""}
              </p>
              <label className="mt-3 block text-xs font-semibold text-slate-600">
                Línea de tiempo ya cargada
                <select
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  value={fichaTimelineId[ficha.name] ?? ""}
                  onChange={(e) => {
                    if (e.target.value) onSelect(ficha.name, e.target.value);
                  }}
                >
                  <option value="">
                    {compatible.length
                      ? "Elegir una compatible…"
                      : timelines.length
                        ? "Ninguna de las cargadas coincide con esta ficha"
                        : "Todavía no hay ninguna"}
                  </option>
                  {compatible.map((timeline) => (
                    <option key={timeline.id} value={timeline.id}>
                      {timeline.title} · {timeline.jornadaKind} · T{timeline.trimestres.join("-")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-3 inline-flex cursor-pointer rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800">
                {selected ? "Cargar otra LT para esta ficha" : "Cargar línea de tiempo"}
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onUpload(ficha.name, file);
                    e.target.value = "";
                  }}
                />
              </label>
              {selected ? (
                <p className="mt-2 text-xs text-teal-800">
                  Asignada: {selected.title} ({selected.jornadaKind}, T{selected.trimestres.join("-")})
                </p>
              ) : (
                <p className="mt-2 text-xs text-amber-700">Pendiente</p>
              )}
              <p className="mt-3 text-xs text-slate-400">Arrastra aquí el Excel de la línea de tiempo o usa el botón.</p>
            </article>
            </DropZone>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {onBackToAssign ? (
          <button
            type="button"
            className="text-sm font-semibold text-teal-700 hover:underline"
            onClick={onBackToAssign}
          >
            ← Volver a asignación
          </button>
        ) : null}
        <button
          type="button"
          disabled={linkedCount === 0}
          onClick={onContinue}
          className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Continuar a asignación de instructores
        </button>
      </div>
    </div>
  );
}
