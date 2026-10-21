import type { CodigoPermiso, Empleado, EmpleadoAlta, EmpleadoEdicion } from '@pgim/shared';
import type { Prisma } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';
import { contarGestoresDeRoles, type ContarGestoresDeRoles } from './gestores-roles';

export interface RolAsignable {
  id: string;
  activo: boolean;
  permisos: CodigoPermiso[];
}

export interface PersonalRepository {
  listar(restauranteId: string): Promise<Empleado[]>;
  buscar(restauranteId: string, usuarioId: string): Promise<Empleado | null>;
  emailRegistrado(email: string): Promise<boolean>;
  buscarRol(restauranteId: string, rolId: string): Promise<RolAsignable | null>;
  contarSucursalesActivas(restauranteId: string, ids: string[]): Promise<number>;
  crear(
    restauranteId: string,
    datos: Omit<EmpleadoAlta, 'password'>,
    passwordHash: string,
  ): Promise<Empleado>;
  actualizar(
    restauranteId: string,
    usuarioId: string,
    datos: Omit<EmpleadoEdicion, 'password'>,
    passwordHash?: string,
  ): Promise<Empleado>;
  desactivar(restauranteId: string, usuarioId: string): Promise<void>;
  contarGestoresDeRoles: ContarGestoresDeRoles;
}

const seleccion = {
  usuarioId: true,
  nombreCompleto: true,
  horasSemanalesMax: true,
  usuario: { select: { email: true, activo: true } },
  rol: { select: { id: true, nombre: true } },
  sucursales: {
    select: { sucursal: { select: { id: true, nombre: true } } },
    orderBy: { sucursal: { nombre: 'asc' } },
  },
} satisfies Prisma.EmpleadoSelect;

type Fila = Prisma.EmpleadoGetPayload<{ select: typeof seleccion }>;

function aEmpleado(fila: Fila): Empleado {
  return {
    id: fila.usuarioId,
    email: fila.usuario.email,
    nombreCompleto: fila.nombreCompleto,
    rol: fila.rol,
    sucursales: fila.sucursales.map(({ sucursal }) => sucursal),
    horasSemanalesMax: fila.horasSemanalesMax,
    activo: fila.usuario.activo,
  };
}

const asignaciones = (ids: string[]) => ({
  createMany: { data: ids.map((sucursalId) => ({ sucursalId })) },
});

export const personalRepository: PersonalRepository = {
  async listar(restauranteId) {
    const filas = await prisma.empleado.findMany({
      where: { restauranteId },
      select: seleccion,
      orderBy: [{ usuario: { activo: 'desc' } }, { nombreCompleto: 'asc' }],
    });
    return filas.map(aEmpleado);
  },

  async buscar(restauranteId, usuarioId) {
    const fila = await prisma.empleado.findFirst({
      where: { usuarioId, restauranteId },
      select: seleccion,
    });
    return fila && aEmpleado(fila);
  },

  // usuario es global (el comensal es de toda la plataforma): el email es único
  // en toda la base, así que esta consulta no filtra por restaurante.
  async emailRegistrado(email) {
    return (await prisma.usuario.count({ where: { email } })) > 0;
  },

  async buscarRol(restauranteId, rolId) {
    const rol = await prisma.rol.findFirst({
      where: { id: rolId, restauranteId },
      select: {
        id: true,
        activo: true,
        permisos: { select: { permiso: { select: { codigo: true } } } },
      },
    });
    return (
      rol && {
        id: rol.id,
        activo: rol.activo,
        permisos: rol.permisos.map(({ permiso }) => permiso.codigo as CodigoPermiso),
      }
    );
  },

  contarSucursalesActivas(restauranteId, ids) {
    return prisma.sucursal.count({ where: { restauranteId, activa: true, id: { in: ids } } });
  },

  async crear(restauranteId, datos, passwordHash) {
    // Usuario, empleado y asignaciones en una sola escritura anidada (una transacción).
    const usuario = await prisma.usuario.create({
      data: {
        email: datos.email,
        passwordHash,
        tipo: 'EMPLEADO',
        empleado: {
          create: {
            restaurante: { connect: { id: restauranteId } },
            rol: { connect: { id: datos.rolId } },
            nombreCompleto: datos.nombreCompleto,
            horasSemanalesMax: datos.horasSemanalesMax,
            sucursales: asignaciones(datos.sucursalIds),
          },
        },
      },
      select: { empleado: { select: seleccion } },
    });
    return aEmpleado(usuario.empleado!);
  },

  async actualizar(restauranteId, usuarioId, datos, passwordHash) {
    const fila = await prisma.empleado.update({
      where: { usuarioId, restauranteId },
      data: {
        nombreCompleto: datos.nombreCompleto,
        horasSemanalesMax: datos.horasSemanalesMax,
        rol: { connect: { id: datos.rolId } },
        sucursales: { deleteMany: {}, ...asignaciones(datos.sucursalIds) },
        usuario: {
          update: {
            ...(datos.activo !== undefined && { activo: datos.activo }),
            ...(passwordHash && { passwordHash }),
          },
        },
      },
      select: seleccion,
    });
    return aEmpleado(fila);
  },

  async desactivar(restauranteId, usuarioId) {
    await prisma.empleado.update({
      where: { usuarioId, restauranteId },
      data: { usuario: { update: { activo: false } } },
    });
  },

  contarGestoresDeRoles,
};
