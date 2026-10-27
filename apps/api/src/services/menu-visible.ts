import { estaVigente, hoyArgentina, type PlatoMenu } from '@pgim/shared';
import { insumosNecesarios } from '../domain/receta';
import { AppError } from '../lib/errors';
import {
  comensalRepository,
  type ComensalRepository,
  type PlatoDelMenu,
  type SucursalConMenu,
} from '../repositories/comensal.repository';
import { pedidoRepository } from '../repositories/pedido.repository';
import { armarReceta, recetaRepository, type Catalogo } from '../repositories/receta.repository';

// Lo que necesita el menú para saber qué platos tienen stock.
export interface Inventario {
  cargarCatalogo(restauranteId: string): Promise<Catalogo>;
  existencias(sucursalId: string): Promise<Map<string, number>>;
}

export const inventario: Inventario = {
  cargarCatalogo: (restauranteId) => recetaRepository.cargarCatalogo(restauranteId),
  existencias: (sucursalId) => pedidoRepository.existencias(sucursalId),
};

// Un plato a la vista del comensal, con los insumos que consume una porción
// (null si no tiene receta: se pide sin descontar stock).
export interface PlatoVisible {
  plato: PlatoMenu;
  insumos: Map<string, number> | null;
}

export interface MenuDeSucursal {
  sucursal: Omit<SucursalConMenu, 'menuActivo'>;
  menu: { nombre: string; descripcion: string | null } | null;
  platos: PlatoVisible[];
}

export type MenuVisible = (sucursalId: string) => Promise<MenuDeSucursal>;

// El comensal ve el menú activo de la sucursal solo si está vigente, y de él
// los platos activos, disponibles y con receta cuando su categoría la exige.
function visible(plato: PlatoDelMenu): boolean {
  return plato.activo && plato.disponible && (!plato.categoria.requiereReceta || plato.tieneReceta);
}

function aPlatoMenu(
  { id, nombre, descripcion, precio, fotoUrl, categoria, modeloRa }: PlatoDelMenu,
  hayStock: boolean,
): PlatoMenu {
  return {
    id,
    nombre,
    descripcion,
    precio,
    fotoUrl,
    categoria: { id: categoria.id, nombre: categoria.nombre },
    modeloRa,
    hayStock,
  };
}

// Menú visible de la sucursal (CU-10 y CU-04): lo usan el menú del comensal y
// la confirmación del pedido, para validar platos y copiar precios.
export function createMenuVisible(
  repo: ComensalRepository,
  hoy: () => string = hoyArgentina,
  stock: Inventario = inventario,
): MenuVisible {
  return async (sucursalId) => {
    const sucursal = await repo.buscarSucursalConMenu(sucursalId);
    if (!sucursal) throw new AppError(404, 'La sucursal no existe');
    const { menuActivo, ...datos } = sucursal;
    const menu = menuActivo && estaVigente(menuActivo, hoy()) ? menuActivo : null;
    const platos = menu ? menu.platos.filter(visible) : [];

    let catalogo: Catalogo = new Map();
    let existencias = new Map<string, number>();
    if (platos.some((p) => p.receta)) {
      [catalogo, existencias] = await Promise.all([
        stock.cargarCatalogo(datos.restaurante.id),
        stock.existencias(datos.id),
      ]);
    }

    return {
      sucursal: datos,
      menu: menu && { nombre: menu.nombre, descripcion: menu.descripcion },
      platos: platos.map((p) => {
        const insumos = p.receta ? insumosNecesarios(armarReceta(p.receta, catalogo), 1) : null;
        // Sin existencia en la sucursal, el insumo cuenta como 0.
        const hayStock = [...(insumos ?? [])].every(
          ([id, cantidad]) => (existencias.get(id) ?? 0) >= cantidad,
        );
        return { plato: aPlatoMenu(p, hayStock), insumos };
      }),
    };
  };
}

export const menuVisible = createMenuVisible(comensalRepository);
