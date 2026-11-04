import { CalendarClock } from 'lucide-react';
import { EVENTOS_SOCKET, hoyArgentina, type MiTurno } from '@pgim/shared';
import { EncabezadoPagina, Etiqueta, EstadoCarga, Panel, Vacio } from '../../components/ui';
import { formatoDiaRelativo, sumarDias } from '../../lib/formato';
import { useEventoSocket } from '../../lib/socket';
import { useRecurso } from '../../lib/useRecurso';
import { NOMBRE_FRANJA } from './apertura/semana';

const mesLargo = new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', month: 'long' });

// Lunes de la semana de una fecha "AAAA-MM-DD".
function lunesDe(fecha: string): string {
  const dia = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  return sumarDias(fecha, -((dia + 6) % 7));
}

// "Semana del 9 al 15 de noviembre" (o "del 30 de noviembre al 6 de diciembre").
function tituloSemana(lunes: string): string {
  const domingo = sumarDias(lunes, 6);
  const [, mesL, diaL] = lunes.split('-').map(Number) as [number, number, number];
  const [, mesD, diaD] = domingo.split('-').map(Number) as [number, number, number];
  const mes = (f: string) => mesLargo.format(new Date(`${f}T12:00:00Z`));
  return mesL === mesD
    ? `Semana del ${diaL} al ${diaD} de ${mes(domingo)}`
    : `Semana del ${diaL} de ${mes(lunes)} al ${diaD} de ${mes(domingo)}`;
}

// Turnos confirmados del empleado, agrupados por semana. Se recarga solo cuando
// el gerente confirma una planificación.
export function MisTurnosPage() {
  const recurso = useRecurso<MiTurno[]>('/turnos/mios');
  useEventoSocket(EVENTOS_SOCKET.turnosPublicados, () => recurso.recargar());

  const hoy = hoyArgentina(new Date());
  const turnos = [...(recurso.datos ?? [])].sort(
    (a, b) => a.fecha.localeCompare(b.fecha) || a.horaInicio.localeCompare(b.horaInicio),
  );
  const proximo = turnos[0];
  const semanas = new Map<string, MiTurno[]>();
  for (const t of turnos) {
    const lunes = lunesDe(t.fecha);
    semanas.set(lunes, [...(semanas.get(lunes) ?? []), t]);
  }

  return (
    <section>
      <EncabezadoPagina
        titulo="Mis turnos"
        descripcion="Tus turnos de las semanas ya confirmadas."
      />
      <EstadoCarga cargando={recurso.cargando && !recurso.datos} error={recurso.error} />
      {recurso.datos && turnos.length === 0 && (
        <Vacio
          icono={CalendarClock}
          titulo="Todavía no hay turnos publicados."
          texto="Cuando se confirme la semana, aparecen acá."
        />
      )}
      <div className="grid gap-4">
        {[...semanas].map(([lunes, lista]) => (
          <Panel key={lunes} className="!p-0">
            <h2 className="px-4 pb-1 pt-3 text-xs font-semibold text-meta">
              {tituloSemana(lunes)}
            </h2>
            <ul className="divide-y divide-line">
              {lista.map((t) => (
                <li
                  key={`${t.fecha}-${t.franja}`}
                  className="flex min-h-12 flex-col gap-0.5 px-4 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-x-2 font-medium text-ink">
                      {formatoDiaRelativo(t.fecha, hoy)}
                      {t === proximo && <Etiqueta tono="acento">Próximo</Etiqueta>}
                    </p>
                    <p className="hidden text-sm text-meta sm:block">{t.sucursal}</p>
                  </div>
                  <p className="text-sm text-ink">
                    <span className="font-medium">{NOMBRE_FRANJA[t.franja]}</span>{' '}
                    <span className="tabular-nums text-meta">
                      {t.horaInicio} a {t.horaFin} h
                    </span>
                    <span className="text-meta sm:hidden"> · {t.sucursal}</span>
                  </p>
                </li>
              ))}
            </ul>
          </Panel>
        ))}
      </div>
    </section>
  );
}
