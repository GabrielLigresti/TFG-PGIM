import {
  CONFIGURACION_APERTURA_POR_DEFECTO,
  ROLES_PREDETERMINADOS,
  type RegistroRestaurante,
} from '@pgim/shared';
import { prisma } from '../lib/prisma';
import { crearRolesPredeterminados } from './roles-predeterminados';
import { columnas, horarios } from './sucursal.repository';

// El primero de los roles predeterminados es el que tiene todos los permisos.
const ROL_ADMINISTRADOR = ROLES_PREDETERMINADOS[0]!.nombre;
const HORAS_SEMANALES_ADMINISTRADOR = 48;

export interface AltaRestaurante {
  restaurante: RegistroRestaurante['restaurante'];
  sucursal: RegistroRestaurante['sucursal'];
  administrador: { nombreCompleto: string; email: string; passwordHash: string };
}

export interface RestauranteRepository {
  registrar(datos: AltaRestaurante): Promise<{ usuarioId: string; sucursalId: string }>;
}

export const restauranteRepository: RestauranteRepository = {
  // CU-11. Es la única escritura sin filtro de tenant: el restaurante todavía
  // no existe, así que no hay restauranteId contra el cual filtrar. Todo lo que
  // crea cuelga del restaurante nuevo, y va en una sola transacción: si falla
  // cualquier paso (por ejemplo, un email repetido), no queda nada.
  registrar({ restaurante, sucursal, administrador }) {
    return prisma.$transaction(async (tx) => {
      const { id: restauranteId } = await tx.restaurante.create({
        data: restaurante,
        select: { id: true },
      });
      const { id: sucursalId } = await tx.sucursal.create({
        data: {
          restauranteId,
          ...columnas(sucursal),
          horariosServicio: { create: horarios(sucursal) },
          configuracionApertura: { create: CONFIGURACION_APERTURA_POR_DEFECTO },
        },
        select: { id: true },
      });
      const roles = await crearRolesPredeterminados(tx, restauranteId);
      const usuario = await tx.usuario.create({
        data: {
          email: administrador.email,
          passwordHash: administrador.passwordHash,
          tipo: 'EMPLEADO',
          empleado: {
            create: {
              restauranteId,
              rolId: roles.get(ROL_ADMINISTRADOR)!,
              nombreCompleto: administrador.nombreCompleto,
              horasSemanalesMax: HORAS_SEMANALES_ADMINISTRADOR,
              sucursales: { create: { sucursalId } },
            },
          },
        },
        select: { id: true },
      });
      return { usuarioId: usuario.id, sucursalId };
    });
  },
};
