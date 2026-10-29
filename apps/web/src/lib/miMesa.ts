import { useEffect, useRef } from 'react';
import { EVENTOS_SOCKET, type MiMesa } from '@pgim/shared';
import { useEventoSocket } from './socket';
import { useRecurso } from './useRecurso';

// Avisos que llegan juntos (un pedido cambia y con él la mesa) se juntan en
// una sola recarga.
const ESPERA_RECARGA_MS = 150;

// La mesa abierta del comensal ("Mi mesa") en esa sucursal o, sin sucursal, en
// cualquiera; null si no tiene una activa. Se recarga cuando cambia el estado
// de un pedido, se resuelve un pago o se cierra la mesa. Con activo = false no
// consulta (la pantalla ya la tiene).
export function useMiMesa(sucursalId: string | null, activo = true) {
  const recurso = useRecurso<MiMesa | null>(
    activo ? `/comensal/mesa${sucursalId ? `?sucursalId=${sucursalId}` : ''}` : null,
  );
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { recargar } = recurso;
  useEffect(
    () => () => {
      if (espera.current) clearTimeout(espera.current);
    },
    [],
  );
  const recargarAgrupado = () => {
    if (!activo || espera.current) return;
    espera.current = setTimeout(() => {
      espera.current = null;
      recargar();
    }, ESPERA_RECARGA_MS);
  };
  useEventoSocket(EVENTOS_SOCKET.pedidoCambio, recargarAgrupado);
  useEventoSocket(EVENTOS_SOCKET.mesaCambio, recargarAgrupado);
  return recurso;
}
