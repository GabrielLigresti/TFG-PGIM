import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import {
  BookOpen,
  CalendarDays,
  ChefHat,
  LogOut,
  MapPin,
  Menu,
  Package,
  ScrollText,
  Shield,
  Users,
  Utensils,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { CodigoPermiso } from '@pgim/shared';
import { useSesion } from '../auth/SesionProvider';

export type GrupoPanel = 'Operación' | 'Menú' | 'Stock' | 'Gestión' | 'Análisis';

export interface SeccionPanel {
  ruta: string;
  titulo: string;
  descripcion: string;
  permiso: CodigoPermiso;
  grupo: GrupoPanel;
  icono: LucideIcon;
}

const GRUPOS: GrupoPanel[] = ['Operación', 'Menú', 'Stock', 'Gestión', 'Análisis'];

// Cada sección se habilita con su permiso de lectura.
export const SECCIONES: SeccionPanel[] = [
  {
    ruta: 'reservas',
    titulo: 'Reservas',
    descripcion: 'Reservas del día y activación de mesas',
    permiso: 'reserva.ver',
    grupo: 'Operación',
    icono: CalendarDays,
  },
  {
    ruta: 'cocina',
    titulo: 'Cocina',
    descripcion: 'Cola de pedidos de la cocina',
    permiso: 'pedido.ver',
    grupo: 'Operación',
    icono: ChefHat,
  },
  {
    ruta: 'platos',
    titulo: 'Platos',
    descripcion: 'Platos y categorías del menú',
    permiso: 'menu.ver',
    grupo: 'Menú',
    icono: Utensils,
  },
  {
    ruta: 'menus',
    titulo: 'Menús',
    descripcion: 'Menús con vigencia y sus platos',
    permiso: 'menu.ver',
    grupo: 'Menú',
    icono: ScrollText,
  },
  {
    ruta: 'recetas',
    titulo: 'Recetas',
    descripcion: 'Recetas, preparaciones y costos',
    permiso: 'receta.ver',
    grupo: 'Menú',
    icono: BookOpen,
  },
  {
    ruta: 'insumos',
    titulo: 'Insumos',
    descripcion: 'Insumos, costos y stock',
    permiso: 'insumo.ver',
    grupo: 'Stock',
    icono: Package,
  },
  {
    ruta: 'personal',
    titulo: 'Personal',
    descripcion: 'Empleados, rol y sucursales',
    permiso: 'personal.ver',
    grupo: 'Gestión',
    icono: Users,
  },
  {
    ruta: 'roles',
    titulo: 'Roles',
    descripcion: 'Roles y permisos del personal',
    permiso: 'rol.ver',
    grupo: 'Gestión',
    icono: Shield,
  },
  {
    ruta: 'sucursales',
    titulo: 'Sucursales',
    descripcion: 'Locales, horarios de servicio y salón',
    permiso: 'sucursal.ver',
    grupo: 'Gestión',
    icono: MapPin,
  },
];

// Secciones visibles agrupadas por módulo; los grupos vacíos no aparecen.
function agrupar(secciones: SeccionPanel[]) {
  return GRUPOS.map((grupo) => ({
    grupo,
    secciones: secciones.filter((s) => s.grupo === grupo),
  })).filter((g) => g.secciones.length > 0);
}

function Marca({ nombre }: { nombre?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        aria-hidden
        className="grid size-7 shrink-0 place-items-center rounded-control bg-accent text-sm font-bold text-white"
      >
        P
      </span>
      {nombre && <span className="truncate text-sm font-semibold text-ink">{nombre}</span>}
    </div>
  );
}

export function PanelLayout() {
  const { sesion, tienePermiso, seleccionarSucursal, logout } = useSesion();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const botonMenu = useRef<HTMLButtonElement>(null);
  const panelMenu = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();

  // Elegir una sección cierra el menú del celular.
  useEffect(() => setMenuAbierto(false), [pathname]);

  // Escape o un toque fuera cierran el menú y devuelven el foco al botón.
  useEffect(() => {
    if (!menuAbierto) return;
    const cerrar = () => {
      setMenuAbierto(false);
      botonMenu.current?.focus();
    };
    const alPresionar = (e: KeyboardEvent) => e.key === 'Escape' && cerrar();
    const alTocar = (e: PointerEvent) => {
      const destino = e.target as Node;
      if (!panelMenu.current?.contains(destino) && !botonMenu.current?.contains(destino)) cerrar();
    };
    document.addEventListener('keydown', alPresionar);
    document.addEventListener('pointerdown', alTocar);
    return () => {
      document.removeEventListener('keydown', alPresionar);
      document.removeEventListener('pointerdown', alTocar);
    };
  }, [menuAbierto]);

  if (!sesion) return null;

  const grupos = agrupar(SECCIONES.filter((s) => tienePermiso(s.permiso)));
  const restaurante = sesion.restaurante?.nombre;

  const selectorSucursal =
    sesion.sucursales.length > 1 ? (
      <select
        aria-label="Sucursal de trabajo"
        value={sesion.sucursalActiva?.id}
        onChange={(e) => seleccionarSucursal(e.target.value)}
        className="min-h-11 w-full min-w-0 max-w-44 truncate rounded-control border border-line-strong bg-surface px-2 text-[16px] sm:min-h-9 sm:text-sm"
      >
        {sesion.sucursales.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nombre}
          </option>
        ))}
      </select>
    ) : (
      <span className="flex min-w-0 items-center gap-1 text-sm text-meta">
        <MapPin aria-hidden className="size-4 shrink-0" />
        <span className="truncate">{sesion.sucursalActiva?.nombre}</span>
      </span>
    );

  const usuario = (
    <div className="flex shrink-0 items-center gap-2 sm:min-w-0 sm:shrink">
      <span className="hidden min-w-0 truncate text-sm text-meta sm:block">
        {sesion.usuario.nombre} · {sesion.rol?.nombre}
      </span>
      <button
        type="button"
        onClick={logout}
        aria-label="Cerrar sesión"
        className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-control px-2 text-sm text-meta hover:bg-panel hover:text-text sm:min-h-9"
      >
        <LogOut aria-hidden className="size-4" />
        <span aria-hidden className="hidden sm:inline">
          Cerrar sesión
        </span>
      </button>
    </div>
  );

  const claseEnlace = (activo: boolean) =>
    activo
      ? 'bg-accent-soft font-semibold text-accent-ink [&>svg]:text-accent'
      : 'text-text hover:bg-panel [&>svg]:text-meta';

  return (
    <div className="min-h-screen md:flex">
      {/* Escritorio: barra lateral agrupada. Tablet: riel con ícono y etiqueta corta. */}
      <aside className="sticky top-0 hidden h-screen shrink-0 flex-col gap-4 overflow-y-auto border-r border-line bg-surface px-2 py-3 md:flex md:w-20 lg:w-56 lg:px-2.5">
        <NavLink to="/panel" end className="px-1 lg:px-1.5" aria-label="Inicio del panel">
          <span className="lg:hidden">
            <Marca />
          </span>
          <span className="hidden lg:block">
            <Marca nombre={restaurante} />
          </span>
        </NavLink>
        <nav aria-label="Secciones" className="grid gap-4">
          {grupos.map(({ grupo, secciones }) => (
            <div key={grupo} className="grid gap-0.5">
              <span className="hidden px-2 pb-1 text-xs font-semibold text-meta lg:block">
                {grupo}
              </span>
              {secciones.map((s) => (
                <NavLink
                  key={s.ruta}
                  to={`/panel/${s.ruta}`}
                  className={({ isActive }) =>
                    `flex flex-col items-center gap-1 rounded-control px-1 py-2 text-xs lg:flex-row lg:gap-2 lg:px-2 lg:py-1.5 lg:text-sm ${claseEnlace(isActive)}`
                  }
                >
                  <s.icono aria-hidden className="size-5 shrink-0 lg:size-4" />
                  {s.titulo}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b border-line bg-surface">
          <div className="flex items-center gap-3 px-4 py-2 lg:px-6">
            {grupos.length > 0 && (
              <button
                ref={botonMenu}
                type="button"
                aria-expanded={menuAbierto}
                aria-controls="menu-panel"
                onClick={() => setMenuAbierto((v) => !v)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-2 text-sm font-medium text-text hover:bg-panel md:hidden"
              >
                {menuAbierto ? (
                  <X aria-hidden className="size-5" />
                ) : (
                  <Menu aria-hidden className="size-5" />
                )}
                Menú
              </button>
            )}
            <div className="hidden min-w-0 min-[420px]:block md:hidden">
              <Marca nombre={restaurante} />
            </div>
            <div className="ml-auto flex min-w-0 items-center gap-2">
              {selectorSucursal}
              {usuario}
            </div>
          </div>

          {menuAbierto && (
            <div
              id="menu-panel"
              ref={panelMenu}
              className="absolute inset-x-0 top-full max-h-[calc(100vh-4rem)] overflow-y-auto border-b border-line bg-surface px-4 pb-4 shadow-flotante md:hidden"
            >
              <nav aria-label="Secciones" className="grid gap-4 pt-2">
                {grupos.map(({ grupo, secciones }) => (
                  <div key={grupo} className="grid gap-0.5">
                    <span className="px-2 pb-1 text-xs font-semibold text-meta">{grupo}</span>
                    {secciones.map((s) => (
                      <NavLink
                        key={s.ruta}
                        to={`/panel/${s.ruta}`}
                        className={({ isActive }) =>
                          `flex min-h-11 items-center gap-2 rounded-control px-2 text-base ${claseEnlace(isActive)}`
                        }
                      >
                        <s.icono aria-hidden className="size-5 shrink-0" />
                        {s.titulo}
                      </NavLink>
                    ))}
                  </div>
                ))}
              </nav>
            </div>
          )}
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6 lg:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
