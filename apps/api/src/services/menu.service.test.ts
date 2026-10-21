import type { Categoria, PlatoInput } from '@pgim/shared';
import type { MenuRepository } from '../repositories/menu.repository';
import { createMenuService } from './menu.service';

const R = 'restaurante';

const principales: Categoria = {
  id: 'principales',
  nombre: 'Principales',
  requiereReceta: true,
  cantidadPlatos: 3,
};

function repoFalso(categoria: Categoria | null = principales): jest.Mocked<MenuRepository> {
  return {
    listarCategorias: jest.fn(),
    buscarCategoria: jest.fn().mockResolvedValue(categoria),
    existeCategoria: jest.fn().mockResolvedValue(false),
    crearCategoria: jest.fn(),
    actualizarCategoria: jest.fn(),
    borrarCategoria: jest.fn(),
    listarPlatos: jest.fn(),
    buscarPlato: jest.fn(),
    existePlato: jest.fn().mockResolvedValue(false),
    crearPlato: jest.fn(),
    actualizarPlato: jest.fn(),
    desactivarPlato: jest.fn(),
  };
}

const plato: PlatoInput = {
  categoriaId: 'principales',
  nombre: 'Bife',
  precio: 1000,
  disponible: true,
};

describe('menuService', () => {
  it('no borra una categoría con platos', async () => {
    const repo = repoFalso();

    await expect(createMenuService(repo).borrarCategoria(R, 'principales')).rejects.toMatchObject({
      status: 409,
    });
    expect(repo.borrarCategoria).not.toHaveBeenCalled();
  });

  it('borra una categoría vacía', async () => {
    const repo = repoFalso({ ...principales, cantidadPlatos: 0 });

    await createMenuService(repo).borrarCategoria(R, 'principales');

    expect(repo.borrarCategoria).toHaveBeenCalledWith(R, 'principales');
  });

  it('rechaza un plato con una categoría de otro restaurante', async () => {
    await expect(createMenuService(repoFalso(null)).crearPlato(R, plato)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('rechaza un plato con nombre repetido', async () => {
    const repo = repoFalso();
    repo.existePlato.mockResolvedValue(true);

    await expect(createMenuService(repo).crearPlato(R, plato)).rejects.toMatchObject({
      status: 409,
    });
  });
});
