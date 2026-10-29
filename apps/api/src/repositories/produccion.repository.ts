import type { Pagina, Referencia, UnidadBase } from '@pgim/shared';
import type { Prisma } from '../generated/prisma/client';
import type { ConsumoTanda } from '../domain/tanda';
import { prisma } from '../lib/prisma';
import { bloquearStockDeSucursal } from './bloqueo-stock';
import { ExistenciaInsuficienteError, type ContextoMovimiento } from './stock.repository';

const POR_PAGINA = 25;

// Cantidades y costos ya en unidad base y positivos.
export interface TandaARegistrar {
  intermedioId: string;
  esperada: number;
  obtenida: number;
  observacion: string | null;
  // Un consumo con `usada` 0 (componente de la receta que no se usó) no genera
  // movimiento.
  consumos: ConsumoTanda[];
  costoUnitarioTanda: number;
}

export interface TandaFila {
  id: string;
  fecha: Date;
  intermedio: Referencia;
  esperada: number;
  obtenida: number;
  observacion: string | null;
  empleado: string | null;
  costoUnitario: number;
  consumos: (ConsumoTanda & {
    componente: { id: string; nombre: string; unidadBase: UnidadBase };
  })[];
}

export interface FiltroTandas {
  intermedioId?: string;
  pagina: number;
}

export interface ProduccionRepository {
  // Descuenta lo usado, crea la tanda con sus movimientos, suma lo obtenido al
  // intermedio y le fija el costo vigente, todo en una transacción. Lanza
  // ExistenciaInsuficienteError (un componente que no alcanza) sin escribir nada.
  registrarTanda(ctx: ContextoMovimiento, t: TandaARegistrar): Promise<string>;
  listarTandas(
    restauranteId: string,
    sucursalId: string,
    filtro: FiltroTandas,
  ): Promise<Pagina<TandaFila>>;
  buscarTanda(restauranteId: string, sucursalId: string, id: string): Promise<TandaFila | null>;
}

// El stock se guarda con 3 decimales.
const redondear = (valor: number) => Math.round(valor * 1000) / 1000;

const seleccionTanda = {
  id: true,
  fecha: true,
  cantidadEsperada: true,
  cantidadObtenida: true,
  observacion: true,
  intermedio: { select: { id: true, nombre: true } },
  empleado: { select: { nombreCompleto: true } },
  movimientos: {
    select: {
      tipo: true,
      cantidad: true,
      cantidadTeorica: true,
      costoUnitario: true,
      existencia: {
        select: { componente: { select: { id: true, nombre: true, unidadBase: true } } },
      },
    },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.TandaProduccionSelect;

type TandaLeida = Prisma.TandaProduccionGetPayload<{ select: typeof seleccionTanda }>;

function aTandaFila(t: TandaLeida): TandaFila {
  const produccion = t.movimientos.find((m) => m.tipo === 'PRODUCCION');
  return {
    id: t.id,
    fecha: t.fecha,
    intermedio: t.intermedio,
    esperada: Number(t.cantidadEsperada),
    obtenida: Number(t.cantidadObtenida),
    observacion: t.observacion,
    empleado: t.empleado.nombreCompleto,
    costoUnitario: Number(produccion?.costoUnitario ?? 0),
    // En la base los consumos van con signo negativo; acá, como magnitudes.
    consumos: t.movimientos
      .filter((m) => m.tipo === 'CONSUMO_PRODUCCION')
      .map((m) => ({
        componenteId: m.existencia.componente.id,
        componente: {
          id: m.existencia.componente.id,
          nombre: m.existencia.componente.nombre,
          unidadBase: m.existencia.componente.unidadBase as UnidadBase,
        },
        teorica: Math.abs(Number(m.cantidadTeorica ?? 0)),
        usada: Math.abs(Number(m.cantidad)),
        costoUnitario: Number(m.costoUnitario),
      })),
  };
}

export const produccionRepository: ProduccionRepository = {
  registrarTanda(ctx, t) {
    return prisma.$transaction(async (tx) => {
      await bloquearStockDeSucursal(tx, ctx.sucursalId);

      // La sucursal, el intermedio y los componentes son del restaurante.
      const ids = [...new Set([t.intermedioId, ...t.consumos.map((c) => c.componenteId)])];
      const [sucursal, componentes] = await Promise.all([
        tx.sucursal.findFirst({
          where: { id: ctx.sucursalId, restauranteId: ctx.restauranteId },
          select: { id: true },
        }),
        tx.componenteInventario.count({
          where: { id: { in: ids }, restauranteId: ctx.restauranteId },
        }),
      ]);
      if (!sucursal || componentes !== ids.length) {
        throw new Error('Componente o sucursal fuera del restaurante');
      }

      // Ordenados por componente, para que dos transacciones nunca se bloqueen
      // en orden cruzado. El UPDATE condicional nunca deja stock negativo.
      const usados = t.consumos
        .filter((c) => redondear(c.usada) > 0)
        .sort((a, b) => (a.componenteId < b.componenteId ? -1 : 1));
      const existenciaDe = new Map<string, string>();
      for (const c of usados) {
        const resta = redondear(c.usada).toFixed(3);
        const filas = await tx.$queryRaw<{ id: string }[]>`
          UPDATE existencia SET cantidad_actual = cantidad_actual - ${resta}::numeric
          WHERE sucursal_id = ${ctx.sucursalId}::uuid
            AND componente_id = ${c.componenteId}::uuid
            AND cantidad_actual >= ${resta}::numeric
          RETURNING id`;
        if (filas.length === 0) {
          const actual = await tx.existencia.findUnique({
            where: {
              sucursalId_componenteId: { sucursalId: ctx.sucursalId, componenteId: c.componenteId },
            },
            select: { cantidadActual: true },
          });
          throw new ExistenciaInsuficienteError(
            c.componenteId,
            Number(actual?.cantidadActual ?? 0),
          );
        }
        existenciaDe.set(c.componenteId, filas[0]!.id);
      }

      const obtenida = redondear(t.obtenida).toFixed(3);
      const tanda = await tx.tandaProduccion.create({
        data: {
          sucursalId: ctx.sucursalId,
          intermedioId: t.intermedioId,
          empleadoId: ctx.empleadoId,
          cantidadEsperada: redondear(t.esperada).toFixed(3),
          cantidadObtenida: obtenida,
          observacion: t.observacion,
        },
        select: { id: true },
      });

      if (usados.length > 0) {
        await tx.movimientoStock.createMany({
          data: usados.map((c) => ({
            existenciaId: existenciaDe.get(c.componenteId)!,
            tipo: 'CONSUMO_PRODUCCION' as const,
            // Con signo, como pide el modelo: el consumo resta.
            cantidad: (-redondear(c.usada)).toFixed(3),
            cantidadTeorica: (-redondear(c.teorica)).toFixed(3),
            costoUnitario: c.costoUnitario,
            tandaId: tanda.id,
            empleadoId: ctx.empleadoId,
          })),
        });
      }

      // Lo obtenido se suma a la existencia del intermedio (se crea si falta).
      const existenciaIntermedio = await tx.existencia.upsert({
        where: {
          sucursalId_componenteId: { sucursalId: ctx.sucursalId, componenteId: t.intermedioId },
        },
        create: { sucursalId: ctx.sucursalId, componenteId: t.intermedioId },
        update: {},
        select: { id: true },
      });
      await tx.$executeRaw`
        UPDATE existencia SET cantidad_actual = cantidad_actual + ${obtenida}::numeric
        WHERE id = ${existenciaIntermedio.id}::uuid`;
      await tx.movimientoStock.create({
        data: {
          existenciaId: existenciaIntermedio.id,
          tipo: 'PRODUCCION',
          cantidad: obtenida,
          costoUnitario: t.costoUnitarioTanda,
          tandaId: tanda.id,
          empleadoId: ctx.empleadoId,
        },
      });
      // El costo de la última tanda pasa a ser el vigente del intermedio.
      await tx.componenteInventario.updateMany({
        where: { id: t.intermedioId, restauranteId: ctx.restauranteId },
        data: { costoCompraVigente: t.costoUnitarioTanda },
      });
      return tanda.id;
    });
  },

  async listarTandas(restauranteId, sucursalId, filtro) {
    const where: Prisma.TandaProduccionWhereInput = {
      sucursalId,
      sucursal: { restauranteId },
      ...(filtro.intermedioId && { intermedioId: filtro.intermedioId }),
    };
    const [total, filas] = await Promise.all([
      prisma.tandaProduccion.count({ where }),
      prisma.tandaProduccion.findMany({
        where,
        select: seleccionTanda,
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        skip: (filtro.pagina - 1) * POR_PAGINA,
        take: POR_PAGINA,
      }),
    ]);
    return { filas: filas.map(aTandaFila), total, pagina: filtro.pagina, porPagina: POR_PAGINA };
  },

  async buscarTanda(restauranteId, sucursalId, id) {
    const fila = await prisma.tandaProduccion.findFirst({
      where: { id, sucursalId, sucursal: { restauranteId } },
      select: seleccionTanda,
    });
    return fila ? aTandaFila(fila) : null;
  },
};
