import type { ConfiguracionApertura, Franja, PronosticoFranja } from '@pgim/shared';
import type { HistorialVentas, ItemPronostico } from '../domain/pronostico';
import type { Prisma } from '../generated/prisma/client';
import { sumarDias } from '../domain/franjas';
import { aHora } from '../lib/hora';
import { prisma } from '../lib/prisma';

export interface TenantSucursal {
  restauranteId: string;
  sucursalId: string;
}

export interface AperturaRepository {
  obtenerConfiguracion(
    restauranteId: string,
    sucursalId: string,
    db?: Prisma.TransactionClient,
  ): Promise<ConfiguracionApertura | null>;
  actualizarConfiguracion(
    restauranteId: string,
    sucursalId: string,
    config: ConfiguracionApertura,
  ): Promise<ConfiguracionApertura | null>;
  // Reservas FINALIZADA con cuenta CERRADA y las líneas de sus pedidos ENTREGADO.
  historial(
    restauranteId: string,
    sucursalId: string,
    db?: Prisma.TransactionClient,
  ): Promise<HistorialVentas>;
  // Los 7 días desde `semanaDesde` (AAAA-MM-DD), ordenados por fecha y franja.
  pronosticosDeSemana(
    restauranteId: string,
    sucursalId: string,
    semanaDesde: string,
  ): Promise<PronosticoFranja[]>;
}

// `fecha_servicio` es date: se guarda y compara como medianoche UTC.
export const aFecha = (fecha: string) => new Date(`${fecha}T00:00:00Z`);
export const deFecha = (fecha: Date) => fecha.toISOString().slice(0, 10);

const aConfiguracion = (c: {
  semanasHistoricoMinimo: number;
  cubiertosPorMozo: unknown;
  platosPorCocineroHora: unknown;
}): ConfiguracionApertura => ({
  semanasHistoricoMinimo: c.semanasHistoricoMinimo,
  cubiertosPorMozo: Number(c.cubiertosPorMozo),
  platosPorCocineroHora: Number(c.platosPorCocineroHora),
});

export function rangoSemana(semanaDesde: string) {
  return { gte: aFecha(semanaDesde), lte: aFecha(sumarDias(semanaDesde, 6)) };
}

export const aperturaRepository: AperturaRepository = {
  async obtenerConfiguracion(restauranteId, sucursalId, db = prisma) {
    const c = await db.configuracionApertura.findFirst({
      where: { sucursalId, sucursal: { restauranteId } },
    });
    return c ? aConfiguracion(c) : null;
  },

  async actualizarConfiguracion(restauranteId, sucursalId, config) {
    const { count } = await prisma.configuracionApertura.updateMany({
      where: { sucursalId, sucursal: { restauranteId } },
      data: config,
    });
    return count === 0 ? null : aperturaRepository.obtenerConfiguracion(restauranteId, sucursalId);
  },

  async historial(restauranteId, sucursalId, db = prisma) {
    // En serie: con una transacción interactiva las consultas comparten conexión.
    const reservas = await db.reserva.findMany({
      where: {
        sucursalId,
        sucursal: { restauranteId },
        estado: 'FINALIZADA',
        cuentaMesa: { estado: 'CERRADA' },
      },
      select: {
        inicio: true,
        cantidadPersonas: true,
        cuentaMesa: {
          select: {
            pedidos: {
              where: { estado: 'ENTREGADO', sucursalId },
              select: { lineas: { select: { itemMenuId: true, cantidad: true } } },
            },
          },
        },
      },
      orderBy: { inicio: 'asc' },
    });
    const horarios = await db.horarioServicio.findMany({
      where: { sucursalId, sucursal: { restauranteId } },
      orderBy: { horaInicio: 'asc' },
    });
    // Ítems activos del menú activo de la sucursal, con su precio vigente.
    const items = await db.itemMenu.findMany({
      where: {
        restauranteId,
        activo: true,
        menus: {
          some: { menu: { sucursalesActivas: { some: { id: sucursalId, restauranteId } } } },
        },
      },
      select: { id: true, nombre: true, precio: true },
      orderBy: { id: 'asc' },
    });
    return {
      reservas: reservas.map((r) => ({
        inicio: r.inicio,
        cantidadPersonas: r.cantidadPersonas,
        lineas: (r.cuentaMesa?.pedidos ?? []).flatMap((p) => p.lineas),
      })),
      horarios: horarios.map((h) => ({
        franja: h.franja as Franja,
        horaInicio: aHora(h.horaInicio),
        horaFin: aHora(h.horaFin),
      })),
      items: items.map<ItemPronostico>((i) => ({
        id: i.id,
        nombre: i.nombre,
        precio: Number(i.precio),
      })),
    };
  },

  async pronosticosDeSemana(restauranteId, sucursalId, semanaDesde) {
    const filas = await prisma.pronostico.findMany({
      where: {
        sucursalId,
        sucursal: { restauranteId },
        fechaServicio: rangoSemana(semanaDesde),
      },
      include: {
        demandasItem: { include: { itemMenu: { select: { nombre: true } } } },
      },
      orderBy: [{ fechaServicio: 'asc' }, { franja: 'asc' }],
    });
    return filas.map((p) => ({
      fecha: deFecha(p.fechaServicio),
      franja: p.franja as Franja,
      cubiertosEstimados: p.cubiertosEstimados,
      limiteInferior: p.limiteInferior,
      limiteSuperior: p.limiteSuperior,
      ingresoEstimado: Number(p.ingresoEstimado),
      metodo: p.metodo,
      errorMape: Number(p.errorMape),
      demanda: p.demandasItem
        .map((d) => ({
          itemMenuId: d.itemMenuId,
          nombre: d.itemMenu.nombre,
          cantidad: d.cantidadEstimada,
        }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre) || (a.itemMenuId < b.itemMenuId ? -1 : 1)),
    }));
  },
};
