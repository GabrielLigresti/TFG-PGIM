import type { Componente } from '../domain/receta';
import type {
  ComensalRepository,
  PlatoDelMenu,
  SucursalConMenu,
} from '../repositories/comensal.repository';
import { createComensalService } from './comensal.service';
import type { Inventario } from './menu-visible';

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
    categoria: { id: 'principales', nombre: 'Principales', requiereReceta: true },
    tieneReceta: true,
    receta: null,
    insumoReventaId: null,
    modeloRa: null,
    ...cambios,
  };
}

const postres = { id: 'postres', nombre: 'Postres', requiereReceta: false };

function sucursal(
  cambios: Partial<NonNullable<SucursalConMenu['menuActivo']>> = {},
): SucursalConMenu {
  return {
    id: 'centro',
    nombre: 'Centro',
    direccion: 'Calle 1',
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
  costoCompra: 5,
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
  return createComensalService(repo, () => HOY, inventario);
}

// 50 g de queso por porción.
const recetaConQueso = {
  rendimiento: 1,
  instrucciones: null,
  lineas: [{ componenteId: 'queso', cantidad: 50, unidad: 'GRAMO' as const, porcentajeMerma: 0 }],
};

describe('comensalService', () => {
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
