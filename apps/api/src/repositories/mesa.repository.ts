import type { Mesa, MesaInput } from '@pgim/shared';
import type { Prisma } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';

// Las mesas no tienen restaurante_id: el aislamiento por tenant se hace a
// través de la sucursal.
export interface MesaRepository {
  listar(restauranteId: string, sucursalId: string): Promise<Mesa[]>;
  existeSucursal(restauranteId: string, sucursalId: string): Promise<boolean>;
  buscar(restauranteId: string, sucursalId: string, id: string): Promise<Mesa | null>;
  existeNumero(
    restauranteId: string,
    sucursalId: string,
    numero: number,
    excluirId?: string,
  ): Promise<boolean>;
  crear(restauranteId: string, sucursalId: string, datos: MesaInput): Promise<Mesa>;
  actualizar(
    restauranteId: string,
    sucursalId: string,
    id: string,
    datos: MesaInput,
  ): Promise<Mesa>;
  desactivar(restauranteId: string, sucursalId: string, id: string): Promise<void>;
  // Reservas PENDIENTE o ACTIVA de la mesa y el grupo más grande entre ellas.
  reservasVigentes(
    restauranteId: string,
    sucursalId: string,
    id: string,
  ): Promise<{ cantidad: number; maxPersonas: number }>;
}

const seleccion = {
  id: true,
  numero: true,
  capacidad: true,
  posX: true,
  posY: true,
  activa: true,
} satisfies Prisma.MesaSelect;

type Fila = Prisma.MesaGetPayload<{ select: typeof seleccion }>;

// pos_x y pos_y son numeric: Prisma las trae como Decimal.
export function aMesa(fila: Fila): Mesa {
  return { ...fila, posX: Number(fila.posX), posY: Number(fila.posY) };
}

function deLaSucursal(restauranteId: string, sucursalId: string) {
  return { sucursalId, sucursal: { restauranteId } };
}

export const mesaRepository: MesaRepository = {
  async listar(restauranteId, sucursalId) {
    const filas = await prisma.mesa.findMany({
      where: deLaSucursal(restauranteId, sucursalId),
      select: seleccion,
      orderBy: { numero: 'asc' },
    });
    return filas.map(aMesa);
  },

  async existeSucursal(restauranteId, sucursalId) {
    return (await prisma.sucursal.count({ where: { id: sucursalId, restauranteId } })) > 0;
  },

  async buscar(restauranteId, sucursalId, id) {
    const fila = await prisma.mesa.findFirst({
      where: { id, ...deLaSucursal(restauranteId, sucursalId) },
      select: seleccion,
    });
    return fila && aMesa(fila);
  },

  async existeNumero(restauranteId, sucursalId, numero, excluirId) {
    const cantidad = await prisma.mesa.count({
      where: {
        ...deLaSucursal(restauranteId, sucursalId),
        numero,
        ...(excluirId && { id: { not: excluirId } }),
      },
    });
    return cantidad > 0;
  },

  async crear(restauranteId, sucursalId, datos) {
    const fila = await prisma.mesa.create({
      // connect con restauranteId: si la sucursal es de otro restaurante, Prisma no la encuentra.
      data: { ...datos, sucursal: { connect: { id: sucursalId, restauranteId } } },
      select: seleccion,
    });
    return aMesa(fila);
  },

  async actualizar(restauranteId, sucursalId, id, datos) {
    const fila = await prisma.mesa.update({
      where: { id, ...deLaSucursal(restauranteId, sucursalId) },
      data: datos,
      select: seleccion,
    });
    return aMesa(fila);
  },

  async desactivar(restauranteId, sucursalId, id) {
    await prisma.mesa.update({
      where: { id, ...deLaSucursal(restauranteId, sucursalId) },
      data: { activa: false },
    });
  },

  async reservasVigentes(restauranteId, sucursalId, id) {
    const { _count, _max } = await prisma.reserva.aggregate({
      where: {
        mesaId: id,
        estado: { in: ['PENDIENTE', 'ACTIVA'] },
        ...deLaSucursal(restauranteId, sucursalId),
      },
      _count: true,
      _max: { cantidadPersonas: true },
    });
    return { cantidad: _count, maxPersonas: _max.cantidadPersonas ?? 0 };
  },
};
