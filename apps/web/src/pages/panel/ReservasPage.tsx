import { useState } from 'react';
import { EVENTOS_SOCKET, hoyArgentina, type BloqueoCierre, type ReservaPanel } from '@pgim/shared';
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
import { formatoDiaRelativo, formatoFecha, formatoHora, formatoPesos } from '../../lib/formato';
import { agruparPorDia, esActivable } from '../../lib/reservas';
import { useEventoSocket } from '../../lib/socket';
import { useAhora } from '../../lib/useAhora';
import { useGuardar } from '../../lib/useGuardar';
import { useRecurso } from '../../lib/useRecurso';

const FILTROS = [
  { valor: 'TODAS', texto: 'Todas' },
  { valor: 'PENDIENTE', texto: 'Reservadas' },
  { valor: 'ACTIVA', texto: 'En curso' },
] as const;

type Filtro = (typeof FILTROS)[number]['valor'];

// CU-12: reservas vigentes de la sucursal de trabajo, un bloque por día. Al
// llegar el comensal se activa la reserva, lo que abre su cuenta de mesa; al
// irse, se cierra la mesa (CU-18). Una reserva pendiente se puede cancelar
// hasta que vence.
export function ReservasPage() {
  const { sesion, tienePermiso } = useSesion();
  const [filtro, setFiltro] = useState<Filtro>('TODAS');
  const { datos, cargando, error, recargar } = useRecurso<ReservaPanel[]>('/reservas');
  const activacion = useGuardar();
  const ahora = useAhora();
  const hoy = hoyArgentina(new Date(ahora));
  const confirmar = useConfirmar();
  const { avisar } = useAvisos();
  const [enviando, setEnviando] = useState(false);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  // El personal ya está en la sala de su sucursal: cualquier alta, baja,
  // activación o vencimiento refresca la lista.
  useEventoSocket(EVENTOS_SOCKET.cambioSalon, recargar);

  const filas = datos?.filter((r) => filtro === 'TODAS' || r.estado === filtro);

  async function activar(r: ReservaPanel) {
    if (await activacion.enviar(`/reservas/${r.id}/activar`, 'POST')) recargar();
  }

  // Con saldo pendiente la API pide confirmación; con pedidos sin entregar, no cierra.
  async function cerrar(r: ReservaPanel, confirmarSaldo = false): Promise<void> {
    setErrorAccion(null);
    setEnviando(true);
    try {
      await api(`/reservas/${r.id}/cerrar`, { method: 'POST', body: { confirmarSaldo } });
      avisar(`Mesa ${r.mesa.numero} cerrada`);
      recargar();
    } catch (e) {
      const bloqueo = e instanceof ApiError ? (e.detalles as BloqueoCierre | undefined) : undefined;
      if (bloqueo?.pagoEnRevision && !confirmarSaldo) {
        setEnviando(false);
        const ok = await confirmar({
          mensaje: `Mercado Pago todavía está revisando un pago de la mesa ${r.mesa.numero}. ¿Cerrarla igual?`,
          detalle:
            'Si Mercado Pago lo aprueba después, el pago se registra igual y queda para conciliar.',
          accion: 'Cerrar mesa',
        });
        if (ok) await cerrar(r, true);
        return;
      }
      const saldo = bloqueo?.saldoPendiente;
      if (saldo && !confirmarSaldo) {
        setEnviando(false);
        const ok = await confirmar({
          mensaje: `Queda ${formatoPesos(saldo)} sin pagar. ¿Cerrar la mesa ${r.mesa.numero} igual?`,
          detalle: 'La visita se registra solo si el cliente pagó.',
          accion: 'Cerrar mesa',
        });
        if (ok) await cerrar(r, true);
        return;
      }
      setErrorAccion(e instanceof ApiError ? e.message : 'No se pudo cerrar la mesa');
    } finally {
      setEnviando(false);
    }
  }

  async function cancelar(r: ReservaPanel) {
    const ok = await confirmar({
      mensaje: `¿Cancelar la reserva de ${r.comensal.nombre} del ${formatoFecha(hoyArgentina(new Date(r.inicio)))} a las ${formatoHora(r.inicio)}?`,
      detalle: `La mesa ${r.mesa.numero} queda libre.`,
      accion: 'Cancelar reserva',
    });
    if (!ok) return;
    setErrorAccion(null);
    setEnviando(true);
    try {
      await api(`/reservas/${r.id}/cancelar`, { method: 'POST' });
      avisar(`Reserva de ${r.comensal.nombre} cancelada`);
      recargar();
    } catch (e) {
      setErrorAccion(e instanceof ApiError ? e.message : 'No se pudo cancelar la reserva');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section>
      <EncabezadoPagina
        titulo="Reservas"
        descripcion={`Próximas reservas de ${sesion?.sucursalActiva?.nombre ?? 'la sucursal'}.`}
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
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
        <Aviso>{activacion.error ?? errorAccion}</Aviso>
      </div>
      {filas?.length === 0 && <p className="text-sm text-meta">No hay reservas próximas.</p>}
      {filas && filas.length > 0 && (
        <div className="space-y-6">
          {agruparPorDia(filas).map((dia) => (
            <section key={dia.fecha} aria-label={formatoDiaRelativo(dia.fecha, hoy)}>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold text-ink">
                  {formatoDiaRelativo(dia.fecha, hoy)}
                </h2>
                <span className="shrink-0 text-sm text-meta">
                  {dia.filas.length === 1 ? '1 reserva' : `${dia.filas.length} reservas`}
                </span>
              </div>
              <Lista
                filas={dia.filas}
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
                      <Boton variante="tonal" disabled={enviando} onClick={() => void cerrar(r)}>
                        Cerrar mesa
                      </Boton>
                    )}
                    {r.cancelable && tienePermiso('reserva.activar') && (
                      <Boton
                        variante="fantasma"
                        disabled={enviando}
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
        </div>
      )}
    </section>
  );
}
