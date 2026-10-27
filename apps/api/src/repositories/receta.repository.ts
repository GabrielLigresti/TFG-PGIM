import type { UnidadBase, UnidadMedida } from '@pgim/shared';
import type { Prisma } from '../generated/prisma/client';
import type { Componente, Receta } from '../domain/receta';
import { prisma } from '../lib/prisma';
import { existeNombreComponente, usosDeComponente } from './componente.repository';

// Receta tal como sale de la base: las líneas apuntan a componentes por id.
export interface RecetaFila {
  rendimiento: number;
  instrucciones: string | null;
  lineas: {
    componenteId: string;
    cantidad: number;
    unidad: UnidadMedida;
    porcentajeMerma: number;
  }[];
}

export interface PlatoConReceta {
  id: string;
  nombre: string;
  activo: boolean;
  categoria: string;
  receta: RecetaFila | null;
}

export type Catalogo = Map<string, Componente>;

export interface RecetaRepository {
  // Todos los componentes del restaurante con sus recetas resueltas (Composite).
  cargarCatalogo(restauranteId: string): Promise<Catalogo>;
  listarPlatos(restauranteId: string): Promise<PlatoConReceta[]>;
  buscarPlato(restauranteId: string, itemId: string): Promise<PlatoConReceta | null>;
  guardarRecetaPlato(restauranteId: string, itemId: string, receta: Receta): Promise<void>;
  guardarRecetaIntermedio(restauranteId: string, id: string, receta: Receta): Promise<void>;
  crearIntermedio(
    restauranteId: string,
    nombre: string,
    unidadBase: UnidadBase,
    receta: Receta,
  ): Promise<string>;
  borrarRecetaPlato(restauranteId: string, itemId: string): Promise<void>;
  desactivarIntermedio(restauranteId: string, id: string): Promise<void>;
  existeNombre(restauranteId: string, nombre: string): Promise<boolean>;
  usosDeComponente(restauranteId: string, id: string): Promise<string[]>;
}

export const seleccionReceta = {
  rendimiento: true,
  instrucciones: true,
  lineas: {
    select: { componenteId: true, cantidad: true, unidad: true, porcentajeMerma: true },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.RecetaSelect;

type RecetaPrisma = Prisma.RecetaGetPayload<{ select: typeof seleccionReceta }>;

export function aRecetaFila(receta: RecetaPrisma): RecetaFila {
  return {
    rendimiento: Number(receta.rendimiento),
    instrucciones: receta.instrucciones,
    lineas: receta.lineas.map((l) => ({
      componenteId: l.componenteId,
      cantidad: Number(l.cantidad),
      unidad: l.unidad,
      porcentajeMerma: Number(l.porcentajeMerma),
    })),
  };
}

// Resuelve las líneas contra el catálogo (los componentes son objetos compartidos).
export function armarReceta(fila: RecetaFila, catalogo: Catalogo): Receta {
  return {
    rendimiento: fila.rendimiento,
    instrucciones: fila.instrucciones,
    lineas: fila.lineas.flatMap((l) => {
      const componente = catalogo.get(l.componenteId);
      return componente ? [{ ...l, componente }] : [];
    }),
  };
}

const seleccionPlato = {
  id: true,
  nombre: true,
  activo: true,
  categoria: { select: { nombre: true } },
  receta: { select: seleccionReceta },
} satisfies Prisma.ItemMenuSelect;

type PlatoPrisma = Prisma.ItemMenuGetPayload<{ select: typeof seleccionPlato }>;

function aPlato(fila: PlatoPrisma): PlatoConReceta {
  return {
    id: fila.id,
    nombre: fila.nombre,
    activo: fila.activo,
    categoria: fila.categoria.nombre,
    receta: fila.receta && aRecetaFila(fila.receta),
  };
}

type Dueno = { itemMenuId: string } | { productoIntermedioId: string };

// Reemplaza la receta del dueño (o la crea) con sus líneas.
async function escribirReceta(tx: Prisma.TransactionClient, dueno: Dueno, receta: Receta) {
  const datos = { rendimiento: receta.rendimiento, instrucciones: receta.instrucciones };
  const { id } = await tx.receta.upsert({
    where: dueno,
    update: datos,
    create: { ...dueno, ...datos },
    select: { id: true },
  });
  await tx.lineaReceta.deleteMany({ where: { recetaId: id } });
  await tx.lineaReceta.createMany({
    data: receta.lineas.map((l) => ({
      recetaId: id,
      componenteId: l.componente.id,
      cantidad: l.cantidad,
      unidad: l.unidad,
      porcentajeMerma: l.porcentajeMerma,
    })),
  });
}

export const recetaRepository: RecetaRepository = {
  async cargarCatalogo(restauranteId) {
    const filas = await prisma.componenteInventario.findMany({
      where: { restauranteId },
      select: {
        id: true,
        nombre: true,
        tipo: true,
        unidadBase: true,
        activo: true,
        costoCompra: true,
        receta: { select: seleccionReceta },
      },
      orderBy: { nombre: 'asc' },
    });
    const catalogo: Catalogo = new Map(
      filas.map((f) => [
        f.id,
        {
          id: f.id,
          nombre: f.nombre,
          tipo: f.tipo,
          unidadBase: f.unidadBase as UnidadBase,
          activo: f.activo,
          costoCompra: f.costoCompra === null ? null : Number(f.costoCompra),
          receta: null,
        },
      ]),
    );
    for (const fila of filas) {
      if (fila.receta)
        catalogo.get(fila.id)!.receta = armarReceta(aRecetaFila(fila.receta), catalogo);
    }
    return catalogo;
  },

  async listarPlatos(restauranteId) {
    const filas = await prisma.itemMenu.findMany({
      where: { restauranteId },
      select: seleccionPlato,
      orderBy: [{ activo: 'desc' }, { categoria: { nombre: 'asc' } }, { nombre: 'asc' }],
    });
    return filas.map(aPlato);
  },

  async buscarPlato(restauranteId, itemId) {
    const fila = await prisma.itemMenu.findFirst({
      where: { id: itemId, restauranteId },
      select: seleccionPlato,
    });
    return fila && aPlato(fila);
  },

  async guardarRecetaPlato(restauranteId, itemId, receta) {
    await prisma.$transaction(async (tx) => {
      await tx.itemMenu.findFirstOrThrow({ where: { id: itemId, restauranteId } });
      await escribirReceta(tx, { itemMenuId: itemId }, receta);
    });
  },

  async guardarRecetaIntermedio(restauranteId, id, receta) {
    await prisma.$transaction(async (tx) => {
      await tx.componenteInventario.findFirstOrThrow({
        where: { id, restauranteId, tipo: 'INTERMEDIO' },
      });
      await escribirReceta(tx, { productoIntermedioId: id }, receta);
    });
  },

  async crearIntermedio(restauranteId, nombre, unidadBase, receta) {
    return prisma.$transaction(async (tx) => {
      const { id } = await tx.componenteInventario.create({
        data: { restauranteId, tipo: 'INTERMEDIO', nombre, unidadBase },
        select: { id: true },
      });
      await escribirReceta(tx, { productoIntermedioId: id }, receta);
      return id;
    });
  },

  async borrarRecetaPlato(restauranteId, itemId) {
    await prisma.receta.deleteMany({ where: { itemMenuId: itemId, itemMenu: { restauranteId } } });
  },

  async desactivarIntermedio(restauranteId, id) {
    await prisma.componenteInventario.update({
      where: { id, restauranteId, tipo: 'INTERMEDIO' },
      data: { activo: false },
    });
  },

  existeNombre: (restauranteId, nombre) => existeNombreComponente(restauranteId, nombre),

  usosDeComponente,
};
