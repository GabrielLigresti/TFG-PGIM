import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { ApiError } from '../lib/api';
import { destinoTrasLogin, useSesion } from '../auth/SesionProvider';
import { Cargando } from '../components/Cargando';

const claseCampo =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-slate-500 focus:outline-none';

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
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200"
      >
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold text-slate-800">Crear cuenta</h1>
          <p className="text-sm text-slate-500">Para reservar mesa y pedir desde la app</p>
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Nombre</span>
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
          <span className="text-sm font-medium text-slate-700">Email</span>
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
          <span className="text-sm font-medium text-slate-700">Contraseña</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={claseCampo}
          />
          <span className="block text-xs text-slate-500">Al menos 8 caracteres</span>
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Teléfono (opcional)</span>
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
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={enviando}
          className="w-full rounded-lg bg-slate-800 px-4 py-2 font-medium text-white hover:bg-slate-700 disabled:opacity-60"
        >
          {enviando ? 'Creando la cuenta…' : 'Crear cuenta'}
        </button>

        <p className="text-center text-sm text-slate-600">
          ¿Ya tenés cuenta?{' '}
          <Link to="/login" state={state} className="font-medium text-slate-800 underline">
            Iniciá sesión
          </Link>
        </p>
      </form>
    </main>
  );
}
