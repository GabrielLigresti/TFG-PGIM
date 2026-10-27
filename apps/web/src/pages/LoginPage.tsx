import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { ApiError } from '../lib/api';
import { destinoTrasLogin as destino, useSesion } from '../auth/SesionProvider';
import { Cargando } from '../components/Cargando';

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
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-panel border border-line bg-surface p-6"
      >
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold text-ink">PGIM</h1>
          <p className="text-sm text-meta">Iniciá sesión con tu cuenta</p>
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-text">Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-control border border-line-strong min-h-11 bg-surface px-3 text-[16px] sm:min-h-9 sm:text-sm focus:border-accent focus:outline-none"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-text">Contraseña</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-control border border-line-strong min-h-11 bg-surface px-3 text-[16px] sm:min-h-9 sm:text-sm focus:border-accent focus:outline-none"
          />
        </label>

        {error && (
          <p role="alert" className="rounded-control bg-bad-soft px-3 py-2 text-sm text-bad">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={enviando}
          className="w-full inline-flex min-h-11 items-center justify-center rounded-control bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover sm:min-h-9 disabled:opacity-60"
        >
          {enviando ? 'Ingresando…' : 'Ingresar'}
        </button>

        <p className="text-center text-sm text-meta">
          ¿No tenés cuenta?{' '}
          <Link
            to="/registro"
            state={state}
            className="font-medium text-accent-ink underline underline-offset-2"
          >
            Registrate
          </Link>
        </p>
      </form>
    </main>
  );
}
