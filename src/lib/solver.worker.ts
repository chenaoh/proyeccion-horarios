import { solveSchedule } from "./solver";
import type { ExtraRules, ParsedWorkbook } from "./types";

type InMsg = {
  parsed: ParsedWorkbook;
  extra: ExtraRules;
  attempts?: number;
};

self.onmessage = (event: MessageEvent<InMsg>) => {
  const { parsed, extra, attempts } = event.data;
  try {
    const result = solveSchedule(parsed, extra, attempts ?? 2500, (progress) => {
      self.postMessage({ type: "progress", ...progress });
    });
    self.postMessage({ type: "done", result });
  } catch (err) {
    self.postMessage({
      type: "done",
      result: {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      },
    });
  }
};
