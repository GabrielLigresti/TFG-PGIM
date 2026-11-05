import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { CalendarDays, LogOut, Receipt, Star, UserRound } from 'lucide-react';
import { rutaInicio, useSesion } from '../auth/SesionProvider';
import { BuscadorSucursales } from '../components/BuscadorSucursales';
import { useMiMesa } from '../lib/miMesa';

// En el celular, ícono con el texto chico debajo (como las pestañas); desde md, en fila.
const claseEnlace =
  'inline-flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-control px-1.5 text-text hover:bg-panel md:flex-row md:gap-1.5 md:px-2 md:text-sm md:font-medium';

function Texto({ corto, largo }: { corto: string; largo?: ReactNode }) {
  return (
    <>
      <span className="text-[11px] leading-none md:hidden">{corto}</span>
      <span className="hidden md:inline">{largo ?? corto}</span>
    </>
  );
}

// Entrada pública: cualquiera busca una sucursal y mira su carta sin sesión.
export function LandingPage() {
  const { sesion, cargando, logout } = useSesion();
  const tipo = sesion?.usuario.tipo;
  const { pathname } = useLocation();
  // Para que el login vuelva a esta pantalla.
  const alLogin = { desde: pathname, tipo: 'COMENSAL' };
  // "Mi mesa" aparece solo con una mesa activa; sin sesión de comensal no se consulta.
  const mesa = useMiMesa(null, tipo === 'COMENSAL').datos;

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
                  state={alLogin}
                  className="inline-flex min-h-11 items-center rounded-control px-4 text-sm font-semibold text-meta hover:bg-panel hover:text-text"
                >
                  Ingresar
                </Link>
                <Link
                  to="/registro"
                  state={alLogin}
                  className="inline-flex min-h-11 items-center rounded-control border border-line-strong bg-surface px-4 text-sm font-semibold text-text hover:bg-panel"
                >
                  Crear cuenta
                </Link>
              </>
            )}
            {tipo === 'COMENSAL' && (
              <>
                {mesa && (
                  <Link to="/mesa" aria-label="Mi mesa" className={claseEnlace}>
                    <Receipt aria-hidden className="size-5" />
                    <Texto corto="Mi mesa" />
                  </Link>
                )}
                <Link to="/reservas" aria-label="Mis reservas" className={claseEnlace}>
                  <CalendarDays aria-hidden className="size-5" />
                  <Texto corto="Reservas" largo="Mis reservas" />
                </Link>
                <Link to="/puntos" aria-label="Mis puntos" className={claseEnlace}>
                  <Star aria-hidden className="size-5" />
                  <Texto corto="Puntos" largo="Mis puntos" />
                </Link>
                <Link to="/cuenta" aria-label="Mi cuenta" className={claseEnlace}>
                  <UserRound aria-hidden className="size-5" />
                  <Texto corto="Cuenta" largo="Mi cuenta" />
                </Link>
                <button
                  type="button"
                  onClick={logout}
                  aria-label="Salir"
                  className={`${claseEnlace} text-meta`}
                >
                  <LogOut aria-hidden className="size-5 md:size-4" />
                  <Texto corto="Salir" />
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
