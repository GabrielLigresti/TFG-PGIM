import { ETIQUETA_UNIDAD, type UnidadMedida } from '@pgim/shared';

const pesos = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 2,
});

const numero = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 });

const lista = new Intl.ListFormat('es', { type: 'conjunction' });

export const formatoLista = (elementos: string[]) => lista.format(elementos);

export const formatoPesos = (valor: number) => pesos.format(valor);

export const formatoCantidad = (valor: number, unidad?: UnidadMedida) =>
  unidad ? `${numero.format(valor)} ${ETIQUETA_UNIDAD[unidad]}` : numero.format(valor);

// Los inputs numéricos se manejan como texto; vacío o inválido es NaN y lo
// rechaza la validación de la API con su mensaje.
export const aNumero = (texto: string) =>
  texto.trim() === '' ? Number.NaN : Number(texto.replace(',', '.'));

export const NOMBRE_UNIDAD: Record<UnidadMedida, string> = {
  GRAMO: 'Gramos (g)',
  KILOGRAMO: 'Kilogramos (kg)',
  MILILITRO: 'Mililitros (ml)',
  LITRO: 'Litros (l)',
  UNIDAD: 'Unidades',
};

// "AAAA-MM-DD" → "21/09/2026", sin pasar por Date para que la zona horaria no corra el día.
export const formatoFecha = (fecha: string) => fecha.split('-').reverse().join('/');

const ZONA_ARGENTINA = 'America/Argentina/Buenos_Aires';

const hora = new Intl.DateTimeFormat('es-AR', {
  timeZone: ZONA_ARGENTINA,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const diaYHora = new Intl.DateTimeFormat('es-AR', {
  timeZone: ZONA_ARGENTINA,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// Instantes ISO (UTC) mostrados en hora de Argentina.
export const formatoHora = (instante: string) => hora.format(new Date(instante));
export const formatoDiaYHora = (instante: string) => diaYHora.format(new Date(instante));

// "AAAA-MM-DD" más n días, sin hora local.
export function sumarDias(fecha: string, dias: number): string {
  const [anio, mes, dia] = fecha.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(anio, mes - 1, dia + dias)).toISOString().slice(0, 10);
}
