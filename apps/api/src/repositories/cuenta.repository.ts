import { prisma } from '../lib/prisma';

export interface DatosComensal {
  email: string;
  nombre: string;
  telefono: string | null;
  tieneContrasena: boolean;
}

export interface DatosEmpleado {
  email: string;
  nombreCompleto: string;
  fotoUrl: string | null;
  rol: string;
  sucursales: string[];
}

// Las actualizaciones devuelven si tocaron una fila: el comensal se busca por
// usuarioId y el empleado, además, por restauranteId (tenant). Todo parte del
// usuarioId de la sesión, nunca de un dato que mande el cliente.
export interface CuentaRepository {
  findComensal(usuarioId: string): Promise<DatosComensal | null>;
  findEmpleado(usuarioId: string, restauranteId: string): Promise<DatosEmpleado | null>;
  actualizarComensal(
    usuarioId: string,
    datos: { nombre: string; telefono: string | null },
  ): Promise<boolean>;
  actualizarEmpleado(
    usuarioId: string,
    restauranteId: string,
    datos: { nombreCompleto: string },
  ): Promise<boolean>;
  guardarFotoEmpleado(usuarioId: string, restauranteId: string, fotoUrl: string): Promise<boolean>;
  findFotoEmpleado(usuarioId: string, restauranteId: string): Promise<string | null>;
  // null si el usuario no existe; { passwordHash: null } si no tiene contraseña.
  findPasswordHash(usuarioId: string): Promise<{ passwordHash: string | null } | null>;
  guardarPasswordHash(usuarioId: string, passwordHash: string): Promise<void>;
}

export const cuentaRepository: CuentaRepository = {
  async findComensal(usuarioId) {
    const comensal = await prisma.comensal.findUnique({
      where: { usuarioId },
      select: {
        nombre: true,
        telefono: true,
        usuario: { select: { email: true, passwordHash: true } },
      },
    });
    return (
      comensal && {
        email: comensal.usuario.email,
        nombre: comensal.nombre,
        telefono: comensal.telefono,
        tieneContrasena: comensal.usuario.passwordHash !== null,
      }
    );
  },

  async findEmpleado(usuarioId, restauranteId) {
    const empleado = await prisma.empleado.findFirst({
      where: { usuarioId, restauranteId },
      select: {
        nombreCompleto: true,
        fotoUrl: true,
        usuario: { select: { email: true } },
        rol: { select: { nombre: true } },
        sucursales: {
          where: { sucursal: { activa: true } },
          select: { sucursal: { select: { nombre: true } } },
          orderBy: { sucursal: { nombre: 'asc' } },
        },
      },
    });
    return (
      empleado && {
        email: empleado.usuario.email,
        nombreCompleto: empleado.nombreCompleto,
        fotoUrl: empleado.fotoUrl,
        rol: empleado.rol.nombre,
        sucursales: empleado.sucursales.map((s) => s.sucursal.nombre),
      }
    );
  },

  async actualizarComensal(usuarioId, { nombre, telefono }) {
    const { count } = await prisma.comensal.updateMany({
      where: { usuarioId },
      data: { nombre, telefono },
    });
    return count > 0;
  },

  async actualizarEmpleado(usuarioId, restauranteId, { nombreCompleto }) {
    const { count } = await prisma.empleado.updateMany({
      where: { usuarioId, restauranteId },
      data: { nombreCompleto },
    });
    return count > 0;
  },

  async guardarFotoEmpleado(usuarioId, restauranteId, fotoUrl) {
    const { count } = await prisma.empleado.updateMany({
      where: { usuarioId, restauranteId },
      data: { fotoUrl },
    });
    return count > 0;
  },

  async findFotoEmpleado(usuarioId, restauranteId) {
    const empleado = await prisma.empleado.findFirst({
      where: { usuarioId, restauranteId },
      select: { fotoUrl: true },
    });
    return empleado?.fotoUrl ?? null;
  },

  async findPasswordHash(usuarioId) {
    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { passwordHash: true },
    });
    return usuario && { passwordHash: usuario.passwordHash };
  },

  async guardarPasswordHash(usuarioId, passwordHash) {
    await prisma.usuario.update({ where: { id: usuarioId }, data: { passwordHash } });
  },
};
