import type { Componente } from '../domain/receta';
import type {
  ComensalRepository,
  PlatoDelMenu,
  SucursalConMenu,
} from '../repositories/comensal.repository';
import { createMenuVisible, type Inventario } from './menu-visible';

const HOY = '2026-10-29';

const harina: Componente = {
  id: 'harina',
  nombre: 'Harina',
  tipo: 'INSUMO',
  unidadBase: 'GRAMO',
  activo: true,
  costoCompraVigente: 2,
  llevaStock: false,
  receta: null,
};

const masa: Componente = {
  id: 'masa',
  nombre: 'Masa',
  tipo: 'INTERMEDIO',
  unidadBase: 'GRAMO',
  activo: true,
  costoCompraVigente: 0.5,
  llevaStock: true,
  receta: {
    rendimiento: 400,
    instrucciones: null,
    lineas: [
      {
        componenteId: 'harina',
        cantidad: 200,
        unidad: 'GRAMO',
        porcentajeMerma: 0,
        componente: harina,
      },
    ],
  },
};

// 100 g de masa por pizza.
const pizza: PlatoDelMenu = {
  id: 'pizza',
  nombre: 'Pizza',
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
  receta: {
    rendimiento: 1,
    instrucciones: null,
    lineas: [{ componenteId: 'masa', cantidad: 100, unidad: 'GRAMO', porcentajeMerma: 0 }],
  },
  insumoReventaId: null,
  modeloRa: null,
};

const sucursal: SucursalConMenu = {
  id: 'centro',
  nombre: 'Centro',
  direccion: 'Calle 1',
  restaurante: { id: 'r', nombre: 'Demo' },
  menuActivo: {
    nombre: 'Carta',
    descripcion: null,
    vigenciaDesde: '2026-10-01',
    vigenciaHasta: null,
    platos: [pizza],
  },
};

async function platoPizza(existencias: [string, number][]) {
  const repo: jest.Mocked<ComensalRepository> = {
    listarSucursales: jest.fn(),
    buscarSucursalConMenu: jest.fn().mockResolvedValue(sucursal),
  };
  const stock: Inventario = {
    cargarCatalogo: jest.fn().mockResolvedValue(
      new Map([
        ['harina', harina],
        ['masa', masa],
      ]),
    ),
    existencias: jest.fn().mockResolvedValue(new Map(existencias)),
  };
  const { platos } = await createMenuVisible(repo, () => HOY, stock)('centro');
  return platos[0]!;
}

describe('menuVisible con intermedios que llevan stock', () => {
  it('con la masa en 0 y harina de sobra, la pizza no tiene stock', async () => {
    const { plato, insumos } = await platoPizza([
      ['masa', 0],
      ['harina', 5000],
    ]);

    expect(plato.hayStock).toBe(false);
    expect([...insumos!]).toEqual([['masa', 100]]);
  });

  it('con masa suficiente y harina en 0, la pizza tiene stock', async () => {
    const { plato } = await platoPizza([
      ['masa', 100],
      ['harina', 0],
    ]);

    expect(plato.hayStock).toBe(true);
  });

  it('sin fila de existencia de la masa, la pizza no tiene stock', async () => {
    const { plato } = await platoPizza([['harina', 5000]]);

    expect(plato.hayStock).toBe(false);
  });
});
