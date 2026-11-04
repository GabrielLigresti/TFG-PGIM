import type { Server } from 'socket.io';
import {
  EVENTOS_SOCKET,
  salaComensal,
  salaPersonal,
  salaSucursal,
  tiposAlertaVisibles,
  type CambioMesa,
  type Sesion,
  type ResultadoPago,
  type CambioReserva,
  type CambioSalon,
} from '@pgim/shared';
import { esEventoReserva, type BusEventos } from '../domain/eventos';

// Oyentes del bus de eventos que avisan por Socket.IO. Son efectos
// secundarios: si un aviso no llega, la operación ya quedó guardada igual.
export function registrarNotificadores(io: Pick<Server, 'to' | 'in'>, bus: BusEventos): () => void {
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
      case 'PAGO_RECHAZADO': {
        const aprobado = evento.tipo === 'PAGO_APROBADO';
        const resultado: ResultadoPago = {
          pagoId: evento.pagoId,
          cuentaMesaId: evento.cuentaMesaId,
          estado: aprobado ? 'APROBADO' : 'RECHAZADO',
          puntosSumados: aprobado ? evento.puntosSumados : 0,
          desbloqueados: aprobado ? evento.desbloqueados : [],
        };
        io.to(salaComensal(evento.comensalId)).emit(EVENTOS_SOCKET.pagoResultado, resultado);
        const cambio: CambioMesa = { cuentaMesaId: evento.cuentaMesaId };
        io.to(salaComensal(evento.comensalId)).emit(EVENTOS_SOCKET.mesaCambio, cambio);
        break;
      }
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
      // Cada alerta depende de un permiso distinto (stock o reservas), así que no
      // va a la sala: se emite solo a los sockets de la sucursal cuya sesión la ve.
      case 'ALERTA_CREADA': {
        const { sucursalId, alerta } = evento;
        void io
          .in(salaSucursal(sucursalId))
          .fetchSockets()
          .then((sockets) => {
            for (const socket of sockets) {
              const sesion = socket.data.sesion as Sesion | undefined;
              if (sesion?.usuario.tipo !== 'EMPLEADO') continue;
              if (sesion.sucursalActiva?.id !== sucursalId) continue;
              if (!tiposAlertaVisibles(sesion.permisos).includes(alerta.tipo)) continue;
              socket.emit(EVENTOS_SOCKET.alertaNueva, alerta);
            }
          })
          .catch(() => {}); // efecto secundario: la alerta ya está guardada
        break;
      }
      // Aviso a toda la sucursal, sin datos: cada empleado consulta sus turnos.
      case 'PLANIFICACION_CONFIRMADA':
        io.to(salaSucursal(evento.sucursalId)).emit(EVENTOS_SOCKET.turnosPublicados);
        break;
    }
  });

  return () => {
    dejarSalon();
    dejarComensal();
    dejarStaff();
  };
}
