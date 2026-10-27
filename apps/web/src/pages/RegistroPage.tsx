import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { ApiError } from '../lib/api';
import { destinoTrasLogin, useSesion } from '../auth/SesionProvider';
import { Cargando } from '../components/Cargando';

const claseCampo =
  'w-full rounded-control border border-line-strong px-3 py-2 text-base focus:border-accent focus:outline-none';

// Registro simple de comensal. Al terminar vuelve a donde lo mandó el login
// (por ejemplo, el menú de la sucursal que abrió con el QR).
export function RegistroPage() {
  const { sesion, cargando, registrar } = useSesion();
  const navigate = useNavigate();
  const { state } = useLocation();
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [telefono, setTelefono] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (cargando) return <Cargando />;
  if (sesion) return <Navigate to={destinoTrasLogin(sesion, state)} replace />;

  async function onSubmit(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const nueva = await registrar({
        nombre,
        email,
        password,
        ...(telefono.trim() && { telefono }),
      });
      navigate(destinoTrasLogin(nueva, state), { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo crear la cuenta');
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
          <h1 className="text-2xl font-semibold text-ink">Crear cuenta</h1>
          <p className="text-sm text-meta">Para reservar mesa y pedir desde la app</p>
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-text">Nombre</span>
          <input
            autoComplete="name"
            required
            maxLength={100}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className={claseCampo}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-text">Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={claseCampo}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-text">Contraseña</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={claseCampo}
          />
          <span className="block text-xs text-meta">Al menos 8 caracteres</span>
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-text">Teléfono (opcional)</span>
          <input
            type="tel"
            autoComplete="tel"
            maxLength={30}
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            className={claseCampo}
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
          {enviando ? 'Creando la cuenta…' : 'Crear cuenta'}
        </button>

        <p className="text-center text-sm text-meta">
          ¿Ya tenés cuenta?{' '}
          <Link
            to="/login"
            state={state}
            className="font-medium text-accent-ink underline underline-offset-2"
          >
            Iniciá sesión
          </Link>
        </p>
      </form>
    </main>
  );
}
