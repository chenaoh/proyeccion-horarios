export function normName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function namesMatch(a: string, b: string): boolean {
  return normName(a) === normName(b);
}

export function inNameList(name: string, list: string[]): boolean {
  const n = normName(name);
  return list.some((item) => normName(item) === n);
}

export const DEFAULT_NO_NOCHE = [
  "Cristian Henao",
  "Henry Falla",
  "Yeison",
  "Alejandro",
];

export const DEFAULT_NO_SABADO = [
  "Cristian Henao",
  "Henry Falla",
  "Yeison",
  "Germán Angarita",
];

/** Roles, no personas. Pueden coincidir en la misma franja cuando no hay otra forma de programar. */
export const ROLE_INSTRUCTORS = [
  "Inglés",
  "Abogado",
  "Comunicador",
  "Deporte",
  "Administrador",
  "Ambiental",
  "Etica",
  "SSyT",
];

export function isRoleInstructor(name: string): boolean {
  return inNameList(name, ROLE_INSTRUCTORS);
}
