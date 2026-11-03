import { useState } from 'react';
import { EVENTOS_SOCKET, hoyArgentina, type Pagina, type ReservaPanel } from '@pgim/shared';
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
import { formatoDiaRelativo, formatoFecha, formatoHora } from '../../lib/formato';
import { agruparPorDia, esActivable } from '../../lib/reservas';
import { useEventoSocket } from '../../lib/socket';
import { useAhora } from '../../lib/useAhora';
import { useCerrarMesa } from '../../lib/useCerrarMesa';
import { useGuardar } from '../../lib/useGuardar';
import { useRecurso } from '../../lib/useRecurso';

// CU-12: reservas de hoy en adelante de la sucursal de trabajo, paginadas y en
// un bloque por día. Al llegar el comensal se activa la reserva, lo que abre su
// cuenta de mesa; al irse, se cierra la mesa (CU-18). Una reserva pendiente se
// puede cancelar hasta que vence.
export function ReservasPage() {
  const { sesion, tienePermiso } = useSesion();
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [pagina, setPagina] = useState(1);
  const q = new URLSearchParams({ pagina: String(pagina) });
  if (desde) q.set('desde', desde);
  if (hasta) q.set('hasta', hasta);
  const { datos, cargando, error, recargar } = useRecurso<Pagina<ReservaPanel>>(`/reservas?${q}`);
  const activacion = useGuardar();
  const ahora = useAhora();
  const hoy = hoyArgentina(new Date(ahora));
  const confirmar = useConfirmar();
  const { avisar } = useAvisos();
  const [cancelando, setCancelando] = useState(false);
  const [errorCancelar, setErrorCancelar] = useState<string | null>(null);
  const cierre = useCerrarMesa(recargar);
  // El personal ya está en la sala de su sucursal: cualquier alta, baja,
  // activación o vencimiento refresca la lista.
  useEventoSocket(EVENTOS_SOCKET.cambioSalon, recargar);

  const filas = datos?.filas;
  const ultimaPagina = datos ? Math.max(1, Math.ceil(datos.total / datos.porPagina)) : 1;

  function filtrar(accion: () => void) {
    accion();
    setPagina(1);
  }

  async function activar(r: ReservaPanel) {
    if (await activacion.enviar(`/reservas/${r.id}/activar`, 'POST')) recargar();
  }

  async function cancelar(r: ReservaPanel) {
    const ok = await confirmar({
      mensaje: `¿Cancelar la reserva de ${r.comensal.nombre} del ${formatoFecha(hoyArgentina(new Date(r.inicio)))} a las ${formatoHora(r.inicio)}?`,
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
        descripcion={`Reservas de hoy en adelante de ${sesion?.sucursalActiva?.nombre ?? 'la sucursal'}.`}
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Campo etiqueta="Desde">
          <input
            type="date"
            min={hoy}
            max={hasta || undefined}
            value={desde}
            onChange={(e) => filtrar(() => setDesde(e.target.value))}
            className={claseInput}
          />
        </Campo>
        <Campo etiqueta="Hasta">
          <input
            type="date"
            min={desde || hoy}
            value={hasta}
            onChange={(e) => filtrar(() => setHasta(e.target.value))}
            className={claseInput}
          />
        </Campo>
        {(desde || hasta) && (
          <Boton
            variante="fantasma"
            onClick={() =>
              filtrar(() => {
                setDesde('');
                setHasta('');
              })
            }
          >
            Quitar fechas
          </Boton>
        )}
      </div>
      <EstadoCarga cargando={cargando && !datos} error={error} />
      <div className="mb-3">
        <Aviso>{activacion.error ?? cierre.error ?? errorCancelar}</Aviso>
      </div>
      {filas?.length === 0 && <p className="text-sm text-meta">No hay reservas para mostrar.</p>}
      {filas && filas.length > 0 && (
        <div className="space-y-6">
          {agruparPorDia(filas).map((dia) => (
            <section key={dia.fecha} aria-label={formatoDiaRelativo(dia.fecha, hoy)}>
              <h2 className="mb-2 text-lg font-semibold text-ink">
                {formatoDiaRelativo(dia.fecha, hoy)}
              </h2>
              <Lista
                filas={dia.filas}
                inactiva={(r) => r.estado !== 'PENDIENTE' && r.estado !== 'ACTIVA'}
                clave={(r) => r.id}
                columnas={[
                  { titulo: 'Hora', className: 'w-[9%]', valor: (r) => formatoHora(r.inicio) },
                  { titulo: 'Mesa', className: 'w-[7%]', valor: (r) => r.mesa.numero },
                  { titulo: 'A nombre de', className: 'w-[20%]', valor: (r) => r.comensal.nombre },
                  {
                    titulo: 'Teléfono',
                    className: 'w-[13%]',
                    valor: (r) => r.comensal.telefono ?? '—',
                  },
                  { titulo: 'Personas', className: 'w-[9%]', valor: (r) => r.cantidadPersonas },
                  {
                    titulo: 'Estado',
                    className: 'w-[26%]',
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
                      <Boton
                        variante="tonal"
                        disabled={activacion.enviando}
                        onClick={() => activar(r)}
                      >
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
            </section>
          ))}
          {ultimaPagina > 1 && (
            <div className="flex items-center justify-between gap-3 text-sm text-meta">
              <Boton
                variante="secundario"
                disabled={pagina <= 1}
                onClick={() => setPagina((p) => p - 1)}
              >
                Anteriores
              </Boton>
              <span>
                Página {datos?.pagina} de {ultimaPagina}
              </span>
              <Boton
                variante="secundario"
                disabled={pagina >= ultimaPagina}
                onClick={() => setPagina((p) => p + 1)}
              >
                Siguientes
              </Boton>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
