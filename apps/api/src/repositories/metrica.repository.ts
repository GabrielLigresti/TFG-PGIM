import type { MotivoMerma, Referencia } from '@pgim/shared';
import { costoTotal, costoUnitario } from '../domain/receta';
import type { HorarioServicioDatos } from '../domain/pronostico';
import { sumarDias } from '../domain/franjas';
import { aHora } from '../lib/hora';
import { prisma } from '../lib/prisma';
import { aFecha } from './apertura.repository';
import { aRecetaFila, armarReceta, recetaRepository, seleccionReceta } from './receta.repository';

// Consultas de solo lectura de CU-19. Todas reciben el restaurante y la lista
// de sucursales ya resuelta por el servicio, y filtran por las dos. Las fechas
// son AAAA-MM-DD de Argentina (UTC−3 fijo): el día arranca a las 03:00 UTC.

export interface LineaVendida {
  itemMenuId: string;
  nombre: string;
  unidades: number;
  ingresos: number;
}

export interface DatosOcupacion {
  sucursalId: string;
  horarios: HorarioServicioDatos[];
  capacidadesMesas: number[];
  reservas: { inicio: Date; cantidadPersonas: number }[];
}

export interface MetricaRepository {
  sucursalesActivas(restauranteId: string): Promise<Referencia[]>;
  // Pagos APROBADO con su fecha y monto.
  pagosAprobados(
    restauranteId: string,
    sucursalIds: string[],
    desde: string,
    hasta: string,
  ): Promise<{ fecha: Date; monto: number }[]>;
  // Unidades e ingresos por plato de los pedidos ENTREGADO.
  lineasEntregadas(
    restauranteId: string,
    sucursalIds: string[],
    desde: string,
    hasta: string,
  ): Promise<LineaVendida[]>;
  // Costo actual por porción (plato con receta) o por unidad (reventa); null si no hay dato.
  costosDePlatos(restauranteId: string, itemIds: string[]): Promise<Map<string, number | null>>;
  // Σ cantidad × costoUnitario de los movimientos MERMA, por motivo.
  mermaPorMotivo(
    restauranteId: string,
    sucursalIds: string[],
    desde: string,
    hasta: string,
  ): Promise<{ motivo: MotivoMerma; valor: number }[]>;
  // Reservas FINALIZADA que pueden caer en el período (el servicio las ubica por
  // fecha de servicio) y lo necesario para calcular la capacidad de cada sucursal.
  datosDeOcupacion(
    restauranteId: string,
    sucursalIds: string[],
    desde: string,
    hasta: string,
  ): Promise<DatosOcupacion[]>;
}

// Instante en que arranca el día `fecha` en Argentina.
const inicioDeDia = (fecha: string) => new Date(aFecha(fecha).getTime() + 3 * 3_600_000);

export const metricaRepository: MetricaRepository = {
  async sucursalesActivas(restauranteId) {
    return prisma.sucursal.findMany({
      where: { restauranteId, activa: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    });
  },

  async pagosAprobados(restauranteId, sucursalIds, desde, hasta) {
    const filas = await prisma.pago.findMany({
      where: {
        estado: 'APROBADO',
        fecha: { gte: inicioDeDia(desde), lt: inicioDeDia(sumarDias(hasta, 1)) },
        cuentaMesa: { reserva: { sucursalId: { in: sucursalIds }, sucursal: { restauranteId } } },
      },
      select: { fecha: true, monto: true },
    });
    return filas.map((f) => ({ fecha: f.fecha, monto: Number(f.monto) }));
  },

  async lineasEntregadas(restauranteId, sucursalIds, desde, hasta) {
    const grupos = await prisma.lineaPedido.groupBy({
      by: ['itemMenuId', 'precioUnitario'],
      where: {
        itemMenu: { restauranteId },
        pedido: {
          estado: 'ENTREGADO',
          sucursalId: { in: sucursalIds },
          sucursal: { restauranteId },
          creadoEn: { gte: inicioDeDia(desde), lt: inicioDeDia(sumarDias(hasta, 1)) },
        },
      },
      _sum: { cantidad: true },
    });
    const items = await prisma.itemMenu.findMany({
      where: { restauranteId, id: { in: [...new Set(grupos.map((g) => g.itemMenuId))] } },
      select: { id: true, nombre: true },
    });
    const nombres = new Map(items.map((i) => [i.id, i.nombre]));
    const porItem = new Map<string, LineaVendida>();
    for (const g of grupos) {
      const unidades = g._sum.cantidad ?? 0;
      const acum = porItem.get(g.itemMenuId) ?? {
        itemMenuId: g.itemMenuId,
        nombre: nombres.get(g.itemMenuId) ?? '',
        unidades: 0,
        ingresos: 0,
      };
      acum.unidades += unidades;
      acum.ingresos += unidades * Number(g.precioUnitario);
      porItem.set(g.itemMenuId, acum);
    }
    return [...porItem.values()];
  },

  async costosDePlatos(restauranteId, itemIds) {
    const costos = new Map<string, number | null>();
    if (itemIds.length === 0) return costos;
    const [catalogo, platos] = await Promise.all([
      recetaRepository.cargarCatalogo(restauranteId),
      prisma.itemMenu.findMany({
        where: { restauranteId, id: { in: itemIds } },
        select: { id: true, insumoId: true, receta: { select: seleccionReceta } },
      }),
    ]);
    for (const plato of platos) {
      if (plato.receta) {
        // El total de la receta alcanza para `rendimiento` porciones.
        const receta = armarReceta(aRecetaFila(plato.receta), catalogo);
        costos.set(plato.id, costoTotal(receta) / receta.rendimiento);
      } else if (plato.insumoId) {
        const insumo = catalogo.get(plato.insumoId);
        // Sin costo cargado es "sin dato": un 0 inflaría el margen.
        costos.set(
          plato.id,
          insumo && insumo.costoCompraVigente !== null ? costoUnitario(insumo) : null,
        );
      } else {
        costos.set(plato.id, null);
      }
    }
    return costos;
  },

  async mermaPorMotivo(restauranteId, sucursalIds, desde, hasta) {
    const filas = await prisma.movimientoStock.findMany({
      where: {
        tipo: 'MERMA',
        fecha: { gte: inicioDeDia(desde), lt: inicioDeDia(sumarDias(hasta, 1)) },
        existencia: { sucursalId: { in: sucursalIds }, sucursal: { restauranteId } },
      },
      select: { motivoMerma: true, cantidad: true, costoUnitario: true },
    });
    const porMotivo = new Map<MotivoMerma, number>();
    for (const f of filas) {
      const motivo = (f.motivoMerma ?? 'OTRO') as MotivoMerma;
      // La merma se guarda con cantidad negativa (resta stock).
      porMotivo.set(
        motivo,
        (porMotivo.get(motivo) ?? 0) + Math.abs(Number(f.cantidad)) * Number(f.costoUnitario),
      );
    }
    return [...porMotivo].map(([motivo, valor]) => ({ motivo, valor }));
  },

  async datosDeOcupacion(restauranteId, sucursalIds, desde, hasta) {
    const sucursales = await prisma.sucursal.findMany({
      where: { restauranteId, id: { in: sucursalIds } },
      select: {
        id: true,
        horariosServicio: { orderBy: { horaInicio: 'asc' } },
        mesas: { where: { activa: true }, select: { capacidad: true } },
        reservas: {
          where: {
            estado: 'FINALIZADA',
            // Un servicio que cruza la medianoche llega hasta la madrugada siguiente.
            inicio: { gte: inicioDeDia(desde), lt: inicioDeDia(sumarDias(hasta, 2)) },
          },
          select: { inicio: true, cantidadPersonas: true },
        },
      },
    });
    return sucursales.map((s) => ({
      sucursalId: s.id,
      horarios: s.horariosServicio.map((h) => ({
        franja: h.franja,
        horaInicio: aHora(h.horaInicio),
        horaFin: aHora(h.horaFin),
      })),
      capacidadesMesas: s.mesas.map((m) => m.capacidad),
      reservas: s.reservas,
    }));
  },
};
