import type { EstadoReserva, Mesa, ModoAsignacion } from '@pgim/shared';
import type { Prisma } from '../generated/prisma/client';
import { aHora } from '../lib/hora';
import { prisma } from '../lib/prisma';
import { aMesa } from './mesa.repository';

export interface SucursalReservable {
  id: string;
  nombre: string;
  restauranteId: string;
  horarioApertura: string;
  horarioCierre: string;
  toleranciaNoShowMin: number;
}

export interface FilaReserva {
  id: string;
  sucursalId: string;
  sucursalNombre: string;
  comensalId: string;
  mesaId: string;
  mesaNumero: number;
  inicio: Date;
  cantidadPersonas: number;
  modoAsignacion: ModoAsignacion;
  estado: EstadoReserva;
  toleranciaNoShowMin: number;
}

export interface DatosReserva {
  sucursalId: string;
  mesaId: string;
  comensalId: string;
  inicio: Date;
  cantidadPersonas: number;
  modoAsignacion: ModoAsignacion;
}

// Toda consulta va acotada por sucursal (o por comensal, que solo ve las suyas).
export interface ReservaRepository {
  // Solo sucursales activas: el comensal no reserva en una dada de baja.
  buscarSucursalReservable(sucursalId: string): Promise<SucursalReservable | null>;
  listarMesasActivas(sucursalId: string): Promise<Mesa[]>;
  // Mesas con una reserva vigente (PENDIENTE o ACTIVA) en alguno de esos inicios.
  mesasOcupadas(sucursalId: string, inicios: Date[]): Promise<{ mesaId: string; inicio: Date }[]>;
  // Reserva vigente del comensal a esa hora, en cualquier sucursal.
  comensalTieneReservaEn(comensalId: string, inicio: Date): Promise<boolean>;
  // null si, mientras tanto, entró otra reserva vigente del comensal a esa hora.
  // Si la mesa ya está tomada, la base rechaza el alta con P2002.
  crear(datos: DatosReserva): Promise<FilaReserva | null>;
  buscarDelComensal(comensalId: string, id: string): Promise<FilaReserva | null>;
  listarDelComensal(comensalId: string): Promise<FilaReserva[]>;
  // Cambia el estado solo si sigue en `desde`; false si otra operación lo cambió antes.
  cambiarEstado(id: string, desde: EstadoReserva, hacia: EstadoReserva): Promise<boolean>;
}

const VIGENTES: EstadoReserva[] = ['PENDIENTE', 'ACTIVA'];

export const seleccionReserva = {
  id: true,
  sucursalId: true,
  comensalId: true,
  mesaId: true,
  inicio: true,
  cantidadPersonas: true,
  modoAsignacion: true,
  estado: true,
  sucursal: { select: { nombre: true, toleranciaNoShowMin: true } },
  mesa: { select: { numero: true } },
} satisfies Prisma.ReservaSelect;

type Fila = Prisma.ReservaGetPayload<{ select: typeof seleccionReserva }>;

export function aFilaReserva({ sucursal, mesa, ...fila }: Fila): FilaReserva {
  return {
    ...fila,
    sucursalNombre: sucursal.nombre,
    mesaNumero: mesa.numero,
    toleranciaNoShowMin: sucursal.toleranciaNoShowMin,
  };
}

export const reservaRepository: ReservaRepository = {
  async buscarSucursalReservable(sucursalId) {
    const fila = await prisma.sucursal.findFirst({
      where: { id: sucursalId, activa: true },
      select: {
        id: true,
        nombre: true,
        restauranteId: true,
        horarioApertura: true,
        horarioCierre: true,
        toleranciaNoShowMin: true,
      },
    });
    return (
      fila && {
        ...fila,
        horarioApertura: aHora(fila.horarioApertura),
        horarioCierre: aHora(fila.horarioCierre),
      }
    );
  },

  async listarMesasActivas(sucursalId) {
    const filas = await prisma.mesa.findMany({
      where: { sucursalId, activa: true },
      select: { id: true, numero: true, capacidad: true, posX: true, posY: true, activa: true },
      orderBy: { numero: 'asc' },
    });
    return filas.map(aMesa);
  },

  mesasOcupadas(sucursalId, inicios) {
    return prisma.reserva.findMany({
      where: { sucursalId, inicio: { in: inicios }, estado: { in: VIGENTES } },
      select: { mesaId: true, inicio: true },
    });
  },

  async comensalTieneReservaEn(comensalId, inicio) {
    return (
      (await prisma.reserva.count({ where: { comensalId, inicio, estado: { in: VIGENTES } } })) > 0
    );
  },

  crear(datos) {
    return prisma.$transaction(async (tx) => {
      // Serializa las altas del mismo comensal a la misma hora: sin el lock,
      // dos pedidos simultáneos a mesas distintas pasarían los dos el control.
      const clave = `${datos.comensalId}|${datos.inicio.toISOString()}`;
      await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${clave}::text))) AS bloqueo`;
      const yaTiene = await tx.reserva.count({
        where: { comensalId: datos.comensalId, inicio: datos.inicio, estado: { in: VIGENTES } },
      });
      if (yaTiene > 0) return null;
      return aFilaReserva(await tx.reserva.create({ data: datos, select: seleccionReserva }));
    });
  },

  async buscarDelComensal(comensalId, id) {
    const fila = await prisma.reserva.findFirst({
      where: { id, comensalId },
      select: seleccionReserva,
    });
    return fila && aFilaReserva(fila);
  },

  async listarDelComensal(comensalId) {
    const filas = await prisma.reserva.findMany({
      where: { comensalId },
      select: seleccionReserva,
      orderBy: { inicio: 'desc' },
      take: 50,
    });
    return filas.map(aFilaReserva);
  },

  async cambiarEstado(id, desde, hacia) {
    const { count } = await prisma.reserva.updateMany({
      where: { id, estado: desde },
      data: { estado: hacia },
    });
    return count === 1;
  },
};
