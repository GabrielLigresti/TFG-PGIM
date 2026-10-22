import { z } from 'zod';
import { nombreSchema } from './comun';

// CU-16 sin menús con vigencia ni modelo RA (quedan para después del Hito 1).

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
}
