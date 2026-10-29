import type { PedidoComensal } from '@pgim/shared';
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
    descuentos: 0,
    pagoPendienteId: null,
    ...cambios,
  };
}

function armar(fila: FilaMesa | null, habilitada = true) {
  const repo: jest.Mocked<CuentaMesaRepository> = {
    mesaAbiertaDelComensal: jest.fn().mockResolvedValue(fila),
    buscarDelComensal: jest.fn().mockResolvedValue(fila),
    registrarVisita: jest.fn(),
  };
  const servicio = createCuentaMesaService(repo, crearPasarelaSimulada(habilitada), (id) =>
    id === 'p-curso' ? 'https://mp/pagar' : null,
  );
  return { repo, servicio };
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

describe('cuentaMesaService.miMesa con un pago en curso', () => {
  it('ofrece retomar el pago con su link de Mercado Pago', async () => {
    const { servicio } = armar(mesa({ pagoPendienteId: 'p-curso' }));
    expect((await servicio.miMesa('C'))!.pagoEnCurso).toEqual({
      pagoId: 'p-curso',
      urlPago: 'https://mp/pagar',
    });
  });

  it('sin pago en curso, null', async () => {
    const { servicio } = armar(mesa());
    expect((await servicio.miMesa('C'))!.pagoEnCurso).toBeNull();
  });
});
