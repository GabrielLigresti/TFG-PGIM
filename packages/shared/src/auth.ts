import { z } from 'zod';
import { CODIGOS_PERMISO, type CodigoPermiso } from './permisos';

export const loginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const seleccionarSucursalSchema = z.object({
  sucursalId: z.uuid(),
});

export type SeleccionarSucursalRequest = z.infer<typeof seleccionarSucursalSchema>;

const referenciaSchema = z.object({ id: z.uuid(), nombre: z.string() });

export const sesionSchema = z.object({
  usuario: z.object({
    id: z.uuid(),
    email: z.email(),
    tipo: z.enum(['EMPLEADO', 'COMENSAL']),
    nombre: z.string(),
  }),
  // Solo para empleados; el comensal es global y no tiene restaurante ni rol.
  restaurante: referenciaSchema.nullable(),
  rol: referenciaSchema.nullable(),
  permisos: z.array(z.enum(CODIGOS_PERMISO as [CodigoPermiso, ...CodigoPermiso[]])),
  sucursales: z.array(referenciaSchema),
  sucursalActiva: referenciaSchema.nullable(),
});

export type Sesion = z.infer<typeof sesionSchema>;

// Alta simple de comensal desde el login (sin verificación de email).
export const registroComensalSchema = z.object({
  nombre: z.string().trim().min(1, 'Ingresá tu nombre').max(100),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(8, 'La contraseña tiene que tener al menos 8 caracteres').max(100),
  telefono: z.string().trim().max(30).optional(),
});

export type RegistroComensal = z.infer<typeof registroComensalSchema>;
