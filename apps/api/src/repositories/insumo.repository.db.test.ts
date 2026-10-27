import { prisma } from '../lib/prisma';
import { crearEscenario, limpiarBase } from '../test/db-setup';
import { insumoRepository } from './insumo.repository';

afterAll(() => prisma.$disconnect());

describe('insumoRepository.platosDeReventa', () => {
  it('lista los platos del restaurante que revenden el insumo', async () => {
    await limpiarBase();
    const e = await crearEscenario();
    await prisma.itemMenu.update({ where: { id: e.aguaId }, data: { insumoId: e.quesoId } });

    expect(await insumoRepository.platosDeReventa(e.restauranteId, e.quesoId)).toEqual(['Agua']);
    expect(await insumoRepository.platosDeReventa(e.restauranteId, e.harinaId)).toEqual([]);
    expect(await insumoRepository.platosDeReventa(e.sucursalId, e.quesoId)).toEqual([]);
  });
});
