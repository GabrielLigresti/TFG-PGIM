import type { AlertaPanel, CambioPedido, EstadoReserva, PedidoCola } from '@pgim/shared';

// Bus de eventos de dominio (Observer). Se publica después de que la escritura
// quedó confirmada en la base, y solo para efectos secundarios (avisos en
// tiempo real, alertas y visitas): stock, puntos y pagos nunca dependen de un evento, se
// resuelven con llamadas directas dentro de la transacción.

export type TipoEventoReserva =
  | 'RESERVA_CREADA'
  | 'RESERVA_CANCELADA'
  | 'RESERVA_ACTIVADA'
  | 'RESERVA_VENCIDA'
  | 'RESERVA_FINALIZADA';

export interface ReservaDelEvento {
  id: string;
  sucursalId: string;
  comensalId: string;
  mesaId: string;
  inicio: Date;
  estado: EstadoReserva;
}

export interface EventoReserva {
  tipo: TipoEventoReserva;
  reserva: ReservaDelEvento;
}

// Cada evento lleva la sucursal y el titular para que los notificadores
// elijan la sala sin volver a la base.
export type EventoDominio =
  | EventoReserva
  | { tipo: 'PEDIDO_CONFIRMADO'; pedido: PedidoCola; sucursalId: string; comensalId: string }
  | {
      tipo: 'PEDIDO_CAMBIO_ESTADO' | 'PEDIDO_CANCELADO';
      cambio: CambioPedido;
      sucursalId: string;
      comensalId: string;
    }
  | { tipo: 'PAGO_APROBADO'; cuentaMesaId: string; comensalId: string }
  | { tipo: 'CUENTA_MESA_CERRADA'; cuentaMesaId: string; restauranteId: string; comensalId: string }
  // Secuencia de CU-04, 5a y 5b: las guarda GeneradorAlertas.
  | { tipo: 'STOCK_INSUFICIENTE'; sucursalId: string; componenteId: string; itemMenuId: string }
  | { tipo: 'PLATO_SIN_RECETA'; sucursalId: string; itemMenuId: string }
  | { tipo: 'ALERTA_CREADA'; sucursalId: string; alerta: AlertaPanel };

export type OyenteEventos = (evento: EventoDominio) => void;

export function esEventoReserva(evento: EventoDominio): evento is EventoReserva {
  return evento.tipo.startsWith('RESERVA_');
}

export interface BusEventos {
  publicar(evento: EventoDominio): void;
  suscribir(oyente: OyenteEventos): () => void;
}

export function crearBusEventos(): BusEventos {
  const oyentes = new Set<OyenteEventos>();
  return {
    // Síncrono: un oyente que falla se registra y no afecta a los demás ni a
    // la operación que publicó, que ya está confirmada.
    publicar(evento) {
      for (const oyente of oyentes) {
        try {
          oyente(evento);
        } catch (e) {
          console.error('Error en un oyente de eventos', e);
        }
      }
    },
    suscribir(oyente) {
      oyentes.add(oyente);
      return () => {
        oyentes.delete(oyente);
      };
    },
  };
}

export const busEventos = crearBusEventos();
