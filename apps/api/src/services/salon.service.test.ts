import type { Mesa, PedidoSalon } from '@pgim/shared';
import type { FilaReservaPanel } from '../repositories/reserva.repository';
import { createSalonService } from './salon.service';

const AHORA = new Date('2026-10-30T23:30:00.000Z');
const MIN = 60_000;

const mesa = (id: string, numero: number, activa = true): Mesa => ({
  id,
  numero,
  capacidad: 4,
  posX: 10 * numero,
  posY: 15,
  activa,
});

function reserva(cambios: Partial<FilaReservaPanel> = {}): FilaReservaPanel {
  return {
    id: 'R',
    sucursalId: 'S',
    sucursalNombre: 'Centro',
    comensalId: 'C',
    mesaId: 'm1',
    mesaNumero: 1,
    inicio: new Date(AHORA.getTime() - 10 * MIN),
    cantidadPersonas: 2,
    modoAsignacion: 'MANUAL',
    estado: 'ACTIVA',
    toleranciaNoShowMin: 15,
    comensalNombre: 'Ana',
    comensalTelefono: null,
    pagoEnCurso: false,
    ...cambios,
  };
}

const pedido = (id: string): PedidoSalon => ({
  id,
  numero: 1,
  creadoEn: AHORA.toISOString(),
  estado: 'CONFIRMADO',
  lineas: [],
});

function armar(mesas: Mesa[], reservas: FilaReservaPanel[], pedidos: Map<string, PedidoSalon[]>) {
  const repoMesas = { listar: jest.fn().mockResolvedValue(mesas) };
  const repoReservas = { vigentesDelSalon: jest.fn().mockResolvedValue(reservas) };
  const repoPedidos = { delSalon: jest.fn().mockResolvedValue(pedidos) };
  const servicio = createSalonService(repoMesas, repoReservas, repoPedidos, () => AHORA);
  return { servicio, repoMesas, repoReservas, repoPedidos };
}

describe('salonService.estado', () => {
  it('no devuelve las mesas dadas de baja', async () => {
    const { servicio } = armar([mesa('m1', 1), mesa('m2', 2, false)], [], new Map());
    const salon = await servicio.estado('R', 'S', true);
    expect(salon.map((m) => m.id)).toEqual(['m1']);
  });

  it('pide las pendientes hasta 30 minutos después de ahora', async () => {
    const { servicio, repoReservas } = armar([mesa('m1', 1)], [], new Map());
    await servicio.estado('R', 'S', true);
    expect(repoReservas.vigentesDelSalon).toHaveBeenCalledWith(
      'R',
      'S',
      new Date(AHORA.getTime() + 30 * MIN),
    );
  });

  it('una mesa con reserva ACTIVA viene OCUPADA, con la reserva y sus pedidos', async () => {
    const pedidos = new Map([['R1', [pedido('p1')]]]);
    const { servicio } = armar([mesa('m1', 1)], [reserva({ id: 'R1' })], pedidos);
    const [m] = await servicio.estado('R', 'S', true);
    expect(m).toMatchObject({ estado: 'OCUPADA', reserva: { id: 'R1' } });
    expect(m!.pedidos.map((p) => p.id)).toEqual(['p1']);
  });

  it('una mesa RESERVADA viene con la reserva y sin pedidos', async () => {
    const pendiente = reserva({
      id: 'R2',
      estado: 'PENDIENTE',
      inicio: new Date(AHORA.getTime() + 10 * MIN),
    });
    const pedidos = new Map([['R2', [pedido('p2')]]]);
    const { servicio, repoPedidos } = armar([mesa('m1', 1)], [pendiente], pedidos);
    const [m] = await servicio.estado('R', 'S', true);
    expect(m).toMatchObject({ estado: 'RESERVADA', reserva: { id: 'R2' }, pedidos: [] });
    expect(repoPedidos.delSalon).not.toHaveBeenCalledWith('R', 'S', expect.arrayContaining(['R2']));
  });

  it('una mesa LIBRE viene con reserva null y pedidos vacíos', async () => {
    const { servicio } = armar([mesa('m1', 1)], [], new Map());
    const [m] = await servicio.estado('R', 'S', true);
    expect(m).toMatchObject({ estado: 'LIBRE', reserva: null, pedidos: [] });
  });

  it('con dos ACTIVA solo pide y muestra los pedidos de la más reciente', async () => {
    const vieja = reserva({ id: 'vieja', inicio: new Date(AHORA.getTime() - 120 * MIN) });
    const nueva = reserva({ id: 'nueva', inicio: new Date(AHORA.getTime() - 5 * MIN) });
    const pedidos = new Map([
      ['vieja', [pedido('pv')]],
      ['nueva', [pedido('pn')]],
    ]);
    const { servicio, repoPedidos } = armar([mesa('m1', 1)], [vieja, nueva], pedidos);
    const [m] = await servicio.estado('R', 'S', true);
    expect(repoPedidos.delSalon).toHaveBeenCalledWith('R', 'S', ['nueva']);
    expect(m!.reserva!.id).toBe('nueva');
    expect(m!.pedidos.map((p) => p.id)).toEqual(['pn']);
  });

  it('sin incluirPedidos no llama a delSalon y pedidos viene vacío', async () => {
    const pedidos = new Map([['R1', [pedido('p1')]]]);
    const { servicio, repoPedidos } = armar([mesa('m1', 1)], [reserva({ id: 'R1' })], pedidos);
    const [m] = await servicio.estado('R', 'S', false);
    expect(repoPedidos.delSalon).not.toHaveBeenCalled();
    expect(m!.pedidos).toEqual([]);
  });

  it('reserva.cerrable es true en una OCUPADA y false en una RESERVADA', async () => {
    const pendiente = reserva({
      id: 'R2',
      mesaId: 'm2',
      estado: 'PENDIENTE',
      inicio: new Date(AHORA.getTime() + 10 * MIN),
    });
    const { servicio } = armar(
      [mesa('m1', 1), mesa('m2', 2)],
      [reserva({ id: 'R1' }), pendiente],
      new Map(),
    );
    const [a, b] = await servicio.estado('R', 'S', true);
    expect(a!.reserva!.cerrable).toBe(true);
    expect(b!.reserva!.cerrable).toBe(false);
  });
});
