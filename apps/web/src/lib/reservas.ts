import { MINUTOS_ANTES_ACTIVACION, type EstadoReserva } from '@pgim/shared';

// Las mismas reglas que valida la API (patrón State de la reserva), calculadas
// con el reloj de la pantalla para mostrar u ocultar los botones a tiempo.

export function esActivable(
  r: { estado: EstadoReserva; inicio: string; limiteLlegada: string },
  ahora: number,
): boolean {
  const desde = Date.parse(r.inicio) - MINUTOS_ANTES_ACTIVACION * 60_000;
  return r.estado === 'PENDIENTE' && ahora >= desde && ahora <= Date.parse(r.limiteLlegada);
}

export function esCancelable(r: { estado: EstadoReserva; inicio: string }, ahora: number) {
  return r.estado === 'PENDIENTE' && ahora < Date.parse(r.inicio);
}
