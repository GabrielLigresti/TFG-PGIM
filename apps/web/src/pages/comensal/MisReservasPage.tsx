import { Link } from 'react-router';
import { EVENTOS_SOCKET, type ReservaComensal } from '@pgim/shared';
import { LayoutComensal, TituloComensal } from '../../components/LayoutComensal';
import { Aviso, Boton, Estado, EstadoCarga } from '../../components/ui';
import { formatoDiaYHora, formatoHora } from '../../lib/formato';
import { esCancelable } from '../../lib/reservas';
import { useEventoSocket } from '../../lib/socket';
import { useAhora } from '../../lib/useAhora';
import { useGuardar } from '../../lib/useGuardar';
import { useRecurso } from '../../lib/useRecurso';
import { useConfirmar } from '../../components/Confirmacion';

export function MisReservasPage() {
  const { datos, cargando, error, recargar } = useRecurso<ReservaComensal[]>('/comensal/reservas');
  const cancelacion = useGuardar();
  const ahora = useAhora();
  // Activación desde el panel o vencimiento: el estado cambia sin recargar.
  useEventoSocket(EVENTOS_SOCKET.cambioReserva, recargar);

  const confirmar = useConfirmar();

  async function cancelar(r: ReservaComensal) {
    const ok = await confirmar({
      mensaje: `¿Cancelar tu reserva en ${r.sucursal.nombre}?`,
      detalle: `Mesa ${r.mesa.numero}, ${formatoDiaYHora(r.inicio)} h.`,
      accion: 'Cancelar reserva',
    });
    if (!ok) return;
    await cancelacion.enviar(`/comensal/reservas/${r.id}/cancelar`, 'POST');
    recargar();
  }

  return (
    <LayoutComensal volver={{ a: '/inicio', texto: 'Sucursales' }}>
      <div className="mb-4">
        <TituloComensal>Mis reservas</TituloComensal>
      </div>
      <EstadoCarga cargando={cargando && !datos} error={error} />
      <div className="mb-3">
        <Aviso>{cancelacion.error}</Aviso>
      </div>
      {datos?.length === 0 && (
        <p className="text-sm text-meta">Todavía no hiciste ninguna reserva.</p>
      )}
      <ul className="space-y-3">
        {datos?.map((r) => {
          return (
            <li key={r.id} className="space-y-2 rounded-panel border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink">
                    {r.sucursal.nombre} · Mesa {r.mesa.numero}
                  </p>
                  <p className="text-sm text-meta">
                    {formatoDiaYHora(r.inicio)} h · {r.cantidadPersonas}{' '}
                    {r.cantidadPersonas === 1 ? 'persona' : 'personas'}
                  </p>
                </div>
                <Estado entidad="reserva" valor={r.estado} publico="comensal" />
              </div>
              {r.estado === 'PENDIENTE' && (
                <p className="text-xs text-meta">
                  Tolerancia de llegada hasta las {formatoHora(r.limiteLlegada)}.
                </p>
              )}
              {r.estado === 'ACTIVA' && (
                <p className="text-sm text-text">
                  Ya estás en la mesa {r.mesa.numero}. Pronto vas a poder pedir desde acá.
                </p>
              )}
              {r.estado === 'VENCIDA' && (
                <Link
                  to={`/s/${r.sucursal.id}/reservar`}
                  className="inline-flex min-h-11 items-center rounded-control border border-line-strong bg-surface px-4 text-sm font-semibold text-text hover:bg-panel"
                >
                  Reservar de nuevo
                </Link>
              )}
              {esCancelable(r, ahora) && (
                <Boton
                  variante="peligro"
                  densidad="comensal"
                  disabled={cancelacion.enviando}
                  onClick={() => cancelar(r)}
                >
                  Cancelar reserva
                </Boton>
              )}
            </li>
          );
        })}
      </ul>
    </LayoutComensal>
  );
}
