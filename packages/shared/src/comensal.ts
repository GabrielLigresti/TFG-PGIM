import type { Referencia } from './comun';
import type { ModeloRa } from './menu';

// Lo que ve el comensal: sucursales para elegir y el menú activo de una sucursal.

export interface SucursalComensal {
  id: string;
  nombre: string;
  direccion: string;
}

export interface RestauranteComensal extends Referencia {
  sucursales: SucursalComensal[];
}

export interface PlatoMenu {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  fotoUrl: string | null;
  categoria: Referencia;
  modeloRa: ModeloRa | null;
}

export interface CategoriaMenu extends Referencia {
  platos: PlatoMenu[];
}

export interface MenuSucursal {
  sucursal: SucursalComensal & { restaurante: Referencia };
  // null si la sucursal no tiene menú activo o está fuera de vigencia.
  menu: { nombre: string; descripcion: string | null; categorias: CategoriaMenu[] } | null;
}

export interface DetallePlato {
  sucursal: MenuSucursal['sucursal'];
  plato: PlatoMenu;
}
