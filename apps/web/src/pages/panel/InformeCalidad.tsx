import type { CriterioId, InformeCalidad as Informe, NivelCalidad } from '@pgim/shared';
import { Etiqueta } from '../../components/ui';
import { infoEstado, type Tono } from '../../lib/estados';

const NOMBRES: Record<CriterioId, string> = {
  FORMATO: 'Duración y calidad',
  NITIDEZ: 'Nitidez',
  EXPOSICION: 'Luz',
  BRILLOS: 'Reflejos',
  RECORRIDO: 'Vuelta al plato',
};

const TITULOS: Record<NivelCalidad, string> = {
  OK: 'El video está listo para enviar',
  ADVERTENCIA: 'Podés enviarlo, pero revisá esto',
  RECHAZO: 'Hay que grabarlo de nuevo',
};

const COLOR_ICONO: Record<Tono, string> = {
  neutro: 'text-meta',
  acento: 'text-accent',
  ok: 'text-ok',
  warn: 'text-warn',
  bad: 'text-bad',
};

// Resultado de revisar el video: un título según el peor nivel y una fila por criterio.
export function InformeCalidad({ informe }: { informe: Informe }) {
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold text-ink">{TITULOS[informe.nivelGlobal]}</h3>
      <ul className="space-y-3">
        {informe.criterios.map((c) => {
          const { etiqueta, tono, icono: Icono } = infoEstado('calidad', c.nivel);
          return (
            <li key={c.criterio} className="flex items-start gap-2">
              <Icono
                aria-hidden
                className={`mt-0.5 size-4 shrink-0 ${COLOR_ICONO[tono]}`}
                strokeWidth={2.4}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text">{NOMBRES[c.criterio]}</p>
                {c.mensaje && <p className="text-sm text-meta">{c.mensaje}</p>}
              </div>
              <Etiqueta tono={tono}>{etiqueta}</Etiqueta>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
