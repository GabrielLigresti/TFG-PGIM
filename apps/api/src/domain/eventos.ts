import type { EstadoReserva } from '@pgim/shared';

// Bus de eventos de dominio (Observer). Se publica después de que la escritura
// quedó confirmada en la base, y solo para efectos secundarios (avisos en
// tiempo real): stock, puntos y pagos nunca dependen de un evento, se
// resuelven con llamadas directas dentro de la transacción.

export type TipoEventoReserva =
  'RESERVA_CREADA' | 'RESERVA_CANCELADA' | 'RESERVA_ACTIVADA' | 'RESERVA_VENCIDA';

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

export type OyenteEventos = (evento: EventoReserva) => void;

export interface BusEventos {
  publicar(evento: EventoReserva): void;
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
