import type { EstadoPagoComensal, MetodoPago } from '@pgim/shared';
import { calcularPuntos } from '../domain/beneficio';
import { estadoDePago, formatearComprobante } from '../domain/pago';
import { prisma } from '../lib/prisma';
import { totalesDeCuenta } from './cuenta-mesa.repository';
import {
  beneficiosActivos,
  contextoMesa,
  elegibilidad,
  type ElegibilidadBeneficio,
} from './elegibilidad';
import type { FilaBeneficio } from './fidelizacion.repository';

// Pago de la cuenta de la mesa (CU-06) en dos transacciones: la primera crea
// el pago PENDIENTE con su beneficio y reserva el stock; la segunda (resolver)
// lo aprueba o lo rechaza. Entre las dos, la pasarela, fuera de toda
// transacción.

// Descuento del beneficio elegido si el comensal lo puede usar en esta mesa;
// null si no. La decide el servicio con las reglas de clasificarBeneficios.
export type ValidarBeneficio = (
  beneficio: FilaBeneficio,
  eleg: ElegibilidadBeneficio | undefined,
  mesa: { menuActivoId: string | null; saldo: number },
) => number | null;

export interface DatosPagoNuevo {
  comensalId: string;
  cuentaMesaId: string;
  metodo: MetodoPago;
  beneficioId: string | null;
  ahora: Date;
}

export type ResultadoCrearPago =
  | {
      resultado: 'CREADO';
      pagoId: string;
      monto: number;
      sucursalId: string;
      mesaNumero: number;
      restaurante: string;
    }
  | { resultado: 'EN_CURSO'; pagoId: string }
  | { resultado: 'CERRADA' | 'SIN_SALDO' | 'BENEFICIO_NO_DISPONIBLE' | 'BENEFICIO_AGOTADO' };

export type ResultadoCobroPago =
  { estado: 'APROBADO'; referenciaExterna: string; metodo?: MetodoPago } | { estado: 'RECHAZADO' };

export interface ResolucionPago {
  estado: 'APROBADO' | 'RECHAZADO';
  pagoId: string;
  cuentaMesaId: string;
  sucursalId: string;
  restauranteId: string;
  comensalId: string;
  monto: number;
  puntosSumados: number;
  // Puntos que descontó el canje de una recompensa por puntos.
  puntosCanjeados: number;
}

export interface PagoRepository {
  crearPendiente(datos: DatosPagoNuevo, validar: ValidarBeneficio): Promise<ResultadoCrearPago>;
  // null si el pago ya no estaba PENDIENTE: una notificación repetida o un
  // vencimiento que llega tarde no hace nada.
  resolver(pagoId: string, resultado: ResultadoCobroPago): Promise<ResolucionPago | null>;
  pendientesVencidos(limite: Date): Promise<string[]>;
  // Solo un pago de una mesa del comensal.
  estadoDelComensal(
    comensalId: string,
    cuentaMesaId: string,
    pagoId: string,
  ): Promise<EstadoPagoComensal | null>;
}

const centavos = (valor: number) => Math.round(valor * 100) / 100;

// Revierte la transacción 1 cuando otro pago se llevó la última unidad.
class BeneficioAgotado extends Error {}

export const pagoRepository: PagoRepository = {
  async crearPendiente(datos, validar) {
    const { comensalId, cuentaMesaId } = datos;
    try {
      return await prisma.$transaction(
        async (tx): Promise<ResultadoCrearPago> => {
          // Bloquea la cuenta: el cierre, otro pago o un pedido no entran en el medio.
          const [cuenta] = await tx.$queryRaw<
            { id: string; sucursal_id: string; numero: number; restaurante: string }[]
          >`
            SELECT c.id, r.sucursal_id, m.numero, rest.nombre AS restaurante
            FROM cuenta_mesa c
            JOIN reserva r ON r.id = c.reserva_id
            JOIN mesa m ON m.id = r.mesa_id
            JOIN sucursal s ON s.id = r.sucursal_id
            JOIN restaurante rest ON rest.id = s.restaurante_id
            WHERE c.id = ${cuentaMesaId}::uuid AND r.comensal_id = ${comensalId}::uuid
              AND c.estado = 'ABIERTA'
            FOR UPDATE OF c`;
          if (!cuenta) return { resultado: 'CERRADA' };

          const enCurso = await tx.pago.findFirst({
            where: { cuentaMesaId, estado: 'PENDIENTE' },
            select: { id: true },
          });
          if (enCurso) return { resultado: 'EN_CURSO', pagoId: enCurso.id };

          const { total, pagado } = await totalesDeCuenta(tx, cuentaMesaId);
          const saldo = centavos(total - pagado);
          if (saldo <= 0) return { resultado: 'SIN_SALDO' };

          let descuento = 0;
          let beneficio: FilaBeneficio | undefined;
          if (datos.beneficioId) {
            const mesa = (await contextoMesa(tx, comensalId, cuentaMesaId))!;
            if (mesa.beneficioUsado) return { resultado: 'BENEFICIO_NO_DISPONIBLE' };
            // Bloquea el beneficio antes de leerlo: dos pagos por la última
            // unidad se ordenan acá.
            const bloqueado = await tx.$queryRaw<{ id: string }[]>`
              SELECT id FROM beneficio
              WHERE id = ${datos.beneficioId}::uuid AND restaurante_id = ${mesa.restauranteId}::uuid
              FOR UPDATE`;
            if (bloqueado.length === 0) return { resultado: 'BENEFICIO_NO_DISPONIBLE' };
            beneficio = (await beneficiosActivos(tx, mesa.restauranteId, datos.ahora)).find(
              (b) => b.id === datos.beneficioId,
            );
            if (!beneficio) return { resultado: 'BENEFICIO_NO_DISPONIBLE' };
            if (beneficio.stockDisponible === 0) return { resultado: 'BENEFICIO_AGOTADO' };
            const { porBeneficio } = await elegibilidad(tx, comensalId, mesa.restauranteId, [
              beneficio,
            ]);
            const calculado = validar(beneficio, porBeneficio.get(beneficio.id), {
              menuActivoId: mesa.menuActivoId,
              saldo,
            });
            if (calculado === null) return { resultado: 'BENEFICIO_NO_DISPONIBLE' };
            descuento = calculado;
          }

          const monto = centavos(saldo - descuento);
          const pago = await tx.pago.create({
            data: { cuentaMesaId, comensalId, monto, metodo: datos.metodo },
            select: { id: true },
          });
          if (beneficio) {
            await tx.beneficioAplicado.create({
              data: { pagoId: pago.id, beneficioId: beneficio.id, montoDescontado: descuento },
            });
            if (beneficio.stockDisponible !== null) {
              const { count } = await tx.beneficio.updateMany({
                where: { id: beneficio.id, stockDisponible: { gt: 0 } },
                data: { stockDisponible: { decrement: 1 } },
              });
              if (count !== 1) throw new BeneficioAgotado();
            }
          }
          return {
            resultado: 'CREADO',
            pagoId: pago.id,
            monto,
            sucursalId: cuenta.sucursal_id,
            mesaNumero: cuenta.numero,
            restaurante: cuenta.restaurante,
          };
        },
        { timeout: 15_000 },
      );
    } catch (e) {
      if (e instanceof BeneficioAgotado) return { resultado: 'BENEFICIO_AGOTADO' };
      throw e;
    }
  },

  resolver(pagoId, resultado) {
    return prisma.$transaction(
      async (tx): Promise<ResolucionPago | null> => {
        const [pago] = await tx.$queryRaw<
          {
            estado: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';
            monto: string;
            metodo: MetodoPago;
            comensal_id: string;
            cuenta_mesa_id: string;
            sucursal_id: string;
            restaurante_id: string;
          }[]
        >`
          SELECT p.estado, p.monto, p.metodo, p.comensal_id, p.cuenta_mesa_id,
                 r.sucursal_id, s.restaurante_id
          FROM pago p
          JOIN cuenta_mesa c ON c.id = p.cuenta_mesa_id
          JOIN reserva r ON r.id = c.reserva_id
          JOIN sucursal s ON s.id = r.sucursal_id
          WHERE p.id = ${pagoId}::uuid
          FOR UPDATE OF p`;
        if (!pago || pago.estado !== 'PENDIENTE') return null;

        const base = {
          pagoId,
          monto: Number(pago.monto),
          cuentaMesaId: pago.cuenta_mesa_id,
          sucursalId: pago.sucursal_id,
          restauranteId: pago.restaurante_id,
          comensalId: pago.comensal_id,
        };
        const aplicado = await tx.beneficioAplicado.findFirst({
          where: { pagoId },
          select: {
            beneficio: {
              select: { id: true, criterioTipo: true, criterioValor: true, stockDisponible: true },
            },
          },
        });

        if (resultado.estado === 'RECHAZADO') {
          await tx.pago.update({
            where: { id: pagoId },
            data: { estado: estadoDePago(pago.estado).rechazar() },
          });
          if (aplicado && aplicado.beneficio.stockDisponible !== null) {
            await tx.beneficio.update({
              where: { id: aplicado.beneficio.id },
              data: { stockDisponible: { increment: 1 } },
            });
          }
          return { ...base, estado: 'RECHAZADO', puntosSumados: 0, puntosCanjeados: 0 };
        }

        await tx.pago.update({
          where: { id: pagoId },
          data: {
            estado: estadoDePago(pago.estado).aprobar(),
            referenciaExterna: resultado.referenciaExterna,
            ...(resultado.metodo &&
              resultado.metodo !== pago.metodo && { metodo: resultado.metodo }),
          },
        });

        const monto = Number(pago.monto);
        const programa = await tx.programaFidelidad.findUnique({
          where: { restauranteId: pago.restaurante_id },
          select: { puntosPorUnidad: true },
        });
        const puntos = programa ? calcularPuntos(monto, Number(programa.puntosPorUnidad)) : 0;
        const cuenta = await tx.cuentaFidelidad.upsert({
          where: {
            comensalId_restauranteId: {
              comensalId: pago.comensal_id,
              restauranteId: pago.restaurante_id,
            },
          },
          create: {
            comensalId: pago.comensal_id,
            restauranteId: pago.restaurante_id,
            puntos,
            montoAcumulado: monto,
          },
          update: { puntos: { increment: puntos }, montoAcumulado: { increment: monto } },
          select: { id: true },
        });
        if (puntos > 0) {
          await tx.movimientoPuntos.create({
            data: { cuentaFidelidadId: cuenta.id, pagoId, tipo: 'ACREDITACION', puntos },
          });
        }

        // Canje de una recompensa por puntos. El saldo se validó al crear el
        // pago y hay una sola mesa abierta por comensal: si no alcanza, es un
        // error y la aprobación se revierte entera.
        let puntosCanjeados = 0;
        if (aplicado?.beneficio.criterioTipo === 'PUNTOS') {
          const costo = Number(aplicado.beneficio.criterioValor);
          puntosCanjeados = costo;
          const { count } = await tx.cuentaFidelidad.updateMany({
            where: { id: cuenta.id, puntos: { gte: costo } },
            data: { puntos: { decrement: costo } },
          });
          if (count !== 1) {
            throw new Error(`Puntos insuficientes para el canje del pago ${pagoId}`);
          }
          await tx.movimientoPuntos.create({
            data: { cuentaFidelidadId: cuenta.id, pagoId, tipo: 'CANJE', puntos: -costo },
          });
        }

        // Comprobante correlativo por sucursal: el candado ordena dos
        // aprobaciones simultáneas, porque no hay una fila que bloquear.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('comprobante:' || ${pago.sucursal_id}))`;
        const [maximo] = await tx.$queryRaw<{ ultimo: number | null }[]>`
          SELECT max(substring(numero from 3)::int) AS ultimo FROM comprobante
          WHERE sucursal_id = ${pago.sucursal_id}::uuid`;
        await tx.comprobante.create({
          data: {
            pagoId,
            sucursalId: pago.sucursal_id,
            numero: formatearComprobante((maximo?.ultimo ?? 0) + 1),
            total: monto,
          },
        });

        return { ...base, estado: 'APROBADO', puntosSumados: puntos, puntosCanjeados };
      },
      { timeout: 15_000 },
    );
  },

  // Tarea de sistema: recorre todos los restaurantes, por eso no filtra por tenant.
  async pendientesVencidos(limite) {
    const filas = await prisma.pago.findMany({
      where: { estado: 'PENDIENTE', fecha: { lt: limite } },
      select: { id: true },
      orderBy: { fecha: 'asc' },
    });
    return filas.map((f) => f.id);
  },

  async estadoDelComensal(comensalId, cuentaMesaId, pagoId) {
    const pago = await prisma.pago.findFirst({
      where: { id: pagoId, cuentaMesaId, comensalId },
      select: {
        id: true,
        estado: true,
        monto: true,
        comprobante: { select: { numero: true, fechaEmision: true, total: true } },
        beneficiosAplicados: {
          select: { montoDescontado: true, beneficio: { select: { nombre: true } } },
        },
        movimientosPuntos: { where: { tipo: 'ACREDITACION' }, select: { puntos: true } },
      },
    });
    if (!pago) return null;
    const aplicado = pago.beneficiosAplicados[0];
    return {
      pagoId: pago.id,
      estado: pago.estado,
      monto: Number(pago.monto),
      comprobante: pago.comprobante && {
        numero: pago.comprobante.numero,
        fecha: pago.comprobante.fechaEmision.toISOString(),
        total: Number(pago.comprobante.total),
        descuento: aplicado ? Number(aplicado.montoDescontado) : 0,
        beneficio: aplicado?.beneficio.nombre ?? null,
      },
      puntosSumados:
        pago.estado === 'APROBADO'
          ? pago.movimientosPuntos.reduce((t, m) => t + m.puntos, 0)
          : null,
    };
  },
};
