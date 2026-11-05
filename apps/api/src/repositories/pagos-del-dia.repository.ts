import type { PagoDelDia } from '@pgim/shared';
import { sumarDias } from '../domain/franjas';
import { inicioDeDiaArgentina } from '../lib/dia-argentina';
import { prisma } from '../lib/prisma';

// Consulta de solo lectura de CU-23. `fecha` es AAAA-MM-DD de Argentina.
export interface PagosDelDiaRepository {
  // Pagos APROBADO y RECHAZADO de la sucursal en ese día, el más nuevo primero.
  delDia(restauranteId: string, sucursalId: string, fecha: string): Promise<PagoDelDia[]>;
}

export const pagosDelDiaRepository: PagosDelDiaRepository = {
  async delDia(restauranteId, sucursalId, fecha) {
    const filas = await prisma.pago.findMany({
      where: {
        estado: { in: ['APROBADO', 'RECHAZADO'] },
        fecha: { gte: inicioDeDiaArgentina(fecha), lt: inicioDeDiaArgentina(sumarDias(fecha, 1)) },
        cuentaMesa: { reserva: { sucursalId, sucursal: { restauranteId } } },
      },
      select: {
        id: true,
        fecha: true,
        monto: true,
        metodo: true,
        estado: true,
        comensal: { select: { nombre: true } },
        comprobante: { select: { numero: true } },
        cuentaMesa: { select: { reserva: { select: { mesa: { select: { numero: true } } } } } },
      },
      orderBy: { fecha: 'desc' },
    });
    return filas.map((f) => ({
      id: f.id,
      fecha: f.fecha.toISOString(),
      mesaNumero: f.cuentaMesa.reserva.mesa.numero,
      comensalNombre: f.comensal.nombre,
      monto: Number(f.monto),
      metodo: f.metodo,
      estado: f.estado as 'APROBADO' | 'RECHAZADO',
      comprobanteNumero: f.comprobante?.numero ?? null,
    }));
  },
};
