import { Link } from 'react-router';
import { CalendarDays, LogOut, Star, UserRound } from 'lucide-react';
import { rutaInicio, useSesion } from '../auth/SesionProvider';
import { BuscadorSucursales } from '../components/BuscadorSucursales';

const claseEnlace =
  'inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-control px-2 text-sm font-medium text-text hover:bg-panel';

// Entrada pública: cualquiera busca una sucursal y mira su carta sin sesión.
export function LandingPage() {
  const { sesion, cargando, logout } = useSesion();
  const tipo = sesion?.usuario.tipo;

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-10 border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-[480px] items-center justify-between gap-2 px-4 md:max-w-[960px]">
          <span className="text-lg font-semibold tracking-tight text-ink">PGIM</span>
          <nav aria-label="Cuenta" className="flex items-center gap-1">
            {!cargando && !sesion && (
              <>
                <Link
                  to="/login"
                  className="inline-flex min-h-11 items-center rounded-control px-4 text-sm font-semibold text-meta hover:bg-panel hover:text-text"
                >
                  Ingresar
                </Link>
                <Link
                  to="/registro"
                  className="inline-flex min-h-11 items-center rounded-control border border-line-strong bg-surface px-4 text-sm font-semibold text-text hover:bg-panel"
                >
                  Crear cuenta
                </Link>
              </>
            )}
            {tipo === 'COMENSAL' && (
              <>
                <Link to="/reservas" aria-label="Mis reservas" className={claseEnlace}>
                  <CalendarDays aria-hidden className="size-5" />
                  <span className="hidden md:inline">Mis reservas</span>
                </Link>
                <Link to="/puntos" aria-label="Mis puntos" className={claseEnlace}>
                  <Star aria-hidden className="size-5" />
                  <span className="hidden md:inline">Mis puntos</span>
                </Link>
                <Link to="/cuenta" aria-label="Mi cuenta" className={claseEnlace}>
                  <UserRound aria-hidden className="size-5" />
                  <span className="hidden md:inline">Mi cuenta</span>
                </Link>
                <button
                  type="button"
                  onClick={logout}
                  aria-label="Salir"
                  className={`${claseEnlace} text-meta`}
                >
                  <LogOut aria-hidden className="size-5 md:size-4" />
                  <span className="hidden md:inline">Salir</span>
                </button>
              </>
            )}
            {sesion && tipo === 'EMPLEADO' && (
              <Link
                to={rutaInicio(sesion)}
                className="inline-flex min-h-11 items-center rounded-control border border-accent/20 bg-accent-soft px-4 text-sm font-semibold text-accent-ink hover:bg-accent/15"
              >
                Ir al panel
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[480px] px-4 pt-5 md:max-w-[960px]">
        <BuscadorSucursales />
      </main>

      <footer className="mx-auto mt-10 max-w-[480px] px-4 md:max-w-[960px]">
        <p className="border-t border-line py-6 text-sm text-meta">
          ¿Tenés un restaurante?{' '}
          <Link to="/registrar-restaurante" className="font-medium text-accent-ink underline">
            Registralo en PGIM
          </Link>
        </p>
      </footer>
    </div>
  );
}
