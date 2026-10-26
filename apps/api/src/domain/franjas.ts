import { DIAS_ANTICIPACION_RESERVA, hoyArgentina, minutosFin, minutosInicio } from '@pgim/shared';

// Franjas de reserva de 1 h a la hora en punto (decisión de reservas por
// franja de 1 h). Las fechas y horas son de Argentina, UTC−3 fijo sin horario
// de verano; los instantes viajan en UTC.

const DESFASE_ARGENTINA_H = 3;

export interface MesaCandidata {
  id: string;
  numero: number;
  capacidad: number;
}

function partes(fecha: string): [number, number, number] {
  return fecha.split('-').map(Number) as [number, number, number];
}

// Inicios de las franjas de una fecha (AAAA-MM-DD), en UTC. Un cierre a 00:00
// es medianoche, así que la última franja empieza a las 23:00.
export function iniciosDelDia(fecha: string, apertura: string, cierre: string): Date[] {
  const [anio, mes, dia] = partes(fecha);
  const fin = minutosFin(cierre);
  const inicios: Date[] = [];
  for (let h = Math.ceil(minutosInicio(apertura) / 60); h * 60 + 60 <= fin; h++) {
    // Date.UTC resuelve el pase al día siguiente cuando h + 3 ≥ 24.
    inicios.push(new Date(Date.UTC(anio, mes - 1, dia, h + DESFASE_ARGENTINA_H)));
  }
  return inicios;
}

// Fecha de Argentina de un instante (AAAA-MM-DD).
export function fechaDe(instante: Date): string {
  return hoyArgentina(instante);
}

export function sumarDias(fecha: string, dias: number): string {
  const [anio, mes, dia] = partes(fecha);
  return new Date(Date.UTC(anio, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

// Desde hoy hasta DIAS_ANTICIPACION_RESERVA días después, inclusive. Las
// fechas AAAA-MM-DD se comparan como texto.
export function esFechaReservable(fecha: string, ahora: Date): boolean {
  const hoy = fechaDe(ahora);
  return fecha >= hoy && fecha <= sumarDias(hoy, DIAS_ANTICIPACION_RESERVA);
}

// La mesa libre de menor capacidad que alcanza; a igual capacidad, la de menor
// número. Así quedan libres las mesas grandes para los grupos grandes.
export function elegirMesa<T extends MesaCandidata>(
  mesas: T[],
  ocupadas: ReadonlySet<string>,
  personas: number,
): T | null {
  const candidatas = mesas
    .filter((m) => m.capacidad >= personas && !ocupadas.has(m.id))
    .sort((a, b) => a.capacidad - b.capacidad || a.numero - b.numero);
  return candidatas[0] ?? null;
}
