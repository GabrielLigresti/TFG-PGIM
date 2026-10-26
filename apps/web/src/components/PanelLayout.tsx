import { NavLink, Outlet } from 'react-router';
import type { CodigoPermiso } from '@pgim/shared';
import { useSesion } from '../auth/SesionProvider';

export interface SeccionPanel {
  ruta: string;
  titulo: string;
  descripcion: string;
  permiso: CodigoPermiso;
}

// Cada sección se habilita con su permiso de lectura.
export const SECCIONES: SeccionPanel[] = [
  {
    ruta: 'reservas',
    titulo: 'Reservas',
    descripcion: 'Reservas del día y activación de mesas',
    permiso: 'reserva.ver',
  },
  {
    ruta: 'sucursales',
    titulo: 'Sucursales',
    descripcion: 'Locales y horarios de servicio',
    permiso: 'sucursal.ver',
  },
  {
    ruta: 'roles',
    titulo: 'Roles',
    descripcion: 'Roles y permisos del personal',
    permiso: 'rol.ver',
  },
  {
    ruta: 'personal',
    titulo: 'Personal',
    descripcion: 'Empleados, rol y sucursales',
    permiso: 'personal.ver',
  },
  {
    ruta: 'insumos',
    titulo: 'Insumos',
    descripcion: 'Insumos, costos y stock',
    permiso: 'insumo.ver',
  },
  {
    ruta: 'recetas',
    titulo: 'Recetas',
    descripcion: 'Recetas, intermedios y costos',
    permiso: 'receta.ver',
  },
  {
    ruta: 'platos',
    titulo: 'Platos',
    descripcion: 'Platos y categorías del menú',
    permiso: 'menu.ver',
  },
  {
    ruta: 'menus',
    titulo: 'Menús',
    descripcion: 'Menús con vigencia y sus platos',
    permiso: 'menu.ver',
  },
];

export function PanelLayout() {
  const { sesion, tienePermiso, seleccionarSucursal, logout } = useSesion();
  if (!sesion) return null;

  const visibles = SECCIONES.filter((s) => tienePermiso(s.permiso));

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <NavLink to="/panel" end>
            <p className="font-semibold text-slate-800">{sesion.restaurante?.nombre}</p>
            <p className="text-sm text-slate-500">
              {sesion.usuario.nombre} · {sesion.rol?.nombre}
            </p>
          </NavLink>

          <div className="flex items-center gap-3">
            {sesion.sucursales.length > 1 ? (
              <select
                aria-label="Sucursal de trabajo"
                value={sesion.sucursalActiva?.id}
                onChange={(e) => seleccionarSucursal(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-base sm:py-1.5 sm:text-sm"
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
              className="rounded-lg px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-100 sm:py-1.5"
            >
              Cerrar sesión
            </button>
          </div>
        </div>

        {visibles.length > 0 && (
          <nav aria-label="Secciones" className="mx-auto max-w-6xl overflow-x-auto px-4">
            <ul className="flex gap-1">
              {visibles.map((s) => (
                <li key={s.ruta}>
                  <NavLink
                    to={`/panel/${s.ruta}`}
                    className={({ isActive }) =>
                      `block border-b-2 px-3 py-2 text-sm whitespace-nowrap ${
                        isActive
                          ? 'border-slate-800 font-medium text-slate-800'
                          : 'border-transparent text-slate-500 hover:text-slate-700'
                      }`
                    }
                  >
                    {s.titulo}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
