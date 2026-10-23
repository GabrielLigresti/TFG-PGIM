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

// Para el panel: la reserva con el contacto del comensal.
export interface FilaReservaPanel extends FilaReserva {
  comensalNombre: string;
  comensalTelefono: string | null;
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
  cambiarEstado(
    alcance: AlcanceReserva,
    id: string,
    desde: EstadoReserva,
    hacia: EstadoReserva,
  ): Promise<boolean>;
  // Panel (CU-12): acotadas por restaurante y sucursal de trabajo.
  listarDelDia(
    restauranteId: string,
    sucursalId: string,
    desde: Date,
    hasta: Date,
  ): Promise<FilaReservaPanel[]>;
  buscarEnSucursal(
    restauranteId: string,
    sucursalId: string,
    id: string,
  ): Promise<FilaReservaPanel | null>;
  // Cambio de estado de la activación (lo decide el State) y apertura de la
  // cuenta de mesa, en una transacción. false si la reserva ya no estaba en `desde`.
  activar(
    restauranteId: string,
    sucursalId: string,
    id: string,
    desde: EstadoReserva,
    hacia: EstadoReserva,
  ): Promise<boolean>;
  // CU-21: PENDIENTE ya empezadas, con la tolerancia de su sucursal. Incluye
  // las de sucursales dadas de baja, para que no queden pendientes para siempre.
  pendientesIniciadas(ahora: Date): Promise<FilaReserva[]>;
}

// Toda escritura va acotada: por el comensal titular, por la sucursal de
// trabajo del personal o, solo en las tareas programadas, por ninguno.
export type AlcanceReserva =
  { comensalId: string } | { restauranteId: string; sucursalId: string } | { sistema: true };

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

const seleccionPanel = {
  ...seleccionReserva,
  comensal: { select: { nombre: true, telefono: true } },
} satisfies Prisma.ReservaSelect;

type FilaPanel = Prisma.ReservaGetPayload<{ select: typeof seleccionPanel }>;

function aFilaReservaPanel({ comensal, ...fila }: FilaPanel): FilaReservaPanel {
  return {
    ...aFilaReserva(fila),
    comensalNombre: comensal.nombre,
    comensalTelefono: comensal.telefono,
  };
}

function deLaSucursal(restauranteId: string, sucursalId: string) {
  return { sucursalId, sucursal: { restauranteId } };
}

function filtroDeAlcance(alcance: AlcanceReserva): Prisma.ReservaWhereInput {
  if ('comensalId' in alcance) return { comensalId: alcance.comensalId };
  if ('sucursalId' in alcance) return deLaSucursal(alcance.restauranteId, alcance.sucursalId);
  return {};
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

  async cambiarEstado(alcance, id, desde, hacia) {
    const { count } = await prisma.reserva.updateMany({
      where: { id, estado: desde, ...filtroDeAlcance(alcance) },
      data: { estado: hacia },
    });
    return count === 1;
  },

  async listarDelDia(restauranteId, sucursalId, desde, hasta) {
    const filas = await prisma.reserva.findMany({
      where: { ...deLaSucursal(restauranteId, sucursalId), inicio: { gte: desde, lt: hasta } },
      select: seleccionPanel,
      orderBy: [{ inicio: 'asc' }, { mesa: { numero: 'asc' } }],
    });
    return filas.map(aFilaReservaPanel);
  },

  async buscarEnSucursal(restauranteId, sucursalId, id) {
    const fila = await prisma.reserva.findFirst({
      where: { id, ...deLaSucursal(restauranteId, sucursalId) },
      select: seleccionPanel,
    });
    return fila && aFilaReservaPanel(fila);
  },

  activar(restauranteId, sucursalId, id, desde, hacia) {
    return prisma.$transaction(async (tx) => {
      const { count } = await tx.reserva.updateMany({
        where: { id, estado: desde, ...deLaSucursal(restauranteId, sucursalId) },
        data: { estado: hacia },
      });
      if (count !== 1) return false;
      await tx.cuentaMesa.create({ data: { reservaId: id } });
      return true;
    });
  },

  // Tarea de sistema: recorre todos los restaurantes, por eso no filtra por tenant.
  async pendientesIniciadas(ahora) {
    const filas = await prisma.reserva.findMany({
      where: { estado: 'PENDIENTE', inicio: { lt: ahora } },
      select: seleccionReserva,
    });
    return filas.map(aFilaReserva);
  },
};
