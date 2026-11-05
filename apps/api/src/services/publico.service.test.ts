import type { Componente } from '../domain/receta';
import type { Barrio, RestauranteComensal } from '@pgim/shared';
import { AppError } from '../lib/errors';
import type {
  ComensalRepository,
  PlatoDelMenu,
  SucursalConMenu,
} from '../repositories/comensal.repository';
import { createMenuVisible, type Inventario, type MenuVisible } from './menu-visible';
import { createPublicoService } from './publico.service';

const HOY = '2026-10-23';

function plato(id: string, cambios: Partial<PlatoDelMenu> = {}): PlatoDelMenu {
  return {
    id,
    nombre: id,
    descripcion: null,
    precio: 1000,
    fotoUrl: null,
    disponible: true,
    activo: true,
    categoria: {
      id: 'principales',
      nombre: 'Principales',
      requiereReceta: true,
      admiteObservaciones: true,
    },
    tieneReceta: true,
    receta: null,
    insumoReventaId: null,
    modeloRa: null,
    ...cambios,
  };
}

const postres = {
  id: 'postres',
  nombre: 'Postres',
  requiereReceta: false,
  admiteObservaciones: true,
};

function sucursal(
  cambios: Partial<NonNullable<SucursalConMenu['menuActivo']>> = {},
): SucursalConMenu {
  return {
    id: 'centro',
    nombre: 'Centro',
    direccion: 'Calle 1',
    barrio: 'SAN_NICOLAS',
    restaurante: { id: 'r', nombre: 'Demo' },
    menuActivo: {
      nombre: 'Carta',
      descripcion: null,
      vigenciaDesde: '2026-10-01',
      vigenciaHasta: null,
      platos: [
        plato('bife'),
        plato('milanesa', { tieneReceta: false }),
        plato('agotado', { disponible: false }),
        plato('baja', { activo: false }),
        plato('flan', { categoria: postres, tieneReceta: false }),
      ],
      ...cambios,
    },
  };
}

const queso: Componente = {
  id: 'queso',
  nombre: 'Queso',
  tipo: 'INSUMO',
  unidadBase: 'GRAMO',
  activo: true,
  costoCompraVigente: 5,
  llevaStock: false,
  receta: null,
};

function servicio(datos: SucursalConMenu | null, stockQueso = 1000) {
  const repo: jest.Mocked<ComensalRepository> = {
    listarSucursales: jest.fn(),
    buscarSucursalConMenu: jest.fn().mockResolvedValue(datos),
  };
  const inventario: Inventario = {
    cargarCatalogo: jest.fn().mockResolvedValue(new Map([['queso', queso]])),
    existencias: jest.fn().mockResolvedValue(new Map([['queso', stockQueso]])),
  };
  return createPublicoService(
    repo,
    createMenuVisible(repo, () => HOY, inventario),
  );
}

// 50 g de queso por porción.
const recetaConQueso = {
  rendimiento: 1,
  instrucciones: null,
  lineas: [{ componenteId: 'queso', cantidad: 50, unidad: 'GRAMO' as const, porcentajeMerma: 0 }],
};

describe('publicoService: menú y plato', () => {
  it('muestra solo los platos activos, disponibles y con receta si la categoría la exige', async () => {
    const { menu } = await servicio(sucursal()).obtenerMenu('centro');

    expect(menu?.categorias.map((c) => [c.nombre, c.platos.map((p) => p.id)])).toEqual([
      ['Principales', ['bife']],
      ['Postres', ['flan']],
    ]);
  });

  it('un menú fuera de vigencia no se muestra', async () => {
    const vencido = sucursal({ vigenciaDesde: '2026-06-21', vigenciaHasta: '2026-09-20' });

    expect((await servicio(vencido).obtenerMenu('centro')).menu).toBeNull();
  });

  it('una sucursal sin menú activo responde sin menú', async () => {
    const sinMenu = { ...sucursal(), menuActivo: null };

    expect((await servicio(sinMenu).obtenerMenu('centro')).menu).toBeNull();
  });

  it('una sucursal inexistente o dada de baja responde 404', async () => {
    await expect(servicio(null).obtenerMenu('otra')).rejects.toMatchObject({ status: 404 });
  });

  it('devuelve el detalle de un plato del menú vigente', async () => {
    const { plato: detalle } = await servicio(sucursal()).obtenerPlato('centro', 'flan');

    expect(detalle).toMatchObject({ id: 'flan', categoria: { nombre: 'Postres' } });
  });

  it('un plato que no se muestra en el menú responde 404', async () => {
    await expect(servicio(sucursal()).obtenerPlato('centro', 'milanesa')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('un plato al que no le alcanza el stock para una porción figura sin stock', async () => {
    const conReceta = sucursal({ platos: [plato('pizza', { receta: recetaConQueso })] });

    const sinStock = await servicio(conReceta, 49).obtenerMenu('centro');
    expect(sinStock.menu?.categorias[0]?.platos[0]?.hayStock).toBe(false);

    const conStock = await servicio(conReceta, 50).obtenerMenu('centro');
    expect(conStock.menu?.categorias[0]?.platos[0]?.hayStock).toBe(true);
  });

  it('un plato sin receta figura con stock', async () => {
    const { menu } = await servicio(sucursal(), 0).obtenerMenu('centro');
    expect(menu?.categorias.flatMap((c) => c.platos).every((p) => p.hayStock)).toBe(true);
  });

  it('un plato de reventa descuenta del insumo y sale sin stock si no queda', async () => {
    // Categoría que pide receta: la reventa también la cumple.
    const conReventa = sucursal({
      platos: [plato('agua', { tieneReceta: false, insumoReventaId: 'queso' })],
    });

    const sinStock = await servicio(conReventa, 0).obtenerMenu('centro');
    expect(sinStock.menu?.categorias[0]?.platos[0]).toMatchObject({ id: 'agua', hayStock: false });

    const conStock = await servicio(conReventa, 1).obtenerMenu('centro');
    expect(conStock.menu?.categorias[0]?.platos[0]?.hayStock).toBe(true);
  });
});

// Búsqueda: un repositorio y un menú visible falsos, con dos restaurantes.
type Suc = { id: string; nombre: string; direccion: string; barrio: Barrio };
const CENTRO: Suc = {
  id: 'centro',
  nombre: 'Centro',
  direccion: 'Siempre Viva 742',
  barrio: 'SAN_NICOLAS',
};
const PALERMO: Suc = {
  id: 'palermo',
  nombre: 'Palermo',
  direccion: 'Honduras 5000',
  barrio: 'PALERMO',
};
const VILLA: Suc = {
  id: 'villa',
  nombre: 'Villa Crespo',
  direccion: 'Corrientes 5500',
  barrio: 'VILLA_CRESPO',
};

function buscador(platosPorSucursal: Record<string, string[] | null>) {
  const restaurantes: RestauranteComensal[] = [
    // Desordenado a propósito: el servicio ordena.
    { id: 'esq', nombre: 'La Esquina de Villa Crespo', sucursales: [VILLA] },
    { id: 'parr', nombre: 'La Parrilla Demo', sucursales: [PALERMO, CENTRO] },
  ];
  const repo: jest.Mocked<ComensalRepository> = {
    listarSucursales: jest.fn().mockResolvedValue(restaurantes),
    buscarSucursalConMenu: jest.fn(),
  };
  const menuVisible: MenuVisible = jest.fn(async (id: string) => {
    if (id === 'cerrada') throw new AppError(404, 'La sucursal no existe');
    const nombres = platosPorSucursal[id];
    return {
      sucursal: { ...CENTRO, restaurante: { id: 'r', nombre: 'R' } },
      menu: nombres ? { nombre: 'Carta', descripcion: null } : null,
      platos: (nombres ?? []).map((nombre) => ({
        plato: { id: nombre, nombre } as never,
        insumos: null,
      })),
    };
  });
  return { servicio: createPublicoService(repo, menuVisible), repo, menuVisible };
}

const MENUS = {
  centro: ['Milanesa con puré', 'Promo 50%', 'Flan'],
  palermo: ['Milanesa napolitana', 'Ñoquis'],
  villa: ['Ensalada'],
};

describe('publicoService: buscar', () => {
  it('encuentra un plato sin importar tildes ni mayúsculas', async () => {
    const { servicio } = buscador(MENUS);
    const r = await servicio.buscar('PURE');
    expect(r.map((x) => [x.sucursal.id, x.platosCoincidentes])).toEqual([
      ['centro', ['Milanesa con puré']],
    ]);
  });

  it('encuentra "noquis" aunque el plato lleve Ñ', async () => {
    const { servicio } = buscador(MENUS);
    expect((await servicio.buscar('noquis')).map((x) => x.sucursal.id)).toEqual(['palermo']);
  });

  it('por nombre del restaurante trae solo sus sucursales, sin platos', async () => {
    const { servicio } = buscador(MENUS);
    const r = await servicio.buscar('parrilla');
    expect(r.map((x) => [x.sucursal.id, x.platosCoincidentes])).toEqual([
      ['centro', []],
      ['palermo', []],
    ]);
  });

  it('por dirección', async () => {
    const { servicio } = buscador(MENUS);
    expect((await servicio.buscar('Siempre Viva')).map((x) => x.sucursal.id)).toEqual(['centro']);
  });

  it('por barrio, con el nombre visible y sin importar tildes', async () => {
    const { servicio } = buscador(MENUS);
    expect((await servicio.buscar('san nicolas')).map((x) => x.sucursal.id)).toEqual(['centro']);
    expect((await servicio.buscar('palermo')).map((x) => x.sucursal.id)).toEqual(['palermo']);
  });

  it('un plato en dos sucursales las trae a las dos', async () => {
    const { servicio } = buscador(MENUS);
    expect((await servicio.buscar('milanesa')).map((x) => x.sucursal.id)).toEqual([
      'centro',
      'palermo',
    ]);
  });

  it('lista hasta 3 platos coincidentes', async () => {
    const { servicio } = buscador({ centro: ['Flan 1', 'Flan 2', 'Flan 3', 'Flan 4', 'Flan 5'] });
    const [r] = await servicio.buscar('flan');
    expect(r?.platosCoincidentes).toHaveLength(3);
  });

  it('el barrio filtra por igualdad', async () => {
    const { servicio } = buscador(MENUS);
    expect((await servicio.buscar('milanesa', 'PALERMO')).map((x) => x.sucursal.id)).toEqual([
      'palermo',
    ]);
    expect((await servicio.buscar(undefined, 'VILLA_CRESPO')).map((x) => x.sucursal.id)).toEqual([
      'villa',
    ]);
  });

  it('un texto de menos de 2 caracteres o en blanco se ignora', async () => {
    const { servicio, menuVisible } = buscador(MENUS);
    expect(await servicio.buscar('a')).toHaveLength(3);
    expect(await servicio.buscar('   ')).toHaveLength(3);
    expect(await servicio.buscar(' a ')).toHaveLength(3);
    expect(menuVisible).not.toHaveBeenCalled();
  });

  it('%, _ y comillas se buscan como texto literal', async () => {
    const { servicio } = buscador({ centro: ['Promo 50%', 'Pan_ajo', 'Pollo "s\''] });
    expect((await servicio.buscar('50%')).map((x) => x.platosCoincidentes)).toEqual([
      ['Promo 50%'],
    ]);
    expect((await servicio.buscar('n_a')).map((x) => x.platosCoincidentes)).toEqual([['Pan_ajo']]);
    expect((await servicio.buscar("s'")).map((x) => x.platosCoincidentes)).toEqual([
      ['Pollo "s\''],
    ]);
    expect(await servicio.buscar('%')).toHaveLength(3);
    expect(await servicio.buscar('%%')).toHaveLength(0);
  });

  it('una sucursal sin menú vigente aparece por nombre y no por plato', async () => {
    const { servicio } = buscador({ ...MENUS, palermo: null });
    const porNombre = await servicio.buscar('Palermo');
    expect(porNombre.map((x) => [x.sucursal.id, x.platosCoincidentes])).toEqual([['palermo', []]]);
    expect((await servicio.buscar('milanesa')).map((x) => x.sucursal.id)).toEqual(['centro']);
    expect(await servicio.buscar(undefined, 'PALERMO')).toHaveLength(1);
  });

  it('una sucursal que se dio de baja durante la búsqueda no la rompe', async () => {
    const { servicio, repo } = buscador(MENUS);
    repo.listarSucursales.mockResolvedValue([
      { id: 'r', nombre: 'R', sucursales: [{ ...CENTRO, id: 'cerrada' }, VILLA] },
    ]);
    expect((await servicio.buscar('ensalada')).map((x) => x.sucursal.id)).toEqual(['villa']);
  });

  it('ordena por restaurante y sucursal, y devuelve solo los campos públicos', async () => {
    const { servicio } = buscador(MENUS);
    const r = await servicio.buscar();
    expect(r.map((x) => x.sucursal.id)).toEqual(['villa', 'centro', 'palermo']);
    expect(Object.keys(r[0] ?? {}).sort()).toEqual([
      'platosCoincidentes',
      'restaurante',
      'sucursal',
    ]);
    expect(Object.keys(r[0]?.sucursal ?? {}).sort()).toEqual([
      'barrio',
      'direccion',
      'id',
      'nombre',
    ]);
    expect(Object.keys(r[0]?.restaurante ?? {}).sort()).toEqual(['id', 'nombre']);
  });
});

describe('publicoService: buscar, campos públicos', () => {
  it('no filtra los campos extra que trae el repositorio', async () => {
    const { servicio, repo } = buscador(MENUS);
    repo.listarSucursales.mockResolvedValue([
      {
        id: 'r',
        nombre: 'R',
        activo: true,
        sucursales: [{ ...CENTRO, restauranteId: 'r', activa: true }],
      } as never,
    ]);
    const [r] = await servicio.buscar();
    expect(r?.sucursal).toEqual({
      id: 'centro',
      nombre: 'Centro',
      direccion: 'Siempre Viva 742',
      barrio: 'SAN_NICOLAS',
    });
    expect(r?.restaurante).toEqual({ id: 'r', nombre: 'R' });
  });
});

describe('publicoService: barrios', () => {
  it('lista los barrios de las sucursales activas, sin repetir y por nombre', async () => {
    const { servicio, repo } = buscador(MENUS);
    repo.listarSucursales.mockResolvedValue([
      { id: 'a', nombre: 'A', sucursales: [PALERMO, { ...PALERMO, id: 'p2' }, VILLA] },
      { id: 'b', nombre: 'B', sucursales: [CENTRO] },
    ]);
    expect(await servicio.barrios()).toEqual([
      { valor: 'PALERMO', nombre: 'Palermo' },
      { valor: 'SAN_NICOLAS', nombre: 'San Nicolás' },
      { valor: 'VILLA_CRESPO', nombre: 'Villa Crespo' },
    ]);
  });
});
