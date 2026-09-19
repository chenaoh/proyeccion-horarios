export type Day = "lun" | "mar" | "mie" | "jue" | "vie" | "sab";
export type Jornada = "MAÑANA" | "TARDE" | "NOCHE";

export type Slot = {
  day: Day;
  label: string;
  start: number;
  end: number;
  hours: number;
  jornada: Jornada;
};

export type OccupiedRange = {
  day: Day;
  start: number;
  end: number;
  raw: string;
};

export type FichaInput = {
  name: string;
  jornada: Jornada;
  trimestre: number | null;
  saturday: boolean;
  director: string;
  ambiente: string;
  hours: Record<string, number>;
};

export type ExtraRules = {
  occupied: Record<string, OccupiedRange[]>;
  noNoche: string[];
  noSabado: string[];
  maxSaturdayHours: Record<string, number>;
  /** Por instructor: opcional. Si es true, puede hacer 6 h seguidas en una misma ficha. El tope diario de 11 h es aparte. */
  allowSixHourBlocks: Record<string, boolean>;
};

export type ParsedWorkbook = {
  fileName: string;
  area: string;
  sheetName: string;
  sourceRows: (string | number | null)[][];
  fichas: FichaInput[];
  instructorNames: string[];
  extraRules: ExtraRules;
  warnings: string[];
};

export type Grid = Record<string, Record<string, string>>;

export type Schedule = {
  grid: Grid;
  hoursByInstructorDay: Record<string, Record<Day, number>>;
};

export type Issue = {
  severity: "error" | "warning";
  message: string;
};

export type SelectedCell = {
  ficha: string;
  slotKey: string;
};

export type LoadMode = "hours" | "manual";

export type TimelineJornada = "DIA" | "NOCHE";

export type TimelineResult = {
  id: string;
  col: number;
  trimestre: number;
  trimestreLabel: string;
  enfoque: string;
  ap: string;
  hours: number;
  norma: string;
  codigo: string;
  resultados: string[];
};

export type Timeline = {
  id: string;
  fileName: string;
  title: string;
  program: string;
  jornadaKind: TimelineJornada;
  codigoPrograma: string;
  trimestres: number[];
  results: TimelineResult[];
  warnings: string[];
};

export type AssignmentRow = {
  id: string;
  sourceResultId: string;
  sourceTrimestre: number;
  enfoque: string;
  ap: string;
  hours: number;
  norma: string;
  codigo: string;
  resultados: string[];
  instructor: string;
  observation: string;
};

export type FichaAssignment = {
  fichaName: string;
  timelineId: string;
  rows: AssignmentRow[];
  saved: boolean;
};

export type ManualPhase = "timelines" | "assign" | "setup" | "review";
