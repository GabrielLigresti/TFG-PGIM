import { useState } from 'react';
import { EVENTOS_SOCKET, hoyArgentina, type ReservaPanel } from '@pgim/shared';
import { useSesion } from '../../auth/SesionProvider';
import { useAvisos } from '../../components/AvisoEmergente';
import { useConfirmar } from '../../components/Confirmacion';
import { Lista } from '../../components/Lista';
import {
  Aviso,
  Boton,
  Campo,
  EncabezadoPagina,
  EstadoCarga,
  Estado,
  claseInput,
} from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import { formatoHora } from '../../lib/formato';
import { esActivable } from '../../lib/reservas';
import { useEventoSocket } from '../../lib/socket';
import { useAhora } from '../../lib/useAhora';
import { useCerrarMesa } from '../../lib/useCerrarMesa';
import { useGuardar } from '../../lib/useGuardar';
import { useRecurso } from '../../lib/useRecurso';

const FILTROS = [
  { valor: 'TODAS', texto: 'Todas' },
  { valor: 'PENDIENTE', texto: 'Reservadas' },
  { valor: 'ACTIVA', texto: 'En curso' },
  { valor: 'VENCIDA', texto: 'Inasistencias' },
] as const;

type Filtro = (typeof FILTROS)[number]['valor'];

// CU-12: reservas del día de la sucursal de trabajo. Al llegar el comensal se
// activa la reserva, lo que abre su cuenta de mesa; al irse, se cierra la mesa
// (CU-18). Una reserva pendiente se puede cancelar hasta que vence.
export function ReservasPage() {
  const { sesion, tienePermiso } = useSesion();
  const [fecha, setFecha] = useState(hoyArgentina());
  const [filtro, setFiltro] = useState<Filtro>('TODAS');
  const { datos, cargando, error, recargar } = useRecurso<ReservaPanel[]>(
    `/reservas?fecha=${fecha}`,
  );
  const activacion = useGuardar();
  const ahora = useAhora();
  const confirmar = useConfirmar();
  const { avisar } = useAvisos();
  const [cancelando, setCancelando] = useState(false);
  const [errorCancelar, setErrorCancelar] = useState<string | null>(null);
  const cierre = useCerrarMesa(recargar);
  // El personal ya está en la sala de su sucursal: cualquier alta, baja,
  // activación o vencimiento refresca la lista.
  useEventoSocket(EVENTOS_SOCKET.cambioSalon, recargar);

  const filas = datos?.filter((r) => filtro === 'TODAS' || r.estado === filtro);

  async function activar(r: ReservaPanel) {
    if (await activacion.enviar(`/reservas/${r.id}/activar`, 'POST')) recargar();
  }

  async function cancelar(r: ReservaPanel) {
    const ok = await confirmar({
      mensaje: `¿Cancelar la reserva de ${r.comensal.nombre} a las ${formatoHora(r.inicio)}?`,
      detalle: `La mesa ${r.mesa.numero} queda libre.`,
      accion: 'Cancelar reserva',
    });
    if (!ok) return;
    cierre.limpiarError();
    setErrorCancelar(null);
    setCancelando(true);
    try {
      await api(`/reservas/${r.id}/cancelar`, { method: 'POST' });
      avisar(`Reserva de ${r.comensal.nombre} cancelada`);
      recargar();
    } catch (e) {
      setErrorCancelar(e instanceof ApiError ? e.message : 'No se pudo cancelar la reserva');
    } finally {
      setCancelando(false);
    }
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
        <Aviso>{activacion.error ?? cierre.error ?? errorCancelar}</Aviso>
      </div>
      {filas?.length === 0 && <p className="text-sm text-meta">No hay reservas para mostrar.</p>}
      {filas && filas.length > 0 && (
        <Lista
          filas={filas}
          clave={(r) => r.id}
          columnas={[
            { titulo: 'Hora', valor: (r) => formatoHora(r.inicio) },
            { titulo: 'Mesa', valor: (r) => r.mesa.numero },
            { titulo: 'A nombre de', valor: (r) => r.comensal.nombre },
            { titulo: 'Teléfono', valor: (r) => r.comensal.telefono ?? '—' },
            { titulo: 'Personas', valor: (r) => r.cantidadPersonas },
            {
              titulo: 'Estado',
              valor: (r) => (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <Estado entidad="reserva" valor={r.estado} />
                  {r.pagoEnCurso && <Estado entidad="pago" valor="PENDIENTE" />}
                  {r.estado === 'PENDIENTE' && (
                    <span className="text-xs text-meta">
                      Tolerancia hasta {formatoHora(r.limiteLlegada)}
                    </span>
                  )}
                </span>
              ),
            },
          ]}
          acciones={(r) => (
            <span className="inline-flex flex-wrap justify-end gap-2">
              {esActivable(r, ahora) && tienePermiso('reserva.activar') && (
                <Boton variante="tonal" disabled={activacion.enviando} onClick={() => activar(r)}>
                  Activar mesa
                </Boton>
              )}
              {r.cerrable && tienePermiso('mesa.cerrar') && (
                <Boton
                  variante="tonal"
                  disabled={cierre.enviando || cancelando}
                  onClick={() => {
                    setErrorCancelar(null);
                    void cierre.cerrar(r);
                  }}
                >
                  Cerrar mesa
                </Boton>
              )}
              {r.cancelable && tienePermiso('reserva.activar') && (
                <Boton
                  variante="fantasma"
                  disabled={cierre.enviando || cancelando}
                  onClick={() => void cancelar(r)}
                >
                  Cancelar
                </Boton>
              )}
            </span>
          )}
        />
      )}
    </section>
  );
}
