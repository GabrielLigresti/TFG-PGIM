import { prisma } from '../lib/prisma';
import { crearEscenario, limpiarBase, type Escenario } from '../test/db-setup';
import { recetaRepository } from './receta.repository';

afterAll(() => prisma.$disconnect());

describe('recetaRepository.existenciasConStock', () => {
  let e: Escenario;

  beforeAll(async () => {
    await limpiarBase();
    e = await crearEscenario();
    const hora = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);
    const palermo = await prisma.sucursal.create({
      data: {
        restauranteId: e.restauranteId,
        nombre: 'Palermo',
        direccion: 'Calle Falsa 456',
        horarioApertura: hora('12:00'),
        horarioCierre: hora('00:00'),
        toleranciaNoShowMin: 15,
      },
    });
    await prisma.existencia.createMany({
      data: [
        { sucursalId: e.sucursalId, componenteId: e.masaId, cantidadActual: 5 },
        { sucursalId: palermo.id, componenteId: e.masaId, cantidadActual: 0 },
      ],
    });
  });

  it('devuelve solo las sucursales con existencia mayor a 0', async () => {
    expect(await recetaRepository.existenciasConStock(e.restauranteId, e.masaId)).toEqual([
      { sucursal: 'Centro', cantidad: 5 },
    ]);
  });

  it('no mira otros restaurantes', async () => {
    expect(
      await recetaRepository.existenciasConStock('01900000-0000-7000-8000-0000000000ff', e.masaId),
    ).toEqual([]);
  });
});
