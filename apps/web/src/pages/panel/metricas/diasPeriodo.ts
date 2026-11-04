import { sumarDias } from '../../../lib/formato';

export interface VentaDia {
  fecha: string;
  monto: number;
}

// La API omite los días sin ventas: el gráfico los completa con cero, uno por día del período.
export function completarDias(desde: string, hasta: string, porDia: VentaDia[]): VentaDia[] {
  const montos = new Map(porDia.map((d) => [d.fecha, d.monto]));
  const dias: VentaDia[] = [];
  for (let fecha = desde; fecha <= hasta; fecha = sumarDias(fecha, 1)) {
    dias.push({ fecha, monto: montos.get(fecha) ?? 0 });
  }
  return dias;
}
