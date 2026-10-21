import type { CodigoPermiso, Rol, RolInput } from '@pgim/shared';
import type { Prisma } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';
import { contarGestoresDeRoles, type ContarGestoresDeRoles } from './gestores-roles';

export interface RolRepository {
  listar(restauranteId: string): Promise<Rol[]>;
  buscar(restauranteId: string, id: string): Promise<Rol | null>;
  existeNombre(restauranteId: string, nombre: string, excluirId?: string): Promise<boolean>;
  crear(restauranteId: string, datos: RolInput): Promise<Rol>;
  actualizar(restauranteId: string, id: string, datos: RolInput): Promise<Rol>;
  desactivar(restauranteId: string, id: string): Promise<void>;
  contarGestoresDeRoles: ContarGestoresDeRoles;
}

const seleccion = {
  id: true,
  nombre: true,
  arquetipo: true,
  predeterminado: true,
  activo: true,
  permisos: { select: { permiso: { select: { codigo: true } } } },
  _count: { select: { empleados: { where: { usuario: { activo: true } } } } },
} satisfies Prisma.RolSelect;

type Fila = Prisma.RolGetPayload<{ select: typeof seleccion }>;

function aRol({ permisos, _count, ...fila }: Fila): Rol {
  return {
    ...fila,
    permisos: permisos.map(({ permiso }) => permiso.codigo as CodigoPermiso),
    cantidadEmpleados: _count.empleados,
  };
}

// El catálogo de permisos es global (no depende del restaurante).
async function permisosPorCodigo(codigos: CodigoPermiso[]) {
  const permisos = await prisma.permiso.findMany({
    where: { codigo: { in: codigos } },
    select: { id: true },
  });
  return permisos.map(({ id }) => ({ permisoId: id }));
}

export const rolRepository: RolRepository = {
  async listar(restauranteId) {
    const filas = await prisma.rol.findMany({
      where: { restauranteId },
      select: seleccion,
      orderBy: [{ activo: 'desc' }, { predeterminado: 'desc' }, { nombre: 'asc' }],
    });
    return filas.map(aRol);
  },

  async buscar(restauranteId, id) {
    const fila = await prisma.rol.findFirst({ where: { id, restauranteId }, select: seleccion });
    return fila && aRol(fila);
  },

  async existeNombre(restauranteId, nombre, excluirId) {
    const cantidad = await prisma.rol.count({
      where: {
        restauranteId,
        nombre: { equals: nombre, mode: 'insensitive' },
        ...(excluirId && { id: { not: excluirId } }),
      },
    });
    return cantidad > 0;
  },

  async crear(restauranteId, datos) {
    const fila = await prisma.rol.create({
      data: {
        restauranteId,
        nombre: datos.nombre,
        arquetipo: datos.arquetipo,
        permisos: { create: await permisosPorCodigo(datos.permisos) },
      },
      select: seleccion,
    });
    return aRol(fila);
  },

  async actualizar(restauranteId, id, datos) {
    const fila = await prisma.rol.update({
      where: { id, restauranteId },
      data: {
        nombre: datos.nombre,
        arquetipo: datos.arquetipo,
        ...(datos.activo !== undefined && { activo: datos.activo }),
        permisos: { deleteMany: {}, create: await permisosPorCodigo(datos.permisos) },
      },
      select: seleccion,
    });
    return aRol(fila);
  },

  async desactivar(restauranteId, id) {
    await prisma.rol.update({ where: { id, restauranteId }, data: { activo: false } });
  },

  contarGestoresDeRoles,
};
