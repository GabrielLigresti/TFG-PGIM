import { z } from 'zod';
import { nombreSchema } from './comun';
import { CODIGOS_PERMISO, type Arquetipo, type CodigoPermiso } from './permisos';

export const ARQUETIPOS = ['MOZO', 'COCINERO', 'OTRO'] as const satisfies readonly Arquetipo[];

// Permiso que define la "gestión de roles" de la regla E2 del CU-02.
export const PERMISO_GESTION_ROLES: CodigoPermiso = 'rol.editar';

// CU-02. E1: nombre único (lo valida el servicio) y al menos un permiso.
export const rolInputSchema = z.object({
  nombre: nombreSchema,
  arquetipo: z.enum(ARQUETIPOS),
  permisos: z
    .array(z.enum(CODIGOS_PERMISO as [CodigoPermiso, ...CodigoPermiso[]]))
    .min(1, 'Elegí al menos un permiso'),
  activo: z.boolean().optional(),
});

export type RolInput = z.infer<typeof rolInputSchema>;

export interface Rol {
  id: string;
  nombre: string;
  arquetipo: Arquetipo;
  predeterminado: boolean;
  activo: boolean;
  permisos: CodigoPermiso[];
  cantidadEmpleados: number;
}

export interface GrupoPermisos {
  modulo: string;
  permisos: { codigo: CodigoPermiso; accion: string }[];
}
