import { z } from 'zod';

// Piezas de validación que reutilizan los ABM.

export const idParamSchema = z.object({ id: z.uuid() });

export const nombreSchema = z.string().trim().min(1, 'Ingresá un nombre').max(100);

export interface Referencia {
  id: string;
  nombre: string;
}

// Horas "HH:mm". Un fin de 00:00 se lee como 24:00 (medianoche), así que
// "12:00 a 00:00" es válido y "inicio < fin" alcanza como regla.
export const horaSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida: usá el formato HH:mm');

export function minutosInicio(hora: string): number {
  const [h, m] = hora.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

export function minutosFin(hora: string): number {
  return hora === '00:00' ? 24 * 60 : minutosInicio(hora);
}
