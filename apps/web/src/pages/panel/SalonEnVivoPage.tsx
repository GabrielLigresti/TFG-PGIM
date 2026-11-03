import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { EVENTOS_SOCKET, type MesaSalon } from '@pgim/shared';
import { useSesion } from '../../auth/SesionProvider';
import { LeyendaSalon, MapaSalon } from '../../components/MapaSalon';
import { Aviso, Boton, EncabezadoPagina, Estado, EstadoCarga } from '../../components/ui';
import { formatoHora } from '../../lib/formato';
import { useConexionSocket, useEventoSocket } from '../../lib/socket';
import { useCerrarMesa } from '../../lib/useCerrarMesa';
import { useRecurso } from '../../lib/useRecurso';

const REFRESCO_MS = 60_000;

// Estado actual del salón para el mozo: el plano con cada mesa libre, reservada
// u ocupada y, al tocar una, su detalle con los pedidos y el cierre (CU-18).
export function SalonEnVivoPage() {
  const { sesion } = useSesion();
  const { datos, cargando, error, recargar } = useRecurso<MesaSalon[]>('/salon/estado');
  const [mesaId, setMesaId] = useState<string | null>(null);
  const cierre = useCerrarMesa(recargar);
  const { limpiarError } = cierre;
  const columna = useRef<HTMLElement>(null);

  useEventoSocket(EVENTOS_SOCKET.cambioSalon, recargar);
  useEventoSocket(EVENTOS_SOCKET.pedidoNuevo, recargar);
  useEventoSocket(EVENTOS_SOCKET.pedidoCambio, recargar);
  useConexionSocket(recargar);

  // Red de seguridad: las reservas que vencen por tiempo no siempre llegan como evento.
  useEffect(() => {
    const id = setInterval(recargar, REFRESCO_MS);
    return () => clearInterval(id);
  }, [recargar]);

  const mesa = datos?.find((m) => m.id === mesaId) ?? null;

  // Si la mesa elegida ya no viene en la respuesta, se vuelve al plano solo.
  useEffect(() => {
    if (datos && mesaId && !mesa) setMesaId(null);
  }, [datos, mesaId, mesa]);

  // Debajo de lg la columna queda bajo el plano: se lleva a la vista al elegir.
  useEffect(() => {
    if (!mesaId || window.matchMedia('(min-width: 1024px)').matches) return;
    const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    columna.current?.scrollIntoView({
      block: 'start',
      behavior: sinMovimiento ? 'auto' : 'smooth',
    });
  }, [mesaId]);

  function elegir(id: string) {
    limpiarError();
    setMesaId(id);
  }

  function cerrarColumna() {
    limpiarError();
    setMesaId(null);
  }

  return (
    <section>
      <EncabezadoPagina
        titulo="Salón"
        descripcion={`Estado actual de las mesas de ${sesion?.sucursalActiva?.nombre ?? 'la sucursal'}.`}
      />
      <EstadoCarga cargando={cargando && !datos} error={error} />
      {datos?.length === 0 && (
        <p className="text-sm text-meta">Esta sucursal todavía no tiene mesas cargadas.</p>
      )}
      {datos && datos.length > 0 && (
        <div className="lg:flex lg:items-start lg:gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            <MapaSalon
              todasElegibles
              mesas={datos}
              seleccionadaId={mesaId}
              onElegir={elegir}
              horaReservada={(m) => {
                const reserva = datos.find((x) => x.id === m.id)?.reserva;
                return reserva ? formatoHora(reserva.inicio) : undefined;
              }}
            />
            <LeyendaSalon estados={['LIBRE', 'RESERVADA', 'OCUPADA']} />
          </div>
          {mesa && (
            <DetalleMesa
              ref={columna}
              mesa={mesa}
              enviando={cierre.enviando}
              error={cierre.error}
              onCerrarColumna={cerrarColumna}
              onCerrarMesa={() => void cierre.cerrar(mesa.reserva!)}
            />
          )}
        </div>
      )}
    </section>
  );
}

function DetalleMesa({
  ref,
  mesa,
  enviando,
  error,
  onCerrarColumna,
  onCerrarMesa,
}: {
  ref: React.Ref<HTMLElement>;
  mesa: MesaSalon;
  enviando: boolean;
  error: string | null;
  onCerrarColumna(): void;
  onCerrarMesa(): void;
}) {
  const { tienePermiso } = useSesion();
  const { reserva } = mesa;
  const verPedidos = tienePermiso('pedido.ver');
  const puedeCerrar = Boolean(reserva?.cerrable) && tienePermiso('mesa.cerrar');

  return (
    <aside
      ref={ref}
      className="mt-4 flex flex-col rounded-panel border border-line bg-surface p-4 lg:sticky lg:top-4 lg:mt-0 lg:max-h-[calc(100dvh-2rem)] lg:w-80 lg:shrink-0"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="text-[22px] font-semibold text-ink">Mesa {mesa.numero}</h2>
          <Estado entidad="mesa" valor={mesa.estado} />
        </div>
        <Boton
          variante="fantasma"
          densidad="tactil"
          aria-label="Cerrar detalle de la mesa"
          onClick={onCerrarColumna}
        >
          <X aria-hidden className="size-5" />
        </Boton>
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
        {reserva && (
          <p className="text-sm text-meta">
            {reserva.comensal.nombre} · {reserva.cantidadPersonas}{' '}
            {reserva.cantidadPersonas === 1 ? 'persona' : 'personas'} ·{' '}
            {formatoHora(reserva.inicio)}
          </p>
        )}
        {mesa.estado === 'LIBRE' && <p className="text-sm text-meta">Esta mesa está libre.</p>}
        {mesa.estado === 'OCUPADA' && verPedidos && (
          <>
            {mesa.pedidos.length === 0 ? (
              <p className="mt-3 text-sm text-meta">Todavía no hay pedidos.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {mesa.pedidos.map((pedido) => (
                  <li key={pedido.id} className="py-3 first:pt-0">
                    <p className="font-semibold text-ink">Pedido {pedido.numero}</p>
                    <ul className="mt-2 space-y-2">
                      {pedido.lineas.map((linea) => (
                        <li key={linea.id} className="flex items-start justify-between gap-3">
                          <span className="min-w-0 text-sm text-ink [overflow-wrap:anywhere]">
                            <span className="tabular-nums">{linea.cantidad}</span> ×{' '}
                            {linea.plato.nombre}
                          </span>
                          <span className="shrink-0">
                            <Estado entidad="pedido" valor={pedido.estado} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {error && (
        <div className="mt-3">
          <Aviso>{error}</Aviso>
        </div>
      )}
      {puedeCerrar && (
        <Boton densidad="tactil" className="mt-3 w-full" disabled={enviando} onClick={onCerrarMesa}>
          Cerrar mesa
        </Boton>
      )}
    </aside>
  );
}
