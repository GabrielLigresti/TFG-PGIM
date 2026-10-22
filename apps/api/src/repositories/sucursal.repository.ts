import type { Sucursal, SucursalInput } from '@pgim/shared';
import type { Prisma } from '../generated/prisma/client';
import { aHora, deHora } from '../lib/hora';
import { prisma } from '../lib/prisma';

export interface SucursalRepository {
  // Con sucursalIds, solo esas (alcance de quien solo ve sus sucursales).
  listar(restauranteId: string, sucursalIds?: string[]): Promise<Sucursal[]>;
  buscar(restauranteId: string, id: string): Promise<Sucursal | null>;
  existeNombre(restauranteId: string, nombre: string, excluirId?: string): Promise<boolean>;
  contarActivas(restauranteId: string): Promise<number>;
  // La sucursal nueva queda asignada a quien la crea, para que pueda elegirla.
  crear(restauranteId: string, datos: SucursalInput, empleadoId: string): Promise<Sucursal>;
  actualizar(restauranteId: string, id: string, datos: SucursalInput): Promise<Sucursal>;
  desactivar(restauranteId: string, id: string): Promise<void>;
}

const seleccion = {
  id: true,
  nombre: true,
  direccion: true,
  horarioApertura: true,
  horarioCierre: true,
  toleranciaNoShowMin: true,
  activa: true,
  horariosServicio: {
    select: { franja: true, horaInicio: true, horaFin: true },
    orderBy: { franja: 'asc' },
  },
} satisfies Prisma.SucursalSelect;

type Fila = Prisma.SucursalGetPayload<{ select: typeof seleccion }>;

function aSucursal(fila: Fila): Sucursal {
  return {
    ...fila,
    horarioApertura: aHora(fila.horarioApertura),
    horarioCierre: aHora(fila.horarioCierre),
    horariosServicio: fila.horariosServicio.map((h) => ({
      franja: h.franja,
      horaInicio: aHora(h.horaInicio),
      horaFin: aHora(h.horaFin),
    })),
  };
}

function columnas(datos: SucursalInput) {
  return {
    nombre: datos.nombre,
    direccion: datos.direccion,
    horarioApertura: deHora(datos.horarioApertura),
    horarioCierre: deHora(datos.horarioCierre),
    toleranciaNoShowMin: datos.toleranciaNoShowMin,
  };
}

function horarios(datos: SucursalInput) {
  return datos.horariosServicio.map((h) => ({
    franja: h.franja,
    horaInicio: deHora(h.horaInicio),
    horaFin: deHora(h.horaFin),
  }));
}

export const sucursalRepository: SucursalRepository = {
  async listar(restauranteId, sucursalIds) {
    const filas = await prisma.sucursal.findMany({
      where: { restauranteId, ...(sucursalIds && { id: { in: sucursalIds } }) },
      select: seleccion,
      orderBy: [{ activa: 'desc' }, { nombre: 'asc' }],
    });
    return filas.map(aSucursal);
  },

  async buscar(restauranteId, id) {
    const fila = await prisma.sucursal.findFirst({
      where: { id, restauranteId },
      select: seleccion,
    });
    return fila && aSucursal(fila);
  },

  async existeNombre(restauranteId, nombre, excluirId) {
    const cantidad = await prisma.sucursal.count({
      where: {
        restauranteId,
        nombre: { equals: nombre, mode: 'insensitive' },
        ...(excluirId && { id: { not: excluirId } }),
      },
    });
    return cantidad > 0;
  },

  contarActivas(restauranteId) {
    return prisma.sucursal.count({ where: { restauranteId, activa: true } });
  },

  async crear(restauranteId, datos, empleadoId) {
    const fila = await prisma.sucursal.create({
      data: {
        restauranteId,
        ...columnas(datos),
        horariosServicio: { create: horarios(datos) },
        empleados: { create: { empleadoId } },
      },
      select: seleccion,
    });
    return aSucursal(fila);
  },

  async actualizar(restauranteId, id, datos) {
    const fila = await prisma.sucursal.update({
      where: { id, restauranteId },
      data: {
        ...columnas(datos),
        ...(datos.activa !== undefined && { activa: datos.activa }),
        horariosServicio: { deleteMany: {}, create: horarios(datos) },
      },
      select: seleccion,
    });
    return aSucursal(fila);
  },

  async desactivar(restauranteId, id) {
    await prisma.sucursal.update({ where: { id, restauranteId }, data: { activa: false } });
  },
};
