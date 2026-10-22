import {
  estaVigente,
  hoyArgentina,
  type Categoria,
  type Menu,
  type MenuInput,
  type Plato,
  type PlatoInput,
} from '@pgim/shared';
import type { MenuRepository } from '../repositories/menu.repository';
import { createMenuService, type ArchivosModelo } from './menu.service';

const R = 'restaurante';

function archivosFalsos(): jest.Mocked<ArchivosModelo> {
  return {
    validarGlb: jest.fn(),
    validarUsdz: jest.fn(),
    guardarModelo: jest.fn().mockResolvedValue('/api/uploads/modelos/nuevo.glb'),
    borrarModelo: jest.fn(),
  };
}

const platoBase: Plato = {
  id: 'bife',
  nombre: 'Bife',
  descripcion: null,
  precio: 1000,
  fotoUrl: null,
  disponible: true,
  activo: true,
  categoria: { id: 'principales', nombre: 'Principales', requiereReceta: true },
  tieneReceta: true,
  sinReceta: false,
  modeloRa: null,
};

const conModelo: Plato = {
  ...platoBase,
  modeloRa: {
    urlModelo: '/api/uploads/modelos/viejo.glb',
    urlModeloIos: '/api/uploads/modelos/viejo.usdz',
    escalaReal: 1,
    porcionGramos: 400,
  },
};

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
    guardarModeloRa: jest.fn(),
    borrarModeloRa: jest.fn(),
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

describe('modelo RA del plato', () => {
  const datos = { escalaReal: 0.5, porcionGramos: 350 };

  it('sube el .glb, guarda la fila y borra el archivo anterior', async () => {
    const repo = repoFalso();
    repo.buscarPlato.mockResolvedValue(conModelo);
    const archivos = archivosFalsos();

    await createMenuService(repo, archivos).subirModelo(R, 'bife', 'glb', Buffer.from('x'), datos);

    expect(archivos.validarGlb).toHaveBeenCalled();
    expect(repo.guardarModeloRa).toHaveBeenCalledWith(R, 'bife', {
      urlModelo: '/api/uploads/modelos/nuevo.glb',
      urlModeloIos: '/api/uploads/modelos/viejo.usdz',
      ...datos,
    });
    expect(archivos.borrarModelo).toHaveBeenCalledWith('/api/uploads/modelos/viejo.glb');
  });

  it('no acepta un .usdz si el plato no tiene .glb', async () => {
    const repo = repoFalso();
    repo.buscarPlato.mockResolvedValue(platoBase);
    const archivos = archivosFalsos();

    await expect(
      createMenuService(repo, archivos).subirModelo(R, 'bife', 'usdz', Buffer.from('x')),
    ).rejects.toMatchObject({ status: 409 });
    expect(archivos.guardarModelo).not.toHaveBeenCalled();
  });

  it('no guarda nada si el archivo no es válido', async () => {
    const repo = repoFalso();
    repo.buscarPlato.mockResolvedValue(platoBase);
    const archivos = archivosFalsos();
    archivos.validarGlb.mockImplementation(() => {
      throw new Error('no es un modelo .glb');
    });

    await expect(
      createMenuService(repo, archivos).subirModelo(R, 'bife', 'glb', Buffer.from('x'), datos),
    ).rejects.toThrow('no es un modelo .glb');
    expect(archivos.guardarModelo).not.toHaveBeenCalled();
  });

  it('si falla la base, borra el archivo recién guardado', async () => {
    const repo = repoFalso();
    repo.buscarPlato.mockResolvedValue(platoBase);
    repo.guardarModeloRa.mockRejectedValue(new Error('base caída'));
    const archivos = archivosFalsos();

    await expect(
      createMenuService(repo, archivos).subirModelo(R, 'bife', 'glb', Buffer.from('x'), datos),
    ).rejects.toThrow('base caída');
    expect(archivos.borrarModelo).toHaveBeenCalledWith('/api/uploads/modelos/nuevo.glb');
  });

  it('quitar el modelo borra la fila y los dos archivos', async () => {
    const repo = repoFalso();
    repo.buscarPlato.mockResolvedValue(conModelo);
    const archivos = archivosFalsos();

    await createMenuService(repo, archivos).quitarModelo(R, 'bife');

    expect(repo.borrarModeloRa).toHaveBeenCalledWith(R, 'bife');
    expect(archivos.borrarModelo).toHaveBeenCalledWith('/api/uploads/modelos/viejo.glb');
    expect(archivos.borrarModelo).toHaveBeenCalledWith('/api/uploads/modelos/viejo.usdz');
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
