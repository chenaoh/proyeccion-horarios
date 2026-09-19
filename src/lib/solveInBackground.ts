import { solveScheduleAsync, type SolveProgress, type SolveResult } from "./solver";
import type { ExtraRules, ParsedWorkbook } from "./types";

export const SOLVE_ATTEMPTS = 2500;

type Handlers = {
  onProgress: (progress: SolveProgress) => void;
  onDone: (result: SolveResult) => void;
};

export function startBackgroundSolve(
  parsed: ParsedWorkbook,
  extra: ExtraRules,
  handlers: Handlers,
): () => void {
  let cancelled = false;
  let finished = false;
  let worker: Worker | null = null;

  const finish = (result: SolveResult) => {
    if (cancelled || finished) return;
    finished = true;
    handlers.onDone(result);
  };

  const fallback = () => {
    void solveScheduleAsync(parsed, extra, SOLVE_ATTEMPTS, (progress) => {
      if (!cancelled) handlers.onProgress(progress);
    }).then(finish, (err: unknown) => {
      finish({
        ok: false,
        message: err instanceof Error ? err.message : "No se pudo generar el horario.",
      });
    });
  };

  try {
    worker = new Worker(new URL("./solver.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<{ type: string } & SolveProgress & { result?: SolveResult }>) => {
      if (cancelled) return;
      if (event.data.type === "progress") {
        handlers.onProgress({ attempt: event.data.attempt, attempts: event.data.attempts });
        return;
      }
      if (event.data.type === "done" && event.data.result) {
        worker?.terminate();
        worker = null;
        finish(event.data.result);
      }
    };
    worker.onerror = () => {
      worker?.terminate();
      worker = null;
      if (!cancelled) fallback();
    };
    worker.postMessage({ parsed, extra, attempts: SOLVE_ATTEMPTS });
  } catch {
    fallback();
  }

  return () => {
    cancelled = true;
    worker?.terminate();
    worker = null;
  };
}
