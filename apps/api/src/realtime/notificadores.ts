import type { Server } from 'socket.io';
import {
  EVENTOS_SOCKET,
  salaComensal,
  salaPersonal,
  salaSucursal,
  type CambioMesa,
  type CambioReserva,
  type CambioSalon,
} from '@pgim/shared';
import { esEventoReserva, type BusEventos } from '../domain/eventos';

// Oyentes del bus de eventos que avisan por Socket.IO. Son efectos
// secundarios: si un aviso no llega, la operación ya quedó guardada igual.
export function registrarNotificadores(io: Pick<Server, 'to'>, bus: BusEventos): () => void {
  // NotificadorSalon: la mesa cambió de estado en esa franja. La sala de la
  // sucursal la sigue cualquier sesión, así que no lleva datos de pedidos.
  const dejarSalon = bus.suscribir((evento) => {
    if (!esEventoReserva(evento)) return;
    const { reserva } = evento;
    const cambio: CambioSalon = {
      sucursalId: reserva.sucursalId,
      inicio: reserva.inicio.toISOString(),
      mesaId: reserva.mesaId,
    };
    io.to(salaSucursal(reserva.sucursalId)).emit(EVENTOS_SOCKET.cambioSalon, cambio);
  });

  // NotificadorComensal: el titular ve su reserva, sus pedidos y su mesa.
  const dejarComensal = bus.suscribir((evento) => {
    if (esEventoReserva(evento)) {
      const cambio: CambioReserva = { id: evento.reserva.id, estado: evento.reserva.estado };
      io.to(salaComensal(evento.reserva.comensalId)).emit(EVENTOS_SOCKET.cambioReserva, cambio);
      return;
    }
    switch (evento.tipo) {
      case 'PEDIDO_CAMBIO_ESTADO':
      case 'PEDIDO_CANCELADO':
        io.to(salaComensal(evento.comensalId)).emit(EVENTOS_SOCKET.pedidoCambio, evento.cambio);
        break;
      case 'PAGO_APROBADO':
      case 'PAGO_RECHAZADO':
      case 'CUENTA_MESA_CERRADA': {
        const cambio: CambioMesa = { cuentaMesaId: evento.cuentaMesaId };
        io.to(salaComensal(evento.comensalId)).emit(EVENTOS_SOCKET.mesaCambio, cambio);
        break;
      }
    }
  });

  // NotificadorStaff: cola de cocina y alertas, solo para el personal.
  const dejarStaff = bus.suscribir((evento) => {
    switch (evento.tipo) {
      case 'PEDIDO_CONFIRMADO':
        io.to(salaPersonal(evento.sucursalId)).emit(EVENTOS_SOCKET.pedidoNuevo, evento.pedido);
        break;
      case 'PEDIDO_CAMBIO_ESTADO':
      case 'PEDIDO_CANCELADO':
        io.to(salaPersonal(evento.sucursalId)).emit(EVENTOS_SOCKET.pedidoCambio, evento.cambio);
        break;
      case 'ALERTA_CREADA':
        io.to(salaPersonal(evento.sucursalId)).emit(EVENTOS_SOCKET.alertaNueva, evento.alerta);
        break;
    }
  });

  return () => {
    dejarSalon();
    dejarComensal();
    dejarStaff();
  };
}
