import { AppError } from '../lib/errors';
import { estadoDePedido } from './pedido';

function status(fn: () => unknown): number | null {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof AppError ? e.status : -1;
  }
}

describe('State del pedido', () => {
  it('la cocina lo empieza y lo marca listo con "preparar pedidos"', () => {
    expect(estadoDePedido('CONFIRMADO').avanzar()).toEqual({
      hacia: 'EN_PREPARACION',
      permiso: 'pedido.gestionar_cola',
    });
    expect(estadoDePedido('EN_PREPARACION').avanzar()).toEqual({
      hacia: 'LISTO',
      permiso: 'pedido.gestionar_cola',
    });
  });

  it('el salón lo entrega con "entregar pedidos"', () => {
    expect(estadoDePedido('LISTO').avanzar()).toEqual({
      hacia: 'ENTREGADO',
      permiso: 'pedido.avanzar',
    });
  });

  it('solo se cancela desde CONFIRMADO, con "preparar pedidos"', () => {
    expect(estadoDePedido('CONFIRMADO').cancelar()).toEqual({
      hacia: 'CANCELADO',
      permiso: 'pedido.gestionar_cola',
    });
    expect(status(() => estadoDePedido('EN_PREPARACION').cancelar())).toBe(409);
    expect(status(() => estadoDePedido('LISTO').cancelar())).toBe(409);
  });

  it('ENTREGADO y CANCELADO son finales', () => {
    expect(status(() => estadoDePedido('ENTREGADO').avanzar())).toBe(409);
    expect(status(() => estadoDePedido('CANCELADO').avanzar())).toBe(409);
    expect(status(() => estadoDePedido('ENTREGADO').cancelar())).toBe(409);
  });
});
