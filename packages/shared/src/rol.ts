import { z } from 'zod';
import { nombreSchema } from './comun';
import { CODIGOS_PERMISO, type Arquetipo, type CodigoPermiso } from './permisos';

export const ARQUETIPOS = ['MOZO', 'COCINERO', 'OTRO'] as const satisfies readonly Arquetipo[];

// "Gestión de roles" de la regla E2 del CU-02: hace falta ver la pantalla de
// roles y poder editarlos.
export const PERMISOS_GESTION_ROLES: readonly CodigoPermiso[] = ['rol.ver', 'rol.editar'];

export function gestionaRoles(permisos: readonly CodigoPermiso[]): boolean {
  return PERMISOS_GESTION_ROLES.every((codigo) => permisos.includes(codigo));
}

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
