import { Link, useParams } from 'react-router';
import type { MenuSucursal } from '@pgim/shared';
import { LayoutComensal, TituloComensal } from '../../components/LayoutComensal';
import { EstadoCarga, Etiqueta } from '../../components/ui';
import { formatoPesos } from '../../lib/formato';
import { useRecurso } from '../../lib/useRecurso';

// Destino del QR de la sucursal: el menú activo, por categoría.
export function MenuSucursalPage() {
  const { sucursalId } = useParams();
  const { datos, cargando, error } = useRecurso<MenuSucursal>(
    `/comensal/sucursales/${sucursalId}/menu`,
  );

  return (
    <LayoutComensal volver={{ a: '/inicio', texto: 'Sucursales' }}>
      <EstadoCarga cargando={cargando && !datos} error={error} />
      {datos && (
        <>
          <p className="text-sm text-slate-500">{datos.sucursal.restaurante.nombre}</p>
          <TituloComensal>{datos.sucursal.nombre}</TituloComensal>
          <p className="mb-3 text-sm text-slate-500">{datos.sucursal.direccion}</p>
          <Link
            to={`/s/${datos.sucursal.id}/reservar`}
            className="mb-5 inline-block rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Reservar mesa
          </Link>

          {!datos.menu ? (
            <p className="rounded-xl bg-white p-4 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200">
              Esta sucursal no tiene un menú disponible en este momento.
            </p>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-slate-800">{datos.menu.nombre}</h2>
              {datos.menu.descripcion && (
                <p className="text-sm text-slate-500">{datos.menu.descripcion}</p>
              )}
              <div className="mt-4 space-y-6">
                {datos.menu.categorias.map((c) => (
                  <section key={c.id}>
                    <h3 className="mb-2 text-sm font-medium uppercase text-slate-500">
                      {c.nombre}
                    </h3>
                    <ul className="space-y-2">
                      {c.platos.map((p) => (
                        <li key={p.id}>
                          <Link
                            to={`/s/${sucursalId}/platos/${p.id}`}
                            className="flex gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
                          >
                            {p.fotoUrl && (
                              <img
                                src={p.fotoUrl}
                                alt=""
                                className="size-16 shrink-0 rounded-lg object-cover"
                              />
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="flex items-start justify-between gap-2">
                                <span className="font-medium text-slate-800">{p.nombre}</span>
                                <span className="shrink-0 text-slate-700">
                                  {formatoPesos(p.precio)}
                                </span>
                              </span>
                              {p.descripcion && (
                                <span className="line-clamp-2 block text-sm text-slate-500">
                                  {p.descripcion}
                                </span>
                              )}
                              {p.modeloRa && (
                                <span className="mt-1 block">
                                  <Etiqueta tono="ok">Ver en RA</Etiqueta>
                                </span>
                              )}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
                {datos.menu.categorias.length === 0 && (
                  <p className="text-sm text-slate-500">El menú no tiene platos disponibles.</p>
                )}
              </div>
            </>
          )}
        </>
      )}
    </LayoutComensal>
  );
}
