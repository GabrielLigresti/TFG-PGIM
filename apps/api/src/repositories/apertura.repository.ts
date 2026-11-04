import type { ConfiguracionApertura, Franja, PronosticoFranja } from '@pgim/shared';
import type { FilaPronostico, HistorialVentas, ItemPronostico } from '../domain/pronostico';
import type { Prisma } from '../generated/prisma/client';
import { sumarDias } from '../domain/franjas';
import { aHora } from '../lib/hora';
import { prisma } from '../lib/prisma';
import { bloquearSucursal } from './bloqueo-stock';

export interface TenantSucursal {
  restauranteId: string;
  sucursalId: string;
}

// `calcular` recibe la transacción y hace sus lecturas con ella (en serie): así
// la generación usa una sola conexión del pool mientras espera o tiene el lock.
// Si el historial ya no alcanza (pudo cambiar mientras se esperaba el lock),
// devuelve `suficiente: false` y el repositorio no borra ni escribe nada.
export type CalcularFilas = (
  tx: Prisma.TransactionClient,
) => Promise<{ suficiente: boolean; filas: FilaPronostico[] }>;

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
  // Si la semana no tiene pronósticos (comprobado dentro del lock) corre
  // `calcular` y los guarda. Devuelve true si generó (false si ya había o si
  // el historial no alcanzaba).
  generarSiFalta(
    tenant: TenantSucursal,
    semanaDesde: string,
    calcular: CalcularFilas,
  ): Promise<boolean>;
  // Borra los pronósticos de la semana (DemandaItem cae en cascada) y guarda los
  // nuevos. Devuelve false, sin tocar nada, si el historial no alcanzaba.
  reemplazarSemana(
    tenant: TenantSucursal,
    semanaDesde: string,
    calcular: CalcularFilas,
  ): Promise<boolean>;
}

const TIMEOUT_TX_MS = 15_000;

// `fecha_servicio` es date: se guarda y compara como medianoche UTC.
const aFecha = (fecha: string) => new Date(`${fecha}T00:00:00Z`);
const deFecha = (fecha: Date) => fecha.toISOString().slice(0, 10);

const aConfiguracion = (c: {
  semanasHistoricoMinimo: number;
  cubiertosPorMozo: unknown;
  platosPorCocineroHora: unknown;
}): ConfiguracionApertura => ({
  semanasHistoricoMinimo: c.semanasHistoricoMinimo,
  cubiertosPorMozo: Number(c.cubiertosPorMozo),
  platosPorCocineroHora: Number(c.platosPorCocineroHora),
});

function rangoSemana(semanaDesde: string) {
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

  generarSiFalta(tenant, semanaDesde, calcular) {
    return prisma.$transaction(
      async (tx) => {
        await bloquearSucursal(tx, 'apertura', tenant.sucursalId);
        await asegurarSucursal(tx, tenant);
        // Con el lock tomado: otra transacción pudo haber generado mientras esperábamos.
        const existentes = await tx.pronostico.count({
          where: { sucursalId: tenant.sucursalId, fechaServicio: rangoSemana(semanaDesde) },
        });
        if (existentes > 0) return false;
        const { suficiente, filas } = await calcular(tx);
        if (!suficiente) return false;
        await guardar(tx, tenant.sucursalId, filas);
        return true;
      },
      { timeout: TIMEOUT_TX_MS },
    );
  },

  reemplazarSemana(tenant, semanaDesde, calcular) {
    return prisma.$transaction(
      async (tx) => {
        await bloquearSucursal(tx, 'apertura', tenant.sucursalId);
        await asegurarSucursal(tx, tenant);
        const { suficiente, filas } = await calcular(tx);
        if (!suficiente) return false;
        await tx.pronostico.deleteMany({
          where: { sucursalId: tenant.sucursalId, fechaServicio: rangoSemana(semanaDesde) },
        });
        await guardar(tx, tenant.sucursalId, filas);
        return true;
      },
      { timeout: TIMEOUT_TX_MS },
    );
  },
};

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function asegurarSucursal(tx: Tx, { restauranteId, sucursalId }: TenantSucursal) {
  const sucursal = await tx.sucursal.findFirst({
    where: { id: sucursalId, restauranteId },
    select: { id: true },
  });
  if (!sucursal) throw new Error('Sucursal fuera del restaurante');
}

async function guardar(tx: Tx, sucursalId: string, filas: FilaPronostico[]) {
  for (const f of filas) {
    await tx.pronostico.create({
      data: {
        sucursalId,
        fechaServicio: aFecha(f.fecha),
        franja: f.franja,
        cubiertosEstimados: f.cubiertosEstimados,
        limiteInferior: f.limiteInferior,
        limiteSuperior: f.limiteSuperior,
        ingresoEstimado: f.ingresoEstimado.toFixed(2),
        errorMape: f.errorMape.toFixed(2),
        metodo: f.metodo,
        demandasItem: {
          create: f.demanda.map((d) => ({
            itemMenuId: d.itemMenuId,
            cantidadEstimada: d.cantidad,
          })),
        },
      },
    });
  }
}
