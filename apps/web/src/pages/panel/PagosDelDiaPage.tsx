import { useEffect, useRef, useState } from 'react';
import { Wallet } from 'lucide-react';
import { EVENTOS_SOCKET, hoyArgentina, type MetodoPago, type PagosDelDia } from '@pgim/shared';
import { useSesion } from '../../auth/SesionProvider';
import { useAvisos } from '../../components/AvisoEmergente';
import { IndicadorConexion } from '../../components/IndicadorConexion';
import { EncabezadoPagina, Estado, EstadoCarga, Kpi, Panel, Vacio } from '../../components/ui';
import { formatoDiaRelativo, formatoHora, formatoPesos } from '../../lib/formato';
import { useConexionSocket, useEventoSocket } from '../../lib/socket';
import { useAhora } from '../../lib/useAhora';
import { useRecurso } from '../../lib/useRecurso';

// CU-23: pagos aprobados y rechazados de hoy en la sucursal de trabajo. La
// pregunta que responde es "¿llegó el pago de la mesa 4?", de un vistazo. El día
// es el calendario de Argentina: a medianoche la lista empieza de cero.

const RESALTADO_MS = 6000;

const NOMBRE_METODO: Record<MetodoPago, string> = {
  TARJETA: 'Tarjeta',
  BILLETERA_VIRTUAL: 'Billetera virtual',
};

export function PagosDelDiaPage() {
  const { sesion } = useSesion();
  const { avisar } = useAvisos();
  const recurso = useRecurso<PagosDelDia>('/pagos/hoy');
  const [resaltados, setResaltados] = useState<Set<string>>(new Set());
  // IDs de la carga anterior: null hasta la primera, que no resalta nada.
  const anteriores = useRef<Set<string> | null>(null);
  const temporizadores = useRef(new Set<ReturnType<typeof setTimeout>>());
  const ahora = useAhora(60_000);
  const reloj = hoyArgentina(new Date(ahora));

  useEventoSocket(EVENTOS_SOCKET.pagosCambio, recurso.recargar);
  const conexion = useConexionSocket(recurso.recargar);

  useEffect(() => {
    const pagos = recurso.datos?.pagos;
    if (!pagos) return;
    const previos = anteriores.current;
    anteriores.current = new Set(pagos.map((p) => p.id));
    if (!previos) return;
    const nuevos = pagos.filter((p) => !previos.has(p.id));
    if (nuevos.length === 0) return;
    setResaltados((s) => new Set([...s, ...nuevos.map((p) => p.id)]));
    const timer = setTimeout(() => {
      temporizadores.current.delete(timer);
      setResaltados((s) => {
        const otro = new Set(s);
        for (const p of nuevos) otro.delete(p.id);
        return otro;
      });
    }, RESALTADO_MS);
    temporizadores.current.add(timer);
    // Al volver de un corte pueden llegar varios juntos: un solo aviso.
    const [primero] = nuevos;
    if (nuevos.length > 1) avisar(`${nuevos.length} pagos nuevos`);
    else if (primero?.estado === 'APROBADO')
      avisar(`Pago recibido: mesa ${primero.mesaNumero}, ${formatoPesos(primero.monto)}`);
    else if (primero) avisar(`Pago no aprobado: mesa ${primero.mesaNumero}`);
  }, [recurso.datos, avisar]);

  useEffect(() => {
    const timers = temporizadores.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  // Con el reloj del dispositivo atrasado, el día que vale es el del servidor.
  const hoy = recurso.datos && recurso.datos.fecha > reloj ? recurso.datos.fecha : reloj;

  // Si la pantalla quedó abierta al pasar la medianoche, se carga el día nuevo.
  const fechaCargada = recurso.datos?.fecha;
  const { recargar } = recurso;
  useEffect(() => {
    if (fechaCargada && fechaCargada < reloj && !recurso.cargando) recargar();
    // Con ahora, una recarga fallida se reintenta al minuto siguiente; cargando
    // queda afuera para no reintentar en el acto cuando falla.
  }, [fechaCargada, reloj, ahora, recargar]);

  const datos = recurso.datos;
  const sinMetodo = datos?.totales.porMetodo.SIN_METODO ?? 0;

  return (
    <section>
      <EncabezadoPagina
        titulo="Pagos del día"
        descripcion={`${datos ? `${formatoDiaRelativo(datos.fecha, hoy)} · ` : ''}Pagos de ${
          sesion?.sucursalActiva?.nombre ?? 'la sucursal'
        }, los más nuevos arriba.`}
        accion={<IndicadorConexion estado={conexion} />}
      />
      <EstadoCarga cargando={recurso.cargando && !datos} error={recurso.error} />
      {datos && (
        <div className="grid max-w-3xl gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              etiqueta="Cobrado hoy"
              valor={formatoPesos(datos.totales.cobrado)}
              detalle={`${datos.totales.aprobados} pagados${
                sinMetodo > 0 ? ` · ${formatoPesos(sinMetodo)} sin cobro` : ''
              }`}
            />
            <Kpi
              etiqueta="Tarjeta"
              valor={formatoPesos(datos.totales.porMetodo.TARJETA)}
              detalle="Crédito o débito"
            />
            <Kpi
              etiqueta="Billetera virtual"
              valor={formatoPesos(datos.totales.porMetodo.BILLETERA_VIRTUAL)}
              detalle="Dinero en cuenta"
            />
            <Kpi
              etiqueta="No aprobados"
              valor={datos.totales.rechazados}
              detalle="No se completaron"
              tono={datos.totales.rechazados > 0 ? 'warn' : 'neutro'}
            />
          </div>
          {datos.pagos.length === 0 ? (
            <Vacio
              icono={Wallet}
              titulo="Todavía no hay pagos hoy"
              texto="Cuando Mercado Pago apruebe o rechace un pago de esta sucursal, aparece acá al instante."
            />
          ) : (
            <Panel>
              <ul className="divide-y divide-line">
                {datos.pagos.map((pago) => (
                  <li
                    key={pago.id}
                    className={`-mx-2 flex items-start justify-between gap-3 px-2 py-3 ${
                      resaltados.has(pago.id) ? 'rounded-panel ring-2 ring-accent' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-lg font-semibold tabular-nums text-ink">
                        Mesa {pago.mesaNumero}
                      </p>
                      <p className="text-sm text-meta">
                        {pago.comensalNombre} · {formatoHora(pago.fecha)}
                        {pago.comprobanteNumero && ` · ${pago.comprobanteNumero}`}
                      </p>
                    </div>
                    <div className="grid justify-items-end gap-1 text-right">
                      <p
                        className={`text-lg font-semibold tabular-nums ${
                          pago.estado === 'APROBADO' ? 'text-ink' : 'text-meta'
                        }`}
                      >
                        {formatoPesos(pago.monto)}
                      </p>
                      <Estado entidad="pago" valor={pago.estado} />
                      <p className="text-sm text-meta">
                        {pago.metodo ? NOMBRE_METODO[pago.metodo] : 'Sin cobro'}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      )}
    </section>
  );
}
