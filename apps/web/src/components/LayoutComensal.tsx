import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import type { MiMesa } from '@pgim/shared';
import { CalendarDays, ChevronLeft, House, LogOut, Receipt, Star } from 'lucide-react';
import { rutaInicio, useSesion } from '../auth/SesionProvider';
import { useMiMesa } from '../lib/miMesa';

const PESTANIAS = [
  { a: '/', texto: 'Inicio', icono: House },
  { a: '/reservas', texto: 'Reservas', icono: CalendarDays },
  { a: '/puntos', texto: 'Mis puntos', icono: Star },
];

// Título de las pantallas del comensal.
export function TituloComensal({ children }: { children: ReactNode }) {
  return (
    <h1 className="font-display text-2xl font-semibold tracking-tight text-ink [overflow-wrap:anywhere]">
      {children}
    </h1>
  );
}

// Marco de las pantallas del comensal: pensado primero para el celular. La
// acción principal de la pantalla queda fija abajo, al alcance del pulgar.
export function LayoutComensal({
  volver,
  accionFija,
  mesaActiva,
  children,
}: {
  volver?: { a: string; texto: string };
  accionFija?: ReactNode;
  // La pantalla que ya consultó la mesa la pasa, para no pedirla dos veces.
  mesaActiva?: MiMesa | null;
  children: ReactNode;
}) {
  const { sesion, logout } = useSesion();
  // "Mi mesa" aparece solo mientras el comensal tiene una mesa activa.
  // Sin sesión de comensal no la consulta: sería un 401 (o 403) en la consola.
  const esComensal = sesion?.usuario.tipo === 'COMENSAL';
  const consultada = useMiMesa(null, mesaActiva === undefined && esComensal).datos;
  const mesa = mesaActiva === undefined ? consultada : mesaActiva;
  const pestanias = mesa
    ? [...PESTANIAS, { a: '/mesa', texto: 'Mi mesa', icono: Receipt }]
    : PESTANIAS;

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-10 border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[480px] items-center justify-between gap-2 px-4 py-1">
          {volver ? (
            <Link
              to={volver.a}
              className="-ml-2 inline-flex min-h-11 min-w-0 items-center gap-1 rounded-control px-2 text-sm font-medium text-text hover:bg-panel"
            >
              <ChevronLeft aria-hidden className="size-5 shrink-0" />
              <span className="truncate">{volver.texto}</span>
            </Link>
          ) : (
            <span className="truncate text-sm font-medium text-text">
              {sesion ? `Hola, ${sesion.usuario.nombre}` : 'PGIM'}
            </span>
          )}
          {!sesion ? (
            <Link
              to="/login"
              className="inline-flex min-h-11 shrink-0 items-center rounded-control px-3 text-sm font-semibold text-meta hover:bg-panel hover:text-text"
            >
              Ingresar
            </Link>
          ) : esComensal ? (
            <button
              type="button"
              onClick={logout}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-control px-2 text-sm text-meta hover:bg-panel hover:text-text"
            >
              <LogOut aria-hidden className="size-4" />
              Salir
            </button>
          ) : (
            <Link
              to={rutaInicio(sesion)}
              className="inline-flex min-h-11 shrink-0 items-center rounded-control border border-accent/20 bg-accent-soft px-3 text-sm font-semibold text-accent-ink hover:bg-accent/15"
            >
              Ir al panel
            </Link>
          )}
        </div>
      </header>

      <main
        className={`mx-auto max-w-[480px] px-4 pt-5 ${esComensal ? (accionFija ? 'pb-40' : 'pb-24') : accionFija ? 'pb-24' : 'pb-8'}`}
      >
        {children}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-10">
        {accionFija && (
          <div className="border-t border-line bg-bg">
            <div className="mx-auto flex max-w-[480px] flex-wrap gap-2 px-4 py-2">{accionFija}</div>
          </div>
        )}
        {esComensal && (
          <nav
            aria-label="Secciones"
            className="border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
          >
            <div
              className={`mx-auto grid h-14 max-w-[480px] ${mesa ? 'grid-cols-4' : 'grid-cols-3'}`}
            >
              {pestanias.map(({ a, texto, icono: Icono }) => (
                <NavLink
                  key={a}
                  to={a}
                  end
                  className={({ isActive }) =>
                    `grid content-center justify-items-center gap-0.5 text-xs ${
                      isActive ? 'font-semibold text-accent-ink' : 'text-meta'
                    }`
                  }
                >
                  <Icono aria-hidden className="size-5" />
                  {texto}
                </NavLink>
              ))}
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}
