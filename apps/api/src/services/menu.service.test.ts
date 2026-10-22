import {
  estaVigente,
  hoyArgentina,
  type Categoria,
  type Menu,
  type MenuInput,
  type PlatoInput,
} from '@pgim/shared';
import type { MenuRepository } from '../repositories/menu.repository';
import { createMenuService } from './menu.service';

const R = 'restaurante';

const principales: Categoria = {
  id: 'principales',
  nombre: 'Principales',
  requiereReceta: true,
  cantidadPlatos: 3,
};

const primavera: Menu = {
  id: 'primavera',
  nombre: 'Carta de primavera',
  descripcion: null,
  vigenciaDesde: '2026-09-21',
  vigenciaHasta: '2026-12-20',
  platoIds: ['bife', 'flan'],
  sucursalesActivas: [],
};

const menu: MenuInput = {
  nombre: 'Carta de primavera',
  vigenciaDesde: '2026-09-21',
  vigenciaHasta: '2026-12-20',
  platoIds: ['bife', 'flan', 'bife'],
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
    listarMenus: jest.fn(),
    buscarMenu: jest.fn().mockResolvedValue(primavera),
    existeMenu: jest.fn().mockResolvedValue(false),
    contarPlatosActivos: jest.fn().mockResolvedValue(2),
    contarPromociones: jest.fn().mockResolvedValue(0),
    crearMenu: jest.fn(),
    actualizarMenu: jest.fn(),
    borrarMenu: jest.fn(),
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

  it('crea un menú sin platos repetidos', async () => {
    const repo = repoFalso();

    await createMenuService(repo).crearMenu(R, menu);

    expect(repo.contarPlatosActivos).toHaveBeenCalledWith(R, ['bife', 'flan']);
    expect(repo.crearMenu).toHaveBeenCalledWith(R, { ...menu, platoIds: ['bife', 'flan'] });
  });

  it('rechaza un menú con platos dados de baja o de otro restaurante', async () => {
    const repo = repoFalso();
    repo.contarPlatosActivos.mockResolvedValue(1);

    await expect(createMenuService(repo).crearMenu(R, menu)).rejects.toMatchObject({
      status: 400,
    });
    expect(repo.crearMenu).not.toHaveBeenCalled();
  });

  it('no borra un menú activo en alguna sucursal', async () => {
    const repo = repoFalso();
    repo.buscarMenu.mockResolvedValue({
      ...primavera,
      sucursalesActivas: [{ id: 'centro', nombre: 'Centro' }],
    });

    await expect(createMenuService(repo).borrarMenu(R, 'primavera')).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('Centro'),
    });
    expect(repo.borrarMenu).not.toHaveBeenCalled();
  });

  it('no borra un menú con promociones', async () => {
    const repo = repoFalso();
    repo.contarPromociones.mockResolvedValue(1);

    await expect(createMenuService(repo).borrarMenu(R, 'primavera')).rejects.toMatchObject({
      status: 409,
    });
  });

  it('borra un menú que nada usa', async () => {
    const repo = repoFalso();

    await createMenuService(repo).borrarMenu(R, 'primavera');

    expect(repo.borrarMenu).toHaveBeenCalledWith(R, 'primavera');
  });
});

describe('vigencia del menú', () => {
  it.each([
    ['2026-09-20', false],
    ['2026-09-21', true],
    ['2026-12-20', true],
    ['2026-12-21', false],
  ])('el %s está vigente: %s', (hoy, esperado) => {
    expect(estaVigente(primavera, hoy)).toBe(esperado);
  });

  it('sin fecha de fin, sigue vigente', () => {
    expect(estaVigente({ ...primavera, vigenciaHasta: null }, '2030-01-01')).toBe(true);
  });

  it('toma el día en hora de Argentina', () => {
    // 01:30 UTC del 23/10 son las 22:30 del 22/10 en Argentina.
    expect(hoyArgentina(new Date('2026-10-23T01:30:00Z'))).toBe('2026-10-22');
  });
});
