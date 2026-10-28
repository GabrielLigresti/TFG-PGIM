import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { BeneficiosMesa, MiMesa, PagoIniciado, PagoInput } from '@pgim/shared';
import { LayoutComensal, TituloComensal } from '../../components/LayoutComensal';
import {
  ResultadoPagoVista,
  SeleccionPago,
  useContinuarPago,
  useSeguimientoPago,
} from '../../components/PagoMesa';
import { Aviso, Boton, EstadoCarga, Estado } from '../../components/ui';
import { formatoHora, formatoPesos } from '../../lib/formato';
import { useGuardar } from '../../lib/useGuardar';
import { useMiMesa } from '../../lib/miMesa';
import { useRecurso } from '../../lib/useRecurso';

// "Mi mesa": los pedidos del comensal con su estado en vivo, lo pagado y el
// saldo. Paga siempre el saldo total, con un beneficio opcional, en Mercado
// Pago; al volver (?pago=<id>) se muestra el resultado.
export function MiMesaPage() {
  const mesa = useMiMesa(null);
  const [parametros, setParametros] = useSearchParams();
  const pagoSeguido = parametros.get('pago');
  // Si la mesa estaba abierta y deja de estarlo, la cerró el personal.
  const [ultima, setUltima] = useState<MiMesa | null>(null);
  useEffect(() => {
    if (mesa.datos) setUltima(mesa.datos);
  }, [mesa.datos]);

  const datos = mesa.datos;
  const seguimiento = useSeguimientoPago(pagoSeguido);
  // Mercado Pago agrega el resultado del intento a la URL de regreso. Es solo
  // una pista para la pantalla: lo que vale es el estado del pago en PGIM.
  const estadoMp = parametros.get('collection_status') ?? parametros.get('status');
  const sinAprobar = estadoMp === 'rejected' || estadoMp === 'null';
  const retomar = useContinuarPago();
  const puedePagar = !!datos && datos.saldo > 0 && datos.pagoHabilitado && !datos.pagoEnCurso;

  const beneficios = useRecurso<BeneficiosMesa>(
    puedePagar ? `/comensal/mesa/${datos.cuentaMesaId}/beneficios` : null,
  );
  const [beneficioId, setBeneficioId] = useState<string | null>(null);
  const pago = useGuardar();

  // Si el beneficio elegido deja de estar disponible, vuelve a "Sin beneficio".
  const elegido = beneficios.datos?.disponibles.find((b) => b.id === beneficioId) ?? null;
  useEffect(() => {
    if (beneficioId && beneficios.datos && !elegido) setBeneficioId(null);
  }, [beneficioId, beneficios.datos, elegido]);
  const aPagar = datos ? Math.max(0, datos.saldo - (elegido?.descuento ?? 0)) : 0;

  async function pagar() {
    if (!datos) return;
    const cuerpo: PagoInput = { beneficioId };
    const respuesta = await pago.enviar<PagoIniciado>(
      `/comensal/mesa/${datos.cuentaMesaId}/pagos`,
      'POST',
      cuerpo,
    );
    if (!respuesta) {
      // El beneficio se agotó o ya no vale: se vuelve a ofrecer lo que queda.
      beneficios.recargar();
      mesa.recargar();
      return;
    }
    const { pagoId, urlPago } = respuesta.datos;
    if (urlPago) window.location.assign(urlPago);
    else {
      setParametros({ pago: pagoId });
      mesa.recargar();
    }
  }

  function terminarSeguimiento() {
    setParametros({});
    pago.setError(null);
    mesa.recargar();
    beneficios.recargar();
  }

  const claseAccion =
    'inline-flex min-h-11 flex-1 items-center justify-center rounded-control px-4 text-sm font-semibold';
  const accion = datos && !pagoSeguido && (
    <>
      {puedePagar && (
        <Boton densidad="comensal" className="flex-1" disabled={pago.enviando} onClick={pagar}>
          {pago.enviando ? 'Abriendo Mercado Pago…' : `Pagar ${formatoPesos(aPagar)}`}
        </Boton>
      )}
      {datos.pagoEnCurso && (
        <Boton
          densidad="comensal"
          className="flex-1"
          disabled={retomar.enviando}
          onClick={() => retomar.continuar(datos.pagoEnCurso!.pagoId)}
        >
          {retomar.enviando ? 'Abriendo Mercado Pago…' : 'Continuar el pago'}
        </Boton>
      )}
      <Link
        to={`/s/${datos.sucursal.id}/menu`}
        className={`${claseAccion} ${
          puedePagar || datos.pagoEnCurso
            ? 'border border-line-strong bg-surface text-text hover:bg-panel'
            : 'bg-accent text-white hover:bg-accent-hover'
        }`}
      >
        Pedir más
      </Link>
    </>
  );

  return (
    <LayoutComensal accionFija={accion || undefined} mesaActiva={datos}>
      <EstadoCarga cargando={mesa.cargando && !datos && !ultima} error={mesa.error} />
      {pagoSeguido && (
        <div className="mb-4">
          <ResultadoPagoVista
            pagoId={pagoSeguido}
            {...seguimiento}
            sinAprobar={sinAprobar}
            onListo={terminarSeguimiento}
          />
        </div>
      )}
      {!datos && !mesa.cargando && !mesa.error && (
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
            {datos.descuentos > 0 && (
              <div className="flex justify-between">
                <dt className="text-meta">Beneficios usados</dt>
                <dd className="tabular-nums">−{formatoPesos(datos.descuentos)}</dd>
              </div>
            )}
            {elegido && puedePagar && (
              <div className="flex justify-between text-accent-ink">
                <dt>{elegido.nombre}</dt>
                <dd className="tabular-nums">−{formatoPesos(elegido.descuento)}</dd>
              </div>
            )}
            <div className="flex justify-between text-base font-semibold text-ink">
              <dt>{elegido && puedePagar ? 'A pagar' : 'Saldo'}</dt>
              <dd className="tabular-nums">{formatoPesos(puedePagar ? aPagar : datos.saldo)}</dd>
            </div>
          </dl>

          {datos.pagoEnCurso && !pagoSeguido && (
            <section
              role="status"
              className="space-y-1 rounded-panel border border-line bg-surface p-4"
            >
              <p className="font-semibold text-ink">Tenés un pago en curso</p>
              <p className="text-sm text-meta">
                Podés terminarlo en Mercado Pago. Si no lo completás, vence a los 15 minutos y no se
                cobra nada.
              </p>
              <Aviso>{retomar.error}</Aviso>
            </section>
          )}

          {puedePagar && !pagoSeguido && (
            <SeleccionPago
              beneficios={beneficios.datos}
              beneficioId={beneficioId}
              onBeneficio={setBeneficioId}
            />
          )}
          <Aviso>{pago.error ?? beneficios.error}</Aviso>
        </div>
      )}
    </LayoutComensal>
  );
}
