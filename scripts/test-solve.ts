import { existsSync, readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { exportFichaWorkbook, exportScheduleWorkbook } from "../src/lib/exportExcel";
import { exportFichaPdf } from "../src/lib/exportFichaPdf";
import { parseWorkbook } from "../src/lib/parseExcel";
import { buildBaseTemplate } from "../src/lib/templateExcel";
import { solveSchedule } from "../src/lib/solver";
import { validateSchedule } from "../src/lib/validate";
import { parseSlotKey, SABADO } from "../src/lib/slots";
import type { Day, ExtraRules, FichaAssignment, ParsedWorkbook, Schedule } from "../src/lib/types";

function run(label: string, parsed: ParsedWorkbook, extra: ExtraRules, attempts = 3000): Schedule {
  console.log(`\n=== ${label} ===`);
  console.log("fichas", parsed.fichas.length, "instructores", parsed.instructorNames.length);
  const result = solveSchedule(parsed, extra, attempts);
  if (!result.ok) {
    console.error(result.message);
    process.exit(1);
  }
  const issues = validateSchedule(parsed, result.schedule, extra);
  console.log("issues", issues.length, issues.slice(0, 5));
  if (issues.length) process.exit(1);
  console.log("OK");
  return result.schedule;
}

function workbookFrom(rows: (string | number | null)[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Asignación");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

function miniWorkbook(): ArrayBuffer {
  return workbookFrom([
    ["AREA:", "TIC"],
    [],
    ["FICHA", "JORNADA", "TRIMESTRE", "SABADO", "Director", "Ambiente", "Ana", "Bruno", "Carla", "Diego"],
    ["Ficha mañana", "MAÑANA", 1, "NO", "Ana", "Aula 1", 15, 15, "", ""],
    ["Ficha tarde", "TARDE", 1, "NO", "Bruno", "Aula 2", "", "", 15, 15],
    ["Ficha noche", "NOCHE", 1, "SI", "Carla", "Aula 3", 6, 8, 8, 8],
  ]);
}

function nightNoSaturdayWorkbook(): ArrayBuffer {
  return workbookFrom([
    ["AREA:", "TIC"],
    [],
    ["FICHA", "JORNADA", "TRIMESTRE", "SABADO", "Director", "Ambiente", "Ana", "Bruno", "Carla", "Diego"],
    ["Ficha noche", "NOCHE", 2, "NO", "Carla", "Aula 3", 6, 2, 8, 4],
  ]);
}

const path = process.argv[2];
if (path && existsSync(path)) {
  const buf = readFileSync(path);
  const parsed = parseWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), path);
  run("archivo", parsed, parsed.extraRules);
}

const mini = parseWorkbook(miniWorkbook(), "mini.xlsx");
const extra = {
  ...mini.extraRules,
  allowSixHourBlocks: { Ana: true, Bruno: true, Carla: false, Diego: false },
  maxSaturdayHours: { Ana: 6, Bruno: 6, Carla: 10, Diego: 6 },
};
const miniSchedule = run("3 fichas / 4 instructores", mini, extra, 4000);

const nightOnly = parseWorkbook(nightNoSaturdayWorkbook(), "noche-sin-sabado.xlsx");
const nightExtra: ExtraRules = {
  ...nightOnly.extraRules,
  noSabado: ["Ana"],
  noNoche: [],
  allowSixHourBlocks: { Ana: false, Bruno: false, Carla: false, Diego: false },
  maxSaturdayHours: { Ana: 6, Bruno: 6, Carla: 6, Diego: 6 },
};
const nightSchedule = run("noche 6h + sin sábado", nightOnly, nightExtra, 4000);
const anaNight = nightSchedule.hoursByInstructorDay.Ana;
const anaWeek = (["lun", "mar", "mie", "jue", "vie"] as Day[]).reduce(
  (sum, day) => sum + (anaNight?.[day] ?? 0),
  0,
);
if ((anaNight?.sab ?? 0) !== 0 || anaWeek !== 6) {
  console.error("Ana debía quedar con 6 h entre semana y 0 h el sábado", anaNight);
  process.exit(1);
}

function nightTwelveWorkbook(): ArrayBuffer {
  return workbookFrom([
    ["AREA:", "TIC"],
    [],
    ["FICHA", "JORNADA", "TRIMESTRE", "SABADO", "Director", "Ambiente", "Ana", "Bruno", "Carla", "Diego"],
    ["Ficha doce", "NOCHE", 1, "SI", "Ana", "Aula 3", 12, 8, 6, 4],
  ]);
}

const twelve = parseWorkbook(nightTwelveWorkbook(), "noche-12.xlsx");
const twelveExtra: ExtraRules = {
  ...twelve.extraRules,
  noSabado: ["Carla", "Diego"],
  noNoche: [],
  maxSaturdayHours: { Ana: 4, Bruno: 6, Carla: 6, Diego: 6 },
};
const twelveSchedule = run("noche 12 h = 8 entre semana + 4 sábado", twelve, twelveExtra, 2500);
const anaTwelve = twelveSchedule.hoursByInstructorDay.Ana;
const anaTwelveWeek = (["lun", "mar", "mie", "jue", "vie"] as Day[]).reduce(
  (sum, day) => sum + (anaTwelve?.[day] ?? 0),
  0,
);
if (anaTwelveWeek !== 8 || (anaTwelve?.sab ?? 0) !== 4) {
  console.error("Ana debía quedar con 8 h entre semana y 4 h el sábado", anaTwelve);
  process.exit(1);
}

function blocksOf(slots: { start: number; end: number }[]): number[] {
  const sorted = [...slots].sort((a, b) => a.start - b.start);
  const blocks: number[] = [];
  let end = sorted[0].end;
  let start = sorted[0].start;
  for (const slot of sorted.slice(1)) {
    if (slot.start === end) end = slot.end;
    else {
      blocks.push(end - start);
      start = slot.start;
      end = slot.end;
    }
  }
  blocks.push(end - start);
  return blocks;
}

function assertSolidBlocks(label: string, schedule: Schedule) {
  for (const [ficha, cells] of Object.entries(schedule.grid)) {
    const grouped = new Map<string, { start: number; end: number }[]>();
    const weekTwos = new Map<string, number>();
    for (const [key, name] of Object.entries(cells)) {
      const slot = parseSlotKey(key);
      const id = `${name}|${slot.day}`;
      const list = grouped.get(id) ?? [];
      list.push({ start: slot.start, end: slot.end });
      grouped.set(id, list);
    }
    for (const [id, ranges] of grouped) {
      const [name, day] = id.split("|");
      const blocks = blocksOf(ranges);
      const night = ranges.some((range) => range.start >= 18) || day === "sab";
      for (const hours of blocks) {
        const ok =
          day === "sab" ? hours === 2 || hours === 4 || hours === 6 || hours === 8 || hours === 10 : night ? hours === 2 || hours === 4 : hours === 3 || hours === 6;
        if (!ok) {
          console.error(`${label}: ${ficha} ${name} quedó con un bloque de ${hours} h el ${day}`);
          process.exit(1);
        }
      }
      if (day === "sab" && blocks.filter((hours) => hours === 2).length > 1) {
        console.error(`${label}: ${ficha} ${name} tiene el sábado partido en franjas de 2 h`, blocks);
        process.exit(1);
      }
      if (day !== "sab" && night && blocks.length === 1 && blocks[0] === 2) {
        weekTwos.set(name, (weekTwos.get(name) ?? 0) + 1);
      }
    }
    for (const [name, count] of weekTwos) {
      if (count > 1) {
        console.error(`${label}: ${ficha} ${name} tiene ${count} noches sueltas de 2 h`);
        process.exit(1);
      }
    }
  }
}

assertSolidBlocks("mini", miniSchedule);
assertSolidBlocks("noche", nightSchedule);
assertSolidBlocks("doce", twelveSchedule);
const anaSaturday = Object.entries(twelveSchedule.grid["Ficha doce"] ?? {})
  .map(([key, name]) => ({ key, name, slot: parseSlotKey(key) }))
  .filter((item) => item.name === "Ana" && item.slot.day === "sab")
  .sort((a, b) => a.slot.start - b.slot.start);
if (anaSaturday.length !== 2 || anaSaturday[1].slot.start !== anaSaturday[0].slot.end) {
  console.error("Las 4 h de Ana el sábado no quedaron seguidas", anaSaturday.map((item) => item.slot.label));
  process.exit(1);
}
console.log("Bloques completos OK", SABADO.length);

function roleWorkbook(): ArrayBuffer {
  return workbookFrom([
    ["AREA:", "TIC"],
    [],
    ["FICHA", "JORNADA", "TRIMESTRE", "SABADO", "Director", "Ambiente", "Inglés", "Etica"],
    ["Ficha rol 1", "NOCHE", 1, "NO", "Inglés", "Aula 1", 12, 8],
    ["Ficha rol 2", "NOCHE", 1, "NO", "Etica", "Aula 2", 12, 8],
  ]);
}

const roles = parseWorkbook(roleWorkbook(), "roles.xlsx");
const roleSchedule = run("roles pueden cruzarse si no hay otra forma", roles, roles.extraRules, 300);
const roleKeys = ["Ficha rol 1", "Ficha rol 2"].map((name) => new Set(Object.keys(roleSchedule.grid[name] ?? {})));
const shared = [...roleKeys[0]].filter((key) => roleKeys[1].has(key));
if (!shared.length) {
  console.error("Los roles debían coincidir en alguna franja");
  process.exit(1);
}
const personClash = validateSchedule(
  {
    ...roles,
    fichas: roles.fichas,
    instructorNames: ["Ana", "Inglés"],
  },
  {
    grid: {
      "Ficha rol 1": { "lun|06-09|6|9": "Ana", "mar|06-09|6|9": "Inglés" },
      "Ficha rol 2": { "lun|06-09|6|9": "Ana", "mar|06-09|6|9": "Inglés" },
    },
    hoursByInstructorDay: {},
  },
  roles.extraRules,
);
if (!personClash.some((issue) => issue.message.includes("Cruce de Ana"))) {
  console.error("Ana debía marcar cruce", personClash);
  process.exit(1);
}
if (personClash.some((issue) => issue.message.includes("Cruce de Inglés"))) {
  console.error("Inglés no debe marcar cruce", personClash);
  process.exit(1);
}
console.log("Cruce de roles OK");

function stuckWorkbook(): ArrayBuffer {
  return workbookFrom([
    ["AREA:", "TIC"],
    [],
    ["FICHA", "JORNADA", "TRIMESTRE", "SABADO", "Director", "Ambiente", "Ana", "Bruno"],
    ["ADSO 3314256", "NOCHE", 1, "NO", "Ana", "Aula 1", 8, 12],
  ]);
}

const stuck = parseWorkbook(stuckWorkbook(), "trabada.xlsx");
const stuckResult = solveSchedule(stuck, { ...stuck.extraRules, noNoche: ["Ana"], noSabado: ["Ana"] }, 20);
if (stuckResult.ok || !stuckResult.message.includes("Ana") || !stuckResult.message.includes("ADSO 3314256")) {
  console.error("El fallo no señaló a Ana en la ficha trabada", stuckResult);
  process.exit(1);
}
console.log("indicio", stuckResult.message);

const sampleAssignment: FichaAssignment = {
  fichaName: "Ficha noche",
  timelineId: "lt",
  saved: true,
  rows: [
    {
      id: "1",
      sourceResultId: "r1",
      sourceTrimestre: 2,
      enfoque: "Primera línea\nSegunda línea",
      ap: "AP",
      hours: 6,
      norma: "Norma X",
      codigo: "C",
      resultados: ["RAP 1"],
      instructor: "Ana",
      observation: "Obs",
    },
  ],
};

async function checkExport() {
  const exported = await exportScheduleWorkbook(nightOnly, nightSchedule, nightExtra, {
    "Ficha noche": sampleAssignment,
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(exported);
  const sheet = wb.getWorksheet("Ficha noche");
  if (!sheet) {
    console.error("No se generó la hoja de la ficha");
    process.exit(1);
  }
  const texts: string[] = [];
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      if (cell.value != null) texts.push(String(cell.value));
    });
  });
  const enfoqueAt = texts.indexOf("Enfoque del trimestre 2");
  const horarioAt = texts.indexOf("Franja");
  const asignacionAt = texts.indexOf("Asignación de instructores y resultados");
  const normaAt = texts.indexOf("Norma de competencia");
  const resultadoAt = texts.indexOf("Resultado");
  const instructorAt = texts.indexOf("Instructor");
  if (enfoqueAt < 0 || horarioAt < 0 || asignacionAt < 0) {
    console.error("Faltan bloques en el Excel", { enfoqueAt, horarioAt, asignacionAt, texts });
    process.exit(1);
  }
  if (!(enfoqueAt < horarioAt && horarioAt < asignacionAt)) {
    console.error("El orden del Excel no es info / enfoque / horario / asignación", {
      enfoqueAt,
      horarioAt,
      asignacionAt,
    });
    process.exit(1);
  }
  if (normaAt < 0 || resultadoAt < 0 || instructorAt < 0 || !(normaAt < resultadoAt && resultadoAt < instructorAt)) {
    console.error("Las columnas de asignación no quedaron en el orden pedido");
    process.exit(1);
  }
  if (!texts.includes("Primera línea\nSegunda línea")) {
    console.error("El enfoque no se escribió en el Excel");
    process.exit(1);
  }
  if (!texts.includes("6:00 a 8:00 pm") || !texts.includes("8:00 a 10:00 pm")) {
    console.error("La noche no se exportó en franjas de 2 h", texts.filter((t) => t.includes("pm")));
    process.exit(1);
  }
  console.log("\nExcel OK");

  const one = await exportFichaWorkbook(
    nightOnly.fichas[0],
    nightSchedule.grid["Ficha noche"] ?? {},
    nightExtra,
    nightOnly.area ?? "",
    sampleAssignment,
  );
  const oneBook = new ExcelJS.Workbook();
  await oneBook.xlsx.load(one);
  if (oneBook.worksheets.length !== 1 || !oneBook.getWorksheet("Ficha noche")) {
    console.error("La exportación de una ficha no quedó en una sola hoja");
    process.exit(1);
  }
  const pdf = await exportFichaPdf(
    nightOnly.fichas[0],
    nightSchedule.grid["Ficha noche"] ?? {},
    nightOnly.area ?? "",
    sampleAssignment,
  );
  const pdfHead = Buffer.from(pdf).subarray(0, 5).toString("utf8");
  if (pdfHead !== "%PDF-" || pdf.byteLength < 500) {
    console.error("El PDF de la ficha no se generó", pdfHead, pdf.byteLength);
    process.exit(1);
  }
  console.log("Ficha individual Excel y PDF OK");

  const { parseScheduleReport } = await import("../src/lib/parseScheduleReport");
  const reloaded = await parseScheduleReport(exported, "reporte.xlsx");
  const gridEntries = (grid: Record<string, Record<string, string>>) =>
    Object.entries(grid)
      .map(([ficha, cells]) => [ficha, Object.entries(cells).sort().map(([key, name]) => `${key}=${name}`).join("|")] as const)
      .sort();
  const sameGrid =
    JSON.stringify(gridEntries(reloaded.schedule.grid)) === JSON.stringify(gridEntries(nightSchedule.grid));
  const sameHours =
    JSON.stringify(reloaded.parsed.fichas[0]?.hours) === JSON.stringify(nightOnly.fichas[0]?.hours);
  const keptAna = reloaded.extra.noSabado.includes("Ana");
  const keptDetail = reloaded.assignments["Ficha noche"]?.rows[0]?.observation === "Obs";
  if (!sameGrid || !sameHours || !keptAna || !keptDetail || (reloaded.parsed.area || "") !== (nightOnly.area || "")) {
    console.error("El reporte no se volvió a leer igual", {
      sameGrid,
      sameHours,
      keptAna,
      keptDetail,
      area: reloaded.parsed.area,
    });
    process.exit(1);
  }
  console.log("Reporte recargado OK");

  const dayExported = await exportScheduleWorkbook(mini, miniSchedule, extra);
  const dayReloaded = await parseScheduleReport(dayExported, "dia.xlsx");
  const dayIssues = validateSchedule(dayReloaded.parsed, dayReloaded.schedule, dayReloaded.extra);
  const morningKeys = Object.keys(dayReloaded.schedule.grid["Ficha mañana"] ?? {});
  const tardeKeys = Object.keys(dayReloaded.schedule.grid["Ficha tarde"] ?? {});
  const nocheKeys = Object.keys(dayReloaded.schedule.grid["Ficha noche"] ?? {});
  if (
    dayIssues.length ||
    !morningKeys.some((key) => key.includes("|09-12|")) ||
    !tardeKeys.some((key) => key.includes("|12-15|")) ||
    !nocheKeys.some((key) => key.includes("|10-12|"))
  ) {
    console.error("La franja hasta las 12 m no se leyó", {
      issues: dayIssues.slice(0, 8),
      morningKeys,
      tardeKeys,
      nocheKeys,
    });
    process.exit(1);
  }
  console.log("Franjas de mediodía OK");

  const hoursTpl = await buildBaseTemplate("hours");
  const hoursParsed = parseWorkbook(hoursTpl, "plantilla_con_horas.xlsx");
  if (hoursParsed.fichas.length !== 3 || hoursParsed.instructorNames.length !== 4) {
    console.error("La plantilla con horas no se leyó bien", hoursParsed.fichas.length, hoursParsed.instructorNames);
    process.exit(1);
  }
  if (hoursParsed.instructorNames.some((name) => /total/i.test(name))) {
    console.error("TOTAL no debe entrar como instructor", hoursParsed.instructorNames);
    process.exit(1);
  }
  const hoursBook = new ExcelJS.Workbook();
  await hoursBook.xlsx.load(hoursTpl);
  const assignSheet = hoursBook.getWorksheet("Asignación");
  const totalHeader = String(assignSheet?.getCell(3, 11).value ?? "");
  const totalesLabel = String(assignSheet?.getCell(7, 1).value ?? "");
  if (totalHeader !== "TOTAL" || totalesLabel !== "TOTALES") {
    console.error("Falta la columna TOTAL o la fila TOTALES", { totalHeader, totalesLabel });
    process.exit(1);
  }
  run("plantilla ejemplo con horas", hoursParsed, hoursParsed.extraRules, 4000);

  const emptyTpl = await buildBaseTemplate("empty");
  const emptyParsed = parseWorkbook(emptyTpl, "plantilla_sin_horas.xlsx", { allowEmptyHours: true });
  if (emptyParsed.fichas.length !== 3 || emptyParsed.fichas.some((ficha) => Object.keys(ficha.hours).length)) {
    console.error("La plantilla sin horas debía entrar vacía de horas");
    process.exit(1);
  }
  console.log("Plantillas OK");
}

checkExport().catch((err) => {
  console.error(err);
  process.exit(1);
});
