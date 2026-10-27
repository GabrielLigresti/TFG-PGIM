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
        <p className="text-sm text-slate-500">Todavía no hiciste ninguna reserva.</p>
      )}
      <ul className="space-y-3">
        {datos?.map((r) => {
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
                <Estado entidad="reserva" valor={r.estado} publico="comensal" />
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
              {esCancelable(r, ahora) && (
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
