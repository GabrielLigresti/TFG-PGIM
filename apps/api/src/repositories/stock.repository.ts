import type {
  ComponenteStock,
  MotivoMerma,
  MovimientoStockFila,
  Pagina,
  TipoMovimiento,
  UnidadBase,
} from '@pgim/shared';
import type { Prisma } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';
import { bloquearStockDeSucursal } from './bloqueo-stock';

const POR_PAGINA = 25;

// Una resta que dejaría la existencia en negativo.
export class ExistenciaInsuficienteError extends Error {
  constructor(
    readonly componenteId: string,
    readonly existencia: number,
  ) {
    super('No alcanza el stock');
    this.name = 'ExistenciaInsuficienteError';
  }
}

// El componente ya no puede tener stock: está dado de baja o es un intermedio sin la marca.
export class ComponenteSinStockError extends Error {
  constructor(readonly componenteId: string) {
    super('El componente ya no lleva stock');
    this.name = 'ComponenteSinStockError';
  }
}

// El conteo coincide con lo que dice el sistema.
export class AjusteSinDiferenciaError extends Error {
  constructor() {
    super('El conteo coincide con el stock');
    this.name = 'AjusteSinDiferenciaError';
  }
}

// Cantidades y costos ya en unidad base y positivos.
export type MovimientoARegistrar =
  | { tipo: 'INGRESO'; componenteId: string; cantidad: number; costoUnitario: number }
  | {
      tipo: 'MERMA';
      componenteId: string;
      cantidad: number;
      costoUnitario: number;
      motivoMerma: MotivoMerma;
      observacion: string | null;
    }
  | {
      tipo: 'AJUSTE';
      componenteId: string;
      cantidadContada: number;
      costoUnitario: number;
      motivo: string;
    };

export interface ContextoMovimiento {
  restauranteId: string;
  sucursalId: string;
  empleadoId: string;
}

export interface FiltroMovimientos {
  componenteId?: string;
  tipo?: TipoMovimiento;
  motivoMerma?: MotivoMerma;
  pagina: number;
}

export interface StockRepository {
  // Insumos e intermedios con stock (activos e inactivos), por nombre, con la
  // existencia de la sucursal.
  listarComponentes(restauranteId: string, sucursalId: string): Promise<ComponenteStock[]>;
  // Existencia, movimiento y costo vigente en una sola transacción. Devuelve
  // la existencia resultante. Lanza ExistenciaInsuficienteError (una resta que
  // dejaría negativo) o AjusteSinDiferenciaError, sin escribir nada.
  registrarMovimiento(
    ctx: ContextoMovimiento,
    mov: MovimientoARegistrar,
  ): Promise<{ existencia: number }>;
  listarMovimientos(
    restauranteId: string,
    sucursalId: string,
    filtro: FiltroMovimientos,
  ): Promise<Pagina<MovimientoStockFila>>;
}

// El stock se guarda con 3 decimales.
const redondear = (valor: number) => Math.round(valor * 1000) / 1000;

export const stockRepository: StockRepository = {
  async listarComponentes(restauranteId, sucursalId) {
    const filas = await prisma.componenteInventario.findMany({
      where: { restauranteId, OR: [{ tipo: 'INSUMO' }, { llevaStock: true }] },
      select: {
        id: true,
        nombre: true,
        tipo: true,
        unidadBase: true,
        activo: true,
        costoCompraVigente: true,
        existencias: { where: { sucursalId }, select: { cantidadActual: true } },
      },
      orderBy: { nombre: 'asc' },
    });
    return filas.map((f) => ({
      id: f.id,
      nombre: f.nombre,
      tipo: f.tipo,
      unidadBase: f.unidadBase as UnidadBase,
      activo: f.activo,
      existencia: Number(f.existencias[0]?.cantidadActual ?? 0),
      costoCompraVigente: f.costoCompraVigente === null ? null : Number(f.costoCompraVigente),
    }));
  },

  registrarMovimiento(ctx, mov) {
    return prisma.$transaction(async (tx) => {
      await bloquearStockDeSucursal(tx, ctx.sucursalId);
      // El componente y la sucursal son del restaurante.
      const sucursal = await tx.sucursal.findFirst({
        where: { id: ctx.sucursalId, restauranteId: ctx.restauranteId },
        select: { id: true },
      });
      const componente = await tx.componenteInventario.findFirst({
        where: { id: mov.componenteId, restauranteId: ctx.restauranteId },
        select: { id: true, activo: true, tipo: true, llevaStock: true },
      });
      if (!sucursal || !componente) throw new Error('Componente o sucursal fuera del restaurante');
      // Con el lock tomado: la baja o la marca pudieron cambiar desde que el servicio leyó.
      if (!componente.activo || (componente.tipo !== 'INSUMO' && !componente.llevaStock)) {
        throw new ComponenteSinStockError(componente.id);
      }

      // Sin fila todavía cuenta como 0: se crea y se bloquea para leerla.
      const fila = await tx.existencia.upsert({
        where: {
          sucursalId_componenteId: { sucursalId: ctx.sucursalId, componenteId: mov.componenteId },
        },
        create: { sucursalId: ctx.sucursalId, componenteId: mov.componenteId },
        update: {},
        select: { id: true },
      });
      const [actual] = await tx.$queryRaw<{ cantidad: string }[]>`
        SELECT cantidad_actual::text AS cantidad FROM existencia
        WHERE id = ${fila.id}::uuid FOR UPDATE`;
      const antes = Number(actual!.cantidad);

      let cantidad: number; // con signo
      let existencia: number;
      let datos: { motivoMerma?: MotivoMerma; motivo?: string | null } = {};

      if (mov.tipo === 'INGRESO') {
        cantidad = redondear(mov.cantidad);
        const filas = await tx.$queryRaw<{ cantidad: string }[]>`
          UPDATE existencia SET cantidad_actual = cantidad_actual + ${cantidad.toFixed(3)}::numeric
          WHERE id = ${fila.id}::uuid
          RETURNING cantidad_actual::text AS cantidad`;
        existencia = Number(filas[0]!.cantidad);
        // El último costo de compra pasa a ser el vigente.
        await tx.componenteInventario.updateMany({
          where: { id: mov.componenteId, restauranteId: ctx.restauranteId },
          data: { costoCompraVigente: mov.costoUnitario },
        });
      } else if (mov.tipo === 'MERMA') {
        const resta = redondear(mov.cantidad).toFixed(3);
        const filas = await tx.$queryRaw<{ cantidad: string }[]>`
          UPDATE existencia SET cantidad_actual = cantidad_actual - ${resta}::numeric
          WHERE id = ${fila.id}::uuid AND cantidad_actual >= ${resta}::numeric
          RETURNING cantidad_actual::text AS cantidad`;
        if (filas.length === 0) throw new ExistenciaInsuficienteError(mov.componenteId, antes);
        cantidad = -Number(resta);
        existencia = Number(filas[0]!.cantidad);
        datos = { motivoMerma: mov.motivoMerma, motivo: mov.observacion };
      } else {
        const contada = redondear(mov.cantidadContada);
        cantidad = redondear(contada - antes);
        if (cantidad === 0) throw new AjusteSinDiferenciaError();
        await tx.existencia.update({
          where: { id: fila.id },
          data: { cantidadActual: contada.toFixed(3) },
        });
        existencia = contada;
        datos = { motivo: mov.motivo };
      }

      await tx.movimientoStock.create({
        data: {
          existenciaId: fila.id,
          tipo: mov.tipo,
          cantidad: cantidad.toFixed(3),
          costoUnitario: mov.costoUnitario,
          empleadoId: ctx.empleadoId,
          ...datos,
        },
      });
      return { existencia };
    });
  },

  async listarMovimientos(restauranteId, sucursalId, filtro) {
    const where: Prisma.MovimientoStockWhereInput = {
      existencia: {
        sucursalId,
        sucursal: { restauranteId },
        ...(filtro.componenteId && { componenteId: filtro.componenteId }),
      },
      ...(filtro.tipo && { tipo: filtro.tipo }),
      ...(filtro.motivoMerma && { motivoMerma: filtro.motivoMerma }),
    };
    const [total, filas] = await Promise.all([
      prisma.movimientoStock.count({ where }),
      prisma.movimientoStock.findMany({
        where,
        select: {
          id: true,
          fecha: true,
          tipo: true,
          cantidad: true,
          costoUnitario: true,
          motivoMerma: true,
          motivo: true,
          tandaId: true,
          empleado: { select: { nombreCompleto: true } },
          existencia: {
            select: { componente: { select: { id: true, nombre: true, unidadBase: true } } },
          },
        },
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        skip: (filtro.pagina - 1) * POR_PAGINA,
        take: POR_PAGINA,
      }),
    ]);
    return {
      filas: filas.map((f) => ({
        id: f.id,
        fecha: f.fecha.toISOString(),
        componente: {
          id: f.existencia.componente.id,
          nombre: f.existencia.componente.nombre,
          unidadBase: f.existencia.componente.unidadBase as UnidadBase,
        },
        tipo: f.tipo,
        cantidad: Number(f.cantidad),
        costoUnitario: Number(f.costoUnitario),
        motivoMerma: f.motivoMerma,
        motivo: f.motivo,
        empleado: f.empleado?.nombreCompleto ?? null,
        tandaId: f.tandaId,
      })),
      total,
      pagina: filtro.pagina,
      porPagina: POR_PAGINA,
    };
  },
};
