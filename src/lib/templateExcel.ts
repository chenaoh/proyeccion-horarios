import ExcelJS from "exceljs";

export type TemplateKind = "hours" | "empty";

const INSTRUCTORS = ["Ana Pérez", "Bruno Díaz", "Carla Ruiz", "Diego León"] as const;

const META = ["FICHA", "JORNADA", "TRIMESTRE", "SABADO", "Director", "Ambiente"] as const;
const HEADER = [...META, ...INSTRUCTORS, "TOTAL"];
const FIRST_HOUR_COL = META.length + 1;
const LAST_HOUR_COL = FIRST_HOUR_COL + INSTRUCTORS.length - 1;
const TOTAL_COL = LAST_HOUR_COL + 1;
const FIRST_DATA_ROW = 4;

function colLetter(index: number): string {
  let n = index;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

const FICHAS: {
  name: string;
  jornada: string;
  trimestre: number;
  saturday: string;
  director: string;
  ambiente: string;
  hours: [number | "", number | "", number | "", number | ""];
}[] = [
  {
    name: "ADSO 3400001 Mañana",
    jornada: "MAÑANA",
    trimestre: 1,
    saturday: "NO",
    director: "Ana Pérez",
    ambiente: "Aula 1",
    hours: [15, 15, "", ""],
  },
  {
    name: "ADSO 3400002 Tarde",
    jornada: "TARDE",
    trimestre: 1,
    saturday: "NO",
    director: "Bruno Díaz",
    ambiente: "Aula 2",
    hours: ["", "", 15, 15],
  },
  {
    name: "ADSO 3400003 Noche",
    jornada: "NOCHE",
    trimestre: 2,
    saturday: "SI",
    director: "Carla Ruiz",
    ambiente: "Aula 3",
    hours: [6, 8, 8, 8],
  },
];

export function templateFileName(kind: TemplateKind): string {
  return kind === "hours"
    ? "plantilla_proyeccion_con_horas.xlsx"
    : "plantilla_proyeccion_sin_horas.xlsx";
}

export async function buildBaseTemplate(kind: TemplateKind): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Area Soft";
  wb.created = new Date();

  const assign = wb.addWorksheet("Asignación", {
    views: [{ state: "frozen", ySplit: 3 }],
  });
  assign.getCell("A1").value = "AREA:";
  assign.getCell("B1").value = "TIC";
  assign.getCell("A1").font = { bold: true, name: "Calibri" };
  assign.getCell("B1").font = { name: "Calibri" };

  HEADER.forEach((title, i) => {
    const cell = assign.getCell(3, i + 1);
    cell.value = title;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Calibri" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2E75B6" } };
  });

  FICHAS.forEach((ficha, rowIndex) => {
    const r = FIRST_DATA_ROW + rowIndex;
    const hours = kind === "hours" ? ficha.hours : (["", "", "", ""] as const);
    const values: (string | number)[] = [
      ficha.name,
      ficha.jornada,
      ficha.trimestre,
      ficha.saturday,
      ficha.director,
      ficha.ambiente,
      ...hours,
    ];
    values.forEach((value, i) => {
      assign.getCell(r, i + 1).value = value;
      assign.getCell(r, i + 1).font = { name: "Calibri" };
    });
    const totalCell = assign.getCell(r, TOTAL_COL);
    totalCell.value = { formula: `SUM(${colLetter(FIRST_HOUR_COL)}${r}:${colLetter(LAST_HOUR_COL)}${r})` };
    totalCell.font = { name: "Calibri", bold: true };
  });

  const totalsRow = FIRST_DATA_ROW + FICHAS.length;
  const lastDataRow = totalsRow - 1;
  assign.getCell(totalsRow, 1).value = "TOTALES";
  assign.getCell(totalsRow, 1).font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Calibri" };
  assign.getCell(totalsRow, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
  for (let c = 2; c <= META.length; c++) {
    assign.getCell(totalsRow, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
  }
  for (let c = FIRST_HOUR_COL; c <= TOTAL_COL; c++) {
    const cell = assign.getCell(totalsRow, c);
    cell.value = {
      formula: `SUM(${colLetter(c)}${FIRST_DATA_ROW}:${colLetter(c)}${lastDataRow})`,
    };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Calibri" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
  }

  assign.getColumn(1).width = 28;
  for (let c = 2; c <= 6; c++) assign.getColumn(c).width = 14;
  for (let c = 7; c <= HEADER.length; c++) assign.getColumn(c).width = 16;

  const info = wb.addWorksheet("Instrucciones");
  const lines =
    kind === "hours"
      ? [
          "Plantilla de ejemplo · Cargar con horas",
          "",
          "Usa este archivo con el botón «Con horas».",
          "Puedes cambiar nombres, fichas, instructores y horas. No borres las columnas FICHA y JORNADA.",
          "",
          "Columnas obligatorias: FICHA, JORNADA.",
          "Columnas recomendadas: TRIMESTRE, SABADO (SI/NO), Director, Ambiente.",
          "Después de Ambiente, una columna por instructor con las horas semanales en esa ficha.",
          "La columna TOTAL suma las horas de la ficha. La fila TOTALES suma las horas de cada instructor.",
          "Esas celdas van con fórmula: si cambias horas, el total se actualiza.",
          "",
          "JORNADA debe ser MAÑANA, TARDE o NOCHE.",
          "En noche, las horas de cada instructor en la ficha deben ser de 2 a 12, en bloques de 2.",
          "En mañana o tarde, las horas de cada instructor deben ser múltiplo de 3.",
          "El total de una ficha de día suele ser 30 h; de noche, 20 h sin sábado o 30 h con sábado.",
        ]
      : [
          "Plantilla base · Cargar sin horas",
          "",
          "Usa este archivo con el botón «Sin horas».",
          "Deja vacías las celdas de los instructores. Las horas se asignan después con la línea de tiempo.",
          "Puedes cambiar nombres de fichas e instructores. No borres las columnas FICHA y JORNADA.",
          "",
          "Columnas obligatorias: FICHA, JORNADA.",
          "Columnas recomendadas: TRIMESTRE, SABADO (SI/NO), Director, Ambiente.",
          "Después de Ambiente, una columna por instructor (sin horas).",
          "La columna TOTAL y la fila TOTALES ya están; se llenan cuando escribas horas.",
          "",
          "JORNADA debe ser MAÑANA, TARDE o NOCHE.",
          "Luego cargas la línea de tiempo de cada ficha y asignas resultados e instructores.",
        ];
  lines.forEach((line, i) => {
    info.getCell(i + 1, 1).value = line;
    info.getCell(i + 1, 1).font = { name: "Calibri", bold: i === 0 };
  });
  info.getColumn(1).width = 110;

  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}
