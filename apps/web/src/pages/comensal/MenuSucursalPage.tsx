import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Box, Utensils } from 'lucide-react';
import type { MenuSucursal } from '@pgim/shared';
import { LayoutComensal, TituloComensal } from '../../components/LayoutComensal';
import { Chip, EstadoCarga, Etiqueta } from '../../components/ui';
import { formatoPesos } from '../../lib/formato';
import { useRecurso } from '../../lib/useRecurso';

// Destino del QR de la sucursal: el menú activo, por categoría.
export function MenuSucursalPage() {
  const { sucursalId } = useParams();
  const { datos, cargando, error } = useRecurso<MenuSucursal>(
    `/comensal/sucursales/${sucursalId}/menu`,
  );
  // null = todas las categorías.
  const [categoria, setCategoria] = useState<string | null>(null);

  const reservar = datos && (
    <Link
      to={`/s/${datos.sucursal.id}/reservar`}
      className="inline-flex min-h-11 flex-1 items-center justify-center rounded-control bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover"
    >
      Reservar mesa
    </Link>
  );

  const categorias = datos?.menu?.categorias ?? [];
  const visibles = categoria ? categorias.filter((c) => c.id === categoria) : categorias;

  return (
    <LayoutComensal volver={{ a: '/inicio', texto: 'Sucursales' }} accionFija={reservar}>
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
                        <li key={p.id}>
                          <Link
                            to={`/s/${sucursalId}/platos/${p.id}`}
                            className="flex gap-3 py-3 hover:bg-panel"
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
