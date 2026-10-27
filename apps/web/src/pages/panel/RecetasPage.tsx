import { Link } from 'react-router';
import type { ResumenRecetas } from '@pgim/shared';
import { useSesion } from '../../auth/SesionProvider';
import { Lista } from '../../components/Lista';
import { Aviso, EncabezadoPagina, EstadoCarga, Etiqueta } from '../../components/ui';
import { NOMBRE_UNIDAD, formatoPesos } from '../../lib/formato';
import { useGuardar } from '../../lib/useGuardar';
import { useRecurso } from '../../lib/useRecurso';

const claseLink =
  'inline-block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50';

// CU-07: recetas de platos y de productos intermedios, con su costo.
export function RecetasPage() {
  const { tienePermiso } = useSesion();
  const { datos, cargando, error, recargar } = useRecurso<ResumenRecetas>('/recetas');
  const baja = useGuardar();

  async function darDeBaja(id: string, nombre: string) {
    if (!confirm(`¿Dar de baja el producto intermedio ${nombre}?`)) return;
    if (await baja.enviar(`/recetas/intermedio/${id}`, 'DELETE')) recargar();
  }

  return (
    <section className="space-y-8">
      <EstadoCarga cargando={cargando && !datos} error={error} />
      {datos && (
        <>
          <div>
            <EncabezadoPagina
              titulo="Recetas de platos"
              descripcion="Insumos y cantidades de cada plato; el costo se calcula con la merma."
            />
            <Lista
              filas={datos.platos}
              clave={(p) => p.id}
              inactiva={(p) => !p.activo}
              vacio="Todavía no hay platos: se cargan en la sección Platos."
              columnas={[
                {
                  titulo: 'Plato',
                  valor: (p) => (
                    <span>
                      {p.nombre} {!p.activo && <Etiqueta>Dado de baja</Etiqueta>}
                    </span>
                  ),
                },
                { titulo: 'Categoría', valor: (p) => p.categoria },
                {
                  titulo: 'Receta',
                  valor: (p) =>
                    p.tieneReceta ? (
                      <Etiqueta tono="ok">Cargada</Etiqueta>
                    ) : (
                      <Etiqueta>Sin receta</Etiqueta>
                    ),
                },
                {
                  titulo: 'Costo por porción',
                  valor: (p) =>
                    p.costoPorPorcion === null ? '—' : formatoPesos(p.costoPorPorcion),
                },
              ]}
              acciones={(p) =>
                p.tieneReceta || tienePermiso('receta.crear') ? (
                  <Link to={`/panel/recetas/plato/${p.id}`} className={claseLink}>
                    {p.tieneReceta ? 'Ver receta' : 'Cargar receta'}
                  </Link>
                ) : null
              }
            />
          </div>

          <div>
            <EncabezadoPagina
              titulo="Productos intermedios"
              descripcion="Preparaciones que se usan en otras recetas, como una salsa base. No tienen stock propio."
              accion={
                tienePermiso('receta.crear') && (
                  <Link
                    to="/panel/recetas/intermedio/nuevo"
                    className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
                  >
                    Nuevo intermedio
                  </Link>
                )
              }
            />
            <div className="mb-3">
              <Aviso>{baja.error}</Aviso>
            </div>
            <Lista
              filas={datos.intermedios}
              clave={(i) => i.id}
              inactiva={(i) => !i.activo}
              vacio="Todavía no hay productos intermedios."
              columnas={[
                {
                  titulo: 'Intermedio',
                  valor: (i) => (
                    <span>
                      {i.nombre} {!i.activo && <Etiqueta>Dado de baja</Etiqueta>}
                    </span>
                  ),
                },
                { titulo: 'Unidad base', valor: (i) => NOMBRE_UNIDAD[i.unidadBase] },
                { titulo: 'Costo por unidad', valor: (i) => formatoPesos(i.costoUnitario) },
              ]}
              acciones={(i) => (
                <span className="inline-flex gap-2">
                  <Link to={`/panel/recetas/intermedio/${i.id}`} className={claseLink}>
                    Ver receta
                  </Link>
                  {tienePermiso('receta.eliminar') && i.activo && (
                    <button
                      type="button"
                      onClick={() => darDeBaja(i.id, i.nombre)}
                      className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                    >
                      Dar de baja
                    </button>
                  )}
                </span>
              )}
            />
          </div>
        </>
      )}
    </section>
  );
}
