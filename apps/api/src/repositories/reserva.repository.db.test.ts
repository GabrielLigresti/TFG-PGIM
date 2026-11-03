import type { EstadoReserva } from '@pgim/shared';
import { prisma } from '../lib/prisma';
import { crearEscenario, limpiarBase, type Escenario } from '../test/db-setup';
import { reservaRepository } from './reserva.repository';

afterAll(() => prisma.$disconnect());

let e: Escenario;

beforeEach(async () => {
  await limpiarBase();
  e = await crearEscenario();
});

describe('reservaRepository.listarPanel', () => {
  // La reserva del escenario tiene la cuenta abierta: se cierra para no contarla.
  beforeEach(() =>
    prisma.reserva.update({ where: { id: e.reservaId }, data: { estado: 'FINALIZADA' } }),
  );

  async function reservar(estado: EstadoReserva, inicio: string, sucursalId = e.sucursalId) {
    const mesa = await prisma.mesa.findFirstOrThrow({ where: { sucursalId } });
    const { id } = await prisma.reserva.create({
      data: {
        sucursalId,
        mesaId: mesa.id,
        comensalId: e.comensalId,
        inicio: new Date(inicio),
        cantidadPersonas: 2,
        modoAsignacion: 'MANUAL',
        estado,
      },
    });
    return id;
  }

  const HOY = new Date('2030-01-02T03:00:00.000Z');

  const ids = async (filtro: { desde?: Date; hasta?: Date; pagina?: number } = {}) =>
    (
      await reservaRepository.listarPanel(e.restauranteId, e.sucursalId, {
        desde: HOY,
        pagina: 1,
        ...filtro,
      })
    ).filas.map((r) => r.id);

  it('trae todos los estados desde hoy, de la más cercana a la más lejana', async () => {
    const finalizada = await reservar('FINALIZADA', '2030-01-04T23:00:00.000Z');
    const vencida = await reservar('VENCIDA', '2030-01-03T23:00:00.000Z');
    const pendiente = await reservar('PENDIENTE', '2030-01-02T23:00:00.000Z');
    const cancelada = await reservar('CANCELADA', '2030-01-05T23:00:00.000Z');

    expect(await ids()).toEqual([pendiente, vencida, finalizada, cancelada]);
  });

  it('no trae nada de antes de desde', async () => {
    await reservar('ACTIVA', '2030-01-01T23:00:00.000Z');
    await reservar('PENDIENTE', '2030-01-01T22:00:00.000Z');

    expect(await ids()).toEqual([]);
  });

  it('hasta no incluye el límite', async () => {
    const adentro = await reservar('PENDIENTE', '2030-01-02T23:00:00.000Z');
    await reservar('PENDIENTE', '2030-01-03T03:00:00.000Z');

    expect(await ids({ hasta: new Date('2030-01-03T03:00:00.000Z') })).toEqual([adentro]);
  });

  it('pagina de a 25 e informa el total', async () => {
    for (let dia = 0; dia < 26; dia++) {
      await reservar('CANCELADA', new Date(HOY.getTime() + dia * 86_400_000).toISOString());
    }
    const filtro = { desde: HOY, pagina: 2 };
    const pagina = await reservaRepository.listarPanel(e.restauranteId, e.sucursalId, filtro);

    expect(pagina).toMatchObject({ total: 26, pagina: 2, porPagina: 25 });
    expect(pagina.filas).toHaveLength(1);
  });

  it('no trae reservas de otra sucursal', async () => {
    const otra = await prisma.sucursal.create({
      data: {
        restauranteId: e.restauranteId,
        nombre: 'Norte',
        direccion: 'Calle Falsa 456',
        horarioApertura: new Date('1970-01-01T12:00:00Z'),
        horarioCierre: new Date('1970-01-01T00:00:00Z'),
        toleranciaNoShowMin: 15,
        mesas: { create: { numero: 1, capacidad: 4, posX: 10, posY: 10 } },
      },
    });
    await reservar('PENDIENTE', '2030-01-02T23:00:00.000Z', otra.id);

    expect(await ids()).toEqual([]);
  });
});
