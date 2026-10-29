import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Trash2, TriangleAlert } from 'lucide-react';
import type { FaltaStock, MenuSucursal, PedidoCola, PedidoInput } from '@pgim/shared';
import { useAvisos } from '../../components/AvisoEmergente';
import { LayoutComensal, TituloComensal } from '../../components/LayoutComensal';
import { SelectorCantidad } from '../../components/SelectorCantidad';
import { Aviso, Boton, EstadoCarga, claseInput } from '../../components/ui';
import { useCarrito } from '../../lib/carrito';
import { formatoPesos } from '../../lib/formato';
import { useGuardar } from '../../lib/useGuardar';
import { useMiMesa } from '../../lib/miMesa';
import { useRecurso } from '../../lib/useRecurso';

// Pedido en armado (CU-04): el comensal revisa cantidades y observaciones y lo
// confirma. Si a un plato no le alcanza el stock, el pedido se conserva.
export function PedidoPage() {
  const { sucursalId } = useParams();
  const navigate = useNavigate();
  const { avisar } = useAvisos();
  const mesa = useMiMesa(sucursalId ?? null);
  const cuentaMesaId = mesa.datos?.cuentaMesaId ?? null;
  const carrito = useCarrito(cuentaMesaId);
  const envio = useGuardar();
  const sinStock = (envio.detalles as FaltaStock | null)?.itemMenuId;

  // El carrito guarda el precio de cuando se agregó el plato: al abrir el
  // pedido se pone al día con el menú, que es el precio que cobra la cocina.
  const menu = useRecurso<MenuSucursal>(
    sucursalId ? `/comensal/sucursales/${sucursalId}/menu` : null,
  );
  const [preciosNuevos, setPreciosNuevos] = useState<string[]>([]);
  const { actualizar } = carrito;
  useEffect(() => {
    if (!menu.datos?.menu || !cuentaMesaId) return;
    const vigentes = new Map(
      menu.datos.menu.categorias
        .flatMap((c) => c.platos)
        .map((p) => [
          p.id,
          {
            id: p.id,
            nombre: p.nombre,
            precio: p.precio,
            admiteObservaciones: p.admiteObservaciones,
          },
        ]),
    );
    const cambiados = actualizar(vigentes);
    if (cambiados.length > 0) {
      setPreciosNuevos(cambiados.map((p) => `${p.nombre}: ahora ${formatoPesos(p.precio)}`));
    }
    // Solo cuando llega el menú: actualizar es una función nueva en cada render.
  }, [menu.datos, cuentaMesaId]);

  async function confirmar() {
    if (!cuentaMesaId) return;
    const pedido: PedidoInput = {
      cuentaMesaId,
      lineas: carrito.lineas.map((l) => ({
        itemMenuId: l.plato.id,
        cantidad: l.cantidad,
        observaciones: l.observaciones || null,
      })),
    };
    const resultado = await envio.enviar<PedidoCola>('/comensal/pedidos', 'POST', pedido);
    if (!resultado) return;
    carrito.vaciar();
    avisar(`Pedido #${resultado.datos.numero} enviado a la cocina`);
    navigate('/mesa');
  }

  const accion = cuentaMesaId && carrito.lineas.length > 0 && (
    <Boton densidad="comensal" className="flex-1" disabled={envio.enviando} onClick={confirmar}>
      {envio.enviando ? 'Enviando…' : `Confirmar pedido · ${formatoPesos(carrito.total)}`}
    </Boton>
  );

  return (
    <LayoutComensal
      volver={{ a: `/s/${sucursalId}/menu`, texto: 'Menú' }}
      accionFija={accion || undefined}
    >
      <TituloComensal>Tu pedido</TituloComensal>
      {preciosNuevos.length > 0 && (
        <div className="my-3">
          <Aviso tono="ok">
            Actualizamos {preciosNuevos.length === 1 ? 'el precio' : 'los precios'} con el menú de
            hoy. {preciosNuevos.join('. ')}.
          </Aviso>
        </div>
      )}
      <EstadoCarga cargando={mesa.cargando && !mesa.datos} error={mesa.error} />
      {!mesa.cargando && !mesa.datos && !mesa.error && (
        <p className="mt-4 rounded-panel border border-line bg-surface p-4 text-sm text-meta">
          Para pedir, tu mesa tiene que estar activa. Avisale al personal cuando llegues.
        </p>
      )}
      {mesa.datos && (
        <>
          <p className="mb-4 text-sm text-meta">Mesa {mesa.datos.mesa.numero}</p>
          {carrito.lineas.length === 0 ? (
            <p className="rounded-panel border border-dashed border-line-strong p-4 text-sm text-meta">
              Tu pedido está vacío.{' '}
              <Link
                to={`/s/${sucursalId}/menu`}
                className="font-semibold text-accent-ink underline"
              >
                Elegí platos del menú.
              </Link>
            </p>
          ) : (
            <ul className="space-y-3">
              {carrito.lineas.map((l, i) => {
                const falta = l.plato.id === sinStock;
                return (
                  <li
                    key={`${l.plato.id}-${i}`}
                    className={`space-y-3 rounded-panel border bg-surface p-4 ${falta ? 'border-bad/40' : 'border-line'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-semibold text-ink">{l.plato.nombre}</span>
                      <span className="shrink-0 font-semibold tabular-nums text-ink">
                        {formatoPesos(l.plato.precio * l.cantidad)}
                      </span>
                    </div>
                    {falta && (
                      <p className="flex items-center gap-1.5 text-sm text-bad">
                        <TriangleAlert aria-hidden className="size-4 shrink-0" />
                        Ya no hay stock para este plato. Quitalo o bajá la cantidad.
                      </p>
                    )}
                    <div className="flex items-center justify-between gap-3">
                      <SelectorCantidad
                        valor={l.cantidad}
                        onChange={(cantidad) => carrito.cambiar(i, { cantidad })}
                        nombre={l.plato.nombre}
                      />
                      <Boton
                        variante="fantasma"
                        densidad="comensal"
                        onClick={() => carrito.quitar(i)}
                        aria-label={`Quitar ${l.plato.nombre}`}
                      >
                        <Trash2 aria-hidden className="size-4" />
                        Quitar
                      </Boton>
                    </div>
                    {l.plato.admiteObservaciones !== false && (
                      <input
                        value={l.observaciones}
                        maxLength={200}
                        placeholder="Observaciones (opcional)"
                        aria-label={`Observaciones de ${l.plato.nombre}`}
                        onChange={(e) => carrito.cambiar(i, { observaciones: e.target.value })}
                        className={`${claseInput} text-base`}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-4">
            <Aviso>{envio.error}</Aviso>
          </div>
        </>
      )}
    </LayoutComensal>
  );
}
