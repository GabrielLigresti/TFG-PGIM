import { minutosFin, minutosInicio } from '@pgim/shared';
import type { HorarioServicioDatos } from './pronostico';

// Duración de una franja en horas. Si cruza la medianoche (fin <= inicio,
// salvo 00:00, que es 24:00), el fin cae al día siguiente.
export function horasDeFranja(horario: HorarioServicioDatos): number {
  const inicio = minutosInicio(horario.horaInicio);
  let fin = minutosFin(horario.horaFin);
  if (fin <= inicio) fin += 24 * 60;
  return (fin - inicio) / 60;
}

// Cubiertos que entran en una franja: suma de capacidades de las mesas activas
// por los bloques de 1 h enteros. La comparten el verificador y CU-19.
export function capacidadDeFranja(capacidadMesas: number[], horas: number): number {
  const total = capacidadMesas.reduce((suma, c) => suma + c, 0);
  return total * Math.floor(horas);
}
