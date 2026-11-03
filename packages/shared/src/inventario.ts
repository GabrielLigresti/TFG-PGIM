import { z } from 'zod';
import { nombreSchema } from './comun';

export const UNIDADES_MEDIDA = ['GRAMO', 'KILOGRAMO', 'MILILITRO', 'LITRO', 'UNIDAD'] as const;
export type UnidadMedida = (typeof UNIDADES_MEDIDA)[number];

// El stock se guarda en unidad base: no hay conversión entre dimensiones.
export const UNIDADES_BASE = ['GRAMO', 'MILILITRO', 'UNIDAD'] as const;
export type UnidadBase = (typeof UNIDADES_BASE)[number];

// Unidad base de la misma dimensión y factor para pasar a ella.
export const CONVERSION: Record<UnidadMedida, { base: UnidadBase; factor: number }> = {
  GRAMO: { base: 'GRAMO', factor: 1 },
  KILOGRAMO: { base: 'GRAMO', factor: 1000 },
  MILILITRO: { base: 'MILILITRO', factor: 1 },
  LITRO: { base: 'MILILITRO', factor: 1000 },
  UNIDAD: { base: 'UNIDAD', factor: 1 },
};

export const ETIQUETA_UNIDAD: Record<UnidadMedida, string> = {
  GRAMO: 'g',
  KILOGRAMO: 'kg',
  MILILITRO: 'ml',
  LITRO: 'l',
  UNIDAD: 'u.',
};

export function unidadesCompatibles(base: UnidadBase): UnidadMedida[] {
  return UNIDADES_MEDIDA.filter((u) => CONVERSION[u].base === base);
}

// ─── Insumos ─────────────────────────────────────────────────────────────────

export const insumoInputSchema = z.object({
  nombre: nombreSchema,
  unidadBase: z.enum(UNIDADES_BASE),
  // Costo de compra por unidad base (por gramo, mililitro o unidad).
  costoCompraVigente: z.number().min(0, 'El costo no puede ser negativo').max(1e9),
  activo: z.boolean().optional(),
});

export type InsumoInput = z.infer<typeof insumoInputSchema>;

export interface Insumo {
  id: string;
  nombre: string;
  unidadBase: UnidadBase;
  costoCompraVigente: number | null;
  activo: boolean;
  // Existencia en la sucursal de trabajo; 0 si todavía no tuvo movimientos.
  stock: number;
}

// ─── Recetas (CU-07) ─────────────────────────────────────────────────────────
// Los esquemas solo validan tipos: las reglas (cantidad, merma, unidades, ciclos,
// rendimiento) las aplica el RecetaBuilder de la API y marcan la línea con error.

export const lineaRecetaInputSchema = z.object({
  componenteId: z.uuid(),
  cantidad: z.number(),
  unidad: z.enum(UNIDADES_MEDIDA),
  porcentajeMerma: z.number().default(0),
});

export const recetaInputSchema = z.object({
  lineas: z.array(lineaRecetaInputSchema).max(50),
  rendimiento: z.number(),
  instrucciones: z.string().trim().max(4000).nullish(),
});

export type RecetaInput = z.infer<typeof recetaInputSchema>;

// Marca "lleva stock" de un producto intermedio (se produce por tandas).
export const llevaStockInputSchema = z.object({ llevaStock: z.boolean() });

export type LlevaStockInput = z.infer<typeof llevaStockInputSchema>;

// Flujo A del CU-07: producto intermedio nuevo con su receta.
export const intermedioAltaSchema = z.object({
  nombre: nombreSchema,
  unidadBase: z.enum(UNIDADES_BASE),
  receta: recetaInputSchema,
});

export type IntermedioAlta = z.infer<typeof intermedioAltaSchema>;

export type TipoComponente = 'INSUMO' | 'INTERMEDIO';

export interface ComponenteReceta {
  id: string;
  nombre: string;
  tipo: TipoComponente;
  unidadBase: UnidadBase;
  costoUnitario: number;
}

export interface LineaRecetaDetalle {
  componenteId: string;
  componente: string;
  tipo: TipoComponente;
  cantidad: number;
  unidad: UnidadMedida;
  porcentajeMerma: number;
  // Cantidad que se descuenta, en unidad base: neta ÷ (1 − merma).
  cantidadBruta: number;
  costo: number;
}

export interface RecetaDetalle {
  dueno: {
    tipo: 'PLATO' | 'INTERMEDIO';
    id: string;
    nombre: string;
    unidadBase: UnidadBase | null;
    // Solo un intermedio puede llevar stock; un plato siempre es false.
    llevaStock: boolean;
  };
  receta: {
    rendimiento: number;
    instrucciones: string | null;
    lineas: LineaRecetaDetalle[];
    costoTotal: number;
    // Costo por porción (plato) o por unidad base (intermedio).
    costoPorPorcion: number;
  } | null;
}

export interface ResumenRecetas {
  platos: {
    id: string;
    nombre: string;
    categoria: string;
    activo: boolean;
    tieneReceta: boolean;
    costoPorPorcion: number | null;
  }[];
  intermedios: {
    id: string;
    nombre: string;
    unidadBase: UnidadBase;
    activo: boolean;
    tieneReceta: boolean;
    costoUnitario: number;
    llevaStock: boolean;
  }[];
}

// Error de una línea (índice) o de la receta entera (null).
export interface ErrorReceta {
  linea: number | null;
  mensaje: string;
}
