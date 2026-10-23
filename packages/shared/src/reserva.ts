// CU-03, CU-12 y CU-21: reservas de mesa por franja de 1 h.

export const ESTADOS_RESERVA = [
  'PENDIENTE',
  'ACTIVA',
  'FINALIZADA',
  'CANCELADA',
  'VENCIDA',
] as const;
export type EstadoReserva = (typeof ESTADOS_RESERVA)[number];

export const DIAS_ANTICIPACION_RESERVA = 30;
// La reserva se puede activar desde este margen antes del inicio de la franja.
export const MINUTOS_ANTES_ACTIVACION = 30;
export const MAX_PERSONAS_RESERVA = 20;
