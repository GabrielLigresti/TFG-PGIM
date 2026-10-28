import type { PedidoComensal, Referencia } from '@pgim/shared';
import type { Prisma } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';

// "Mi mesa": la cuenta de mesa del comensal con sus pedidos y lo pagado.
export interface FilaMesa {
  cuentaMesaId: string;
  estado: 'ABIERTA' | 'CERRADA';
  sucursal: Referencia;
  restauranteId: string;
  comensalId: string;
  mesaNumero: number;
  abiertaEn: Date;
  pedidos: PedidoComensal[];
  pagado: number;
  // El pago PENDIENTE de la mesa, si hay uno (nunca hay dos).
  pagoPendienteId: string | null;
}

export interface CuentaMesaRepository {
  // La cuenta ABIERTA del comensal en esa sucursal o, sin sucursal, en cualquiera.
  mesaAbiertaDelComensal(comensalId: string, sucursalId?: string): Promise<FilaMesa | null>;
  // Solo la cuenta cuya reserva es del comensal, abierta o cerrada.
  buscarDelComensal(comensalId: string, cuentaMesaId: string): Promise<FilaMesa | null>;
  // RegistroVisitas: si el titular pagó algo, alta de la cuenta de fidelidad
  // (si no tenía) y una visita por cuenta de mesa. true si la visita es nueva.
  registrarVisita(
    cuentaMesaId: string,
    restauranteId: string,
    comensalId: string,
  ): Promise<boolean>;
}

const seleccionMesa = {
  id: true,
  estado: true,
  abiertaEn: true,
  reserva: {
    select: {
      comensalId: true,
      mesa: { select: { numero: true } },
      sucursal: { select: { id: true, nombre: true, restauranteId: true } },
    },
  },
  pedidos: {
    select: {
      id: true,
      numero: true,
      creadoEn: true,
      estado: true,
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
    },
    orderBy: { numero: 'asc' },
  },
  pagos: {
    where: { estado: { not: 'RECHAZADO' } },
    select: { id: true, estado: true, monto: true },
  },
} satisfies Prisma.CuentaMesaSelect;

type Fila = Prisma.CuentaMesaGetPayload<{ select: typeof seleccionMesa }>;

const centavos = (valor: number) => Math.round(valor * 100) / 100;

function aFilaMesa(fila: Fila): FilaMesa {
  const { reserva } = fila;
  return {
    cuentaMesaId: fila.id,
    estado: fila.estado,
    sucursal: { id: reserva.sucursal.id, nombre: reserva.sucursal.nombre },
    restauranteId: reserva.sucursal.restauranteId,
    comensalId: reserva.comensalId,
    mesaNumero: reserva.mesa.numero,
    abiertaEn: fila.abiertaEn,
    pedidos: fila.pedidos.map((p) => {
      const lineas = p.lineas.map((l) => ({
        id: l.id,
        plato: l.itemMenu,
        cantidad: l.cantidad,
        precioUnitario: Number(l.precioUnitario),
        observaciones: l.observaciones,
      }));
      return {
        id: p.id,
        numero: p.numero,
        creadoEn: p.creadoEn.toISOString(),
        estado: p.estado,
        total: centavos(lineas.reduce((t, l) => t + l.cantidad * l.precioUnitario, 0)),
        lineas,
      };
    }),
    pagado: centavos(
      fila.pagos.filter((p) => p.estado === 'APROBADO').reduce((t, p) => t + Number(p.monto), 0),
    ),
    pagoPendienteId: fila.pagos.find((p) => p.estado === 'PENDIENTE')?.id ?? null,
  };
}

// Total de los pedidos no cancelados y lo pagado (pagos aprobados), para el
// cierre de mesa dentro de su transacción.
export async function totalesDeCuenta(
  tx: Prisma.TransactionClient,
  cuentaMesaId: string,
): Promise<{ total: number; pagado: number; pedidosActivos: number }> {
  const [fila] = await tx.$queryRaw<
    { total: string | null; pagado: string | null; activos: bigint }[]
  >`
    SELECT
      (SELECT SUM(lp.cantidad * lp.precio_unitario) FROM linea_pedido lp
         JOIN pedido p ON p.id = lp.pedido_id
         WHERE p.cuenta_mesa_id = ${cuentaMesaId}::uuid AND p.estado <> 'CANCELADO') AS total,
      (SELECT SUM(monto) FROM pago
         WHERE cuenta_mesa_id = ${cuentaMesaId}::uuid AND estado = 'APROBADO') AS pagado,
      (SELECT COUNT(*) FROM pedido
         WHERE cuenta_mesa_id = ${cuentaMesaId}::uuid
           AND estado IN ('CONFIRMADO', 'EN_PREPARACION', 'LISTO')) AS activos`;
  return {
    total: Number(fila?.total ?? 0),
    pagado: Number(fila?.pagado ?? 0),
    pedidosActivos: Number(fila?.activos ?? 0),
  };
}

export const cuentaMesaRepository: CuentaMesaRepository = {
  async mesaAbiertaDelComensal(comensalId, sucursalId) {
    const fila = await prisma.cuentaMesa.findFirst({
      where: { estado: 'ABIERTA', reserva: { comensalId, ...(sucursalId && { sucursalId }) } },
      select: seleccionMesa,
      orderBy: { abiertaEn: 'desc' },
    });
    return fila && aFilaMesa(fila);
  },

  async buscarDelComensal(comensalId, cuentaMesaId) {
    const fila = await prisma.cuentaMesa.findFirst({
      where: { id: cuentaMesaId, reserva: { comensalId } },
      select: seleccionMesa,
    });
    return fila && aFilaMesa(fila);
  },

  registrarVisita(cuentaMesaId, restauranteId, comensalId) {
    return prisma.$transaction(async (tx) => {
      const pagado = await tx.pago.aggregate({
        where: { cuentaMesaId, comensalId, estado: 'APROBADO' },
        _sum: { monto: true },
      });
      if (!(Number(pagado._sum.monto ?? 0) > 0)) return false;

      const cuenta = await tx.cuentaFidelidad.upsert({
        where: { comensalId_restauranteId: { comensalId, restauranteId } },
        create: { comensalId, restauranteId },
        update: {},
        select: { id: true },
      });
      const { count } = await tx.visita.createMany({
        data: [{ cuentaFidelidadId: cuenta.id, cuentaMesaId }],
        skipDuplicates: true,
      });
      if (count === 0) return false;
      await tx.cuentaFidelidad.update({
        where: { id: cuenta.id },
        data: { cantidadVisitas: { increment: 1 } },
      });
      return true;
    });
  },
};
