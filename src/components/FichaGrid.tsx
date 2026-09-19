'use client';

import { DAY_LABEL, WEEKDAYS, formatRange, parseSlotKey, slotKey, slotsForFicha } from "@/lib/slots";
import type { FichaInput, SelectedCell } from "@/lib/types";
import type { SwapTarget } from "@/lib/validate";

type Props = {
  ficha: FichaInput;
  assigned: Record<string, string>;
  selected: SelectedCell | null;
  swapPreview?: Record<string, SwapTarget>;
  onSelect: (ficha: string, slotKey: string) => void;
};

export function FichaGrid({ ficha, assigned, selected, swapPreview, onSelect }: Props) {
  const slots = slotsForFicha(ficha.jornada, !ficha.saturday);
  const isNight = ficha.jornada === "NOCHE";
  const jornadaClass =
    ficha.jornada === "MAÑANA"
      ? "bg-sky-50"
      : ficha.jornada === "TARDE"
        ? "bg-amber-50"
        : "bg-emerald-50";

  function cell(day: (typeof WEEKDAYS)[number] | "sab", label: string, start: number, end: number) {
    const slot = slots.find(
      (s) => s.day === day && s.label === label && s.start === start && s.end === end,
    );
    if (!slot) {
      return (
        <td
          key={`${day}-empty`}
          className="border border-slate-200 bg-slate-50 px-2 py-2 text-center text-slate-400"
        >
          —
        </td>
      );
    }
    const key = slotKey(slot);
    const who = assigned[key] ?? "—";
    const isSel = selected?.ficha === ficha.name && selected.slotKey === key;
    const preview = isSel ? undefined : swapPreview?.[key];
    const canPlace = preview === "ok";
    const blocked = preview === "blocked";
    return (
      <td key={`${day}-${label}`} className="border border-slate-200 p-0">
        <button
          type="button"
          onClick={() => onSelect(ficha.name, key)}
          title={
            isSel
              ? "Celda seleccionada. Elige un destino verde claro, o vuelve a hacer clic para cancelar."
              : canPlace
                ? "Se puede ubicar aquí, sin cruces"
                : blocked
                  ? "No se puede ubicar aquí: hay cruce o no coincide la duración"
                  : "Clic para seleccionar esta franja"
          }
          className={`block w-full px-2 py-2 text-left text-sm leading-snug transition ${
            isSel
              ? "bg-teal-700 text-white"
              : canPlace
                ? "bg-emerald-100/80 text-emerald-950 hover:bg-emerald-200/80"
                : blocked
                  ? "bg-rose-100/80 text-rose-950 hover:bg-rose-200/70"
                  : `${jornadaClass} text-slate-800 hover:bg-teal-100`
          }`}
        >
          <span className="font-medium">{who}</span>
          <span
            className={`mt-0.5 block text-[10px] ${
              isSel ? "text-teal-100" : canPlace ? "text-emerald-800" : blocked ? "text-rose-800" : "text-slate-500"
            }`}
          >
            {slot.hours} h
            {canPlace ? " · se puede" : blocked ? " · no se puede" : ""}
          </span>
        </button>
      </td>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 bg-slate-900 px-4 py-3 text-white">
        <h3 className="text-sm font-semibold tracking-tight">{ficha.name}</h3>
        <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs text-slate-300 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="uppercase tracking-wide text-slate-400">Ambiente asignado</dt>
            <dd className="font-medium text-white">{ficha.ambiente || "—"}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-wide text-slate-400">Trimestre</dt>
            <dd className="font-medium text-white">
              {ficha.trimestre != null ? `T${ficha.trimestre}` : "—"}
            </dd>
          </div>
          <div>
            <dt className="uppercase tracking-wide text-slate-400">Director de grupo</dt>
            <dd className="font-medium text-white">{ficha.director || "—"}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-wide text-slate-400">Jornada</dt>
            <dd className="font-medium text-white">
              {ficha.jornada}
              {ficha.saturday ? " · con sábado" : " · sin sábado"}
            </dd>
          </div>
        </dl>
      </header>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
              <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Franja</th>
              {WEEKDAYS.map((d) => (
                <th key={d} className="border border-slate-200 px-3 py-2 font-semibold">
                  {DAY_LABEL[d]}
                </th>
              ))}
              {isNight ? (
                <th className="border border-slate-200 px-3 py-2 font-semibold">Sábado</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {isNight ? (
              <>
                <tr>
                  <th className="border border-slate-200 bg-slate-50 px-3 py-2 text-left font-medium">
                    6:00 pm – 8:00 pm
                  </th>
                  {WEEKDAYS.map((d) => cell(d, "18-20", 18, 20))}
                  <td className="border border-slate-200 bg-slate-50 px-2 py-2 text-center text-xs text-slate-400">
                    ver filas
                  </td>
                </tr>
                <tr>
                  <th className="border border-slate-200 bg-slate-50 px-3 py-2 text-left font-medium">
                    8:00 pm – 10:00 pm
                  </th>
                  {WEEKDAYS.map((d) => cell(d, "20-22", 20, 22))}
                  <td className="border border-slate-200 bg-slate-50 px-2 py-2 text-center text-xs text-slate-400">
                    ver filas
                  </td>
                </tr>
                {!ficha.saturday
                  ? [
                      ["08-10", 8, 10],
                      ["10-12", 10, 12],
                      ["12-14", 12, 14],
                      ["14-16", 14, 16],
                      ["16-18", 16, 18],
                    ].map(([lab, a, b]) => (
                      <tr key={String(lab)}>
                        <th className="border border-slate-200 bg-slate-50 px-3 py-2 text-left font-medium">
                          Sábado {formatRange(Number(a), Number(b))}
                        </th>
                        {WEEKDAYS.map((d) => (
                          <td
                            key={d}
                            className="border border-slate-200 bg-slate-50 px-2 py-2 text-slate-300"
                          />
                        ))}
                        <td className="border border-slate-200 bg-slate-100 px-2 py-2 text-center text-xs text-slate-500">
                          No se programa
                        </td>
                      </tr>
                    ))
                  : SABADO_ROWS.map((s) => (
                      <tr key={s.label}>
                        <th className="border border-slate-200 bg-slate-50 px-3 py-2 text-left font-medium">
                          Sábado {formatRange(s.start, s.end)}
                        </th>
                        {WEEKDAYS.map((d) => (
                          <td
                            key={d}
                            className="border border-slate-200 bg-slate-50 px-2 py-2 text-slate-300"
                          />
                        ))}
                        {cell("sab", s.label, s.start, s.end)}
                      </tr>
                    ))}
              </>
            ) : ficha.jornada === "MAÑANA" ? (
              <>
                <tr>
                  <th className="border border-slate-200 bg-slate-50 px-3 py-2 text-left font-medium">
                    6:00 am – 9:00 am
                  </th>
                  {WEEKDAYS.map((d) => cell(d, "06-09", 6, 9))}
                </tr>
                <tr>
                  <th className="border border-slate-200 bg-slate-50 px-3 py-2 text-left font-medium">
                    9:00 am – 12:00 m
                  </th>
                  {WEEKDAYS.map((d) => cell(d, "09-12", 9, 12))}
                </tr>
              </>
            ) : (
              <>
                <tr>
                  <th className="border border-slate-200 bg-slate-50 px-3 py-2 text-left font-medium">
                    12:00 m – 3:00 pm
                  </th>
                  {WEEKDAYS.map((d) => cell(d, "12-15", 12, 15))}
                </tr>
                <tr>
                  <th className="border border-slate-200 bg-slate-50 px-3 py-2 text-left font-medium">
                    3:00 pm – 6:00 pm
                  </th>
                  {WEEKDAYS.map((d) => cell(d, "15-18", 15, 18))}
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
      <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
        {Object.entries(ficha.hours)
          .map(([n, h]) => `${n} ${h}h`)
          .join(" · ")}
        {selected?.ficha === ficha.name ? (
          <span className="mt-1 block font-medium text-slate-700">
            Verde claro: el instructor se puede ubicar ahí. Rojo claro: no (cruce o distinta duración).
            Clic de nuevo en la celda oscura para cancelar.
          </span>
        ) : null}
      </p>
    </section>
  );
}

const SABADO_ROWS = [
  { label: "08-10", start: 8, end: 10 },
  { label: "10-12", start: 10, end: 12 },
  { label: "12-14", start: 12, end: 14 },
  { label: "14-16", start: 14, end: 16 },
  { label: "16-18", start: 16, end: 18 },
];

export function slotLabel(key: string): string {
  const slot = parseSlotKey(key);
  return `${DAY_LABEL[slot.day]} ${formatRange(slot.start, slot.end)}`;
}
