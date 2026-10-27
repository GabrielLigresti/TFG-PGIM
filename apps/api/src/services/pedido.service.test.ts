import type { PedidoCola } from '@pgim/shared';
import { crearBusEventos, type EventoDominio } from '../domain/eventos';
import {
  StockInsuficienteError,
  type CuentaParaPedido,
  type LineaAConfirmar,
  type PedidoRepository,
} from '../repositories/pedido.repository';
import type { MenuVisible, PlatoVisible } from './menu-visible';
import { createPedidoService } from './pedido.service';

const CUENTA: CuentaParaPedido = {
  id: 'cuenta',
  sucursalId: 'centro',
  restauranteId: 'r',
  comensalId: 'C',
  mesaNumero: 4,
  estado: 'ABIERTA',
};

function platoVisible(id: string, precio: number, insumos: Map<string, number> | null) {
  return {
    plato: {
      id,
      nombre: id === 'pizza' ? 'Pizza' : 'Agua',
      descripcion: null,
      precio,
      fotoUrl: null,
      categoria: { id: 'c', nombre: 'Principales' },
      modeloRa: null,
      hayStock: true,
    },
    insumos,
  } satisfies PlatoVisible;
}

const pedidoCreado: PedidoCola = {
  id: 'P',
  numero: 1,
  mesa: { numero: 4 },
  creadoEn: '2026-10-30T23:00:00.000Z',
  listoEn: null,
  estado: 'CONFIRMADO',
  lineas: [],
};

function armar(cuenta: CuentaParaPedido | null = CUENTA) {
  const repo = {
    buscarCuentaDelComensal: jest.fn().mockResolvedValue(cuenta),
    confirmar: jest.fn().mockResolvedValue(pedidoCreado),
    existencias: jest.fn(),
  } as unknown as jest.Mocked<PedidoRepository>;
  const menuVisible: jest.MockedFunction<MenuVisible> = jest.fn().mockResolvedValue({
    sucursal: {
      id: 'centro',
      nombre: 'Centro',
      direccion: 'x',
      restaurante: { id: 'r', nombre: 'R' },
    },
    menu: { nombre: 'Carta', descripcion: null },
    platos: [
      platoVisible('pizza', 1000, new Map([['queso', 50]])),
      platoVisible('agua', 300, null),
    ],
  });
  const bus = crearBusEventos();
  const eventos: EventoDominio[] = [];
  bus.suscribir((e) => eventos.push(e));
  return { repo, menuVisible, eventos, servicio: createPedidoService(repo, menuVisible, bus) };
}

const linea = (itemMenuId: string, cantidad = 1) => ({ itemMenuId, cantidad, observaciones: null });

describe('pedidoService.confirmar', () => {
  it('una cuenta que no existe o es de otro comensal responde 404', async () => {
    const { servicio } = armar(null);
    await expect(
      servicio.confirmar('C', { cuentaMesaId: 'cuenta', lineas: [linea('agua')] }),
    ).rejects.toMatchObject({ status: 404, message: 'La mesa no existe' });
  });

  it('una mesa cerrada responde 409', async () => {
    const { servicio } = armar({ ...CUENTA, estado: 'CERRADA' });
    await expect(
      servicio.confirmar('C', { cuentaMesaId: 'cuenta', lineas: [linea('agua')] }),
    ).rejects.toMatchObject({ status: 409, message: 'La mesa ya está cerrada' });
  });

  it('un plato que no está en el menú de la sucursal responde 400', async () => {
    const { servicio, menuVisible } = armar();
    await expect(
      servicio.confirmar('C', { cuentaMesaId: 'cuenta', lineas: [linea('otro')] }),
    ).rejects.toMatchObject({ status: 400 });
    expect(menuVisible).toHaveBeenCalledWith('centro');
  });

  it('copia el precio del menú y escala los insumos por la cantidad', async () => {
    const { servicio, repo } = armar();
    await servicio.confirmar('C', { cuentaMesaId: 'cuenta', lineas: [linea('pizza', 3)] });

    const [, lineas] = repo.confirmar.mock.calls[0]! as [CuentaParaPedido, LineaAConfirmar[]];
    expect(lineas[0]).toEqual({
      itemMenuId: 'pizza',
      cantidad: 3,
      precioUnitario: 1000,
      observaciones: null,
      insumos: new Map([['queso', 150]]),
    });
  });

  it('un plato sin receta se confirma sin descontar stock y avisa PLATO_SIN_RECETA', async () => {
    const { servicio, repo, eventos } = armar();
    await servicio.confirmar('C', { cuentaMesaId: 'cuenta', lineas: [linea('agua')] });

    const [, lineas] = repo.confirmar.mock.calls[0]! as [CuentaParaPedido, LineaAConfirmar[]];
    expect(lineas[0]!.insumos.size).toBe(0);
    expect(eventos).toContainEqual({
      tipo: 'PLATO_SIN_RECETA',
      sucursalId: 'centro',
      itemMenuId: 'agua',
    });
  });

  it('sin stock responde 409 con el plato y avisa STOCK_INSUFICIENTE', async () => {
    const { servicio, repo, eventos } = armar();
    repo.confirmar.mockRejectedValue(new StockInsuficienteError('queso', 'pizza'));

    await expect(
      servicio.confirmar('C', { cuentaMesaId: 'cuenta', lineas: [linea('pizza')] }),
    ).rejects.toMatchObject({
      status: 409,
      message: 'No alcanza el stock para Pizza',
      detalles: { itemMenuId: 'pizza', nombre: 'Pizza' },
    });
    expect(eventos).toContainEqual({
      tipo: 'STOCK_INSUFICIENTE',
      sucursalId: 'centro',
      componenteId: 'queso',
      itemMenuId: 'pizza',
    });
    expect(eventos.some((e) => e.tipo === 'PEDIDO_CONFIRMADO')).toBe(false);
  });

  it('al confirmar publica PEDIDO_CONFIRMADO para la cocina', async () => {
    const { servicio, eventos } = armar();
    const pedido = await servicio.confirmar('C', {
      cuentaMesaId: 'cuenta',
      lineas: [linea('pizza')],
    });

    expect(pedido).toBe(pedidoCreado);
    expect(eventos).toContainEqual({
      tipo: 'PEDIDO_CONFIRMADO',
      pedido: pedidoCreado,
      sucursalId: 'centro',
      comensalId: 'C',
    });
  });
});
