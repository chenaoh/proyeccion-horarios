"use client";

import { useEffect, useState } from "react";
import type { TemplateKind } from "@/lib/templateExcel";

export type HelpSection = "cargar" | "lineas" | "asignacion" | "restricciones" | "horario";

type Props = {
  open: boolean;
  onClose: () => void;
  section: HelpSection;
  fichaOpen?: boolean;
  onDownloadTemplate: (kind: TemplateKind) => void;
};

const TABS: { id: HelpSection; label: string }[] = [
  { id: "cargar", label: "Cargar" },
  { id: "lineas", label: "Líneas de tiempo" },
  { id: "asignacion", label: "Asignación" },
  { id: "restricciones", label: "Restricciones" },
  { id: "horario", label: "Horario" },
];

export function HelpPanel({ open, onClose, section, fichaOpen = false, onDownloadTemplate }: Props) {
  const [active, setActive] = useState<HelpSection>(section);

  useEffect(() => {
    if (open) setActive(section);
  }, [open, section]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const current = TABS.find((tab) => tab.id === active) ?? TABS[0];

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-slate-950/50">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Cerrar ayuda"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        className="relative flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Ayuda</p>
            <h2 id="help-title" className="mt-1 text-xl font-semibold text-slate-900">
              {current.label}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Estás en esta sección. Cambia de pestaña si quieres ver otra.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cerrar
          </button>
        </header>

        <nav className="flex flex-wrap gap-2 border-b border-slate-100 px-6 py-3">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActive(tab.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                tab.id === active
                  ? "bg-teal-700 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-teal-50 hover:text-teal-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto px-6 py-6 text-sm leading-relaxed text-slate-700">
          {active === "cargar" ? <CargarHelp onDownloadTemplate={onDownloadTemplate} /> : null}
          {active === "lineas" ? <LineasHelp /> : null}
          {active === "asignacion" ? <AsignacionHelp fichaOpen={fichaOpen} /> : null}
          {active === "restricciones" ? <RestriccionesHelp /> : null}
          {active === "horario" ? <HorarioHelp /> : null}
        </div>
      </aside>
    </div>
  );
}

function CargarHelp({ onDownloadTemplate }: { onDownloadTemplate: (kind: TemplateKind) => void }) {
  return (
    <div className="space-y-4">
      <p>Elige el archivo según lo que tengas. Los tres botones del banner hacen cosas distintas:</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Con horas:</strong> el Excel ya trae horas por instructor en cada ficha. Sigues a
          restricciones y generas.
        </li>
        <li>
          <strong>Sin horas:</strong> solo fichas e instructores. Después vinculas la línea de tiempo
          y asignas resultados.
        </li>
        <li>
          <strong>Avance:</strong> retoma un <code>.md</code> guardado con Guardar avance.
        </li>
      </ul>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="font-semibold text-slate-900">Plantilla que debe cargarse</p>
        <p className="mt-1">
          Hoja <strong>Asignación</strong>, celda <code>AREA:</code> y columnas FICHA, JORNADA,
          TRIMESTRE, SABADO, Director, Ambiente, una columna por instructor, la columna{" "}
          <strong>TOTAL</strong> por ficha y la fila <strong>TOTALES</strong> por instructor.
        </p>
        <p className="mt-2">JORNADA: MAÑANA, TARDE o NOCHE. SABADO: SI o NO.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onDownloadTemplate("hours")}
            className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-600"
          >
            Descargar ejemplo con horas
          </button>
          <button
            type="button"
            onClick={() => onDownloadTemplate("empty")}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Descargar plantilla sin horas
          </button>
        </div>
      </div>
    </div>
  );
}

function LineasHelp() {
  return (
    <div className="space-y-3">
      <p>Cada ficha necesita su línea de tiempo antes de asignar instructores.</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>Arrastra o sube el Excel de la línea de tiempo en la ficha correspondiente.</li>
        <li>En el listado solo aparecen las que coinciden con la jornada (día o noche) y el trimestre.</li>
        <li>Puedes volver aquí desde la asignación sin perder el avance de las otras fichas.</li>
        <li>Si cambias la línea de una ficha, solo se reinicia esa ficha.</li>
      </ul>
      <p>Continúa cuando al menos una ficha tenga línea de tiempo. Las que falten se avisan.</p>
    </div>
  );
}

function AsignacionHelp({ fichaOpen }: { fichaOpen: boolean }) {
  return (
    <div className="space-y-3">
      {fichaOpen ? (
        <p>
          Estás dentro de una ficha. Arriba ves el enfoque del trimestre. La tabla empieza por la
          norma de competencia; luego resultado, instructor, horas y observación.
        </p>
      ) : (
        <p>
          Las tarjetas muestran el director de grupo. Entra solo a una ficha que ya tenga línea de
          tiempo; si no, el sistema avisa.
        </p>
      )}
      <ul className="list-disc space-y-1 pl-5">
        <li>El total de la ficha debe cerrar en 20 h (noche sin sábado) o 30 h.</li>
        <li>En noche, cada instructor en esa ficha debe quedar entre 2 y 12 h, en bloques de 2. Por ejemplo, 8 h entre semana y 4 h el sábado.</li>
        <li>Las horas de un resultado se pueden bajar para subir las de otro. La ficha se guarda cuando el total cierra.</li>
        <li>En mañana o tarde, las horas de cada instructor deben ser múltiplo de 3.</li>
        <li>El combo muestra las horas totales del instructor en todas las fichas, no solo en esta.</li>
        <li>La observación llega de la fila AP de la línea de tiempo y se puede editar.</li>
        <li>En Avance por instructores, un clic en el nombre abre tarjetas con la ficha, las horas y la observación de lo que debe orientar. Otro clic las cierra.</li>
        <li>Puedes agregar un instructor que no venía en el Excel. Queda en el combo y en restricciones.</li>
        <li>El check Programar sábado cambia la ficha. En noche, al marcarlo el tope pasa de 20 h a 30 h.</li>
        <li>Guarda la ficha antes de pasar a restricciones.</li>
        <li>Pasar de 40 h en un instructor es aviso, no bloquea.</li>
      </ul>
    </div>
  );
}

function RestriccionesHelp() {
  return (
    <div className="space-y-3">
      <p>
        Estas reglas se aplican al generar. El sábado de cada ficha se cambia con el check, y un instructor
        que no estaba en el Excel se agrega con el formulario.
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>11 h al día:</strong> tope fijo. Suma mañana, tarde y noche del mismo día.
        </li>
        <li>
          <strong>6 h seguidas:</strong> opcional, por instructor y en la misma ficha. Va desmarcada.
          No reemplaza las 11 h.
        </li>
        <li>
          <strong>Sin noche / Sin sábado:</strong> no se programa en esas franjas. Una ficha de noche
          con sábado necesita a alguien que sí pueda sábado.
        </li>
        <li>
          <strong>Tope de sábado:</strong> por defecto 6 h.
        </li>
        <li>
          <strong>Franjas ocupadas:</strong> bloques en los que ya no está disponible.
        </li>
      </ul>
      <p>
        En noche, L–V son 6:00–8:00 pm y 8:00–10:00 pm. Se prefieren 4 h seguidas. Si alguien tiene 6
        h y no puede sábado, queda 4 h un día y 2 h otro; el hueco lo toma otro instructor.
      </p>
    </div>
  );
}

function HorarioHelp() {
  return (
    <div className="space-y-3">
      <p>
        <strong>Iniciar programación</strong> busca un horario sin cruces de instructor ni de
        ambiente. Si se traba en una ficha, el aviso nombra a los instructores que conviene revisar.
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>Clic en una celda: queda seleccionada.</li>
        <li>Verde claro: se puede mover ahí. Rojo: cruce o distinta duración.</li>
        <li>Solo se aplica el cambio en una celda verde.</li>
        <li>Deshacer vuelve al horario anterior.</li>
        <li>Cada ficha tiene Excel y PDF propios, con enfoque, franjas, resultados y observaciones.</li>
      </ul>
      <p>El Excel exportado de cada ficha va en este orden:</p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>Información de la ficha.</li>
        <li>Enfoque del trimestre.</li>
        <li>Horario.</li>
        <li>Asignación: Norma, Resultado, Instructor, Horas, Observación.</li>
      </ol>
    </div>
  );
}
