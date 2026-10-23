import { useState } from 'react';
import { EVENTOS_SOCKET, hoyArgentina, type EstadoReserva, type ReservaPanel } from '@pgim/shared';
import { useSesion } from '../../auth/SesionProvider';
import { Lista } from '../../components/Lista';
import {
  Aviso,
  Boton,
  Campo,
  EncabezadoPagina,
  EstadoCarga,
  Etiqueta,
  claseInput,
} from '../../components/ui';
import { formatoHora } from '../../lib/formato';
import { esActivable } from '../../lib/reservas';
import { useEventoSocket } from '../../lib/socket';
import { useAhora } from '../../lib/useAhora';
import { useGuardar } from '../../lib/useGuardar';
import { useRecurso } from '../../lib/useRecurso';

const ESTADOS: Record<EstadoReserva, { texto: string; color: 'ambar' | 'verde' | 'gris' }> = {
  PENDIENTE: { texto: 'Pendiente', color: 'ambar' },
  ACTIVA: { texto: 'Activa', color: 'verde' },
  FINALIZADA: { texto: 'Finalizada', color: 'gris' },
  CANCELADA: { texto: 'Cancelada', color: 'gris' },
  VENCIDA: { texto: 'Vencida', color: 'gris' },
};

const FILTROS = [
  { valor: 'TODAS', texto: 'Todas' },
  { valor: 'PENDIENTE', texto: 'Pendientes' },
  { valor: 'ACTIVA', texto: 'Activas' },
  { valor: 'VENCIDA', texto: 'Vencidas' },
] as const;

type Filtro = (typeof FILTROS)[number]['valor'];

// CU-12: reservas del día de la sucursal de trabajo. Al llegar el comensal se
// activa la reserva, lo que abre su cuenta de mesa.
export function ReservasPage() {
  const { sesion, tienePermiso } = useSesion();
  const [fecha, setFecha] = useState(hoyArgentina());
  const [filtro, setFiltro] = useState<Filtro>('TODAS');
  const { datos, cargando, error, recargar } = useRecurso<ReservaPanel[]>(
    `/reservas?fecha=${fecha}`,
  );
  const activacion = useGuardar();
  const ahora = useAhora();
  // El personal ya está en la sala de su sucursal: cualquier alta, baja,
  // activación o vencimiento refresca la lista.
  useEventoSocket(EVENTOS_SOCKET.cambioSalon, recargar);

  const filas = datos?.filter((r) => filtro === 'TODAS' || r.estado === filtro);

  async function activar(r: ReservaPanel) {
    if (await activacion.enviar(`/reservas/${r.id}/activar`, 'POST')) recargar();
  }

  return (
    <section>
      <EncabezadoPagina
        titulo="Reservas"
        descripcion={`Reservas de ${sesion?.sucursalActiva?.nombre ?? 'la sucursal'}.`}
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Campo etiqueta="Fecha">
          <input
            type="date"
            value={fecha}
            onChange={(e) => e.target.value && setFecha(e.target.value)}
            className={claseInput}
          />
        </Campo>
        <Campo etiqueta="Estado">
          <select
            value={filtro}
            onChange={(e) => setFiltro(e.target.value as Filtro)}
            className={claseInput}
          >
            {FILTROS.map((f) => (
              <option key={f.valor} value={f.valor}>
                {f.texto}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      <EstadoCarga cargando={cargando && !datos} error={error} />
      <div className="mb-3">
        <Aviso>{activacion.error}</Aviso>
      </div>
      {filas?.length === 0 && (
        <p className="text-sm text-slate-500">No hay reservas para mostrar.</p>
      )}
      {filas && filas.length > 0 && (
        <Lista
          filas={filas}
          clave={(r) => r.id}
          columnas={[
            { titulo: 'Hora', valor: (r) => formatoHora(r.inicio) },
            { titulo: 'Mesa', valor: (r) => r.mesa.numero },
            { titulo: 'Comensal', valor: (r) => r.comensal.nombre },
            { titulo: 'Teléfono', valor: (r) => r.comensal.telefono ?? '—' },
            { titulo: 'Personas', valor: (r) => r.cantidadPersonas },
            {
              titulo: 'Estado',
              valor: (r) => (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <Etiqueta color={ESTADOS[r.estado].color}>{ESTADOS[r.estado].texto}</Etiqueta>
                  {r.estado === 'PENDIENTE' && (
                    <span className="text-xs text-slate-500">
                      Tolerancia hasta {formatoHora(r.limiteLlegada)}
                    </span>
                  )}
                </span>
              ),
            },
          ]}
          acciones={(r) =>
            esActivable(r, ahora) &&
            tienePermiso('reserva.activar') && (
              <Boton disabled={activacion.enviando} onClick={() => activar(r)}>
                Activar
              </Boton>
            )
          }
        />
      )}
    </section>
  );
}
