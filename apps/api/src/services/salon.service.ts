import { MINUTOS_ANTES_ACTIVACION, type MesaSalon, type PedidoSalon } from '@pgim/shared';
import { situacionDeMesa } from '../domain/salon';
import type { MesaRepository } from '../repositories/mesa.repository';
import { mesaRepository } from '../repositories/mesa.repository';
import type { PedidoRepository } from '../repositories/pedido.repository';
import { pedidoRepository } from '../repositories/pedido.repository';
import type { FilaReservaPanel, ReservaRepository } from '../repositories/reserva.repository';
import { reservaRepository } from '../repositories/reserva.repository';
import { aReservaPanel } from './reserva-panel';

const MINUTO = 60_000;

// En vivo: el estado actual de cada mesa de la sucursal, con su reserva
// y, si el permiso lo deja, los pedidos de su cuenta abierta.
export function createSalonService(
  mesas: Pick<MesaRepository, 'listar'>,
  reservas: Pick<ReservaRepository, 'vigentesDelSalon'>,
  pedidos: Pick<PedidoRepository, 'delSalon'>,
  ahora: () => Date = () => new Date(),
) {
  return {
    async estado(
      restauranteId: string,
      sucursalId: string,
      incluirPedidos: boolean,
    ): Promise<MesaSalon[]> {
      const ya = ahora();
      const hasta = new Date(ya.getTime() + MINUTOS_ANTES_ACTIVACION * MINUTO);
      const [todas, vigentes] = await Promise.all([
        mesas.listar(restauranteId, sucursalId),
        reservas.vigentesDelSalon(restauranteId, sucursalId, hasta),
      ]);

      const porMesa = new Map<string, FilaReservaPanel[]>();
      for (const fila of vigentes) {
        porMesa.set(fila.mesaId, [...(porMesa.get(fila.mesaId) ?? []), fila]);
      }

      const situaciones = todas
        .filter((m) => m.activa)
        .map((m) => ({ mesa: m, ...situacionDeMesa(porMesa.get(m.id) ?? [], ya) }));

      const idsOcupadas = situaciones
        .filter((s) => s.estado === 'OCUPADA')
        .map((s) => s.reserva!.id);
      const delSalon =
        incluirPedidos && idsOcupadas.length > 0
          ? await pedidos.delSalon(restauranteId, sucursalId, idsOcupadas)
          : new Map<string, PedidoSalon[]>();

      return situaciones.map(({ mesa, estado, reserva }) => ({
        id: mesa.id,
        numero: mesa.numero,
        capacidad: mesa.capacidad,
        posX: mesa.posX,
        posY: mesa.posY,
        estado,
        reserva: reserva && aReservaPanel(reserva, ya),
        pedidos: (estado === 'OCUPADA' && reserva && delSalon.get(reserva.id)) || [],
      }));
    },
  };
}

export const salonService = createSalonService(mesaRepository, reservaRepository, pedidoRepository);
