import { EVENTOS_SOCKET, type EstadoReserva, type ReservaComensal } from '@pgim/shared';
import { LayoutComensal } from '../../components/LayoutComensal';
import { Aviso, Boton, EstadoCarga, Etiqueta } from '../../components/ui';
import { formatoDiaYHora, formatoHora } from '../../lib/formato';
import { useEventoSocket } from '../../lib/socket';
import { useGuardar } from '../../lib/useGuardar';
import { useRecurso } from '../../lib/useRecurso';

const ETIQUETA_ESTADO: Record<EstadoReserva, { texto: string; color: 'ambar' | 'verde' | 'gris' }> =
  {
    PENDIENTE: { texto: 'Pendiente', color: 'ambar' },
    ACTIVA: { texto: 'Activa', color: 'verde' },
    FINALIZADA: { texto: 'Finalizada', color: 'gris' },
    CANCELADA: { texto: 'Cancelada', color: 'gris' },
    VENCIDA: { texto: 'Vencida', color: 'gris' },
  };

export function MisReservasPage() {
  const { datos, cargando, error, recargar } = useRecurso<ReservaComensal[]>('/comensal/reservas');
  const cancelacion = useGuardar();
  // Activación desde el panel o vencimiento: el estado cambia sin recargar.
  useEventoSocket(EVENTOS_SOCKET.cambioReserva, recargar);

  async function cancelar(r: ReservaComensal) {
    if (!confirm(`¿Cancelar la reserva de la mesa ${r.mesa.numero}?`)) return;
    await cancelacion.enviar(`/comensal/reservas/${r.id}/cancelar`, 'POST');
    recargar();
  }

  return (
    <LayoutComensal volver={{ a: '/inicio', texto: 'Sucursales' }}>
      <h1 className="mb-4 text-xl font-semibold text-slate-800">Mis reservas</h1>
      <EstadoCarga cargando={cargando && !datos} error={error} />
      <div className="mb-3">
        <Aviso>{cancelacion.error}</Aviso>
      </div>
      {datos?.length === 0 && (
        <p className="text-sm text-slate-500">Todavía no hiciste ninguna reserva.</p>
      )}
      <ul className="space-y-3">
        {datos?.map((r) => {
          const estado = ETIQUETA_ESTADO[r.estado];
          return (
            <li
              key={r.id}
              className="space-y-2 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-800">
                    {r.sucursal.nombre} · Mesa {r.mesa.numero}
                  </p>
                  <p className="text-sm text-slate-600">
                    {formatoDiaYHora(r.inicio)} h · {r.cantidadPersonas}{' '}
                    {r.cantidadPersonas === 1 ? 'persona' : 'personas'}
                  </p>
                </div>
                <Etiqueta color={estado.color}>{estado.texto}</Etiqueta>
              </div>
              {r.estado === 'PENDIENTE' && (
                <p className="text-xs text-slate-500">
                  Tolerancia de llegada hasta las {formatoHora(r.limiteLlegada)}.
                </p>
              )}
              {r.estado === 'ACTIVA' && (
                <p className="text-sm text-emerald-700">
                  Mesa {r.mesa.numero} activa. Pronto vas a poder pedir desde acá.
                </p>
              )}
              {r.cancelable && (
                <Boton
                  variante="peligro"
                  disabled={cancelacion.enviando}
                  onClick={() => cancelar(r)}
                >
                  Cancelar
                </Boton>
              )}
            </li>
          );
        })}
      </ul>
    </LayoutComensal>
  );
}
