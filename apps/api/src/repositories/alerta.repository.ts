import type { AlertaPanel, TipoAlertaPanel, TipoAlertaStock } from '@pgim/shared';
import { servicioDeReserva } from '../domain/pronostico';
import type { ReservaDelEvento } from '../domain/eventos';
import type { Prisma } from '../generated/prisma/client';
import { aHora, horaArgentina } from '../lib/hora';
import { prisma } from '../lib/prisma';

export interface DatosAlertaStock {
  sucursalId: string;
  tipo: TipoAlertaStock;
  // Solo STOCK_INSUFICIENTE: el insumo que no alcanzó.
  componenteId?: string;
  itemMenuId: string;
}

export interface AlertaRepository {
  // Guarda la alerta si no hay otra igual sin resolver (mismo tipo y misma
  // existencia o mismo plato); null si ya la había. Si el insumo no tenía
  // existencia en la sucursal, la crea en 0 para poder señalarla.
  crearSiNoHay(datos: DatosAlertaStock): Promise<AlertaPanel | null>;
  // Alerta INFO de una reserva vencida (CU-21): comensal, mesa y hora en el
  // texto; fecha y franja del servicio (la franja queda vacía si la hora no
  // cae en ninguna). No hay duplicados: una reserva vence una sola vez.
  crearInasistencia(reserva: ReservaDelEvento): Promise<AlertaPanel | null>;
  listarSinResolver(
    restauranteId: string,
    sucursalId: string,
    tipos: TipoAlertaPanel[],
  ): Promise<AlertaPanel[]>;
  // false si no existe, es de otra sucursal o su tipo no está en `tipos`.
  resolver(
    restauranteId: string,
    sucursalId: string,
    id: string,
    tipos: TipoAlertaPanel[],
  ): Promise<boolean>;
}

const seleccionAlerta = {
  id: true,
  tipo: true,
  severidad: true,
  descripcion: true,
  creadaEn: true,
  existencia: { select: { componente: { select: { id: true, nombre: true } } } },
  itemMenu: { select: { id: true, nombre: true } },
} satisfies Prisma.AlertaSelect;

type Fila = Prisma.AlertaGetPayload<{ select: typeof seleccionAlerta }>;

function aAlertaPanel(fila: Fila): AlertaPanel {
  return {
    id: fila.id,
    tipo: fila.tipo as TipoAlertaPanel,
    severidad: fila.severidad,
    descripcion: fila.descripcion,
    creadaEn: fila.creadaEn.toISOString(),
    insumo: fila.existencia?.componente ?? null,
    plato: fila.itemMenu,
  };
}

function deLaSucursal(restauranteId: string, sucursalId: string) {
  return { sucursalId, sucursal: { restauranteId } };
}

export const alertaRepository: AlertaRepository = {
  crearSiNoHay({ sucursalId, tipo, componenteId, itemMenuId }) {
    return prisma.$transaction(async (tx) => {
      // Una alerta por vez en la sucursal: dos pedidos rechazados juntos no la duplican.
      await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${`alerta|${sucursalId}`}::text))) AS bloqueo`;
      // El plato tiene que ser del restaurante de la sucursal.
      const plato = await tx.itemMenu.findFirstOrThrow({
        where: { id: itemMenuId, restaurante: { sucursales: { some: { id: sucursalId } } } },
        select: { nombre: true },
      });

      if (tipo === 'STOCK_INSUFICIENTE') {
        const existencia = await tx.existencia.upsert({
          where: { sucursalId_componenteId: { sucursalId, componenteId: componenteId! } },
          create: { sucursalId, componenteId: componenteId! },
          update: {},
          select: { id: true, componente: { select: { nombre: true } } },
        });
        const repetida = await tx.alerta.count({
          where: { sucursalId, tipo, existenciaId: existencia.id, resuelta: false },
        });
        if (repetida > 0) return null;
        return aAlertaPanel(
          await tx.alerta.create({
            data: {
              sucursalId,
              tipo,
              severidad: 'CRITICA',
              existenciaId: existencia.id,
              itemMenuId,
              descripcion: `No alcanzó ${existencia.componente.nombre} para ${plato.nombre}`,
            },
            select: seleccionAlerta,
          }),
        );
      }

      const repetida = await tx.alerta.count({
        where: { sucursalId, tipo, itemMenuId, resuelta: false },
      });
      if (repetida > 0) return null;
      return aAlertaPanel(
        await tx.alerta.create({
          data: {
            sucursalId,
            tipo,
            severidad: 'ADVERTENCIA',
            itemMenuId,
            descripcion: `${plato.nombre} se pidió sin receta: no descontó stock`,
          },
          select: seleccionAlerta,
        }),
      );
    });
  },

  async crearInasistencia(reserva) {
    const [comensal, mesa, horarios] = await Promise.all([
      prisma.comensal.findUniqueOrThrow({
        where: { usuarioId: reserva.comensalId },
        select: { nombre: true },
      }),
      prisma.mesa.findFirstOrThrow({
        where: { id: reserva.mesaId, sucursalId: reserva.sucursalId },
        select: { numero: true },
      }),
      prisma.horarioServicio.findMany({
        where: { sucursalId: reserva.sucursalId },
        select: { franja: true, horaInicio: true, horaFin: true },
      }),
    ]);
    const servicio = servicioDeReserva(
      reserva.inicio,
      horarios.map((h) => ({
        franja: h.franja,
        horaInicio: aHora(h.horaInicio),
        horaFin: aHora(h.horaFin),
      })),
    );
    const fila = await prisma.alerta.create({
      data: {
        sucursalId: reserva.sucursalId,
        tipo: 'INASISTENCIA',
        severidad: 'INFO',
        fechaServicio: servicio ? new Date(`${servicio.fecha}T00:00:00Z`) : null,
        franja: servicio?.franja ?? null,
        descripcion: `${comensal.nombre} no llegó a su reserva de las ${horaArgentina(reserva.inicio)} h, mesa ${mesa.numero}`,
      },
      select: seleccionAlerta,
    });
    return aAlertaPanel(fila);
  },

  async listarSinResolver(restauranteId, sucursalId, tipos) {
    const filas = await prisma.alerta.findMany({
      where: { ...deLaSucursal(restauranteId, sucursalId), tipo: { in: tipos }, resuelta: false },
      select: seleccionAlerta,
      orderBy: { creadaEn: 'desc' },
    });
    return filas.map(aAlertaPanel);
  },

  async resolver(restauranteId, sucursalId, id, tipos) {
    const { count } = await prisma.alerta.updateMany({
      where: { id, ...deLaSucursal(restauranteId, sucursalId), tipo: { in: tipos } },
      data: { resuelta: true },
    });
    return count === 1;
  },
};
