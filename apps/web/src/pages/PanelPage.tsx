import { Link } from 'react-router';
import { LayoutGrid } from 'lucide-react';
import { useSesion } from '../auth/SesionProvider';
import { SECCIONES } from '../components/PanelLayout';
import { EncabezadoPagina, Vacio } from '../components/ui';

export function PanelPage() {
  const { sesion, tienePermiso } = useSesion();
  const visibles = SECCIONES.filter((s) => tienePermiso(s.permiso));

  return (
    <>
      <EncabezadoPagina
        titulo={`Hola, ${sesion?.usuario.nombre ?? ''}`}
        descripcion={
          sesion?.sucursalActiva ? `Trabajando en ${sesion.sucursalActiva.nombre}` : undefined
        }
      />
      {visibles.length === 0 ? (
        <Vacio
          icono={LayoutGrid}
          titulo="Todavía no tenés secciones disponibles"
          texto="Pedile al administrador que le sume permisos a tu rol."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibles.map((s) => (
            <li key={s.ruta}>
              <Link
                to={`/panel/${s.ruta}`}
                className="flex h-full gap-3 rounded-panel border border-line bg-surface p-4 hover:border-line-strong hover:bg-panel"
              >
                <s.icono aria-hidden className="mt-0.5 size-5 shrink-0 text-accent" />
                <span className="min-w-0">
                  <span className="block font-semibold text-ink">{s.titulo}</span>
                  <span className="block text-sm text-meta">{s.descripcion}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
