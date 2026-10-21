import { useSesion } from '../auth/SesionProvider';

export function InicioComensalPage() {
  const { sesion, logout } = useSesion();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 px-4 text-center">
      <h1 className="text-2xl font-semibold text-slate-800">Hola, {sesion?.usuario.nombre}</h1>
      <p className="text-sm text-slate-500">Las reservas y los pedidos van a aparecer acá.</p>
      <button
        type="button"
        onClick={logout}
        className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
      >
        Cerrar sesión
      </button>
    </main>
  );
}
