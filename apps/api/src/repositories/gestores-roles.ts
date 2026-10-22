import { PERMISOS_GESTION_ROLES } from '@pgim/shared';
import { prisma } from '../lib/prisma';

export interface ExclusionGestores {
  rolId?: string;
  usuarioId?: string;
}

export type ContarGestoresDeRoles = (
  restauranteId: string,
  excluir: ExclusionGestores,
) => Promise<number>;

// Usuarios activos del restaurante cuyo rol activo tiene los permisos de gestión
// de roles (ver y editar), sin contar el rol o el usuario que se está por modificar (CU-02, E2).
export const contarGestoresDeRoles: ContarGestoresDeRoles = (restauranteId, excluir) =>
  prisma.usuario.count({
    where: {
      activo: true,
      ...(excluir.usuarioId && { id: { not: excluir.usuarioId } }),
      empleado: {
        is: {
          restauranteId,
          rol: {
            activo: true,
            ...(excluir.rolId && { id: { not: excluir.rolId } }),
            AND: PERMISOS_GESTION_ROLES.map((codigo) => ({
              permisos: { some: { permiso: { codigo } } },
            })),
          },
        },
      },
    },
  });
