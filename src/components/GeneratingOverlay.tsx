"use client";

import { useEffect, useState } from "react";
import type { SolveProgress } from "@/lib/solver";

function formatElapsed(ms: number) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${String(s % 60).padStart(2, "0")} s`;
}

export function GeneratingOverlay({ attempt, attempts }: SolveProgress) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const id = window.setInterval(() => setElapsed(Date.now() - started), 200);
    return () => window.clearInterval(id);
  }, []);

  const pct = attempts > 0 ? Math.min(96, Math.round((attempt / attempts) * 100)) : 0;
  const hasProgress = attempt > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 px-4 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-labelledby="generating-title"
      aria-describedby="generating-copy"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-center gap-4">
          <div
            className="h-12 w-12 shrink-0 animate-spin rounded-full border-4 border-slate-200 border-t-teal-500"
            aria-hidden
          />
          <div>
            <h2 id="generating-title" className="text-lg font-semibold text-slate-900">
              Generando horario
            </h2>
            <p id="generating-copy" className="mt-1 text-sm text-slate-600">
              Buscando una combinación sin cruces. Si hay muchas fichas o restricciones, esto puede tardar.
            </p>
          </div>
        </div>

        <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
          {hasProgress ? (
            <div
              className="h-full rounded-full bg-teal-500 transition-[width] duration-200 ease-out"
              style={{ width: `${Math.max(pct, 4)}%` }}
            />
          ) : (
            <div className="as-indeterminate h-full w-2/5 rounded-full bg-teal-500" />
          )}
        </div>

        <div className="mt-3 flex items-center justify-between text-xs font-medium text-slate-500">
          <span>
            {hasProgress
              ? `Intento ${attempt.toLocaleString("es-CO")} de ${attempts.toLocaleString("es-CO")}`
              : "Preparando…"}
          </span>
          <span>{formatElapsed(elapsed)}</span>
        </div>
      </div>
    </div>
  );
}
