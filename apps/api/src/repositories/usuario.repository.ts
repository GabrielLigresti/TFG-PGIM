import type { CodigoPermiso } from '@pgim/shared';
import { prisma } from '../lib/prisma';

interface Referencia {
  id: string;
  nombre: string;
}

export interface CredencialesUsuario {
  id: string;
  passwordHash: string;
  activo: boolean;
}

export interface UsuarioSesion {
  id: string;
  email: string;
  tipo: 'EMPLEADO' | 'COMENSAL';
  activo: boolean;
  comensal: { nombre: string } | null;
  empleado: {
    nombreCompleto: string;
    restaurante: Referencia;
    rol: Referencia;
    permisos: CodigoPermiso[];
    sucursales: Referencia[];
  } | null;
}

export interface UsuarioRepository {
  findCredencialesByEmail(email: string): Promise<CredencialesUsuario | null>;
  findSesionById(id: string): Promise<UsuarioSesion | null>;
  // Usuario y comensal en un solo create anidado (atómico). Devuelve el id.
  // Un email repetido llega como P2002.
  crearComensal(datos: {
    email: string;
    passwordHash: string;
    nombre: string;
    telefono: string | null;
  }): Promise<string>;
}

// usuario es una tabla global (el comensal es de toda la plataforma), así que
// estas consultas no filtran por restaurante: el tenant sale del empleado.
export const usuarioRepository: UsuarioRepository = {
  findCredencialesByEmail(email) {
    return prisma.usuario.findUnique({
      where: { email },
      select: { id: true, passwordHash: true, activo: true },
    });
  },

  async findSesionById(id) {
    const usuario = await prisma.usuario.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        tipo: true,
        activo: true,
        comensal: { select: { nombre: true } },
        empleado: {
          select: {
            nombreCompleto: true,
            restaurante: { select: { id: true, nombre: true } },
            rol: {
              select: {
                id: true,
                nombre: true,
                activo: true,
                permisos: { select: { permiso: { select: { codigo: true } } } },
              },
            },
            sucursales: {
              where: { sucursal: { activa: true } },
              select: { sucursal: { select: { id: true, nombre: true } } },
              orderBy: { sucursal: { nombre: 'asc' } },
            },
          },
        },
      },
    });
    if (!usuario) return null;

    const { empleado } = usuario;
    return {
      ...usuario,
      empleado: empleado && {
        nombreCompleto: empleado.nombreCompleto,
        restaurante: empleado.restaurante,
        rol: { id: empleado.rol.id, nombre: empleado.rol.nombre },
        // Un rol dado de baja no otorga permisos.
        permisos: empleado.rol.activo
          ? empleado.rol.permisos.map(({ permiso }) => permiso.codigo as CodigoPermiso)
          : [],
        sucursales: empleado.sucursales.map(({ sucursal }) => sucursal),
      },
    };
  },

  async crearComensal({ email, passwordHash, nombre, telefono }) {
    const usuario = await prisma.usuario.create({
      data: { email, passwordHash, tipo: 'COMENSAL', comensal: { create: { nombre, telefono } } },
      select: { id: true },
    });
    return usuario.id;
  },
};
