import type { Insumo, InsumoInput } from '@pgim/shared';
import type { InsumoRepository } from '../repositories/insumo.repository';
import { createInsumoService } from './insumo.service';

const R = 'restaurante';

const sal: Insumo = {
  id: 'sal',
  nombre: 'Sal',
  unidadBase: 'GRAMO',
  costoCompra: 0.001,
  activo: true,
  stock: 0,
};

const datos: InsumoInput = { nombre: 'Sal', unidadBase: 'GRAMO', costoCompra: 0.001 };

function repoFalso(usos: string[] = []): jest.Mocked<InsumoRepository> {
  return {
    listar: jest.fn(),
    buscar: jest.fn().mockResolvedValue(sal),
    existeNombre: jest.fn().mockResolvedValue(false),
    usosEnRecetas: jest.fn().mockResolvedValue(usos),
    crear: jest.fn(),
    actualizar: jest.fn(),
    desactivar: jest.fn(),
  };
}

describe('insumoService', () => {
  it('no da de baja un insumo que está en recetas y dice en cuáles', async () => {
    const repo = repoFalso(['Bife de chorizo', 'Provoleta']);

    await expect(createInsumoService(repo).desactivar(R, 'sal')).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('Bife de chorizo, Provoleta'),
    });
    expect(repo.desactivar).not.toHaveBeenCalled();
  });

  it('no cambia la unidad base de un insumo en uso', async () => {
    const repo = repoFalso(['Provoleta']);

    await expect(
      createInsumoService(repo).actualizar(R, 'sal', { ...datos, unidadBase: 'UNIDAD' }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('edita el costo de un insumo en uso', async () => {
    const repo = repoFalso(['Provoleta']);

    await createInsumoService(repo).actualizar(R, 'sal', { ...datos, costoCompra: 0.002 });

    expect(repo.actualizar).toHaveBeenCalled();
  });

  it('rechaza un nombre repetido', async () => {
    const repo = repoFalso();
    repo.existeNombre.mockResolvedValue(true);

    await expect(createInsumoService(repo).crear(R, datos)).rejects.toMatchObject({ status: 409 });
  });
});
