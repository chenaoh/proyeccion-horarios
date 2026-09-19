'use client';

import { useState } from "react";
import { DAY_LABEL, DAYS, formatHour } from "@/lib/slots";
import { hoursOf, maxSaturdayOf, allowsSixHours } from "@/lib/rules";
import { inNameList, namesMatch } from "@/lib/names";
import type { Day, ExtraRules, OccupiedRange, ParsedWorkbook } from "@/lib/types";

const HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];

type Props = {
  parsed: ParsedWorkbook;
  extra: ExtraRules;
  onChange: (next: ExtraRules) => void;
};

export function RestrictionsPanel({ parsed, extra, onChange }: Props) {
  const [draftDay, setDraftDay] = useState<Record<string, Day>>({});
  const [draftStart, setDraftStart] = useState<Record<string, number>>({});
  const [draftEnd, setDraftEnd] = useState<Record<string, number>>({});

  function toggleList(list: "noNoche" | "noSabado", name: string) {
    const current = extra[list];
    const next = inNameList(name, current)
      ? current.filter((n) => !namesMatch(n, name))
      : [...current, name];
    onChange({ ...extra, [list]: next });
  }

  function addOccupied(name: string) {
    const day = draftDay[name] ?? "lun";
    const start = draftStart[name] ?? 6;
    const end = draftEnd[name] ?? 9;
    if (end <= start) return;
    const range: OccupiedRange = {
      day,
      start,
      end,
      raw: `${DAY_LABEL[day]} ${formatHour(start)}-${formatHour(end)}`,
    };
    onChange({
      ...extra,
      occupied: {
        ...extra.occupied,
        [name]: [...(extra.occupied[name] ?? []), range],
      },
    });
  }

  function removeOccupied(name: string, index: number) {
    onChange({
      ...extra,
      occupied: {
        ...extra.occupied,
        [name]: (extra.occupied[name] ?? []).filter((_, i) => i !== index),
      },
    });
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Fichas cargadas ({parsed.fichas.length})
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          El área, las fichas y los instructores salen del Excel. El sábado de cada ficha sale de la columna
          SABADO. El tope de 11 h al día es fijo. Las 6 h seguidas en una ficha se marcan por instructor, más abajo.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {parsed.fichas.map((ficha) => (
            <article key={ficha.name} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="font-semibold text-slate-900">{ficha.name}</h3>
              <p className="mt-1 text-xs text-slate-500">
                {ficha.jornada}
                {ficha.trimestre != null ? ` · T${ficha.trimestre}` : ""}
                {ficha.saturday ? " · sábado SI" : " · sábado NO"}
                {ficha.director ? ` · Dir. ${ficha.director}` : ""}
                {ficha.ambiente ? ` · ${ficha.ambiente}` : ""}
                {` · ${hoursOf(ficha)} h`}
              </p>
              <p className="mt-2 text-xs text-slate-600">
                {Object.entries(ficha.hours)
                  .map(([n, h]) => `${n} ${h}h`)
                  .join(" · ")}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Restricciones por instructor ({parsed.instructorNames.length})
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Franjas ocupadas no se programan. Nadie puede pasar de 11 h el mismo día sumando mañana, tarde y noche.
          Las 6 h seguidas son opcionales y solo aplican dentro de una misma ficha; el check sale apagado.
        </p>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {parsed.instructorNames.map((name) => {
            const occupied = extra.occupied[name] ?? [];
            return (
              <article key={name} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="font-semibold">{name}</h3>
                <div className="mt-3 flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={inNameList(name, extra.noNoche)}
                      onChange={() => toggleList("noNoche", name)}
                    />
                    Sin noche L–V
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={inNameList(name, extra.noSabado)}
                      onChange={() => toggleList("noSabado", name)}
                    />
                    Sin sábado
                  </label>
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={allowsSixHours(extra, name)}
                      onChange={(e) =>
                        onChange({
                          ...extra,
                          allowSixHourBlocks: {
                            ...extra.allowSixHourBlocks,
                            [name]: e.target.checked,
                          },
                        })
                      }
                    />
                    <span>
                      6 horas seguidas en una ficha
                      <span className="block text-xs text-slate-500">
                        Opcional. Permite dos bloques de 3 h seguidos en la misma ficha. El tope de 11 h al día se mantiene igual.
                      </span>
                    </span>
                  </label>
                </div>
                <fieldset className="mt-3 text-sm">
                  <legend className="text-xs font-semibold text-slate-500">Máximo el sábado</legend>
                  <label className="mr-4">
                    <input
                      type="radio"
                      className="mr-1"
                      checked={maxSaturdayOf(extra, name) === 6}
                      onChange={() =>
                        onChange({
                          ...extra,
                          maxSaturdayHours: { ...extra.maxSaturdayHours, [name]: 6 },
                        })
                      }
                    />
                    6 h
                  </label>
                  <label>
                    <input
                      type="radio"
                      className="mr-1"
                      checked={maxSaturdayOf(extra, name) !== 6}
                      onChange={() =>
                        onChange({
                          ...extra,
                          maxSaturdayHours: { ...extra.maxSaturdayHours, [name]: 10 },
                        })
                      }
                    />
                    Todo el sábado (hasta 10 h)
                  </label>
                </fieldset>
                <div className="mt-3">
                  <p className="text-xs font-semibold text-slate-500">Franjas ocupadas</p>
                  {occupied.length ? (
                    <ul className="mt-1 space-y-1">
                      {occupied.map((o, i) => (
                        <li key={`${o.day}-${o.start}-${o.end}-${i}`} className="flex items-center justify-between text-sm">
                          <span>
                            {DAY_LABEL[o.day]} {formatHour(o.start)} – {formatHour(o.end)}
                          </span>
                          <button
                            type="button"
                            className="text-xs font-semibold text-red-600 hover:underline"
                            onClick={() => removeOccupied(name, i)}
                          >
                            Quitar
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400">Sin ocupaciones. Se puede programar en cualquier franja.</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <label className="text-xs">
                      Día
                      <select
                        className="mt-0.5 block rounded border border-slate-300 px-2 py-1 text-sm"
                        value={draftDay[name] ?? "lun"}
                        onChange={(e) => setDraftDay({ ...draftDay, [name]: e.target.value as Day })}
                      >
                        {DAYS.map((d) => (
                          <option key={d} value={d}>
                            {DAY_LABEL[d]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs">
                      Desde
                      <select
                        className="mt-0.5 block rounded border border-slate-300 px-2 py-1 text-sm"
                        value={draftStart[name] ?? 6}
                        onChange={(e) => setDraftStart({ ...draftStart, [name]: Number(e.target.value) })}
                      >
                        {HOURS.map((h) => (
                          <option key={h} value={h}>
                            {formatHour(h)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs">
                      Hasta
                      <select
                        className="mt-0.5 block rounded border border-slate-300 px-2 py-1 text-sm"
                        value={draftEnd[name] ?? 9}
                        onChange={(e) => setDraftEnd({ ...draftEnd, [name]: Number(e.target.value) })}
                      >
                        {HOURS.map((h) => (
                          <option key={h} value={h}>
                            {formatHour(h)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
                      onClick={() => addOccupied(name)}
                    >
                      Agregar
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
