import { Link } from 'react-router';
import type { ResumenRecetas } from '@pgim/shared';
import { useSesion } from '../../auth/SesionProvider';
import { Lista } from '../../components/Lista';
import { Aviso, EncabezadoPagina, EstadoCarga, Etiqueta } from '../../components/ui';
import { NOMBRE_UNIDAD, formatoPesos } from '../../lib/formato';
import { useGuardar } from '../../lib/useGuardar';
import { useRecurso } from '../../lib/useRecurso';
import { useConfirmar } from '../../components/Confirmacion';

const claseLink =
  'inline-block rounded-control border border-line-strong bg-surface px-3 py-2 text-sm font-medium text-text hover:bg-panel';

// CU-07: recetas de platos y de productos intermedios, con su costo.
export function RecetasPage() {
  const { tienePermiso } = useSesion();
  const { datos, cargando, error, recargar } = useRecurso<ResumenRecetas>('/recetas');
  const baja = useGuardar();

  const confirmar = useConfirmar();

  async function darDeBaja(id: string, nombre: string) {
    if (
      !(await confirmar({
        mensaje: `¿Dar de baja la preparación ${nombre}?`,
        detalle: 'Deja de estar disponible para nuevas recetas. Su historial se conserva.',
        accion: 'Dar de baja',
      }))
    )
      return;
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
              titulo="Preparaciones"
              descripcion="Preparaciones que se usan en otras recetas, como una salsa base. No tienen stock propio."
              accion={
                tienePermiso('receta.crear') && (
                  <Link
                    to="/panel/recetas/intermedio/nuevo"
                    className="inline-flex min-h-11 items-center justify-center rounded-control bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover sm:min-h-9"
                  >
                    Nueva preparación
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
              vacio="Todavía no hay preparaciones."
              columnas={[
                {
                  titulo: 'Preparación',
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
                <span className="inline-flex flex-wrap justify-end gap-x-6 gap-y-2">
                  <Link to={`/panel/recetas/intermedio/${i.id}`} className={claseLink}>
                    Ver receta
                  </Link>
                  {tienePermiso('receta.eliminar') && i.activo && (
                    <button
                      type="button"
                      onClick={() => darDeBaja(i.id, i.nombre)}
                      className="rounded-control border border-bad/30 bg-surface px-3 py-2 text-sm font-medium text-bad hover:bg-bad-soft"
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
