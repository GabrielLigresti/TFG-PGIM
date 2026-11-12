import type { CodigoPermiso } from '@pgim/shared';
import { prisma } from '../lib/prisma';

interface Referencia {
  id: string;
  nombre: string;
}

export interface CredencialesUsuario {
  id: string;
  passwordHash: string | null;
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

export interface CuentaGoogle {
  id: string;
  tipo: 'EMPLEADO' | 'COMENSAL';
  activo: boolean;
  googleId: string | null;
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
  findCuentaByGoogleId(googleId: string): Promise<CuentaGoogle | null>;
  findCuentaByEmail(email: string): Promise<CuentaGoogle | null>;
  // P2002 si el google_id ya está tomado por otra cuenta.
  vincularGoogle(usuarioId: string, googleId: string): Promise<void>;
  // Como crearComensal, pero sin contraseña ni teléfono. P2002 si se repite el
  // email o el google_id.
  crearComensalGoogle(datos: { email: string; googleId: string; nombre: string }): Promise<string>;
}

const seleccionCuenta = { id: true, tipo: true, activo: true, googleId: true } as const;

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
  findCuentaByGoogleId(googleId) {
    return prisma.usuario.findUnique({ where: { googleId }, select: seleccionCuenta });
  },

  findCuentaByEmail(email) {
    return prisma.usuario.findUnique({ where: { email }, select: seleccionCuenta });
  },

  async vincularGoogle(usuarioId, googleId) {
    await prisma.usuario.update({ where: { id: usuarioId }, data: { googleId } });
  },

  async crearComensalGoogle({ email, googleId, nombre }) {
    const usuario = await prisma.usuario.create({
      data: {
        email,
        googleId,
        passwordHash: null,
        tipo: 'COMENSAL',
        comensal: { create: { nombre, telefono: null } },
      },
      select: { id: true },
    });
    return usuario.id;
  },
};
