import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { MiMesa } from '@pgim/shared';
import { useAvisos } from '../../components/AvisoEmergente';
import { useConfirmar } from '../../components/Confirmacion';
import { LayoutComensal, TituloComensal } from '../../components/LayoutComensal';
import { Aviso, Boton, EstadoCarga, Estado } from '../../components/ui';
import { formatoHora, formatoPesos } from '../../lib/formato';
import { useGuardar } from '../../lib/useGuardar';
import { useMiMesa } from '../../lib/miMesa';

// "Mi mesa": los pedidos del comensal con su estado en vivo, lo pagado y el
// saldo. El pago, por ahora, es de prueba (no cobra nada).
export function MiMesaPage() {
  const mesa = useMiMesa(null);
  const pago = useGuardar();
  const confirmar = useConfirmar();
  const { avisar } = useAvisos();
  // Si la mesa estaba abierta y deja de estarlo, la cerró el personal.
  const [ultima, setUltima] = useState<MiMesa | null>(null);
  useEffect(() => {
    if (mesa.datos) setUltima(mesa.datos);
  }, [mesa.datos]);

  const datos = mesa.datos;

  async function pagar() {
    if (!datos) return;
    const ok = await confirmar({
      mensaje: `¿Pagar ${formatoPesos(datos.saldo)}?`,
      detalle: 'Es un pago de prueba: no se cobra nada.',
      accion: 'Pagar',
      principal: true,
    });
    if (!ok) return;
    if (await pago.enviar(`/comensal/mesa/${datos.cuentaMesaId}/pagos`, 'POST')) {
      avisar('Pago aprobado');
      mesa.recargar();
    }
  }

  const claseAccion =
    'inline-flex min-h-11 flex-1 items-center justify-center rounded-control px-4 text-sm font-semibold';
  const accion = datos && (
    <>
      {datos.saldo > 0 && datos.pagoHabilitado && (
        <Boton densidad="comensal" className="flex-1" disabled={pago.enviando} onClick={pagar}>
          {pago.enviando ? 'Pagando…' : `Pagar ${formatoPesos(datos.saldo)}`}
        </Boton>
      )}
      <Link
        to={`/s/${datos.sucursal.id}/menu`}
        className={`${claseAccion} ${
          datos.saldo > 0
            ? 'border border-line-strong bg-surface text-text hover:bg-panel'
            : 'bg-accent text-white hover:bg-accent-hover'
        }`}
      >
        Pedir más
      </Link>
    </>
  );

  return (
    <LayoutComensal accionFija={accion || undefined}>
      <EstadoCarga cargando={mesa.cargando && !datos && !ultima} error={mesa.error} />
      {!datos && !mesa.cargando && (
        <div className="space-y-2">
          <TituloComensal>{ultima ? 'Gracias por tu visita' : 'Mi mesa'}</TituloComensal>
          <p className="text-sm text-meta">
            {ultima
              ? `La mesa ${ultima.mesa.numero} en ${ultima.sucursal.nombre} quedó cerrada.`
              : 'No tenés una mesa activa. Cuando llegues, el personal activa tu reserva.'}
          </p>
          <Link to="/inicio" className="text-sm font-semibold text-accent-ink underline">
            Volver al inicio
          </Link>
        </div>
      )}
      {datos && (
        <div className="space-y-4">
          <div>
            <p className="text-sm text-meta">{datos.sucursal.nombre}</p>
            <TituloComensal>Mesa {datos.mesa.numero}</TituloComensal>
          </div>

          {datos.pedidos.length === 0 ? (
            <p className="rounded-panel border border-dashed border-line-strong p-4 text-sm text-meta">
              Todavía no pediste nada.
            </p>
          ) : (
            <ul className="space-y-3">
              {datos.pedidos.map((p) => (
                <li
                  key={p.id}
                  className="space-y-2 rounded-panel border border-line bg-surface p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-meta">
                      Pedido #{p.numero} · {formatoHora(p.creadoEn)} h
                    </span>
                    <Estado entidad="pedido" valor={p.estado} publico="comensal" />
                  </div>
                  <ul
                    className={`space-y-1 ${p.estado === 'CANCELADO' ? 'line-through opacity-60' : ''}`}
                  >
                    {p.lineas.map((l) => (
                      <li key={l.id} className="flex justify-between gap-3 text-sm">
                        <span className="min-w-0">
                          <span className="font-semibold tabular-nums">{l.cantidad}×</span>{' '}
                          {l.plato.nombre}
                          {l.observaciones && (
                            <span className="block text-meta">{l.observaciones}</span>
                          )}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {formatoPesos(l.cantidad * l.precioUnitario)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}

          <dl className="space-y-1 rounded-panel bg-panel p-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-meta">Total</dt>
              <dd className="tabular-nums">{formatoPesos(datos.total)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-meta">Pagado</dt>
              <dd className="tabular-nums">{formatoPesos(datos.pagado)}</dd>
            </div>
            <div className="flex justify-between text-base font-semibold text-ink">
              <dt>Saldo</dt>
              <dd className="tabular-nums">{formatoPesos(datos.saldo)}</dd>
            </div>
          </dl>
          <Aviso>{pago.error}</Aviso>
        </div>
      )}
    </LayoutComensal>
  );
}
