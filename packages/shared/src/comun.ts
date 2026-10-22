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

// Fechas "AAAA-MM-DD" (columnas date). El día se toma en hora de Argentina,
// como fija la convención del DER.
export const fechaSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida: usá el formato AAAA-MM-DD');

const formatoFecha = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
});

export function hoyArgentina(ahora: Date = new Date()): string {
  return formatoFecha.format(ahora);
}
