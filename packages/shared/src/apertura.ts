import { z } from 'zod';
import { emailSchema, passwordSchema } from './auth';
import { nombreSchema } from './comun';
import { sucursalRegistroSchema, type Franja } from './sucursal';

// Debe coincidir con el enum MetodoPronostico de Prisma.
export const METODOS_PRONOSTICO = [
  'PROMEDIO_MOVIL_PONDERADO',
  'NAIVE_ESTACIONAL',
  'REGRESION_ESTACIONAL',
] as const;
export type MetodoPronostico = (typeof METODOS_PRONOSTICO)[number];

export const ETIQUETA_METODO_PRONOSTICO: Record<MetodoPronostico, string> = {
  PROMEDIO_MOVIL_PONDERADO: 'Promedio de semanas recientes',
  NAIVE_ESTACIONAL: 'Repetición de la misma semana anterior',
  REGRESION_ESTACIONAL: 'Tendencia con patrón semanal',
};

export const CONFIGURACION_APERTURA_POR_DEFECTO = {
  semanasHistoricoMinimo: 8,
  cubiertosPorMozo: 20,
  platosPorCocineroHora: 12,
} as const;

const coeficienteSchema = z.number().gt(0, 'Tiene que ser mayor que 0').max(999);

export const configuracionAperturaSchema = z.object({
  semanasHistoricoMinimo: z.number().int().min(5).max(52),
  cubiertosPorMozo: coeficienteSchema,
  platosPorCocineroHora: coeficienteSchema,
});

export type ConfiguracionApertura = z.infer<typeof configuracionAperturaSchema>;

// CU-11. El CUIT se guarda sin guiones.
export const cuitSchema = z
  .string()
  .trim()
  .transform((c) => c.replace(/-/g, ''))
  .pipe(z.string().regex(/^\d{11}$/, 'El CUIT tiene que tener 11 dígitos'));

export const registroRestauranteSchema = z.object({
  restaurante: z.object({ nombre: nombreSchema, cuit: cuitSchema }),
  sucursal: sucursalRegistroSchema,
  administrador: z.object({
    nombreCompleto: z.string().trim().min(1, 'Ingresá el nombre').max(120),
    email: emailSchema,
    password: passwordSchema,
  }),
});

export type RegistroRestaurante = z.infer<typeof registroRestauranteSchema>;

export interface ProgresoDatos {
  semanas: number;
  minimo: number;
  suficiente: boolean;
}

export interface PronosticoFranja {
  fecha: string; // AAAA-MM-DD
  franja: Franja;
  cubiertosEstimados: number;
  limiteInferior: number;
  limiteSuperior: number;
  ingresoEstimado: number;
  metodo: MetodoPronostico;
  errorMape: number;
  demanda: { itemMenuId: string; nombre: string; cantidad: number }[];
}

export interface AsistenteApertura {
  semanaDesde: string; // AAAA-MM-DD
  progreso: ProgresoDatos;
  pronosticos: PronosticoFranja[];
}

// Tipos de alerta que genera el simulador de apertura; coinciden con los
// valores de TipoAlerta de Prisma.
export type TipoAlertaSimulador =
  'FALTANTE_STOCK_PREVISTO' | 'CAPACIDAD_MESAS' | 'FALTANTE_PERSONAL';
