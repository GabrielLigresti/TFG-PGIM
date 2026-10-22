import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useSesion } from '../auth/SesionProvider';

// Marco de las pantallas del comensal: pensado primero para el celular.
export function LayoutComensal({
  volver,
  children,
}: {
  volver?: { a: string; texto: string };
  children: ReactNode;
}) {
  const { sesion, logout } = useSesion();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-2">
          {volver ? (
            <Link to={volver.a} className="py-2 text-sm text-slate-700">
              ← {volver.texto}
            </Link>
          ) : (
            <span className="py-2 text-sm font-medium text-slate-800">
              Hola, {sesion?.usuario.nombre}
            </span>
          )}
          <button
            type="button"
            onClick={logout}
            className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            Cerrar sesión
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-5">{children}</main>
    </div>
  );
}
