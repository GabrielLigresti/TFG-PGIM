import { aFecha } from '../repositories/apertura.repository';

// Instante en que arranca el día `fecha` (AAAA-MM-DD) en Argentina (UTC−3 fijo):
// las 03:00 UTC.
export const inicioDeDiaArgentina = (fecha: string) =>
  new Date(aFecha(fecha).getTime() + 3 * 3_600_000);
