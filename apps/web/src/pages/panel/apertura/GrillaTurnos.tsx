import { TriangleAlert } from 'lucide-react';
import type { Franja, PlanificacionSemana } from '@pgim/shared';
import { Etiqueta, Panel } from '../../../components/ui';
import { NOMBRE_FRANJA, clave, diaCorto, diaLargo } from './semana';

type Rol = 'MOZO' | 'COCINERO';
const ROLES: { rol: Rol; titulo: string; singular: string; plural: string }[] = [
  { rol: 'MOZO', titulo: 'Mozos', singular: 'mozo', plural: 'mozos' },
  { rol: 'COCINERO', titulo: 'Cocineros', singular: 'cocinero', plural: 'cocineros' },
];

interface Bloque {
  rol: Rol;
  titulo: string;
  nombres: string[];
  requeridos: number;
  falta: number;
  faltaTexto: string;
}

// Un bloque por rol y franja: quiénes están asignados frente a cuántos hacen falta.
function bloquesDe(plan: PlanificacionSemana, fecha: string, franja: Franja): Bloque[] | null {
  const k = clave({ fecha, franja });
  const dotacion = plan.dotacion.filter((d) => clave(d) === k);
  if (dotacion.length === 0) return null;
  return ROLES.map(({ rol, titulo, singular, plural }) => {
    const nombres = plan.turnos
      .filter((t) => clave(t) === k && t.arquetipo === rol)
      .map((t) => t.nombre);
    const requeridos = dotacion.find((d) => d.arquetipo === rol)?.cantidad ?? 0;
    const falta = Math.max(requeridos - nombres.length, 0);
    return {
      rol,
      titulo,
      nombres,
      requeridos,
      falta,
      faltaTexto: `Falta ${falta} ${falta === 1 ? singular : plural}`,
    };
  });
}

export function cantidadFaltantes(plan: PlanificacionSemana): number {
  let total = 0;
  for (const d of plan.dotacion) {
    const asignados = plan.turnos.filter(
      (t) => clave(t) === clave(d) && t.arquetipo === d.arquetipo,
    );
    total += Math.max(d.cantidad - asignados.length, 0);
  }
  return total;
}

function BloqueRol({ b }: { b: Bloque }) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-meta">{b.titulo}</span>
        <span className="font-semibold text-ink tabular-nums">
          {b.nombres.length} de {b.requeridos}
        </span>
      </div>
      {b.nombres.map((n, i) => (
        <span key={`${n}-${i}`} title={n} className="truncate text-sm text-text">
          {n}
        </span>
      ))}
      {b.falta > 0 && (
        <span>
          <Etiqueta tono="bad">
            <TriangleAlert aria-hidden className="size-3.5" strokeWidth={2.4} />
            {b.faltaTexto}
          </Etiqueta>
        </span>
      )}
    </div>
  );
}

function Celda({ bloques }: { bloques: Bloque[] }) {
  return (
    <div className="grid min-w-0 gap-2 rounded-control border border-line bg-surface p-2">
      {bloques.map((b) => (
        <BloqueRol key={b.rol} b={b} />
      ))}
    </div>
  );
}

// Misma estructura que la grilla de demanda (7 días por franjas) para que los
// días se lean alineados. En el celular, una lista por día.
export function GrillaTurnos({
  plan,
  fechas,
  franjas,
}: {
  plan: PlanificacionSemana;
  fechas: string[];
  franjas: Franja[];
}) {
  return (
    <Panel titulo="Turnos de la semana">
      <div className="hidden md:block">
        <table className="w-full table-fixed border-separate border-spacing-1 text-left">
          <thead>
            <tr>
              <th scope="col" className="w-24" />
              {fechas.map((f) => (
                <th key={f} scope="col" className="px-1 pb-1 text-xs font-medium text-meta">
                  {diaCorto(f)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {franjas.map((franja) => (
              <tr key={franja}>
                <th scope="row" className="pr-2 text-left align-top text-sm font-medium text-ink">
                  {NOMBRE_FRANJA[franja]}
                </th>
                {fechas.map((f) => {
                  const bloques = bloquesDe(plan, f, franja);
                  return (
                    <td key={f} className="align-top">
                      {bloques && <Celda bloques={bloques} />}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="grid gap-3 md:hidden">
        {fechas.map((f) => (
          <li key={f} className="rounded-panel border border-line p-2">
            <h3 className="px-1 pb-1 text-sm font-semibold text-ink">{diaLargo(f)}</h3>
            <div className="grid gap-2">
              {franjas.map((franja) => {
                const bloques = bloquesDe(plan, f, franja);
                if (!bloques) return null;
                return (
                  <div key={franja} className="grid gap-1">
                    <span className="px-1 text-xs font-medium text-meta">
                      {NOMBRE_FRANJA[franja]}
                    </span>
                    <Celda bloques={bloques} />
                  </div>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
