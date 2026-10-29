import { prisma } from '../lib/prisma';
import { crearEscenario, limpiarBase, type Escenario } from '../test/db-setup';
import {
  MesaCerradaError,
  pedidoRepository,
  StockInsuficienteError,
  type CuentaParaPedido,
  type LineaAConfirmar,
} from './pedido.repository';

afterAll(() => prisma.$disconnect());

let e: Escenario;
let cuenta: CuentaParaPedido;

beforeEach(async () => {
  await limpiarBase();
  e = await crearEscenario();
  cuenta = (await pedidoRepository.buscarCuentaDelComensal(e.comensalId, e.cuentaMesaId))!;
});

function pizzas(cantidad: number): LineaAConfirmar {
  return {
    itemMenuId: e.pizzaId,
    cantidad,
    precioUnitario: 1000,
    observaciones: null,
    insumos: new Map([
      [e.harinaId, 50 * cantidad],
      [e.quesoId, 50 * cantidad],
    ]),
  };
}

const agua: () => LineaAConfirmar = () => ({
  itemMenuId: e.aguaId,
  cantidad: 1,
  precioUnitario: 300,
  observaciones: 'Sin hielo',
  insumos: new Map(),
});

async function stock(componenteId: string) {
  const fila = await prisma.existencia.findFirstOrThrow({ where: { componenteId } });
  return Number(fila.cantidadActual);
}

describe('pedidoRepository.buscarCuentaDelComensal', () => {
  it('no encuentra la cuenta de otro comensal', async () => {
    expect(cuenta.mesaNumero).toBe(4);
    expect(await pedidoRepository.buscarCuentaDelComensal(e.harinaId, e.cuentaMesaId)).toBeNull();
  });
});

describe('pedidoRepository.confirmar', () => {
  it('crea el pedido, descuenta el stock y registra un consumo por línea e insumo', async () => {
    const pedido = await pedidoRepository.confirmar(cuenta, [pizzas(1), agua()]);

    expect(pedido.numero).toBe(1);
    expect(pedido.mesa.numero).toBe(4);
    expect(pedido.estado).toBe('CONFIRMADO');
    expect(pedido.lineas).toHaveLength(2);
    expect(await stock(e.harinaId)).toBe(950);
    expect(await stock(e.quesoId)).toBe(50);

    const lineaPizza = pedido.lineas.find((l) => l.plato.id === e.pizzaId)!;
    const movimientos = await prisma.movimientoStock.findMany({ include: { existencia: true } });
    expect(movimientos).toHaveLength(2);
    for (const m of movimientos) {
      expect(m.tipo).toBe('CONSUMO_PEDIDO');
      expect(m.lineaPedidoId).toBe(lineaPizza.id);
    }
    const deHarina = movimientos.find((m) => m.existencia.componenteId === e.harinaId)!;
    const deQueso = movimientos.find((m) => m.existencia.componenteId === e.quesoId)!;
    expect(Number(deHarina.costoUnitario)).toBe(2);
    expect(Number(deQueso.costoUnitario)).toBe(0);
  });

  it('una mesa que se cerró mientras tanto no recibe el pedido', async () => {
    await prisma.cuentaMesa.update({ where: { id: e.cuentaMesaId }, data: { estado: 'CERRADA' } });
    await expect(pedidoRepository.confirmar(cuenta, [agua()])).rejects.toBeInstanceOf(
      MesaCerradaError,
    );
    expect(await prisma.pedido.count()).toBe(0);
  });

  it('numera los pedidos en forma correlativa por sucursal', async () => {
    await pedidoRepository.confirmar(cuenta, [agua()]);
    const segundo = await pedidoRepository.confirmar(cuenta, [agua()]);
    expect(segundo.numero).toBe(2);
  });

  it('sin stock suficiente rechaza todo el pedido y no deja rastros', async () => {
    await expect(pedidoRepository.confirmar(cuenta, [agua(), pizzas(3)])).rejects.toMatchObject({
      componenteId: e.quesoId,
      itemMenuId: e.pizzaId,
    });

    expect(await prisma.pedido.count()).toBe(0);
    expect(await prisma.lineaPedido.count()).toBe(0);
    expect(await prisma.movimientoStock.count()).toBe(0);
    expect(await stock(e.harinaId)).toBe(1000);
    expect(await stock(e.quesoId)).toBe(100);
  });

  it('un insumo sin existencia en la sucursal cuenta como sin stock', async () => {
    await prisma.existencia.deleteMany({ where: { componenteId: e.quesoId } });
    await expect(pedidoRepository.confirmar(cuenta, [pizzas(1)])).rejects.toBeInstanceOf(
      StockInsuficienteError,
    );
  });

  it('dos pedidos simultáneos por el último stock: confirma uno solo', async () => {
    const resultados = await Promise.allSettled([
      pedidoRepository.confirmar(cuenta, [pizzas(2)]),
      pedidoRepository.confirmar(cuenta, [pizzas(2)]),
    ]);

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rechazo = resultados.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rechazo.reason).toBeInstanceOf(StockInsuficienteError);
    expect(await stock(e.quesoId)).toBe(0);
    expect(await prisma.pedido.count()).toBe(1);
  });

  it('pedidos simultáneos no repiten número', async () => {
    const pedidos = await Promise.all(
      Array.from({ length: 5 }, () => pedidoRepository.confirmar(cuenta, [agua()])),
    );
    expect(new Set(pedidos.map((p) => p.numero))).toEqual(new Set([1, 2, 3, 4, 5]));
  });
});

describe('pedidoRepository.existencias', () => {
  it('devuelve el stock de la sucursal por componente', async () => {
    const existencias = await pedidoRepository.existencias(e.sucursalId);
    expect(existencias.get(e.harinaId)).toBe(1000);
    expect(existencias.get(e.quesoId)).toBe(100);
  });
});

describe('pedidoRepository.cancelar', () => {
  it('devuelve exactamente lo descontado, con una devolución por cada consumo', async () => {
    const pedido = await pedidoRepository.confirmar(cuenta, [pizzas(1), pizzas(1)]);

    expect(
      await pedidoRepository.cancelar(
        e.restauranteId,
        e.sucursalId,
        pedido.id,
        'Lo pidió el cliente',
      ),
    ).toBe(true);

    expect(await stock(e.harinaId)).toBe(1000);
    expect(await stock(e.quesoId)).toBe(100);
    const consumos = await prisma.movimientoStock.findMany({ where: { tipo: 'CONSUMO_PEDIDO' } });
    const devoluciones = await prisma.movimientoStock.findMany({
      where: { tipo: 'DEVOLUCION_PEDIDO' },
    });
    expect(devoluciones).toHaveLength(4);
    for (const c of consumos) {
      expect(
        devoluciones.some(
          (d) =>
            d.lineaPedidoId === c.lineaPedidoId &&
            d.existenciaId === c.existenciaId &&
            Number(d.cantidad) === -Number(c.cantidad),
        ),
      ).toBe(true);
    }
    const guardado = await prisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } });
    expect(guardado.estado).toBe('CANCELADO');
    expect(guardado.motivoCancelacion).toBe('Lo pidió el cliente');
  });

  it('un pedido en preparación no se cancela ni mueve stock', async () => {
    const pedido = await pedidoRepository.confirmar(cuenta, [pizzas(1)]);
    await pedidoRepository.cambiarEstado(
      e.restauranteId,
      e.sucursalId,
      pedido.id,
      'CONFIRMADO',
      'EN_PREPARACION',
    );

    expect(await pedidoRepository.cancelar(e.restauranteId, e.sucursalId, pedido.id, 'x')).toBe(
      false,
    );
    expect(await stock(e.quesoId)).toBe(50);
  });
});

describe('signo de los movimientos', () => {
  async function sumaMovimientos(componenteId: string) {
    const movimientos = await prisma.movimientoStock.findMany({
      where: { existencia: { componenteId } },
    });
    return movimientos.reduce((t, m) => t + Number(m.cantidad), 0);
  }

  it('la suma de los movimientos explica el cambio de stock', async () => {
    const pedido = await pedidoRepository.confirmar(cuenta, [pizzas(1)]);
    expect(await sumaMovimientos(e.harinaId)).toBe((await stock(e.harinaId)) - 1000);
    expect(await sumaMovimientos(e.harinaId)).toBe(-50);

    await pedidoRepository.cancelar(e.restauranteId, e.sucursalId, pedido.id, 'x');
    expect(await sumaMovimientos(e.harinaId)).toBe(0);
    expect(await stock(e.harinaId)).toBe(1000);
  });
});

describe('confirmar y cancelar a la vez', () => {
  it('no se traban aunque las existencias se hayan creado en otro orden', async () => {
    // Existencias recreadas al revés: el id de la de queso queda antes que el de harina.
    await prisma.existencia.deleteMany();
    await prisma.existencia.create({
      data: { sucursalId: e.sucursalId, componenteId: e.quesoId, cantidadActual: 100000 },
    });
    await prisma.existencia.create({
      data: { sucursalId: e.sucursalId, componenteId: e.harinaId, cantidadActual: 100000 },
    });
    for (let i = 0; i < 40; i++) {
      const aCancelar = await Promise.all(
        [1, 2, 3].map(() => pedidoRepository.confirmar(cuenta, [pizzas(1)])),
      );
      await Promise.all([
        pedidoRepository.confirmar(cuenta, [pizzas(1)]),
        pedidoRepository.confirmar(cuenta, [pizzas(1)]),
        ...aCancelar.map((p) =>
          pedidoRepository.cancelar(e.restauranteId, e.sucursalId, p.id, 'x'),
        ),
      ]);
    }
  });
});

describe('alcance por sucursal', () => {
  it('no cambia ni cancela pedidos de otra sucursal', async () => {
    const pedido = await pedidoRepository.confirmar(cuenta, [agua()]);
    expect(
      await pedidoRepository.cambiarEstado(
        e.restauranteId,
        e.harinaId,
        pedido.id,
        'CONFIRMADO',
        'EN_PREPARACION',
      ),
    ).toBe(false);
    expect(await pedidoRepository.cancelar(e.restauranteId, e.harinaId, pedido.id, 'x')).toBe(
      false,
    );
  });
});

describe('pedidoRepository.cambiarEstado', () => {
  it('al pasar a LISTO guarda cuándo quedó listo', async () => {
    const pedido = await pedidoRepository.confirmar(cuenta, [agua()]);
    await pedidoRepository.cambiarEstado(
      e.restauranteId,
      e.sucursalId,
      pedido.id,
      'CONFIRMADO',
      'EN_PREPARACION',
    );

    const resultado = await pedidoRepository.cambiarEstado(
      e.restauranteId,
      e.sucursalId,
      pedido.id,
      'EN_PREPARACION',
      'LISTO',
    );

    expect(resultado && resultado.listoEn).toBeInstanceOf(Date);
  });

  it('de dos avances simultáneos desde el mismo estado, gana uno solo', async () => {
    const pedido = await pedidoRepository.confirmar(cuenta, [agua()]);
    const resultados = await Promise.all([
      pedidoRepository.cambiarEstado(
        e.restauranteId,
        e.sucursalId,
        pedido.id,
        'CONFIRMADO',
        'EN_PREPARACION',
      ),
      pedidoRepository.cambiarEstado(
        e.restauranteId,
        e.sucursalId,
        pedido.id,
        'CONFIRMADO',
        'EN_PREPARACION',
      ),
    ]);
    expect(resultados.filter((r) => r !== false)).toHaveLength(1);
  });
});

// La masa (intermedio de la pizza) pasa a llevar stock, con costo 0,5 por gramo
// y, si se pide, esa cantidad de existencia en la sucursal.
async function masaConStock(cantidad: number | null) {
  await prisma.componenteInventario.update({
    where: { id: e.masaId },
    data: { llevaStock: true, costoCompraVigente: 0.5 },
  });
  if (cantidad !== null) {
    await prisma.existencia.create({
      data: { sucursalId: e.sucursalId, componenteId: e.masaId, cantidadActual: cantidad },
    });
  }
}

// Con la masa con stock, la explosión se detiene en ella: la pizza consume
// 100 g de masa y 50 g de queso, y nada de harina.
function pizzasConMasaConStock(cantidad: number): LineaAConfirmar {
  return {
    ...pizzas(cantidad),
    insumos: new Map([
      [e.masaId, 100 * cantidad],
      [e.quesoId, 50 * cantidad],
    ]),
  };
}

describe('pedidoRepository con intermedios que llevan stock', () => {
  it('descuenta la masa y el queso, y no la harina', async () => {
    await masaConStock(400);
    await pedidoRepository.confirmar(cuenta, [pizzasConMasaConStock(2)]);

    expect(await stock(e.masaId)).toBe(200);
    expect(await stock(e.quesoId)).toBe(0);
    expect(await stock(e.harinaId)).toBe(1000);
  });

  it('sin fila de existencia de la masa rechaza el pedido y no deja rastros', async () => {
    await masaConStock(null);
    await expect(
      pedidoRepository.confirmar(cuenta, [pizzasConMasaConStock(1)]),
    ).rejects.toMatchObject({
      componenteId: e.masaId,
      itemMenuId: e.pizzaId,
    });

    expect(await prisma.pedido.count()).toBe(0);
    expect(await prisma.movimientoStock.count()).toBe(0);
    expect(await stock(e.quesoId)).toBe(100);
  });

  it('el consumo de la masa usa su costo vigente', async () => {
    await masaConStock(400);
    await pedidoRepository.confirmar(cuenta, [pizzasConMasaConStock(1)]);

    const movimiento = await prisma.movimientoStock.findFirstOrThrow({
      where: { existencia: { componenteId: e.masaId } },
    });
    expect(movimiento.tipo).toBe('CONSUMO_PEDIDO');
    expect(Number(movimiento.cantidad)).toBe(-100);
    expect(Number(movimiento.costoUnitario)).toBe(0.5);
  });

  it('si la marca cambia con el pedido en curso, cancelar devuelve la harina y no toca la masa', async () => {
    const pedido = await pedidoRepository.confirmar(cuenta, [pizzas(1)]);
    expect(await stock(e.harinaId)).toBe(950);

    await masaConStock(null);
    const cancelado = await pedidoRepository.cancelar(
      e.restauranteId,
      e.sucursalId,
      pedido.id,
      'x',
    );

    expect(cancelado).toBe(true);
    expect(await stock(e.harinaId)).toBe(1000);
    expect(await stock(e.quesoId)).toBe(100);
    expect(await prisma.existencia.count({ where: { componenteId: e.masaId } })).toBe(0);
    expect(
      await prisma.movimientoStock.count({ where: { existencia: { componenteId: e.masaId } } }),
    ).toBe(0);
  });
});

describe('pedidoRepository.cola', () => {
  it('trae los pedidos activos de la sucursal por orden de llegada', async () => {
    const primero = await pedidoRepository.confirmar(cuenta, [agua()]);
    const entregado = await pedidoRepository.confirmar(cuenta, [agua()]);
    const cancelado = await pedidoRepository.confirmar(cuenta, [agua()]);
    const ultimo = await pedidoRepository.confirmar(cuenta, [agua()]);
    await pedidoRepository.cambiarEstado(
      e.restauranteId,
      e.sucursalId,
      entregado.id,
      'CONFIRMADO',
      'ENTREGADO',
    );
    await pedidoRepository.cancelar(e.restauranteId, e.sucursalId, cancelado.id, 'x');

    const cola = await pedidoRepository.cola(e.restauranteId, e.sucursalId);

    expect(cola.map((p) => p.id)).toEqual([primero.id, ultimo.id]);
    expect(await pedidoRepository.cola(e.restauranteId, e.harinaId)).toEqual([]);
  });

  it('buscarEnSucursal no encuentra pedidos de otra sucursal', async () => {
    const pedido = await pedidoRepository.confirmar(cuenta, [agua()]);
    expect(
      await pedidoRepository.buscarEnSucursal(e.restauranteId, e.sucursalId, pedido.id),
    ).toEqual({
      id: pedido.id,
      estado: 'CONFIRMADO',
      comensalId: e.comensalId,
    });
    expect(
      await pedidoRepository.buscarEnSucursal(e.restauranteId, e.harinaId, pedido.id),
    ).toBeNull();
  });
});
