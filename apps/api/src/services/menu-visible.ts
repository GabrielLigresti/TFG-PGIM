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
// Un plato de reventa cumple con la receta: descuenta su insumo.
function visible(plato: PlatoDelMenu): boolean {
  const descuentaStock = plato.tieneReceta || plato.insumoReventaId !== null;
  return plato.activo && plato.disponible && (!plato.categoria.requiereReceta || descuentaStock);
}

// Insumos que consume una porción: por receta, o 1 unidad si es de reventa;
// null si el plato no descuenta stock.
function insumosPorPorcion(plato: PlatoDelMenu, catalogo: Catalogo): Map<string, number> | null {
  if (plato.receta) return insumosNecesarios(armarReceta(plato.receta, catalogo), 1);
  if (plato.insumoReventaId) return new Map([[plato.insumoReventaId, 1]]);
  return null;
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
    if (platos.some((p) => p.receta || p.insumoReventaId)) {
      [catalogo, existencias] = await Promise.all([
        platos.some((p) => p.receta)
          ? stock.cargarCatalogo(datos.restaurante.id)
          : Promise.resolve(catalogo),
        stock.existencias(datos.id),
      ]);
    }

    return {
      sucursal: datos,
      menu: menu && { nombre: menu.nombre, descripcion: menu.descripcion },
      platos: platos.map((p) => {
        const insumos = insumosPorPorcion(p, catalogo);
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
