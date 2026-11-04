import { z } from 'zod';
import { fechaSchema, type Referencia } from './comun';
import type { MotivoMerma } from './stock';
import type { Franja } from './sucursal';

// Consulta de métricas (CU-19). Las fechas son AAAA-MM-DD de Argentina.

export const DIAS_PERIODO_MAXIMO = 366;
export const DIAS_PERIODO_PREDETERMINADO = 30;

export const consultaMetricasSchema = z
  .object({
    desde: fechaSchema.optional(),
    hasta: fechaSchema.optional(),
    sucursalId: z.uuid().optional(),
  })
  .superRefine((consulta, ctx) => {
    if (consulta.desde && consulta.hasta) {
      const error = errorDePeriodo(consulta.desde, consulta.hasta);
      if (error) ctx.addIssue({ code: 'custom', message: error, path: ['hasta'] });
    }
  });

export type ConsultaMetricas = z.infer<typeof consultaMetricasSchema>;

const MS_DIA = 86_400_000;

function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / MS_DIA);
}

function sumarDiasFecha(fecha: string, dias: number): string {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * MS_DIA).toISOString().slice(0, 10);
}

// Mensaje de error del período, o null si es válido.
export function errorDePeriodo(desde: string, hasta: string): string | null {
  if (desde > hasta) return 'La fecha de inicio no puede ser posterior a la de fin';
  if (diasEntre(desde, hasta) + 1 > DIAS_PERIODO_MAXIMO) {
    return `El período no puede superar los ${DIAS_PERIODO_MAXIMO} días`;
  }
  return null;
}

// Sin fechas: los últimos 30 días hasta ayer. `hoy` es la fecha de Argentina.
export function resolverPeriodo(
  consulta: Pick<ConsultaMetricas, 'desde' | 'hasta'>,
  hoy: string,
): { desde: string; hasta: string } {
  const hasta = consulta.hasta ?? sumarDiasFecha(hoy, -1);
  const desde = consulta.desde ?? sumarDiasFecha(hasta, -(DIAS_PERIODO_PREDETERMINADO - 1));
  return { desde, hasta };
}

export interface Metricas {
  periodo: { desde: string; hasta: string };
  // Sucursales que el usuario puede elegir, y cómo se llama el total (null con una sola).
  alcance: {
    sucursales: Referencia[];
    etiquetaTotal: 'Todas las sucursales' | 'Mis sucursales' | null;
  };
  ventas: { total: number; porDia: { fecha: string; monto: number }[] };
  platosMasPedidos: { itemMenuId: string; nombre: string; unidades: number }[];
  margenPorPlato: {
    itemMenuId: string;
    nombre: string;
    unidades: number;
    precioPromedio: number;
    costo: number | null;
    margenUnitario: number | null;
    margenTotal: number | null;
  }[];
  merma: { total: number; porMotivo: { motivo: MotivoMerma; valor: number }[] };
  ocupacion: {
    porcentaje: number | null;
    porFranja: { franja: Franja; porcentaje: number | null }[];
  };
  proyeccion: {
    total: number;
    semanaDesde: string;
    excluidas: { sucursal: string; semanas: number; minimo: number }[];
    sinPronostico: string[];
  };
}
