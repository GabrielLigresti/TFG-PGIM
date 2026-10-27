import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Box, Plus, Utensils } from 'lucide-react';
import type { MenuSucursal, PlatoMenu } from '@pgim/shared';
import { LayoutComensal, TituloComensal } from '../../components/LayoutComensal';
import { Chip, EstadoCarga, Etiqueta } from '../../components/ui';
import { useCarrito } from '../../lib/carrito';
import { formatoPesos } from '../../lib/formato';
import { useMiMesa } from '../../lib/miMesa';
import { useRecurso } from '../../lib/useRecurso';

// Destino del QR de la sucursal: el menú activo, por categoría.
export function MenuSucursalPage() {
  const { sucursalId } = useParams();
  const { datos, cargando, error } = useRecurso<MenuSucursal>(
    `/comensal/sucursales/${sucursalId}/menu`,
  );
  // null = todas las categorías.
  const [categoria, setCategoria] = useState<string | null>(null);
  // Con la mesa activa en esta sucursal, el comensal pide desde el menú.
  const mesa = useMiMesa(sucursalId ?? null).datos;
  const carrito = useCarrito(mesa?.cuentaMesaId ?? null);

  const claseAccion =
    'inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover';
  const accion = !datos ? null : mesa ? (
    carrito.unidades > 0 && (
      <Link to={`/s/${datos.sucursal.id}/pedido`} className={claseAccion}>
        Ver pedido · {carrito.unidades} · {formatoPesos(carrito.total)}
      </Link>
    )
  ) : (
    <Link to={`/s/${datos.sucursal.id}/reservar`} className={claseAccion}>
      Reservar mesa
    </Link>
  );

  function agregar(p: PlatoMenu) {
    carrito.agregar({ id: p.id, nombre: p.nombre, precio: p.precio }, 1);
  }

  const categorias = datos?.menu?.categorias ?? [];
  const visibles = categoria ? categorias.filter((c) => c.id === categoria) : categorias;

  return (
    <LayoutComensal volver={{ a: '/inicio', texto: 'Sucursales' }} accionFija={accion || undefined}>
      <EstadoCarga cargando={cargando && !datos} error={error} />
      {datos && (
        <>
          <p className="text-sm text-meta">{datos.sucursal.restaurante.nombre}</p>
          <TituloComensal>{datos.sucursal.nombre}</TituloComensal>
          <p className="mb-5 text-sm text-meta">{datos.sucursal.direccion}</p>

          {!datos.menu ? (
            <p className="rounded-panel border border-line bg-surface p-4 text-sm text-meta">
              Esta sucursal no tiene un menú disponible en este momento.
            </p>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-ink">{datos.menu.nombre}</h2>
              {datos.menu.descripcion && (
                <p className="text-sm text-meta">{datos.menu.descripcion}</p>
              )}
              {categorias.length > 1 && (
                <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
                  <Chip seleccionado={categoria === null} onClick={() => setCategoria(null)}>
                    Todo
                  </Chip>
                  {categorias.map((c) => (
                    <Chip
                      key={c.id}
                      seleccionado={categoria === c.id}
                      onClick={() => setCategoria(c.id)}
                    >
                      {c.nombre}
                    </Chip>
                  ))}
                </div>
              )}
              <div className="mt-4 space-y-6">
                {visibles.map((c) => (
                  <section key={c.id}>
                    <h3 className="text-sm font-semibold text-meta">{c.nombre}</h3>
                    <ul className="divide-y divide-line">
                      {c.platos.map((p) => (
                        <li key={p.id} className="relative">
                          <Link
                            to={`/s/${sucursalId}/platos/${p.id}`}
                            className={`flex gap-3 py-3 hover:bg-panel ${p.hayStock ? '' : 'opacity-60'}`}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block font-semibold text-ink">{p.nombre}</span>
                              {p.descripcion && (
                                <span className="line-clamp-2 block text-sm text-meta">
                                  {p.descripcion}
                                </span>
                              )}
                              <span className="mt-1.5 flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-ink">
                                  {formatoPesos(p.precio)}
                                </span>
                                {!p.hayStock && <Etiqueta>Sin stock</Etiqueta>}
                                {p.modeloRa && (
                                  <Etiqueta tono="acento">
                                    <Box aria-hidden className="size-3.5" />
                                    Ver en mi mesa
                                  </Etiqueta>
                                )}
                              </span>
                            </span>
                            {p.fotoUrl ? (
                              <img
                                src={p.fotoUrl}
                                alt=""
                                className="size-[76px] shrink-0 rounded-panel object-cover"
                              />
                            ) : (
                              <span
                                aria-hidden
                                className="grid size-[76px] shrink-0 place-items-center rounded-panel border border-line bg-panel text-meta"
                              >
                                <Utensils className="size-6" strokeWidth={1.6} />
                              </span>
                            )}
                          </Link>
                          {mesa && p.hayStock && (
                            <BotonAgregar
                              nombre={p.nombre}
                              cantidad={carrito.cantidadDe(p.id)}
                              onClick={() => agregar(p)}
                            />
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
                {categorias.length === 0 && (
                  <p className="text-sm text-meta">El menú no tiene platos disponibles.</p>
                )}
              </div>
            </>
          )}
        </>
      )}
    </LayoutComensal>
  );
}

// Sobre la foto: agrega una unidad y, si ya hay, muestra cuántas van en el pedido.
function BotonAgregar({
  nombre,
  cantidad,
  onClick,
}: {
  nombre: string;
  cantidad: number;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={
        cantidad > 0 ? `${nombre}: ${cantidad} en el pedido. Agregar otro` : `Agregar ${nombre}`
      }
      className={`absolute right-1 bottom-1 grid size-11 place-items-center rounded-full font-semibold tabular-nums ${
        cantidad > 0
          ? 'bg-accent text-white hover:bg-accent-hover'
          : 'border border-line-strong bg-surface text-accent-ink hover:bg-panel'
      }`}
    >
      {cantidad > 0 ? cantidad : <Plus aria-hidden className="size-5" />}
    </button>
  );
}
