import { EVENTOS_SOCKET, type MiMesa } from '@pgim/shared';
import { useEventoSocket } from './socket';
import { useRecurso } from './useRecurso';

// La mesa abierta del comensal ("Mi mesa") en esa sucursal o, sin sucursal, en
// cualquiera; null si no tiene una activa. Se recarga cuando cambia el estado
// de un pedido, se aprueba un pago o se cierra la mesa.
export function useMiMesa(sucursalId: string | null) {
  const recurso = useRecurso<MiMesa | null>(
    `/comensal/mesa${sucursalId ? `?sucursalId=${sucursalId}` : ''}`,
  );
  useEventoSocket(EVENTOS_SOCKET.pedidoCambio, recurso.recargar);
  useEventoSocket(EVENTOS_SOCKET.mesaCambio, recurso.recargar);
  return recurso;
}
