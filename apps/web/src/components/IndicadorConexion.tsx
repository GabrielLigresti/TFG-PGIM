import { Radio, WifiOff } from 'lucide-react';
import type { useConexionSocket } from '../lib/socket';

export function IndicadorConexion({ estado }: { estado: ReturnType<typeof useConexionSocket> }) {
  if (estado === 'conectando') {
    return <span className="text-sm text-meta">Conectando…</span>;
  }
  if (estado === 'en-vivo') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ok">
        <Radio aria-hidden className="size-4" />
        En vivo
      </span>
    );
  }
  return (
    <span role="status" className="inline-flex items-center gap-1.5 text-sm font-semibold text-bad">
      <WifiOff aria-hidden className="size-4" />
      {estado === 'reintentando' ? 'Sin conexión. Reintentando…' : 'Sin conexión'}
    </span>
  );
}
