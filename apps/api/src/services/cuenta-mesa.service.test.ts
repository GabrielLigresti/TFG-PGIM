import type { PedidoComensal } from '@pgim/shared';
import { crearBusEventos, type EventoDominio } from '../domain/eventos';
import { crearPasarelaSimulada } from '../pagos/pasarela';
import type { CuentaMesaRepository, FilaMesa } from '../repositories/cuenta-mesa.repository';
import { createCuentaMesaService } from './cuenta-mesa.service';

function pedido(id: string, total: number, estado: PedidoComensal['estado']): PedidoComensal {
  return { id, numero: 1, creadoEn: '2026-10-30T23:00:00.000Z', estado, total, lineas: [] };
}

function mesa(cambios: Partial<FilaMesa> = {}): FilaMesa {
  return {
    cuentaMesaId: 'cuenta',
    estado: 'ABIERTA',
    sucursal: { id: 'centro', nombre: 'Centro' },
    restauranteId: 'r',
    comensalId: 'C',
    mesaNumero: 4,
    abiertaEn: new Date('2026-10-30T22:55:00.000Z'),
    pedidos: [pedido('a', 1000, 'ENTREGADO'), pedido('b', 500, 'CANCELADO')],
    pagado: 0,
    ...cambios,
  };
}

function armar(fila: FilaMesa | null, habilitada = true) {
  const repo: jest.Mocked<CuentaMesaRepository> = {
    mesaAbiertaDelComensal: jest.fn().mockResolvedValue(fila),
    buscarDelComensal: jest.fn().mockResolvedValue(fila),
    registrarPago: jest.fn(async (_c, _co, _m, resolver) => (await resolver('pago')).estado),
    registrarVisita: jest.fn(),
  };
  const bus = crearBusEventos();
  const eventos: EventoDominio[] = [];
  bus.suscribir((e) => eventos.push(e));
  const servicio = createCuentaMesaService(repo, crearPasarelaSimulada(habilitada), bus);
  return { repo, eventos, servicio };
}

describe('cuentaMesaService.miMesa', () => {
  it('sin mesa abierta devuelve null', async () => {
    expect(await armar(null).servicio.miMesa('C', 'centro')).toBeNull();
  });

  it('sin sucursal busca la mesa abierta en cualquiera', async () => {
    const { servicio, repo } = armar(mesa());
    await servicio.miMesa('C');
    expect(repo.mesaAbiertaDelComensal).toHaveBeenCalledWith('C', undefined);
  });

  it('el total no cuenta los pedidos cancelados', async () => {
    const resultado = await armar(mesa({ pagado: 400 })).servicio.miMesa('C', 'centro');
    expect(resultado).toMatchObject({
      cuentaMesaId: 'cuenta',
      mesa: { numero: 4 },
      total: 1000,
      pagado: 400,
      saldo: 600,
      pagoHabilitado: true,
    });
  });
});

describe('cuentaMesaService.pagar', () => {
  it('una mesa de otro comensal responde 404', async () => {
    await expect(armar(null).servicio.pagar('C', 'cuenta')).rejects.toMatchObject({ status: 404 });
  });

  it('una mesa cerrada responde 409', async () => {
    await expect(
      armar(mesa({ estado: 'CERRADA' })).servicio.pagar('C', 'cuenta'),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('sin saldo responde 409', async () => {
    await expect(armar(mesa({ pagado: 1000 })).servicio.pagar('C', 'cuenta')).rejects.toMatchObject(
      { status: 409, message: 'La mesa no tiene saldo para pagar' },
    );
  });

  it('con la pasarela deshabilitada responde 503', async () => {
    await expect(armar(mesa(), false).servicio.pagar('C', 'cuenta')).rejects.toMatchObject({
      status: 503,
      message: 'El pago de prueba no está habilitado',
    });
  });

  it('cobra el saldo completo y avisa PAGO_APROBADO', async () => {
    const { servicio, repo, eventos } = armar(mesa({ pagado: 400 }));
    repo.buscarDelComensal
      .mockResolvedValueOnce(mesa({ pagado: 400 }))
      .mockResolvedValueOnce(mesa({ pagado: 1000 }));

    const resultado = await servicio.pagar('C', 'cuenta');

    expect(repo.registrarPago).toHaveBeenCalledWith('cuenta', 'C', 600, expect.any(Function));
    expect(resultado.saldo).toBe(0);
    expect(eventos).toContainEqual({
      tipo: 'PAGO_APROBADO',
      cuentaMesaId: 'cuenta',
      comensalId: 'C',
    });
  });

  it('si la pasarela rechaza responde 402', async () => {
    const { servicio, repo } = armar(mesa());
    repo.registrarPago.mockResolvedValue('RECHAZADO');
    await expect(servicio.pagar('C', 'cuenta')).rejects.toMatchObject({ status: 402 });
  });
});
