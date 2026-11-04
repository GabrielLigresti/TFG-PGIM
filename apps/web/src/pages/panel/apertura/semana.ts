import type { Franja } from '@pgim/shared';

export const NOMBRE_FRANJA: Record<Franja, string> = { ALMUERZO: 'Almuerzo', CENA: 'Cena' };
export const ORDEN_FRANJA: Franja[] = ['ALMUERZO', 'CENA'];
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// "AAAA-MM-DD" → índice de día de la semana, sin zona horaria (0 = domingo).
function diaDeSemana(fecha: string): number {
  const [a, m, d] = fecha.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

export const diaMes = (fecha: string) => fecha.slice(8, 10) + '/' + fecha.slice(5, 7);
export const nombreDia = (fecha: string) => DIAS[diaDeSemana(fecha)]!;
export const diaLargo = (fecha: string) => `${nombreDia(fecha)} ${diaMes(fecha)}`;
export const diaCorto = (fecha: string) => `${nombreDia(fecha).slice(0, 3)} ${diaMes(fecha)}`;
export const diaMinuscula = (fecha: string) =>
  `${nombreDia(fecha).slice(0, 3).toLowerCase()} ${diaMes(fecha)}`;

export const clave = (p: { fecha: string; franja: Franja }) => `${p.fecha}|${p.franja}`;
