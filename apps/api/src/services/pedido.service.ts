import type { CambioPedido, CodigoPermiso, PedidoCola, PedidoInput } from '@pgim/shared';
import { busEventos, type BusEventos } from '../domain/eventos';
import { estadoDePedido, type Transicion } from '../domain/pedido';
import { AppError } from '../lib/errors';
import {
  MesaCerradaError,
  pedidoRepository,
  StockInsuficienteError,
  type LineaAConfirmar,
  type PedidoRepository,
} from '../repositories/pedido.repository';
import { menuVisible, type MenuVisible } from './menu-visible';

// CU-04 Realizar pedido (secuencia CU-04 v1) y CU-05 Gestionar cola de pedidos.
export function createPedidoService(
  repo: PedidoRepository,
  menuDeSucursal: MenuVisible,
  bus: BusEventos,
) {
  async function pedidoDeLaSucursal(restauranteId: string, sucursalId: string, id: string) {
    const pedido = await repo.buscarEnSucursal(restauranteId, sucursalId, id);
    if (!pedido) throw new AppError(404, 'El pedido no existe');
    return pedido;
  }

  // El permiso lo decide la transición: preparar (pedido.gestionar_cola) o
  // entregar (pedido.avanzar).
  function exigir(permisos: readonly CodigoPermiso[], transicion: Transicion) {
    if (!permisos.includes(transicion.permiso)) {
      throw new AppError(403, 'No tenés permiso para esta acción');
    }
  }

  const YA_CAMBIO = 'El pedido ya cambió; recargá la cola';

  return {
    cola: (restauranteId: string, sucursalId: string) => repo.cola(restauranteId, sucursalId),

    async avanzar(
      restauranteId: string,
      sucursalId: string,
      permisos: readonly CodigoPermiso[],
      id: string,
    ): Promise<CambioPedido> {
      const pedido = await pedidoDeLaSucursal(restauranteId, sucursalId, id);
      const transicion = estadoDePedido(pedido.estado).avanzar();
      exigir(permisos, transicion);
      const resultado = await repo.cambiarEstado(id, pedido.estado, transicion.hacia);
      if (!resultado) throw new AppError(409, YA_CAMBIO);
      const cambio: CambioPedido = {
        id,
        estado: transicion.hacia,
        listoEn: resultado.listoEn?.toISOString() ?? null,
      };
      bus.publicar({
        tipo: 'PEDIDO_CAMBIO_ESTADO',
        cambio,
        sucursalId,
        comensalId: pedido.comensalId,
      });
      return cambio;
    },

    // Solo un pedido nuevo; los ingredientes vuelven al stock.
    async cancelar(
      restauranteId: string,
      sucursalId: string,
      permisos: readonly CodigoPermiso[],
      id: string,
      motivo: string,
    ): Promise<CambioPedido> {
      const pedido = await pedidoDeLaSucursal(restauranteId, sucursalId, id);
      const transicion = estadoDePedido(pedido.estado).cancelar();
      exigir(permisos, transicion);
      if (!(await repo.cancelar(id, motivo))) throw new AppError(409, YA_CAMBIO);
      const cambio: CambioPedido = { id, estado: 'CANCELADO', listoEn: null };
      bus.publicar({ tipo: 'PEDIDO_CANCELADO', cambio, sucursalId, comensalId: pedido.comensalId });
      return cambio;
    },

    async confirmar(comensalId: string, input: PedidoInput): Promise<PedidoCola> {
      const cuenta = await repo.buscarCuentaDelComensal(comensalId, input.cuentaMesaId);
      if (!cuenta) throw new AppError(404, 'La mesa no existe');
      if (cuenta.estado !== 'ABIERTA') throw new AppError(409, 'La mesa ya está cerrada');

      // Solo platos a la vista en el menú de la sucursal, con el precio vigente.
      const { platos } = await menuDeSucursal(cuenta.sucursalId);
      const porId = new Map(platos.map((p) => [p.plato.id, p]));
      const lineas: LineaAConfirmar[] = input.lineas.map((l) => {
        const visible = porId.get(l.itemMenuId);
        if (!visible) throw new AppError(400, 'Un plato del pedido ya no está en el menú');
        const insumos = new Map(
          [...(visible.insumos ?? [])].map(([id, cantidad]) => [id, cantidad * l.cantidad]),
        );
        return {
          itemMenuId: l.itemMenuId,
          cantidad: l.cantidad,
          precioUnitario: visible.plato.precio,
          observaciones: l.observaciones,
          insumos,
        };
      });

      let pedido: PedidoCola;
      try {
        pedido = await repo.confirmar(cuenta, lineas);
      } catch (err) {
        if (err instanceof MesaCerradaError) throw new AppError(409, 'La mesa ya está cerrada');
        if (!(err instanceof StockInsuficienteError)) throw err;
        // 5a: el pedido no se confirmó; la alerta se guarda igual (fuera de
        // la transacción que se revirtió).
        bus.publicar({
          tipo: 'STOCK_INSUFICIENTE',
          sucursalId: cuenta.sucursalId,
          componenteId: err.componenteId,
          itemMenuId: err.itemMenuId,
        });
        const nombre = porId.get(err.itemMenuId)?.plato.nombre ?? 'un plato';
        throw new AppError(409, `No alcanza el stock para ${nombre}`, {
          itemMenuId: err.itemMenuId,
          nombre,
        });
      }

      // 5b: los platos sin receta se confirmaron sin descontar stock.
      for (const itemMenuId of new Set(
        input.lineas.filter((l) => !porId.get(l.itemMenuId)!.insumos).map((l) => l.itemMenuId),
      )) {
        bus.publicar({ tipo: 'PLATO_SIN_RECETA', sucursalId: cuenta.sucursalId, itemMenuId });
      }
      bus.publicar({
        tipo: 'PEDIDO_CONFIRMADO',
        pedido,
        sucursalId: cuenta.sucursalId,
        comensalId: cuenta.comensalId,
      });
      return pedido;
    },
  };
}

export const pedidoService = createPedidoService(pedidoRepository, menuVisible, busEventos);
