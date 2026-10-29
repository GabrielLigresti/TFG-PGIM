import { prisma } from '../lib/prisma';
import { crearEscenario, limpiarBase, type Escenario } from '../test/db-setup';
import { recetaRepository } from './receta.repository';

afterAll(() => prisma.$disconnect());

describe('recetaRepository: salir del stock', () => {
  let e: Escenario;
  let palermoId: string;
  let salsaId: string;

  const salsa = () => prisma.componenteInventario.findUniqueOrThrow({ where: { id: salsaId } });
  const poner = (sucursalId: string, cantidadActual: number) =>
    prisma.existencia.upsert({
      where: { sucursalId_componenteId: { sucursalId, componenteId: salsaId } },
      create: { sucursalId, componenteId: salsaId, cantidadActual },
      update: { cantidadActual },
    });

  beforeEach(async () => {
    await limpiarBase();
    e = await crearEscenario();
    const hora = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);
    palermoId = (
      await prisma.sucursal.create({
        data: {
          restauranteId: e.restauranteId,
          nombre: 'Palermo',
          direccion: 'Calle Falsa 456',
          horarioApertura: hora('12:00'),
          horarioCierre: hora('00:00'),
          toleranciaNoShowMin: 15,
        },
      })
    ).id;
    salsaId = (
      await prisma.componenteInventario.create({
        data: {
          restauranteId: e.restauranteId,
          tipo: 'INTERMEDIO',
          nombre: 'Salsa',
          unidadBase: 'GRAMO',
          llevaStock: true,
          costoCompraVigente: 3,
        },
      })
    ).id;
  });

  it('desactivarLlevaStock con existencia devuelve la sucursal y no escribe', async () => {
    await poner(e.sucursalId, 5);
    await poner(palermoId, 0);

    expect(await recetaRepository.desactivarLlevaStock(e.restauranteId, salsaId)).toEqual([
      { sucursal: 'Centro', cantidad: 5 },
    ]);
    expect(await salsa()).toMatchObject({ llevaStock: true });
  });

  it('desactivarLlevaStock con todo en cero apaga la marca y limpia el costo', async () => {
    await poner(e.sucursalId, 0);

    expect(await recetaRepository.desactivarLlevaStock(e.restauranteId, salsaId)).toEqual([]);
    expect(await salsa()).toMatchObject({ llevaStock: false, costoCompraVigente: null });
  });

  it('desactivarIntermedio con existencia no da de baja; con todo en cero sí', async () => {
    await poner(palermoId, 2);

    expect(await recetaRepository.desactivarIntermedio(e.restauranteId, salsaId)).toEqual([
      { sucursal: 'Palermo', cantidad: 2 },
    ]);
    expect(await salsa()).toMatchObject({ activo: true });

    await poner(palermoId, 0);
    expect(await recetaRepository.desactivarIntermedio(e.restauranteId, salsaId)).toEqual([]);
    expect(await salsa()).toMatchObject({ activo: false });
  });

  it('no mira otros restaurantes', async () => {
    await poner(e.sucursalId, 5);

    await expect(
      recetaRepository.desactivarLlevaStock('01900000-0000-7000-8000-0000000000ff', salsaId),
    ).rejects.toThrow();
    expect(await salsa()).toMatchObject({ llevaStock: true });
  });
});
