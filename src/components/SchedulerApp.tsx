"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AssignmentBoard } from "@/components/AssignmentBoard";
import { DropZone } from "@/components/DropZone";
import { FichaGrid, slotLabel } from "@/components/FichaGrid";
import { GeneratingOverlay } from "@/components/GeneratingOverlay";
import { HelpPanel, type HelpSection } from "@/components/HelpPanel";
import { RestrictionsPanel } from "@/components/RestrictionsPanel";
import { TimelineLinkPanel } from "@/components/TimelineLinkPanel";
import {
  allAssignmentsSaved,
  applyAssignmentsToFichas,
  assignmentIssues,
  createFichaAssignment,
  hoursByInstructor,
  setRowHours,
  setRowInstructor,
  setRowObservation,
  swapAssignmentRow,
} from "@/lib/assignment";
import { downloadBuffer, downloadText, exportScheduleWorkbook } from "@/lib/exportExcel";
import { buildBaseTemplate, templateFileName, type TemplateKind } from "@/lib/templateExcel";
import { timelineFitsFicha } from "@/lib/hoursTarget";
import { parseWorkbook } from "@/lib/parseExcel";
import { parseTimelineWorkbook } from "@/lib/parseTimeline";
import { parseProgressMarkdown, serializeProgress } from "@/lib/progressFile";
import { inNameList, DEFAULT_NO_NOCHE, DEFAULT_NO_SABADO } from "@/lib/names";
import { normalizeExtraRules } from "@/lib/rules";
import { SOLVE_ATTEMPTS, startBackgroundSolve } from "@/lib/solveInBackground";
import { DAY_LABEL, DAYS, formatRange, parseSlotKey } from "@/lib/slots";
import type {
  ExtraRules,
  FichaAssignment,
  LoadMode,
  ManualPhase,
  ParsedWorkbook,
  Schedule,
  SelectedCell,
  Timeline,
} from "@/lib/types";
import { previewSwapTargets, swapSlots, validateSchedule } from "@/lib/validate";

type Tab = "fichas" | "manana" | "tarde" | "noche" | "instructores";

export function SchedulerApp() {
  const hoursInputRef = useRef<HTMLInputElement>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);
  const progressInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<LoadMode | null>(null);
  const [parsed, setParsed] = useState<ParsedWorkbook | null>(null);
  const [extra, setExtra] = useState<ExtraRules | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [phase, setPhase] = useState<ManualPhase>("setup");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ attempt: 0, attempts: SOLVE_ATTEMPTS });
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("fichas");
  const [selected, setSelected] = useState<SelectedCell | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [swapError, setSwapError] = useState<string[] | null>(null);
  const [history, setHistory] = useState<Schedule[]>([]);
  const [timelines, setTimelines] = useState<Timeline[]>([]);
  const [fichaTimelineId, setFichaTimelineId] = useState<Record<string, string>>({});
  const [assignments, setAssignments] = useState<Record<string, FichaAssignment>>({});
  const [openFicha, setOpenFicha] = useState<string | null>(null);
  const [assignMessage, setAssignMessage] = useState<string | null>(null);
  const [visitedAssign, setVisitedAssign] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const stopSolveRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => stopSolveRef.current?.();
  }, []);

  const issues = useMemo(() => {
    if (!parsed || !schedule || !extra) return [];
    return validateSchedule(parsed, schedule, extra);
  }, [parsed, schedule, extra]);

  const swapPreview = useMemo(() => {
    if (!parsed || !schedule || !extra || !selected) return {};
    return previewSwapTargets(parsed, schedule, extra, selected.ficha, selected.slotKey);
  }, [parsed, schedule, extra, selected]);

  function resetManual() {
    setTimelines([]);
    setFichaTimelineId({});
    setAssignments({});
    setOpenFicha(null);
    setAssignMessage(null);
    setVisitedAssign(false);
  }

  function applyHoursWorkbook(model: ParsedWorkbook) {
    setMode("hours");
    setParsed(model);
    setExtra(normalizeExtraRules(model.extraRules, model.instructorNames, model.fichas));
    setSchedule(null);
    setPhase("setup");
    setSelected(null);
    setError(null);
    setSwapError(null);
    setHistory([]);
    resetManual();
    const area = model.area?.trim();
    setHint(
      area
        ? `Proyección horarios · ${area}: ${model.fichas.length} fichas y ${model.instructorNames.length} instructores. Revisa las restricciones y luego inicia la programación.`
        : `Se cargaron ${model.fichas.length} fichas y ${model.instructorNames.length} instructores. Revisa las restricciones y luego inicia la programación.`,
    );
  }

  function applyManualWorkbook(model: ParsedWorkbook) {
    setMode("manual");
    setParsed(model);
    setExtra(normalizeExtraRules(model.extraRules, model.instructorNames, model.fichas));
    setSchedule(null);
    setPhase("timelines");
    setSelected(null);
    setError(null);
    setSwapError(null);
    setHistory([]);
    resetManual();
    setHint(
      `Proyección sin horas: ${model.fichas.length} fichas y ${model.instructorNames.length} instructores. Asigna una línea de tiempo a cada ficha.`,
    );
  }

  async function onHoursFile(file: File) {
    try {
      const buffer = await file.arrayBuffer();
      applyHoursWorkbook(parseWorkbook(buffer, file.name));
    } catch (err) {
      setParsed(null);
      setExtra(null);
      setMode(null);
      setError(err instanceof Error ? err.message : "No se pudo leer el Excel.");
    }
  }

  async function onManualFile(file: File) {
    try {
      const buffer = await file.arrayBuffer();
      applyManualWorkbook(parseWorkbook(buffer, file.name, { allowEmptyHours: true }));
    } catch (err) {
      setParsed(null);
      setExtra(null);
      setMode(null);
      setError(err instanceof Error ? err.message : "No se pudo leer el Excel.");
    }
  }

  async function onProgressFile(file: File) {
    try {
      const text = await file.text();
      const payload = parseProgressMarkdown(text);
      setMode("manual");
      setParsed(payload.parsed);
      setExtra(normalizeExtraRules(payload.extra, payload.parsed.instructorNames, payload.parsed.fichas));
      setSchedule(payload.schedule);
      setPhase(payload.phase);
      setTimelines(payload.timelines);
      setFichaTimelineId(payload.fichaTimelineId);
      setAssignments(payload.assignments);
      setSelected(null);
      setError(null);
      setSwapError(null);
      setHistory([]);
      setOpenFicha(null);
      setVisitedAssign(payload.phase !== "timelines");
      setHint("Se restauró el avance. Puedes continuar donde lo dejaste.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer el avance.");
    }
  }

  function saveProgress() {
    if (mode !== "manual" || !parsed || !extra) return;
    const md = serializeProgress({
      version: 1,
      mode: "manual",
      parsed,
      extra,
      phase,
      timelines,
      fichaTimelineId,
      assignments,
      schedule,
    });
    const slug = (parsed.area || "horarios").replace(/[^\p{L}\p{N}]+/gu, "_");
    downloadText(md, `avance_proyeccion_${slug}.md`);
  }

  function upsertTimeline(timeline: Timeline): Timeline[] {
    const exists = timelines.find((t) => t.id === timeline.id);
    if (exists) return timelines;
    const next = [...timelines, timeline];
    setTimelines(next);
    return next;
  }

  function attachTimeline(fichaName: string, timeline: Timeline) {
    if (!parsed) return;
    const ficha = parsed.fichas.find((f) => f.name === fichaName);
    if (!ficha) return;
    if (!timelineFitsFicha(ficha, timeline)) {
      const need = ficha.trimestre != null ? `T${ficha.trimestre}` : "trimestre";
      setError(
        `${ficha.name} (${ficha.jornada}, ${need}) no coincide con esa línea de tiempo (${timeline.jornadaKind}, T${timeline.trimestres.join("-")}).`,
      );
      return;
    }
    const current = assignments[fichaName];
    if (current?.timelineId === timeline.id) {
      setError(null);
      setFichaTimelineId((prev) => ({ ...prev, [fichaName]: timeline.id }));
      return;
    }
    try {
      const assignment = createFichaAssignment(ficha, timeline);
      setError(null);
      setFichaTimelineId((prev) => ({ ...prev, [fichaName]: timeline.id }));
      setAssignments((prev) => ({ ...prev, [fichaName]: assignment }));
      if (parsed) {
        setParsed({
          ...parsed,
          fichas: parsed.fichas.map((item) => (item.name === fichaName ? { ...item, hours: {} } : item)),
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo vincular la línea de tiempo.");
    }
  }

  async function onTimelineFile(fichaName: string, file: File) {
    try {
      const buffer = await file.arrayBuffer();
      const timeline = parseTimelineWorkbook(buffer, file.name);
      const next = upsertTimeline(timeline);
      const stored = next.find((t) => t.id === timeline.id) ?? timeline;
      attachTimeline(fichaName, stored);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer la línea de tiempo.");
    }
  }

  function selectExistingTimeline(fichaName: string, timelineId: string) {
    const timeline = timelines.find((t) => t.id === timelineId);
    if (timeline) attachTimeline(fichaName, timeline);
  }

  function continueToAssign() {
    if (!parsed) return;
    const next = { ...assignments };
    const missing: string[] = [];
    for (const ficha of parsed.fichas) {
      const timeline = timelines.find((t) => t.id === fichaTimelineId[ficha.name]);
      if (!timeline || !timelineFitsFicha(ficha, timeline)) {
        missing.push(ficha.name);
        continue;
      }
      if (!next[ficha.name]) {
        try {
          next[ficha.name] = createFichaAssignment(ficha, timeline);
        } catch (err) {
          setError(err instanceof Error ? err.message : "No se pudo armar la asignación.");
          return;
        }
      }
    }
    if (missing.length === parsed.fichas.length) {
      setError("Primero debe definir una línea de tiempo en cada ficha.");
      return;
    }
    setAssignments(next);
    setError(null);
    setVisitedAssign(true);
    setPhase("assign");
    setAssignMessage(
      missing.length
        ? `Primero debe definir una línea de tiempo: ${missing.join(", ")}.`
        : null,
    );
    setHint("Asigna instructores ficha por ficha. El total debe cerrar en 20 o 30 h.");
  }

  function openFichaForAssign(name: string | null) {
    if (!name) {
      setOpenFicha(null);
      return;
    }
    if (!assignments[name]) {
      setAssignMessage(`${name}: primero debe definir una línea de tiempo.`);
      return;
    }
    setAssignMessage(null);
    setOpenFicha(name);
  }

  function changeDirector(fichaName: string, director: string) {
    if (!parsed) return;
    setParsed({
      ...parsed,
      fichas: parsed.fichas.map((ficha) => (ficha.name === fichaName ? { ...ficha, director } : ficha)),
    });
  }

  function changeSaturday(fichaName: string, saturday: boolean) {
    if (!parsed) return;
    setParsed({
      ...parsed,
      fichas: parsed.fichas.map((ficha) => (ficha.name === fichaName ? { ...ficha, saturday } : ficha)),
    });
    setAssignments((prev) => {
      const current = prev[fichaName];
      if (!current || !current.saved) return prev;
      return { ...prev, [fichaName]: { ...current, saved: false } };
    });
    if (schedule) {
      setSchedule(null);
      setHistory([]);
      setSelected(null);
      setSwapError(null);
      setPhase("setup");
      setHint("Cambió el sábado de una ficha. Vuelve a generar el horario.");
    }
  }

  function addInstructor(raw: string): string | null {
    if (!parsed || !extra) return "Primero carga una proyección.";
    const name = raw.replace(/\s+/g, " ").trim();
    if (!name) return "Escribe el nombre del instructor.";
    if (inNameList(name, parsed.instructorNames)) return "Ese instructor ya está en la lista.";
    const instructorNames = [...parsed.instructorNames, name];
    const next = normalizeExtraRules(extra, instructorNames, parsed.fichas);
    setParsed({ ...parsed, instructorNames });
    setExtra({
      ...next,
      noNoche:
        inNameList(name, DEFAULT_NO_NOCHE) && !inNameList(name, next.noNoche)
          ? [...next.noNoche, name]
          : next.noNoche,
      noSabado:
        inNameList(name, DEFAULT_NO_SABADO) && !inNameList(name, next.noSabado)
          ? [...next.noSabado, name]
          : next.noSabado,
    });
    setHint(`${name} quedó disponible para asignar.`);
    return null;
  }

  function backToTimelines() {
    setOpenFicha(null);
    setAssignMessage(null);
    setPhase("timelines");
    setHint("Puedes cambiar la línea de tiempo de una ficha. El resto de la asignación se conserva.");
  }

  function patchAssignment(fichaName: string, assignment: FichaAssignment) {
    setAssignments((prev) => ({ ...prev, [fichaName]: assignment }));
  }

  function changeHours(fichaName: string, rowId: string, hours: number) {
    if (!parsed) return;
    const ficha = parsed.fichas.find((f) => f.name === fichaName);
    const current = assignments[fichaName];
    if (!ficha || !current) return;
    const result = setRowHours(current, ficha, rowId, hours);
    if (!result.ok) {
      setAssignMessage(result.message);
      return;
    }
    setAssignMessage(null);
    patchAssignment(fichaName, result.assignment);
  }

  function changeInstructor(fichaName: string, rowId: string, instructor: string) {
    const current = assignments[fichaName];
    if (!current) return;
    setAssignMessage(null);
    patchAssignment(fichaName, setRowInstructor(current, rowId, instructor));
  }

  function changeObservation(fichaName: string, rowId: string, observation: string) {
    const current = assignments[fichaName];
    if (!current) return;
    patchAssignment(fichaName, setRowObservation(current, rowId, observation));
  }

  function swapResult(fichaName: string, rowId: string, resultId: string) {
    if (!parsed) return;
    const ficha = parsed.fichas.find((f) => f.name === fichaName);
    const current = assignments[fichaName];
    const timeline = timelines.find((t) => t.id === current?.timelineId);
    const incoming = timeline?.results.find((r) => r.id === resultId);
    if (!ficha || !current || !incoming) return;
    const result = swapAssignmentRow(current, ficha, rowId, incoming);
    if (!result.ok) {
      setAssignMessage(result.message);
      return;
    }
    setAssignMessage(null);
    patchAssignment(fichaName, result.assignment);
  }

  function saveAssignment(fichaName: string) {
    if (!parsed) return;
    const ficha = parsed.fichas.find((f) => f.name === fichaName);
    const current = assignments[fichaName];
    if (!ficha || !current) return;
    const problems = assignmentIssues(ficha, current);
    if (problems.length) {
      setAssignMessage(problems[0]);
      return;
    }
    const saved = { ...current, saved: true };
    patchAssignment(fichaName, saved);
    setParsed({
      ...parsed,
      fichas: parsed.fichas.map((item) =>
        item.name === fichaName ? { ...item, hours: hoursByInstructor(saved.rows) } : item,
      ),
    });
    setAssignMessage(null);
    setHint(`Asignación guardada: ${fichaName}.`);
    setOpenFicha(null);
  }

  function continueToRestrictions() {
    if (!parsed || !extra) return;
    if (!allAssignmentsSaved(parsed.fichas, assignments)) return;
    const fichas = applyAssignmentsToFichas(parsed.fichas, assignments);
    setParsed({ ...parsed, fichas });
    setExtra(normalizeExtraRules(extra, parsed.instructorNames, fichas));
    setPhase("setup");
    setHint("Horas listas. Define restricciones e inicia la programación.");
  }

  const manualReady = Boolean(
    mode === "manual" && parsed && allAssignmentsSaved(parsed.fichas, assignments),
  );
  const canGenerate = Boolean(
    parsed && extra && !busy && (mode === "hours" || (manualReady && (phase === "setup" || phase === "review"))),
  );

  function generate() {
    if (!parsed || !extra || busy || !canGenerate) return;
    const rules = normalizeExtraRules(extra, parsed.instructorNames, parsed.fichas);
    setExtra(rules);
    stopSolveRef.current?.();
    setBusy(true);
    setProgress({ attempt: 0, attempts: SOLVE_ATTEMPTS });
    setError(null);
    setSelected(null);
    setSwapError(null);
    setHistory([]);
    setHint("Generando horario…");
    stopSolveRef.current = startBackgroundSolve(parsed, rules, {
      onProgress: setProgress,
      onDone: (result) => {
        stopSolveRef.current = null;
        setBusy(false);
        setProgress({ attempt: 0, attempts: SOLVE_ATTEMPTS });
        if (!result.ok) {
          setSchedule(null);
          setPhase("setup");
          setError(result.message);
          setHint(null);
          return;
        }
        setSchedule(result.schedule);
        setPhase("review");
        setHint(null);
        setTab("fichas");
      },
    });
  }

  function onSelect(ficha: string, key: string) {
    if (!schedule || !parsed || !extra) return;
    setSwapError(null);
    if (!selected) {
      setSelected({ ficha, slotKey: key });
      setHint(
        `Seleccionado: ${ficha} · ${slotLabel(key)}. Las celdas verde claro son destinos sin cruce; las rojo claro generarían conflicto.`,
      );
      return;
    }
    if (selected.ficha !== ficha) {
      setHint(
        `El intercambio es solo dentro de la misma ficha. Sigue seleccionada ${selected.ficha}. Elige otra franja ahí, o cancela haciendo clic otra vez en la celda marcada.`,
      );
      return;
    }
    if (selected.slotKey === key) {
      setSelected(null);
      setHint("Selección cancelada. Haz clic en una celda para empezar de nuevo.");
      return;
    }
    const a = parseSlotKey(selected.slotKey);
    const b = parseSlotKey(key);
    if (a.hours !== b.hours) {
      setHint(
        `Ahí no puede ir: esa franja es de ${b.hours} h y la seleccionada es de ${a.hours} h. Elige una celda verde claro.`,
      );
      return;
    }
    const nextGrid = swapSlots(schedule.grid, ficha, selected.slotKey, key);
    const nextSchedule: Schedule = { ...schedule, grid: nextGrid };
    const nextIssues = validateSchedule(parsed, nextSchedule, extra);
    if (nextIssues.length) {
      setSwapError(nextIssues.map((i) => i.message));
      setHint("Ese destino está en rojo: el cambio no se aplicó. Elige una celda verde claro o cancela la selección.");
      return;
    }
    setHistory((prev) => [...prev, schedule]);
    setSchedule(nextSchedule);
    setSelected(null);
    setHint(`Cambio aplicado: ${slotLabel(selected.slotKey)} ↔ ${slotLabel(key)} en ${ficha}.`);
  }

  function undoLast() {
    setHistory((prev) => {
      if (!prev.length) return prev;
      const last = prev[prev.length - 1];
      setSchedule(last);
      setSelected(null);
      setSwapError(null);
      setHint("Se deshizo el último intercambio.");
      return prev.slice(0, -1);
    });
  }

  async function exportXlsx() {
    if (!parsed || !schedule || !extra) return;
    const buffer = await exportScheduleWorkbook(
      parsed,
      schedule,
      extra,
      mode === "manual" ? assignments : undefined,
    );
    const slug = (parsed.area || "horarios").replace(/[^\p{L}\p{N}]+/gu, "_");
    downloadBuffer(buffer, `proyeccion_horarios_${slug}.xlsx`);
  }

  const areaLabel = parsed?.area?.trim() ?? "";
  const title = areaLabel ? `Proyección horarios · ${areaLabel}` : "Proyección horarios";
  const hasMorning = Boolean(parsed?.fichas.some((f) => f.jornada === "MAÑANA"));
  const hasAfternoon = Boolean(parsed?.fichas.some((f) => f.jornada === "TARDE"));
  const hasNight = Boolean(parsed?.fichas.some((f) => f.jornada === "NOCHE"));

  useEffect(() => {
    document.title = `${title} | Area Soft`;
  }, [title]);

  useEffect(() => {
    if (
      (tab === "manana" && !hasMorning) ||
      (tab === "tarde" && !hasAfternoon) ||
      (tab === "noche" && !hasNight)
    ) {
      setTab("fichas");
    }
  }, [tab, hasMorning, hasAfternoon, hasNight]);

  const instructorAgenda = useMemo(() => {
    if (!parsed || !schedule) return [];
    const map: Record<
      string,
      { dayKey: (typeof DAYS)[number]; day: string; range: string; hours: number; ficha: string; jornada: string; start: number }[]
    > = {};
    for (const ficha of parsed.fichas) {
      for (const [key, name] of Object.entries(schedule.grid[ficha.name] ?? {})) {
        const slot = parseSlotKey(key);
        if (!map[name]) map[name] = [];
        map[name].push({
          dayKey: slot.day,
          day: DAY_LABEL[slot.day],
          range: formatRange(slot.start, slot.end),
          hours: slot.hours,
          ficha: ficha.name,
          jornada: slot.jornada,
          start: slot.start,
        });
      }
    }
    return Object.entries(map)
      .sort((a, b) => a[0].localeCompare(b[0], "es"))
      .map(([name, rows]) => ({
        name,
        rows: rows.sort(
          (x, y) => DAYS.indexOf(x.dayKey) - DAYS.indexOf(y.dayKey) || x.start - y.start,
        ),
        total: rows.reduce((s, r) => s + r.hours, 0),
      }));
  }, [parsed, schedule]);

  const showRestrictions = Boolean(parsed && extra && (mode === "hours" ? phase === "setup" || !schedule : phase === "setup"));

  const helpSection: HelpSection = !parsed || !mode
    ? "cargar"
    : mode === "manual" && phase === "timelines"
      ? "lineas"
      : mode === "manual" && phase === "assign"
        ? "asignacion"
        : showRestrictions
          ? "restricciones"
          : schedule && phase === "review"
            ? "horario"
            : "cargar";

  async function downloadTemplate(kind: TemplateKind) {
    const buffer = await buildBaseTemplate(kind);
    downloadBuffer(buffer, templateFileName(kind));
  }

  return (
    <div className="flex min-h-full flex-col bg-slate-100 text-slate-900">
      <header className="border-b border-slate-800 bg-slate-900 text-white">
        <div className="mx-auto max-w-7xl px-6 py-5">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300">Area Soft</p>
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-300">
                {areaLabel
                  ? `Área ${areaLabel}. Carga otra proyección o continúa la programación.`
                  : "Carga un Excel de proyección con horas, uno sin horas para asignar por línea de tiempo, o un avance guardado."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="shrink-0 rounded-lg border border-white/30 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
            >
              Ayuda
            </button>
          </div>

          <div className="mt-5 grid gap-4 border-t border-white/10 pt-4 md:grid-cols-2">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Cargar</p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => hoursInputRef.current?.click()}
                  disabled={busy}
                  className="h-10 shrink-0 rounded-lg bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Con horas
                </button>
                <button
                  type="button"
                  onClick={() => manualInputRef.current?.click()}
                  disabled={busy}
                  className="h-10 shrink-0 rounded-lg bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Sin horas
                </button>
                <button
                  type="button"
                  onClick={() => progressInputRef.current?.click()}
                  disabled={busy}
                  className="h-10 shrink-0 rounded-lg bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Avance
                </button>
              </div>
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Programar</p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={!canGenerate}
                  onClick={generate}
                  className="h-10 shrink-0 rounded-lg bg-teal-500 px-4 text-sm font-semibold text-white hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy ? "Generando…" : "Iniciar programación"}
                </button>
                <button
                  type="button"
                  disabled={!schedule || issues.length > 0 || busy}
                  onClick={() => void exportXlsx()}
                  className="h-10 shrink-0 rounded-lg border border-white/30 px-4 text-sm font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                  title={issues.length ? "Corrige los cruces antes de exportar" : "Exportar proyección + horarios"}
                >
                  Exportar Excel
                </button>
                {mode === "manual" && parsed ? (
                  <button
                    type="button"
                    onClick={saveProgress}
                    disabled={busy}
                    className="h-10 shrink-0 rounded-lg border border-white/30 px-4 text-sm font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Guardar avance
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </header>

      <HelpPanel
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        section={helpSection}
        fichaOpen={Boolean(openFicha)}
        onDownloadTemplate={(kind) => void downloadTemplate(kind)}
      />

      {busy ? <GeneratingOverlay attempt={progress.attempt} attempts={progress.attempts} /> : null}

      <input
        ref={hoursInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onHoursFile(file);
          e.target.value = "";
        }}
      />
      <input
        ref={manualInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onManualFile(file);
          e.target.value = "";
        }}
      />
      <input
        ref={progressInputRef}
        type="file"
        accept=".md,.txt"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onProgressFile(file);
          e.target.value = "";
        }}
      />

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-6 py-8">
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        ) : null}
        {hint ? (
          <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">{hint}</div>
        ) : null}

        {!parsed || !extra || !mode ? (
          <>
          <div className="grid gap-4 md:grid-cols-3">
            <DropZone
              onFile={(file) => void onHoursFile(file)}
              className="rounded-2xl border-2 border-dashed border-slate-300 bg-white px-6 py-12 text-center hover:border-teal-500 hover:bg-teal-50/40"
              activeClassName="border-teal-500 bg-teal-50"
            >
              <button
                type="button"
                onClick={() => hoursInputRef.current?.click()}
                className="w-full"
              >
                <span className="text-lg font-semibold">Cargar con horas</span>
                <span className="mt-2 block text-sm text-slate-500">
                  El Excel de proyección ya trae horas por instructor. Es el flujo actual. También
                  puedes arrastrar el archivo aquí.
                </span>
              </button>
            </DropZone>
            <DropZone
              onFile={(file) => void onManualFile(file)}
              className="rounded-2xl border-2 border-dashed border-slate-300 bg-white px-6 py-12 text-center hover:border-teal-500 hover:bg-teal-50/40"
              activeClassName="border-teal-500 bg-teal-50"
            >
              <button
                type="button"
                onClick={() => manualInputRef.current?.click()}
                className="w-full"
              >
                <span className="text-lg font-semibold">Cargar sin horas</span>
                <span className="mt-2 block text-sm text-slate-500">
                  Solo estructura de fichas e instructores. Luego asignas línea de tiempo y resultados.
                  También puedes arrastrar el archivo aquí.
                </span>
              </button>
            </DropZone>
            <DropZone
              onFile={(file) => void onProgressFile(file)}
              className="rounded-2xl border-2 border-dashed border-slate-300 bg-white px-6 py-12 text-center hover:border-teal-500 hover:bg-teal-50/40"
              activeClassName="border-teal-500 bg-teal-50"
            >
              <button
                type="button"
                onClick={() => progressInputRef.current?.click()}
                className="w-full"
              >
                <span className="text-lg font-semibold">Cargar avance</span>
                <span className="mt-2 block text-sm text-slate-500">
                  Retoma un archivo .md guardado con la asignación en curso. También puedes
                  arrastrarlo aquí.
                </span>
              </button>
            </DropZone>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => void downloadTemplate("hours")}
              className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-600"
            >
              Descargar ejemplo con horas
            </button>
            <button
              type="button"
              onClick={() => void downloadTemplate("empty")}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Descargar plantilla sin horas
            </button>
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-teal-800 hover:underline"
            >
              Ayuda de esta sección
            </button>
          </div>
          </>
        ) : (
          <>
            {parsed.warnings.length && phase !== "review" ? (
              <ul className="list-disc rounded-lg border border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-900">
                {parsed.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}

            {mode === "manual" && phase === "timelines" ? (
              <TimelineLinkPanel
                fichas={parsed.fichas}
                timelines={timelines}
                fichaTimelineId={fichaTimelineId}
                onUpload={(name, file) => void onTimelineFile(name, file)}
                onSelect={selectExistingTimeline}
                onContinue={continueToAssign}
                onBackToAssign={
                  visitedAssign
                    ? () => {
                        setPhase("assign");
                        setHint("Asigna instructores ficha por ficha. El total debe cerrar en 20 o 30 h.");
                      }
                    : undefined
                }
              />
            ) : null}

            {mode === "manual" && phase === "assign" ? (
              <AssignmentBoard
                fichas={parsed.fichas}
                instructors={parsed.instructorNames}
                timelines={timelines}
                assignments={assignments}
                openFicha={openFicha}
                onOpen={openFichaForAssign}
                onHours={changeHours}
                onInstructor={changeInstructor}
                onDirector={changeDirector}
                onSaturday={changeSaturday}
                onObservation={changeObservation}
                onAddInstructor={addInstructor}
                onSwap={swapResult}
                onSave={saveAssignment}
                onContinue={continueToRestrictions}
                onBackToTimelines={backToTimelines}
                message={assignMessage}
              />
            ) : null}

            {showRestrictions ? (
              <>
                {mode === "manual" ? (
                  <button
                    type="button"
                    className="text-sm font-semibold text-teal-700 hover:underline"
                    onClick={() => {
                      setPhase("assign");
                      setSchedule(null);
                    }}
                  >
                    Volver a asignación
                  </button>
                ) : null}
                <RestrictionsPanel
                  parsed={parsed}
                  extra={extra}
                  onChange={setExtra}
                  onSaturday={changeSaturday}
                  onAddInstructor={addInstructor}
                />
              </>
            ) : null}

            {schedule && phase === "review" ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-slate-600">
                    {title}: {parsed.fichas.length} fichas. Puedes volver a las restricciones y generar de nuevo.
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={!history.length}
                      onClick={undoLast}
                      className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Deshacer último cambio
                    </button>
                    <button
                      type="button"
                      className="text-sm font-semibold text-teal-700 hover:underline"
                      onClick={() => {
                        setPhase("setup");
                        setSchedule(null);
                        setSelected(null);
                        setHistory([]);
                        setSwapError(null);
                      }}
                    >
                      Volver a restricciones
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                  <p className="font-semibold text-slate-900">Cómo ajustar el horario a mano</p>
                  <ol className="mt-2 list-decimal space-y-1 pl-5">
                    <li>Haz clic en una celda para elegir al instructor (queda en verde oscuro).</li>
                    <li>
                      En esa misma ficha, las celdas <span className="font-semibold text-emerald-700">verde claro</span> son destinos sin cruce; las{" "}
                      <span className="font-semibold text-rose-700">rojo claro</span> no se pueden usar.
                    </li>
                    <li>Solo se aplica el cambio si haces clic en una celda verde. El rojo no mueve nada.</li>
                    <li>Usa Deshacer último cambio para volver al horario anterior.</li>
                  </ol>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs">
                    <span className="inline-flex items-center gap-2 rounded-md bg-emerald-100 px-2 py-1 text-emerald-900">
                      Verde tenue: se puede ubicar
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-md bg-rose-100 px-2 py-1 text-rose-900">
                      Rojo tenue: hay cruce o no coincide la duración
                    </span>
                  </div>
                </div>

                {swapError?.length ? (
                  <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-950">
                    <p className="font-semibold">No se aplicó el cambio: generaría conflicto</p>
                    <ul className="mt-2 list-disc pl-5">
                      {swapError.slice(0, 8).map((message) => (
                        <li key={message}>{message}</li>
                      ))}
                    </ul>
                    {swapError.length > 8 ? <p className="mt-1 text-xs">…y {swapError.length - 8} más</p> : null}
                  </div>
                ) : null}

                {issues.length ? (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                    <p className="font-semibold">{issues.length} conflicto(s) en el horario actual</p>
                    <ul className="mt-2 list-disc pl-5">
                      {issues.slice(0, 10).map((i) => (
                        <li key={i.message}>{i.message}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                    Horario válido. Puedes exportar el Excel.
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["fichas", "Todas las fichas"] as [Tab, string],
                      ...(hasMorning ? ([["manana", "Fichas mañana"]] as [Tab, string][]) : []),
                      ...(hasAfternoon ? ([["tarde", "Fichas tarde"]] as [Tab, string][]) : []),
                      ...(hasNight ? ([["noche", "Fichas noche L–S"]] as [Tab, string][]) : []),
                      ["instructores", "Por instructor"] as [Tab, string],
                    ]
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setTab(id)}
                      className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                        tab === id
                          ? "bg-slate-900 text-white"
                          : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {tab === "instructores" ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {instructorAgenda.map((inst) => (
                      <article
                        key={inst.name}
                        className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                      >
                        <header className="bg-slate-900 px-4 py-3 text-white">
                          <h3 className="font-semibold">{inst.name}</h3>
                          <p className="text-xs text-slate-300">{inst.total} h / semana</p>
                        </header>
                        <ul className="divide-y divide-slate-100 text-sm">
                          {inst.rows.map((row, idx) => (
                            <li key={`${row.ficha}-${row.day}-${row.range}-${idx}`} className="px-4 py-2">
                              <span className="font-medium">{row.day}</span> {row.range}
                              <span className="mt-0.5 block text-xs text-slate-500">
                                {row.ficha} · {row.hours} h · {row.jornada}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-6">
                    {(tab === "manana"
                      ? parsed.fichas.filter((f) => f.jornada === "MAÑANA")
                      : tab === "tarde"
                        ? parsed.fichas.filter((f) => f.jornada === "TARDE")
                        : tab === "noche"
                          ? parsed.fichas.filter((f) => f.jornada === "NOCHE")
                          : parsed.fichas
                    ).map((ficha) => (
                      <FichaGrid
                        key={ficha.name}
                        ficha={ficha}
                        assigned={schedule.grid[ficha.name] ?? {}}
                        selected={selected}
                        swapPreview={selected?.ficha === ficha.name ? swapPreview : undefined}
                        onSelect={onSelect}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : null}
          </>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white px-6 py-4 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} Area Soft. Proyección horarios. Todos los derechos reservados.
      </footer>
    </div>
  );
}
