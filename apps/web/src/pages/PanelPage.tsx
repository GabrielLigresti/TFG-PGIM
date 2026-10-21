import type { CodigoPermiso } from '@pgim/shared';
import { useSesion } from '../auth/SesionProvider';

interface Seccion {
  titulo: string;
  descripcion: string;
  permiso: CodigoPermiso;
}

// Cada sección se habilita con su permiso de lectura; las pantallas llegan con
// los ABM del Hito 1.
const SECCIONES: Seccion[] = [
  { titulo: 'Sucursales', descripcion: 'Locales del restaurante', permiso: 'sucursal.ver' },
  { titulo: 'Roles', descripcion: 'Roles y permisos del personal', permiso: 'rol.ver' },
  {
    titulo: 'Personal',
    descripcion: 'Usuarios y asignación a sucursales',
    permiso: 'personal.ver',
  },
  { titulo: 'Insumos', descripcion: 'Insumos y unidades de medida', permiso: 'insumo.ver' },
  { titulo: 'Recetas', descripcion: 'Recetas con insumos y cantidades', permiso: 'receta.ver' },
  { titulo: 'Platos', descripcion: 'Platos del menú', permiso: 'menu.ver' },
];

export function PanelPage() {
  const { sesion, tienePermiso, seleccionarSucursal, logout } = useSesion();
  if (!sesion) return null;

  const visibles = SECCIONES.filter((s) => tienePermiso(s.permiso));

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="font-semibold text-slate-800">{sesion.restaurante?.nombre}</p>
            <p className="text-sm text-slate-500">
              {sesion.usuario.nombre} · {sesion.rol?.nombre}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {sesion.sucursales.length > 1 ? (
              <select
                aria-label="Sucursal de trabajo"
                value={sesion.sucursalActiva?.id}
                onChange={(e) => seleccionarSucursal(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
              >
                {sesion.sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-sm text-slate-600">{sesion.sucursalActiva?.nombre}</span>
            )}
            <button
              type="button"
              onClick={logout}
              className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {visibles.length === 0 ? (
          <p className="text-sm text-slate-600">
            Tu rol todavía no tiene pantallas de gestión disponibles.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibles.map((s) => (
              <li
                key={s.titulo}
                className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
              >
                <p className="font-medium text-slate-800">{s.titulo}</p>
                <p className="text-sm text-slate-500">{s.descripcion}</p>
                <p className="mt-2 text-xs text-slate-400">Próximamente</p>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
