import { MINUTOS_ANTES_ACTIVACION, hoyArgentina, type EstadoReserva } from '@pgim/shared';

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

// Agrupa por día de Argentina y conserva el orden de la lista.
export function agruparPorDia<T extends { inicio: string }>(reservas: T[]) {
  const dias = new Map<string, T[]>();
  for (const r of reservas) {
    const fecha = hoyArgentina(new Date(r.inicio));
    dias.set(fecha, [...(dias.get(fecha) ?? []), r]);
  }
  return [...dias].map(([fecha, filas]) => ({ fecha, filas }));
}
