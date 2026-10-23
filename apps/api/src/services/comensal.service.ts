import {
  estaVigente,
  hoyArgentina,
  type CategoriaMenu,
  type DetallePlato,
  type MenuSucursal,
  type PlatoMenu,
} from '@pgim/shared';
import { AppError } from '../lib/errors';
import {
  comensalRepository,
  type ComensalRepository,
  type PlatoDelMenu,
} from '../repositories/comensal.repository';

// El comensal ve el menú activo de la sucursal solo si está vigente, y de él
// los platos activos, disponibles y con receta cuando su categoría la exige.
function visible(plato: PlatoDelMenu): boolean {
  return plato.activo && plato.disponible && (!plato.categoria.requiereReceta || plato.tieneReceta);
}

function aPlatoMenu({
  id,
  nombre,
  descripcion,
  precio,
  fotoUrl,
  categoria,
  modeloRa,
}: PlatoDelMenu): PlatoMenu {
  return {
    id,
    nombre,
    descripcion,
    precio,
    fotoUrl,
    categoria: { id: categoria.id, nombre: categoria.nombre },
    modeloRa,
  };
}

function agrupar(platos: PlatoMenu[]): CategoriaMenu[] {
  const categorias = new Map<string, CategoriaMenu>();
  for (const plato of platos) {
    const categoria = categorias.get(plato.categoria.id) ?? { ...plato.categoria, platos: [] };
    categoria.platos.push(plato);
    categorias.set(plato.categoria.id, categoria);
  }
  return [...categorias.values()];
}

export function createComensalService(repo: ComensalRepository, hoy: () => string = hoyArgentina) {
  async function menuDeSucursal(sucursalId: string) {
    const sucursal = await repo.buscarSucursalConMenu(sucursalId);
    if (!sucursal) throw new AppError(404, 'La sucursal no existe');
    const { menuActivo, ...datos } = sucursal;
    const menu = menuActivo && estaVigente(menuActivo, hoy()) ? menuActivo : null;
    return {
      sucursal: datos,
      menu,
      platos: menu ? menu.platos.filter(visible).map(aPlatoMenu) : [],
    };
  }

  return {
    listarSucursales: () => repo.listarSucursales(),

    async obtenerMenu(sucursalId: string): Promise<MenuSucursal> {
      const { sucursal, menu, platos } = await menuDeSucursal(sucursalId);
      return {
        sucursal,
        menu: menu && {
          nombre: menu.nombre,
          descripcion: menu.descripcion,
          categorias: agrupar(platos),
        },
      };
    },

    // CU-10 obtenerDetalle: el plato tiene que estar a la vista en esa sucursal.
    async obtenerPlato(sucursalId: string, platoId: string): Promise<DetallePlato> {
      const { sucursal, platos } = await menuDeSucursal(sucursalId);
      const plato = platos.find((p) => p.id === platoId);
      if (!plato) throw new AppError(404, 'El plato no está en el menú de esta sucursal');
      return { sucursal, plato };
    },
  };
}

export const comensalService = createComensalService(comensalRepository);
