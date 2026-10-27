import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ApiError } from '../lib/api';
import { useSesion } from '../auth/SesionProvider';

// Flujo B del CU-01: el empleado de varias sucursales elige dónde trabaja.
export function SeleccionarSucursalPage() {
  const { sesion, seleccionarSucursal, logout } = useSesion();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  async function elegir(sucursalId: string) {
    setError(null);
    try {
      await seleccionarSucursal(sucursalId);
      navigate('/panel', { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo elegir la sucursal');
    }
  }

  const sucursales = sesion?.sucursales ?? [];

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm space-y-4 rounded-panel border border-line bg-surface p-6">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold text-ink">¿En qué sucursal trabajás hoy?</h1>
          <p className="text-sm text-meta">{sesion?.restaurante?.nombre}</p>
        </div>

        {sucursales.length === 0 ? (
          <p className="text-center text-sm text-meta">
            No tenés sucursales asignadas. Pedile al administrador que te asigne una.
          </p>
        ) : (
          <ul className="space-y-2">
            {sucursales.map((sucursal) => (
              <li key={sucursal.id}>
                <button
                  type="button"
                  onClick={() => elegir(sucursal.id)}
                  className="w-full rounded-control border border-line-strong px-4 py-3 text-left font-medium text-text hover:border-accent hover:bg-panel"
                >
                  {sucursal.nombre}
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <p role="alert" className="rounded-control bg-bad-soft px-3 py-2 text-sm text-bad">
            {error}
          </p>
        )}

        <button type="button" onClick={logout} className="w-full text-sm text-meta hover:text-text">
          Cerrar sesión
        </button>
      </div>
    </main>
  );
}
