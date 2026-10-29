import { z } from 'zod';
import type { Referencia } from './comun';
import { UNIDADES_MEDIDA, type TipoComponente, type UnidadBase } from './inventario';

// Mismo orden y valores que los enums del schema de Prisma.
export const MOTIVOS_MERMA = [
  'VENCIMIENTO',
  'DETERIORO',
  'PREPARACION',
  'SOBREPRODUCCION',
  'ERROR',
  'DEVUELTO_POR_CLIENTE',
  'RECEPCION',
  'OTRO',
] as const;
export type MotivoMerma = (typeof MOTIVOS_MERMA)[number];

export const ETIQUETA_MOTIVO_MERMA: Record<MotivoMerma, string> = {
  VENCIMIENTO: 'Vencimiento',
  DETERIORO: 'Deterioro',
  PREPARACION: 'Preparación o recorte',
  SOBREPRODUCCION: 'Sobreproducción',
  ERROR: 'Error o accidente',
  DEVUELTO_POR_CLIENTE: 'Devuelto por el cliente',
  RECEPCION: 'Recepción',
  OTRO: 'Otro',
};

export const TIPOS_MOVIMIENTO = [
  'INGRESO',
  'CONSUMO_PEDIDO',
  'DEVOLUCION_PEDIDO',
  'MERMA',
  'AJUSTE',
  'PRODUCCION',
  'CONSUMO_PRODUCCION',
] as const;
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];

export const ETIQUETA_TIPO_MOVIMIENTO: Record<TipoMovimiento, string> = {
  INGRESO: 'Ingreso',
  CONSUMO_PEDIDO: 'Consumo por pedido',
  DEVOLUCION_PEDIDO: 'Devolución por cancelación',
  MERMA: 'Merma',
  AJUSTE: 'Ajuste por conteo',
  PRODUCCION: 'Producción',
  CONSUMO_PRODUCCION: 'Consumo de producción',
};

// ─── Esquemas de entrada ─────────────────────────────────────────────────────

const unidadSchema = z.enum(UNIDADES_MEDIDA);
const observacionSchema = z.string().trim().max(200).optional();
const cantidadPositiva = z.number().positive('La cantidad debe ser mayor a cero').max(1e9);

export const movimientoInputSchema = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('INGRESO'),
    componenteId: z.uuid(),
    cantidad: cantidadPositiva,
    unidad: unidadSchema,
    // Costo por la unidad elegida.
    costoUnitario: z.number().min(0, 'El costo no puede ser negativo').max(1e9),
    observacion: observacionSchema,
  }),
  z.object({
    tipo: z.literal('MERMA'),
    componenteId: z.uuid(),
    cantidad: cantidadPositiva,
    unidad: unidadSchema,
    motivoMerma: z.enum(MOTIVOS_MERMA),
    observacion: observacionSchema,
  }),
  z.object({
    tipo: z.literal('AJUSTE'),
    componenteId: z.uuid(),
    cantidadContada: z.number().min(0, 'La cantidad no puede ser negativa').max(1e9),
    unidad: unidadSchema,
    motivo: z.string().trim().min(1, 'Indicá el motivo').max(200),
  }),
]);

export type MovimientoInput = z.infer<typeof movimientoInputSchema>;

export const tandaInputSchema = z.object({
  intermedioId: z.uuid(),
  cantidadPlaneada: cantidadPositiva,
  unidad: unidadSchema,
  // En la misma unidad que la cantidad planeada.
  cantidadObtenida: cantidadPositiva,
  consumos: z
    .array(
      z.object({
        componenteId: z.uuid(),
        cantidad: cantidadPositiva,
        unidad: unidadSchema,
      }),
    )
    .min(1, 'La tanda necesita al menos un consumo')
    .max(50),
  observacion: observacionSchema,
});

export type TandaInput = z.infer<typeof tandaInputSchema>;

const paginaSchema = z.coerce.number().int().min(1).default(1);

export const planTandaQuerySchema = z.object({
  intermedioId: z.uuid(),
  cantidad: z.coerce.number().positive(),
  unidad: unidadSchema,
});

export const movimientosQuerySchema = z.object({
  componenteId: z.uuid().optional(),
  tipo: z.enum(TIPOS_MOVIMIENTO).optional(),
  motivoMerma: z.enum(MOTIVOS_MERMA).optional(),
  pagina: paginaSchema,
});

export const tandasQuerySchema = z.object({
  intermedioId: z.uuid().optional(),
  pagina: paginaSchema,
});

// ─── Respuestas ──────────────────────────────────────────────────────────────
// Las cantidades van en unidad base y positivas, salvo MovimientoStockFila.cantidad (con signo).

export interface ComponenteStock {
  id: string;
  nombre: string;
  tipo: TipoComponente;
  unidadBase: UnidadBase;
  activo: boolean;
  // Existencia en la sucursal de trabajo; 0 si todavía no tiene fila.
  existencia: number;
  costoCompraVigente: number | null;
}

interface ComponenteRef {
  id: string;
  nombre: string;
  unidadBase: UnidadBase;
}

export interface MovimientoStockFila {
  id: string;
  fecha: string;
  componente: ComponenteRef;
  tipo: TipoMovimiento;
  cantidad: number;
  costoUnitario: number;
  motivoMerma: MotivoMerma | null;
  motivo: string | null;
  empleado: string | null;
  tandaId: string | null;
}

export interface Pagina<T> {
  filas: T[];
  total: number;
  pagina: number;
  porPagina: 25;
}

export interface PlanTanda {
  intermedio: ComponenteRef;
  esperada: number;
  consumos: { componente: ComponenteRef; teorica: number; existencia: number }[];
}

export interface DesvioTanda {
  rendimientoReal: number;
  faltanteRendimiento: number;
  usoDeMas: number;
  total: number;
}

export interface TandaResumen {
  id: string;
  fecha: string;
  intermedio: Referencia;
  esperada: number;
  obtenida: number;
  empleado: string | null;
  desvio: DesvioTanda;
}

export interface TandaDetalle extends TandaResumen {
  observacion: string | null;
  costoUnitario: number;
  consumos: {
    componente: ComponenteRef;
    teorica: number;
    usada: number;
    diferencia: number;
    diferenciaCosto: number;
  }[];
}
