import type { Insumo, InsumoInput } from '@pgim/shared';
import type { Prisma } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';
import { existeNombreComponente, usosDeComponente } from './componente.repository';

export interface InsumoRepository {
  listar(restauranteId: string, sucursalId: string | null): Promise<Insumo[]>;
  buscar(restauranteId: string, id: string): Promise<Insumo | null>;
  existeNombre(restauranteId: string, nombre: string, excluirId?: string): Promise<boolean>;
  usosEnRecetas(restauranteId: string, id: string): Promise<string[]>;
  // Nombres de los platos que lo revenden como viene.
  platosDeReventa(restauranteId: string, id: string): Promise<string[]>;
  crear(restauranteId: string, datos: InsumoInput): Promise<Insumo>;
  actualizar(restauranteId: string, id: string, datos: InsumoInput): Promise<Insumo>;
  desactivar(restauranteId: string, id: string): Promise<void>;
}

function seleccion(sucursalId: string | null) {
  return {
    id: true,
    nombre: true,
    unidadBase: true,
    costoCompra: true,
    activo: true,
    // Stock de la sucursal de trabajo (una existencia por insumo y sucursal).
    existencias: {
      where: { sucursalId: sucursalId ?? undefined },
      select: { cantidadActual: true },
      take: sucursalId ? 1 : 0,
    },
  } satisfies Prisma.ComponenteInventarioSelect;
}

type Fila = Prisma.ComponenteInventarioGetPayload<{ select: ReturnType<typeof seleccion> }>;

function aInsumo({ existencias, ...fila }: Fila): Insumo {
  return {
    ...fila,
    unidadBase: fila.unidadBase as Insumo['unidadBase'],
    costoCompra: fila.costoCompra === null ? null : Number(fila.costoCompra),
    stock: Number(existencias[0]?.cantidadActual ?? 0),
  };
}

export const insumoRepository: InsumoRepository = {
  async listar(restauranteId, sucursalId) {
    const filas = await prisma.componenteInventario.findMany({
      where: { restauranteId, tipo: 'INSUMO' },
      select: seleccion(sucursalId),
      orderBy: [{ activo: 'desc' }, { nombre: 'asc' }],
    });
    return filas.map(aInsumo);
  },

  async buscar(restauranteId, id) {
    const fila = await prisma.componenteInventario.findFirst({
      where: { id, restauranteId, tipo: 'INSUMO' },
      select: seleccion(null),
    });
    return fila && aInsumo(fila);
  },

  existeNombre: existeNombreComponente,

  usosEnRecetas: usosDeComponente,

  async platosDeReventa(restauranteId, id) {
    const platos = await prisma.itemMenu.findMany({
      where: { restauranteId, insumoId: id },
      select: { nombre: true },
      orderBy: { nombre: 'asc' },
    });
    return platos.map((p) => p.nombre);
  },

  async crear(restauranteId, datos) {
    const fila = await prisma.componenteInventario.create({
      data: {
        restauranteId,
        tipo: 'INSUMO',
        nombre: datos.nombre,
        unidadBase: datos.unidadBase,
        costoCompra: datos.costoCompra,
      },
      select: seleccion(null),
    });
    return aInsumo(fila);
  },

  async actualizar(restauranteId, id, datos) {
    const fila = await prisma.componenteInventario.update({
      where: { id, restauranteId },
      data: {
        nombre: datos.nombre,
        unidadBase: datos.unidadBase,
        costoCompra: datos.costoCompra,
        ...(datos.activo !== undefined && { activo: datos.activo }),
      },
      select: seleccion(null),
    });
    return aInsumo(fila);
  },

  async desactivar(restauranteId, id) {
    await prisma.componenteInventario.update({
      where: { id, restauranteId },
      data: { activo: false },
    });
  },
};
