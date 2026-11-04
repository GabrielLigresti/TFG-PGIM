import { z } from 'zod';
import { barrioSchema, type Barrio } from './barrios';

// Lo que ve cualquier visitante, sin sesión: el buscador de la landing.

export const busquedaQuerySchema = z.object({
  q: z.string().max(100, 'La búsqueda admite hasta 100 caracteres').optional(),
  barrio: barrioSchema.optional(),
});
export type BusquedaQuery = z.infer<typeof busquedaQuerySchema>;

export interface ResultadoBusqueda {
  restaurante: { id: string; nombre: string };
  sucursal: { id: string; nombre: string; direccion: string; barrio: Barrio };
  // Hasta 3 platos del menú a la vista que coinciden con el texto buscado.
  platosCoincidentes: string[];
}

export type BarrioConSucursales = { valor: Barrio; nombre: string };
