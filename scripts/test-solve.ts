import { existsSync, readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { exportScheduleWorkbook } from "../src/lib/exportExcel";
import { parseWorkbook } from "../src/lib/parseExcel";
import { buildBaseTemplate } from "../src/lib/templateExcel";
import { solveSchedule } from "../src/lib/solver";
import { validateSchedule } from "../src/lib/validate";
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
run("3 fichas / 4 instructores", mini, extra, 4000);

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
