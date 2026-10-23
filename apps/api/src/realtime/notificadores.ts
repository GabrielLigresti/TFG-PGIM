import type { Server } from 'socket.io';
import {
  EVENTOS_SOCKET,
  salaComensal,
  salaSucursal,
  type CambioReserva,
  type CambioSalon,
} from '@pgim/shared';
import type { BusEventos } from '../domain/eventos';

// Oyentes del bus de eventos que avisan por Socket.IO. Son efectos
// secundarios: si un aviso no llega, la reserva ya quedó guardada igual.
export function registrarNotificadores(io: Pick<Server, 'to'>, bus: BusEventos): () => void {
  // NotificadorSalon: la mesa cambió de estado en esa franja.
  const dejarSalon = bus.suscribir(({ reserva }) => {
    const cambio: CambioSalon = {
      sucursalId: reserva.sucursalId,
      inicio: reserva.inicio.toISOString(),
      mesaId: reserva.mesaId,
    };
    io.to(salaSucursal(reserva.sucursalId)).emit(EVENTOS_SOCKET.cambioSalon, cambio);
  });

  // NotificadorComensal: el titular ve el estado nuevo de su reserva.
  const dejarComensal = bus.suscribir(({ reserva }) => {
    const cambio: CambioReserva = { id: reserva.id, estado: reserva.estado };
    io.to(salaComensal(reserva.comensalId)).emit(EVENTOS_SOCKET.cambioReserva, cambio);
  });

  return () => {
    dejarSalon();
    dejarComensal();
  };
}
