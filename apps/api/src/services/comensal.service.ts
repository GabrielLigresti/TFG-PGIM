import {
  hoyArgentina,
  type CategoriaMenu,
  type DetallePlato,
  type MenuSucursal,
  type PlatoMenu,
} from '@pgim/shared';
import { AppError } from '../lib/errors';
import { comensalRepository, type ComensalRepository } from '../repositories/comensal.repository';
import { createMenuVisible, inventario, type Inventario } from './menu-visible';

function agrupar(platos: PlatoMenu[]): CategoriaMenu[] {
  const categorias = new Map<string, CategoriaMenu>();
  for (const plato of platos) {
    const categoria = categorias.get(plato.categoria.id) ?? { ...plato.categoria, platos: [] };
    categoria.platos.push(plato);
    categorias.set(plato.categoria.id, categoria);
  }
  return [...categorias.values()];
}

export function createComensalService(
  repo: ComensalRepository,
  hoy: () => string = hoyArgentina,
  stock: Inventario = inventario,
) {
  const menuDeSucursal = createMenuVisible(repo, hoy, stock);

  return {
    listarSucursales: () => repo.listarSucursales(),

    async obtenerMenu(sucursalId: string): Promise<MenuSucursal> {
      const { sucursal, menu, platos } = await menuDeSucursal(sucursalId);
      return {
        sucursal,
        menu: menu && { ...menu, categorias: agrupar(platos.map((p) => p.plato)) },
      };
    },

    // CU-10 obtenerDetalle: el plato tiene que estar a la vista en esa sucursal.
    async obtenerPlato(sucursalId: string, platoId: string): Promise<DetallePlato> {
      const { sucursal, platos } = await menuDeSucursal(sucursalId);
      const plato = platos.find((p) => p.plato.id === platoId)?.plato;
      if (!plato) throw new AppError(404, 'El plato no está en el menú de esta sucursal');
      return { sucursal, plato };
    },
  };
}

export const comensalService = createComensalService(comensalRepository);
