import { z } from 'zod';
import type { Referencia } from './comun';

const nombreCompletoSchema = z.string().trim().min(1, 'Ingresá el nombre').max(120);
const passwordSchema = z.string().min(8, 'La contraseña tiene que tener al menos 8 caracteres');
const sucursalIdsSchema = z.array(z.uuid()).min(1, 'Asigná al menos una sucursal');
const horasSchema = z.number().int().min(1).max(84);

// CU-15.
export const empleadoAltaSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Email inválido')),
  password: passwordSchema,
  nombreCompleto: nombreCompletoSchema,
  rolId: z.uuid(),
  sucursalIds: sucursalIdsSchema,
  horasSemanalesMax: horasSchema,
});

export type EmpleadoAlta = z.infer<typeof empleadoAltaSchema>;

// El email no se edita; la contraseña nueva es opcional.
export const empleadoEdicionSchema = z.object({
  nombreCompleto: nombreCompletoSchema,
  rolId: z.uuid(),
  sucursalIds: sucursalIdsSchema,
  horasSemanalesMax: horasSchema,
  activo: z.boolean().optional(),
  password: passwordSchema.optional(),
});

export type EmpleadoEdicion = z.infer<typeof empleadoEdicionSchema>;

export interface Empleado {
  id: string;
  email: string;
  nombreCompleto: string;
  rol: Referencia;
  sucursales: Referencia[];
  horasSemanalesMax: number;
  activo: boolean;
}
