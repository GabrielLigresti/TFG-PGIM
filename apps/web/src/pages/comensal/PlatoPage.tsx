import { useState } from 'react';
import { useParams } from 'react-router';
import type { DetallePlato } from '@pgim/shared';
import { useAvisos } from '../../components/AvisoEmergente';
import { LayoutComensal, TituloComensal } from '../../components/LayoutComensal';
import { SelectorCantidad } from '../../components/SelectorCantidad';
import { VisorRA } from '../../components/VisorRA';
import { Aviso, Boton, Campo, EstadoCarga, claseInput } from '../../components/ui';
import { useCarrito } from '../../lib/carrito';
import { formatoCantidad, formatoPesos } from '../../lib/formato';
import { useMiMesa } from '../../lib/miMesa';
import { useRecurso } from '../../lib/useRecurso';

// Detalle del plato (CU-10). "Ver en mi mesa" (RA) aparece solo si el plato tiene modelo (E1).
// Con la mesa activa, el plato se agrega al pedido desde acá o desde la RA (flujo A).
export function PlatoPage() {
  const { sucursalId, id } = useParams();
  const { datos, cargando, error } = useRecurso<DetallePlato>(
    `/comensal/sucursales/${sucursalId}/platos/${id}`,
  );
  const plato = datos?.plato;
  const mesa = useMiMesa(sucursalId ?? null).datos;
  const carrito = useCarrito(mesa?.cuentaMesaId ?? null);
  const { avisar } = useAvisos();
  const [cantidad, setCantidad] = useState(1);
  const [observaciones, setObservaciones] = useState('');

  const puedePedir = Boolean(mesa && plato?.hayStock);

  function agregar(unidades: number, nota: string) {
    if (!plato) return;
    carrito.agregar(
      {
        id: plato.id,
        nombre: plato.nombre,
        precio: plato.precio,
        admiteObservaciones: plato.admiteObservaciones,
      },
      unidades,
      plato.admiteObservaciones ? nota : '',
    );
  }

  function agregarDesdeFicha() {
    agregar(cantidad, observaciones);
    avisar(`${plato!.nombre}: ${cantidad} agregado al pedido`);
    setCantidad(1);
    setObservaciones('');
  }

  const accion = plato && puedePedir && (
    <Boton densidad="comensal" className="flex-1" onClick={agregarDesdeFicha}>
      Agregar al pedido · {formatoPesos(plato.precio * cantidad)}
    </Boton>
  );

  return (
    <LayoutComensal
      volver={{ a: `/s/${sucursalId}/menu`, texto: 'Menú' }}
      accionFija={accion || undefined}
    >
      <EstadoCarga cargando={cargando && !datos} error={error} />
      {plato && (
        <article className="space-y-4">
          {plato.fotoUrl && (
            <img
              src={plato.fotoUrl}
              alt={plato.nombre}
              className="aspect-[4/3] w-full rounded-panel object-cover"
            />
          )}
          <div>
            <p className="text-sm text-meta">{plato.categoria.nombre}</p>
            <div className="flex items-start justify-between gap-3">
              <TituloComensal>{plato.nombre}</TituloComensal>
              <span className="shrink-0 pt-1 text-lg font-semibold text-ink">
                {formatoPesos(plato.precio)}
              </span>
            </div>
            {plato.descripcion && <p className="mt-1 text-meta">{plato.descripcion}</p>}
            {plato.modeloRa && (
              <p className="mt-1 text-sm text-meta">
                Porción: {formatoCantidad(plato.modeloRa.porcionGramos, 'GRAMO')}
              </p>
            )}
          </div>
          {mesa && !plato.hayStock && <Aviso>Hoy no hay stock de este plato.</Aviso>}
          {plato.modeloRa && (
            <VisorRA
              modelo={plato.modeloRa}
              nombre={plato.nombre}
              fotoUrl={plato.fotoUrl}
              {...(puedePedir && {
                alAgregar: () => agregar(1, ''),
                cantidadEnPedido: carrito.cantidadDe(plato.id),
              })}
            />
          )}
          {puedePedir && (
            <section className="space-y-3 rounded-panel border border-line bg-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-text">Cantidad</span>
                <SelectorCantidad valor={cantidad} onChange={setCantidad} nombre={plato.nombre} />
              </div>
              {plato.admiteObservaciones && (
                <Campo etiqueta="Observaciones" ayuda="Por ejemplo: sin cebolla, bien cocida.">
                  <input
                    value={observaciones}
                    maxLength={200}
                    onChange={(e) => setObservaciones(e.target.value)}
                    className={`${claseInput} text-base`}
                  />
                </Campo>
              )}
            </section>
          )}
        </article>
      )}
    </LayoutComensal>
  );
}
