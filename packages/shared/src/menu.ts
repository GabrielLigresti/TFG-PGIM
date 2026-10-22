import { z } from 'zod';
import { fechaSchema, nombreSchema, type Referencia } from './comun';

// CU-16: categorías, platos y menús con vigencia.

export const categoriaInputSchema = z.object({
  nombre: nombreSchema,
  // Los platos de estas categorías necesitan receta para el menú activo.
  requiereReceta: z.boolean(),
});

export type CategoriaInput = z.infer<typeof categoriaInputSchema>;

export interface Categoria {
  id: string;
  nombre: string;
  requiereReceta: boolean;
  cantidadPlatos: number;
}

export const platoInputSchema = z.object({
  categoriaId: z.uuid('Elegí una categoría'),
  nombre: nombreSchema,
  descripcion: z.string().trim().max(500).nullish(),
  precio: z.number().positive('El precio tiene que ser mayor a 0').max(1e10),
  fotoUrl: z.url('La foto tiene que ser una URL').nullish(),
  disponible: z.boolean(),
  activo: z.boolean().optional(),
});

export type PlatoInput = z.infer<typeof platoInputSchema>;

// Datos del modelo RA de un plato (CU-16). Los archivos .glb y .usdz se suben aparte.
export const modeloRaInputSchema = z.object({
  // Factor que lleva el modelo a tamaño real (1 si ya está en metros reales).
  escalaReal: z.number().positive('La escala tiene que ser mayor a 0').max(1000),
  porcionGramos: z.number().int().positive('La porción tiene que ser mayor a 0').max(10000),
});

export type ModeloRaInput = z.infer<typeof modeloRaInputSchema>;

export interface ModeloRa extends ModeloRaInput {
  urlModelo: string;
  urlModeloIos: string | null;
}

export const LIMITE_MODELO_MB = 20;

export interface Plato {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  fotoUrl: string | null;
  disponible: boolean;
  activo: boolean;
  categoria: { id: string; nombre: string; requiereReceta: boolean };
  tieneReceta: boolean;
  // La categoría pide receta y el plato no la tiene (anticipa PLATO_SIN_RECETA).
  sinReceta: boolean;
  modeloRa: ModeloRa | null;
}

// Un menú agrupa platos del restaurante con una vigencia; cada sucursal elige
// su menú activo, que deja de mostrarse fuera de vigencia.
export const menuInputSchema = z
  .object({
    nombre: nombreSchema,
    descripcion: z.string().trim().max(500).nullish(),
    vigenciaDesde: fechaSchema,
    vigenciaHasta: fechaSchema.nullish(),
    platoIds: z.array(z.uuid()).max(500),
  })
  .refine((m) => !m.vigenciaHasta || m.vigenciaHasta >= m.vigenciaDesde, {
    message: 'La vigencia tiene que terminar después de empezar',
    path: ['vigenciaHasta'],
  });

export type MenuInput = z.infer<typeof menuInputSchema>;

export interface Vigencia {
  vigenciaDesde: string;
  vigenciaHasta: string | null;
}

export interface Menu extends Vigencia {
  id: string;
  nombre: string;
  descripcion: string | null;
  platoIds: string[];
  // Sucursales que lo tienen como menú activo.
  sucursalesActivas: Referencia[];
}

// Las fechas "AAAA-MM-DD" se comparan como texto; hoy sale de hoyArgentina().
export function estaVigente({ vigenciaDesde, vigenciaHasta }: Vigencia, hoy: string): boolean {
  return vigenciaDesde <= hoy && (vigenciaHasta === null || hoy <= vigenciaHasta);
}
