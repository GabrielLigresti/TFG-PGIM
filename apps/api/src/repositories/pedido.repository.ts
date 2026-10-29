import type { EstadoPedido, PedidoCola } from '@pgim/shared';
import { ESTADOS_ACTIVOS } from '../domain/pedido';
import type { Prisma } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';

export interface CuentaParaPedido {
  id: string;
  sucursalId: string;
  restauranteId: string;
  comensalId: string;
  mesaNumero: number;
  estado: 'ABIERTA' | 'CERRADA';
}

// Una línea lista para confirmar: precio ya copiado del menú y los insumos
// que consume (cantidad bruta en unidad base); vacío si el plato no tiene receta.
export interface LineaAConfirmar {
  itemMenuId: string;
  cantidad: number;
  precioUnitario: number;
  observaciones: string | null;
  insumos: Map<string, number>;
}

// 5a de la secuencia de CU-04: a un insumo no le alcanza el stock.
export class StockInsuficienteError extends Error {
  constructor(
    readonly componenteId: string,
    readonly itemMenuId: string,
  ) {
    super('No alcanza el stock');
    this.name = 'StockInsuficienteError';
  }
}

// La mesa se cerró entre la validación del servicio y la transacción.
export class MesaCerradaError extends Error {
  constructor() {
    super('La mesa ya está cerrada');
    this.name = 'MesaCerradaError';
  }
}

export interface PedidoRepository {
  // Solo la cuenta de mesa cuya reserva es del comensal.
  buscarCuentaDelComensal(
    comensalId: string,
    cuentaMesaId: string,
  ): Promise<CuentaParaPedido | null>;
  // Pedido, líneas, descuento de stock y movimientos en una sola transacción.
  // Lanza StockInsuficienteError (y no queda nada escrito) si algún insumo no
  // alcanza o no tiene existencia en la sucursal.
  confirmar(cuenta: CuentaParaPedido, lineas: LineaAConfirmar[]): Promise<PedidoCola>;
  // componenteId → cantidad actual en la sucursal.
  existencias(sucursalId: string): Promise<Map<string, number>>;
  // CU-05: pedidos activos de la sucursal de trabajo, por orden de llegada.
  cola(restauranteId: string, sucursalId: string): Promise<PedidoCola[]>;
  buscarEnSucursal(
    restauranteId: string,
    sucursalId: string,
    id: string,
  ): Promise<{ id: string; estado: EstadoPedido; comensalId: string } | null>;
  // Solo si sigue en `desde`; false si otra operación lo cambió antes. Al
  // pasar a LISTO guarda listoEn.
  cambiarEstado(
    restauranteId: string,
    sucursalId: string,
    id: string,
    desde: EstadoPedido,
    hacia: EstadoPedido,
  ): Promise<{ listoEn: Date | null } | false>;
  // CONFIRMADO → CANCELADO con el motivo, y devolución de cada consumo de
  // stock, en una transacción. false si ya no estaba CONFIRMADO.
  cancelar(restauranteId: string, sucursalId: string, id: string, motivo: string): Promise<boolean>;
}

function deLaSucursal(restauranteId: string, sucursalId: string) {
  return { sucursalId, sucursal: { restauranteId } };
}

export const seleccionPedidoCola = {
  id: true,
  numero: true,
  creadoEn: true,
  listoEn: true,
  estado: true,
  cuentaMesa: { select: { reserva: { select: { mesa: { select: { numero: true } } } } } },
  lineas: {
    select: {
      id: true,
      cantidad: true,
      precioUnitario: true,
      observaciones: true,
      itemMenu: { select: { id: true, nombre: true } },
    },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.PedidoSelect;

type FilaPedido = Prisma.PedidoGetPayload<{ select: typeof seleccionPedidoCola }>;

export function aPedidoCola(fila: FilaPedido): PedidoCola {
  return {
    id: fila.id,
    numero: fila.numero,
    mesa: { numero: fila.cuentaMesa.reserva.mesa.numero },
    creadoEn: fila.creadoEn.toISOString(),
    listoEn: fila.listoEn?.toISOString() ?? null,
    estado: fila.estado,
    lineas: fila.lineas.map((l) => ({
      id: l.id,
      plato: l.itemMenu,
      cantidad: l.cantidad,
      precioUnitario: Number(l.precioUnitario),
      observaciones: l.observaciones,
    })),
  };
}

// El stock se guarda con 3 decimales: se redondea cada consumo antes de
// sumarlo, para que la devolución reponga exactamente lo descontado.
const redondear = (valor: number) => Math.round(valor * 1000) / 1000;

// Confirmaciones y cancelaciones de una sucursal, de a una: el número de
// pedido es correlativo y las dos mueven las mismas existencias.
async function bloquearPedidosDeSucursal(tx: Prisma.TransactionClient, sucursalId: string) {
  await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${`pedido|${sucursalId}`}::text))) AS bloqueo`;
}

export const pedidoRepository: PedidoRepository = {
  async buscarCuentaDelComensal(comensalId, cuentaMesaId) {
    const fila = await prisma.cuentaMesa.findFirst({
      where: { id: cuentaMesaId, reserva: { comensalId } },
      select: {
        id: true,
        estado: true,
        reserva: {
          select: {
            comensalId: true,
            sucursalId: true,
            sucursal: { select: { restauranteId: true } },
            mesa: { select: { numero: true } },
          },
        },
      },
    });
    return (
      fila && {
        id: fila.id,
        estado: fila.estado,
        sucursalId: fila.reserva.sucursalId,
        restauranteId: fila.reserva.sucursal.restauranteId,
        comensalId: fila.reserva.comensalId,
        mesaNumero: fila.reserva.mesa.numero,
      }
    );
  },

  confirmar(cuenta, lineas) {
    return prisma.$transaction(async (tx) => {
      // La cuenta sigue abierta y nadie la cierra mientras tanto (el cierre
      // la bloquea igual).
      const abierta = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM cuenta_mesa WHERE id = ${cuenta.id}::uuid AND estado = 'ABIERTA' FOR UPDATE`;
      if (abierta.length === 0) throw new MesaCerradaError();
      // Número correlativo de la sucursal (max + 1), con el bloqueo tomado.
      await bloquearPedidosDeSucursal(tx, cuenta.sucursalId);
      const ultimo = await tx.pedido.aggregate({
        where: { sucursalId: cuenta.sucursalId },
        _max: { numero: true },
      });

      const pedido = await tx.pedido.create({
        data: {
          cuentaMesaId: cuenta.id,
          sucursalId: cuenta.sucursalId,
          numero: (ultimo._max.numero ?? 0) + 1,
        },
        select: { id: true },
      });
      // Una línea por vez, para asociar cada consumo a su línea sin depender
      // del orden en que la base devuelve los ids.
      const idsLineas: string[] = [];
      for (const l of lineas) {
        const linea = await tx.lineaPedido.create({
          data: {
            pedidoId: pedido.id,
            itemMenuId: l.itemMenuId,
            cantidad: l.cantidad,
            precioUnitario: l.precioUnitario,
            observaciones: l.observaciones,
          },
          select: { id: true },
        });
        idsLineas.push(linea.id);
      }

      // Consumo por línea e insumo, y el total por insumo.
      const consumos = lineas.flatMap((l, i) =>
        [...l.insumos].map(([componenteId, cantidad]) => ({
          lineaPedidoId: idsLineas[i]!,
          itemMenuId: l.itemMenuId,
          componenteId,
          cantidad: redondear(cantidad),
        })),
      );
      const totales = new Map<string, number>();
      for (const c of consumos) {
        totales.set(c.componenteId, redondear((totales.get(c.componenteId) ?? 0) + c.cantidad));
      }

      // Ordenados por insumo, para que dos transacciones nunca se bloqueen
      // en orden cruzado. El UPDATE condicional nunca deja stock negativo.
      const existencias = new Map<string, string>();
      for (const componenteId of [...totales.keys()].sort()) {
        const cantidad = totales.get(componenteId)!.toFixed(3);
        const filas = await tx.$queryRaw<{ id: string }[]>`
          UPDATE existencia SET cantidad_actual = cantidad_actual - ${cantidad}::numeric
          WHERE sucursal_id = ${cuenta.sucursalId}::uuid
            AND componente_id = ${componenteId}::uuid
            AND cantidad_actual >= ${cantidad}::numeric
          RETURNING id`;
        if (filas.length === 0) {
          const linea = consumos.find((c) => c.componenteId === componenteId)!;
          throw new StockInsuficienteError(componenteId, linea.itemMenuId);
        }
        existencias.set(componenteId, filas[0]!.id);
      }

      if (consumos.length > 0) {
        const costos = await tx.componenteInventario.findMany({
          where: { id: { in: [...totales.keys()] } },
          select: { id: true, costoCompraVigente: true },
        });
        const costo = new Map(costos.map((c) => [c.id, c.costoCompraVigente ?? 0]));
        await tx.movimientoStock.createMany({
          data: consumos.map((c) => ({
            existenciaId: existencias.get(c.componenteId)!,
            tipo: 'CONSUMO_PEDIDO' as const,
            // Con signo, como pide el modelo: el consumo resta.
            cantidad: -c.cantidad,
            costoUnitario: costo.get(c.componenteId) ?? 0,
            lineaPedidoId: c.lineaPedidoId,
          })),
        });
      }

      return aPedidoCola(
        await tx.pedido.findUniqueOrThrow({
          where: { id: pedido.id },
          select: seleccionPedidoCola,
        }),
      );
    });
  },

  async existencias(sucursalId) {
    const filas = await prisma.existencia.findMany({
      where: { sucursalId },
      select: { componenteId: true, cantidadActual: true },
    });
    return new Map(filas.map((f) => [f.componenteId, Number(f.cantidadActual)]));
  },

  async cola(restauranteId, sucursalId) {
    const filas = await prisma.pedido.findMany({
      where: { ...deLaSucursal(restauranteId, sucursalId), estado: { in: ESTADOS_ACTIVOS } },
      select: seleccionPedidoCola,
      orderBy: [{ creadoEn: 'asc' }, { numero: 'asc' }],
    });
    return filas.map(aPedidoCola);
  },

  async buscarEnSucursal(restauranteId, sucursalId, id) {
    const fila = await prisma.pedido.findFirst({
      where: { id, ...deLaSucursal(restauranteId, sucursalId) },
      select: {
        id: true,
        estado: true,
        cuentaMesa: { select: { reserva: { select: { comensalId: true } } } },
      },
    });
    return (
      fila && { id: fila.id, estado: fila.estado, comensalId: fila.cuentaMesa.reserva.comensalId }
    );
  },

  async cambiarEstado(restauranteId, sucursalId, id, desde, hacia) {
    const listoEn = hacia === 'LISTO' ? new Date() : null;
    const { count } = await prisma.pedido.updateMany({
      where: { id, estado: desde, ...deLaSucursal(restauranteId, sucursalId) },
      data: { estado: hacia, ...(listoEn && { listoEn }) },
    });
    return count === 1 && { listoEn };
  },

  cancelar(restauranteId, sucursalId, id, motivo) {
    return prisma.$transaction(async (tx) => {
      // El mismo bloqueo que confirmar: nunca se cruzan sobre las existencias.
      await bloquearPedidosDeSucursal(tx, sucursalId);
      const { count } = await tx.pedido.updateMany({
        where: { id, estado: 'CONFIRMADO', ...deLaSucursal(restauranteId, sucursalId) },
        data: { estado: 'CANCELADO', motivoCancelacion: motivo },
      });
      if (count !== 1) return false;
      const consumos = await tx.movimientoStock.findMany({
        where: { tipo: 'CONSUMO_PEDIDO', lineaPedido: { pedidoId: id } },
        select: { existenciaId: true, cantidad: true, costoUnitario: true, lineaPedidoId: true },
        orderBy: { existencia: { componenteId: 'asc' } },
      });
      // El consumo se guardó negativo: la devolución suma lo mismo, en positivo.
      for (const c of consumos) {
        await tx.existencia.update({
          where: { id: c.existenciaId },
          data: { cantidadActual: { decrement: c.cantidad } },
        });
      }
      await tx.movimientoStock.createMany({
        data: consumos.map((c) => ({
          ...c,
          cantidad: c.cantidad.negated(),
          tipo: 'DEVOLUCION_PEDIDO' as const,
          motivo,
        })),
      });
      return true;
    });
  },
};
