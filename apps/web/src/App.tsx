import { useEffect, useState } from 'react';
import { API_PREFIX, healthResponseSchema } from '@pgim/shared';

type EstadoApi = 'verificando' | 'ok' | 'sin conexión';

export default function App() {
  const [estadoApi, setEstadoApi] = useState<EstadoApi>('verificando');

  useEffect(() => {
    fetch(`${API_PREFIX}/health`)
      .then((res) => res.json())
      .then((body) => setEstadoApi(healthResponseSchema.parse(body).status))
      .catch(() => setEstadoApi('sin conexión'));
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 bg-slate-50 px-4 text-slate-800">
      <h1 className="text-3xl font-semibold">PGIM</h1>
      <p className="text-sm text-slate-500">Estado de la API: {estadoApi}</p>
    </main>
  );
}
