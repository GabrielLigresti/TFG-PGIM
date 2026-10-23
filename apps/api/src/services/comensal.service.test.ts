import type {
  ComensalRepository,
  PlatoDelMenu,
  SucursalConMenu,
} from '../repositories/comensal.repository';
import { createComensalService } from './comensal.service';

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

function servicio(datos: SucursalConMenu | null) {
  const repo: jest.Mocked<ComensalRepository> = {
    listarSucursales: jest.fn(),
    buscarSucursalConMenu: jest.fn().mockResolvedValue(datos),
  };
  return createComensalService(repo, () => HOY);
}

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
});
