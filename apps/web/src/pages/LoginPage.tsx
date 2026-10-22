import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import type { Sesion } from '@pgim/shared';
import { ApiError } from '../lib/api';
import { rutaInicio, useSesion } from '../auth/SesionProvider';
import { Cargando } from '../components/Cargando';

// La página que pidió el login (RutaProtegida la deja en el state), si es para
// el mismo tipo de usuario que entró.
interface Destino {
  desde?: string;
  tipo?: Sesion['usuario']['tipo'];
}

function destino(sesion: Sesion, state: unknown): string {
  const { desde, tipo } = (state ?? {}) as Destino;
  return desde && tipo === sesion.usuario.tipo ? desde : rutaInicio(sesion);
}

export function LoginPage() {
  const { sesion, cargando, login } = useSesion();
  const navigate = useNavigate();
  const { state } = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (cargando) return <Cargando />;
  if (sesion) return <Navigate to={destino(sesion, state)} replace />;

  async function onSubmit(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const nueva = await login(email, password);
      navigate(destino(nueva, state), { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo iniciar sesión');
      setEnviando(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200"
      >
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold text-slate-800">PGIM</h1>
          <p className="text-sm text-slate-500">Iniciá sesión con tu cuenta</p>
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-slate-500 focus:outline-none"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Contraseña</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-slate-500 focus:outline-none"
          />
        </label>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={enviando}
          className="w-full rounded-lg bg-slate-800 px-4 py-2 font-medium text-white hover:bg-slate-700 disabled:opacity-60"
        >
          {enviando ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </main>
  );
}
