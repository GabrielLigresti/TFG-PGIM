import type { UnidadBase, UnidadMedida } from '@pgim/shared';
import type { Prisma } from '../generated/prisma/client';
import type { Componente, Receta } from '../domain/receta';
import { prisma } from '../lib/prisma';
import { bloquearStockDeSucursal } from './bloqueo-stock';
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

export type ExistenciaEnSucursal = { sucursal: string; cantidad: number };

// Resultado de salir del stock: si no es ok, no se escribió nada.
export type ResultadoSalidaDeStock =
  | { ok: true }
  | { ok: false; motivo: 'EXISTENCIAS'; sucursales: ExistenciaEnSucursal[] }
  | { ok: false; motivo: 'PEDIDOS_CONFIRMADOS' };

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
  // Igual que desactivarLlevaStock: si hay existencia o pedidos confirmados, no da de baja.
  desactivarIntermedio(restauranteId: string, id: string): Promise<ResultadoSalidaDeStock>;
  existeNombre(restauranteId: string, nombre: string): Promise<boolean>;
  usosDeComponente(restauranteId: string, id: string): Promise<string[]>;
  activarLlevaStock(restauranteId: string, id: string, costoVigente: number): Promise<void>;
  // Con las sucursales bloqueadas, si hay pedidos confirmados que descontaron el intermedio
  // o existencia mayor a 0 devuelve el motivo (sin escribir); si no, apaga la marca y
  // limpia el costo vigente.
  desactivarLlevaStock(restauranteId: string, id: string): Promise<ResultadoSalidaDeStock>;
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

// Bloquea el stock de todas las sucursales del restaurante (ordenadas por id, para no
// cruzarse con otras transacciones), lee las existencias del intermedio y recién ahí
// escribe: una tanda o un ajuste no puede entrar entre el chequeo y la escritura.
async function sinExistencias(
  restauranteId: string,
  id: string,
  datos: Prisma.ComponenteInventarioUpdateInput,
): Promise<ResultadoSalidaDeStock> {
  return prisma.$transaction(async (tx) => {
    const sucursales = await tx.sucursal.findMany({
      where: { restauranteId },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    for (const s of sucursales) await bloquearStockDeSucursal(tx, s.id);
    // Un pedido confirmado que descontó el intermedio puede cancelarse y devolverlo: con la
    // marca apagada o dado de baja, esa devolución dejaría stock huérfano.
    const pedidoConfirmado = await tx.pedido.findFirst({
      where: {
        estado: 'CONFIRMADO',
        sucursal: { restauranteId },
        lineas: {
          some: {
            movimientosStock: {
              some: {
                tipo: 'CONSUMO_PEDIDO',
                existencia: { componenteId: id, componente: { restauranteId } },
              },
            },
          },
        },
      },
      select: { id: true },
    });
    if (pedidoConfirmado) return { ok: false, motivo: 'PEDIDOS_CONFIRMADOS' };
    const filas = await tx.existencia.findMany({
      where: {
        componenteId: id,
        cantidadActual: { gt: 0 },
        componente: { restauranteId },
        sucursal: { restauranteId },
      },
      select: { cantidadActual: true, sucursal: { select: { nombre: true } } },
      orderBy: { sucursal: { nombre: 'asc' } },
    });
    if (filas.length > 0) {
      return {
        ok: false,
        motivo: 'EXISTENCIAS',
        sucursales: filas.map((f) => ({
          sucursal: f.sucursal.nombre,
          cantidad: Number(f.cantidadActual),
        })),
      };
    }
    await tx.componenteInventario.update({
      where: { id, restauranteId, tipo: 'INTERMEDIO' },
      data: datos,
    });
    return { ok: true };
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
        costoCompraVigente: true,
        llevaStock: true,
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
          costoCompraVigente: f.costoCompraVigente === null ? null : Number(f.costoCompraVigente),
          llevaStock: f.llevaStock,
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
    // Los platos de reventa no tienen receta: no se listan para la cocina.
    const filas = await prisma.itemMenu.findMany({
      where: { restauranteId, insumoId: null },
      select: seleccionPlato,
      orderBy: [{ activo: 'desc' }, { categoria: { nombre: 'asc' } }, { nombre: 'asc' }],
    });
    return filas.map(aPlato);
  },

  async buscarPlato(restauranteId, itemId) {
    const fila = await prisma.itemMenu.findFirst({
      where: { id: itemId, restauranteId, insumoId: null },
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

  desactivarIntermedio: (restauranteId, id) => sinExistencias(restauranteId, id, { activo: false }),

  async activarLlevaStock(restauranteId, id, costoVigente) {
    await prisma.componenteInventario.update({
      where: { id, restauranteId, tipo: 'INTERMEDIO' },
      data: { llevaStock: true, costoCompraVigente: costoVigente },
    });
  },

  desactivarLlevaStock: (restauranteId, id) =>
    sinExistencias(restauranteId, id, { llevaStock: false, costoCompraVigente: null }),

  existeNombre: (restauranteId, nombre) => existeNombreComponente(restauranteId, nombre),

  usosDeComponente,
};
