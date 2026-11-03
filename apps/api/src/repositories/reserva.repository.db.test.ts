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

describe('reservaRepository.listarVigentes', () => {
  // La reserva del escenario tiene la cuenta abierta: se saca de las vigentes.
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

  const ids = async () =>
    (await reservaRepository.listarVigentes(e.restauranteId, e.sucursalId)).map((r) => r.id);

  it('trae las pendientes y activas de cualquier día, de la más vieja a la más nueva', async () => {
    const pasadoManana = await reservar('PENDIENTE', '2030-01-03T23:00:00.000Z');
    const abiertaDeAyer = await reservar('ACTIVA', '2030-01-01T23:00:00.000Z');
    const manana = await reservar('PENDIENTE', '2030-01-02T23:00:00.000Z');

    expect(await ids()).toEqual([abiertaDeAyer, manana, pasadoManana]);
  });

  it('deja afuera las vencidas, canceladas y finalizadas', async () => {
    await reservar('VENCIDA', '2030-01-01T23:00:00.000Z');
    await reservar('CANCELADA', '2030-01-02T23:00:00.000Z');
    await reservar('FINALIZADA', '2030-01-03T23:00:00.000Z');

    expect(await ids()).toEqual([]);
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
