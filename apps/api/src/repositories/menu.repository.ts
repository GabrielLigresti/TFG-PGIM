import type { Categoria, CategoriaInput, Menu, MenuInput, Plato, PlatoInput } from '@pgim/shared';
import type { Prisma } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';

export interface MenuRepository {
  listarCategorias(restauranteId: string): Promise<Categoria[]>;
  buscarCategoria(restauranteId: string, id: string): Promise<Categoria | null>;
  existeCategoria(restauranteId: string, nombre: string, excluirId?: string): Promise<boolean>;
  crearCategoria(restauranteId: string, datos: CategoriaInput): Promise<Categoria>;
  actualizarCategoria(restauranteId: string, id: string, datos: CategoriaInput): Promise<Categoria>;
  borrarCategoria(restauranteId: string, id: string): Promise<void>;

  listarPlatos(restauranteId: string): Promise<Plato[]>;
  buscarPlato(restauranteId: string, id: string): Promise<Plato | null>;
  existePlato(restauranteId: string, nombre: string, excluirId?: string): Promise<boolean>;
  crearPlato(restauranteId: string, datos: PlatoInput): Promise<Plato>;
  actualizarPlato(restauranteId: string, id: string, datos: PlatoInput): Promise<Plato>;
  desactivarPlato(restauranteId: string, id: string): Promise<void>;

  listarMenus(restauranteId: string): Promise<Menu[]>;
  buscarMenu(restauranteId: string, id: string): Promise<Menu | null>;
  existeMenu(restauranteId: string, nombre: string, excluirId?: string): Promise<boolean>;
  // Cuántos de esos platos son del restaurante y están activos.
  contarPlatosActivos(restauranteId: string, platoIds: string[]): Promise<number>;
  contarPromociones(restauranteId: string, menuId: string): Promise<number>;
  crearMenu(restauranteId: string, datos: MenuInput): Promise<Menu>;
  actualizarMenu(restauranteId: string, id: string, datos: MenuInput): Promise<Menu>;
  borrarMenu(restauranteId: string, id: string): Promise<void>;
}

const seleccionCategoria = {
  id: true,
  nombre: true,
  requiereReceta: true,
  _count: { select: { items: true } },
} satisfies Prisma.CategoriaSelect;

type FilaCategoria = Prisma.CategoriaGetPayload<{ select: typeof seleccionCategoria }>;

function aCategoria({ _count, ...fila }: FilaCategoria): Categoria {
  return { ...fila, cantidadPlatos: _count.items };
}

const seleccionPlato = {
  id: true,
  nombre: true,
  descripcion: true,
  precio: true,
  fotoUrl: true,
  disponible: true,
  activo: true,
  categoria: { select: { id: true, nombre: true, requiereReceta: true } },
  receta: { select: { id: true } },
} satisfies Prisma.ItemMenuSelect;

type FilaPlato = Prisma.ItemMenuGetPayload<{ select: typeof seleccionPlato }>;

function aPlato({ receta, ...fila }: FilaPlato): Plato {
  return {
    ...fila,
    precio: Number(fila.precio),
    tieneReceta: receta !== null,
    sinReceta: fila.categoria.requiereReceta && receta === null,
  };
}

function columnasPlato(datos: PlatoInput) {
  return {
    categoriaId: datos.categoriaId,
    nombre: datos.nombre,
    descripcion: datos.descripcion || null,
    precio: datos.precio,
    fotoUrl: datos.fotoUrl || null,
    disponible: datos.disponible,
  };
}

const seleccionMenu = {
  id: true,
  nombre: true,
  descripcion: true,
  vigenciaDesde: true,
  vigenciaHasta: true,
  items: { select: { itemMenuId: true } },
  sucursalesActivas: { select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } },
} satisfies Prisma.MenuSelect;

type FilaMenu = Prisma.MenuGetPayload<{ select: typeof seleccionMenu }>;

// Las columnas date llegan como Date a medianoche UTC: se toma la parte de la fecha.
const aFecha = (fecha: Date) => fecha.toISOString().slice(0, 10);
const deFecha = (fecha: string) => new Date(`${fecha}T00:00:00.000Z`);

function aMenu({ items, ...fila }: FilaMenu): Menu {
  return {
    ...fila,
    vigenciaDesde: aFecha(fila.vigenciaDesde),
    vigenciaHasta: fila.vigenciaHasta && aFecha(fila.vigenciaHasta),
    platoIds: items.map((i) => i.itemMenuId),
  };
}

function columnasMenu(datos: MenuInput) {
  return {
    nombre: datos.nombre,
    descripcion: datos.descripcion || null,
    vigenciaDesde: deFecha(datos.vigenciaDesde),
    vigenciaHasta: datos.vigenciaHasta ? deFecha(datos.vigenciaHasta) : null,
  };
}

const itemsMenu = (platoIds: string[]) => platoIds.map((itemMenuId) => ({ itemMenuId }));

const nombreIgual = (nombre: string) => ({ equals: nombre, mode: 'insensitive' as const });

export const menuRepository: MenuRepository = {
  async listarCategorias(restauranteId) {
    const filas = await prisma.categoria.findMany({
      where: { restauranteId },
      select: seleccionCategoria,
      orderBy: { nombre: 'asc' },
    });
    return filas.map(aCategoria);
  },

  async buscarCategoria(restauranteId, id) {
    const fila = await prisma.categoria.findFirst({
      where: { id, restauranteId },
      select: seleccionCategoria,
    });
    return fila && aCategoria(fila);
  },

  async existeCategoria(restauranteId, nombre, excluirId) {
    const cantidad = await prisma.categoria.count({
      where: {
        restauranteId,
        nombre: nombreIgual(nombre),
        ...(excluirId && { id: { not: excluirId } }),
      },
    });
    return cantidad > 0;
  },

  async crearCategoria(restauranteId, datos) {
    const fila = await prisma.categoria.create({
      data: { restauranteId, ...datos },
      select: seleccionCategoria,
    });
    return aCategoria(fila);
  },

  async actualizarCategoria(restauranteId, id, datos) {
    const fila = await prisma.categoria.update({
      where: { id, restauranteId },
      data: datos,
      select: seleccionCategoria,
    });
    return aCategoria(fila);
  },

  async borrarCategoria(restauranteId, id) {
    await prisma.categoria.delete({ where: { id, restauranteId } });
  },

  async listarPlatos(restauranteId) {
    const filas = await prisma.itemMenu.findMany({
      where: { restauranteId },
      select: seleccionPlato,
      orderBy: [{ activo: 'desc' }, { categoria: { nombre: 'asc' } }, { nombre: 'asc' }],
    });
    return filas.map(aPlato);
  },

  async buscarPlato(restauranteId, id) {
    const fila = await prisma.itemMenu.findFirst({
      where: { id, restauranteId },
      select: seleccionPlato,
    });
    return fila && aPlato(fila);
  },

  async existePlato(restauranteId, nombre, excluirId) {
    const cantidad = await prisma.itemMenu.count({
      where: {
        restauranteId,
        nombre: nombreIgual(nombre),
        ...(excluirId && { id: { not: excluirId } }),
      },
    });
    return cantidad > 0;
  },

  async crearPlato(restauranteId, datos) {
    const fila = await prisma.itemMenu.create({
      data: { restauranteId, ...columnasPlato(datos) },
      select: seleccionPlato,
    });
    return aPlato(fila);
  },

  async actualizarPlato(restauranteId, id, datos) {
    const fila = await prisma.itemMenu.update({
      where: { id, restauranteId },
      data: {
        ...columnasPlato(datos),
        ...(datos.activo !== undefined && { activo: datos.activo }),
      },
      select: seleccionPlato,
    });
    return aPlato(fila);
  },

  async desactivarPlato(restauranteId, id) {
    await prisma.itemMenu.update({ where: { id, restauranteId }, data: { activo: false } });
  },

  async listarMenus(restauranteId) {
    const filas = await prisma.menu.findMany({
      where: { restauranteId },
      select: seleccionMenu,
      orderBy: [{ vigenciaDesde: 'desc' }, { nombre: 'asc' }],
    });
    return filas.map(aMenu);
  },

  async buscarMenu(restauranteId, id) {
    const fila = await prisma.menu.findFirst({
      where: { id, restauranteId },
      select: seleccionMenu,
    });
    return fila && aMenu(fila);
  },

  async existeMenu(restauranteId, nombre, excluirId) {
    const cantidad = await prisma.menu.count({
      where: {
        restauranteId,
        nombre: nombreIgual(nombre),
        ...(excluirId && { id: { not: excluirId } }),
      },
    });
    return cantidad > 0;
  },

  contarPlatosActivos(restauranteId, platoIds) {
    return prisma.itemMenu.count({ where: { restauranteId, activo: true, id: { in: platoIds } } });
  },

  contarPromociones(restauranteId, menuId) {
    return prisma.beneficio.count({ where: { restauranteId, menuId } });
  },

  async crearMenu(restauranteId, datos) {
    const fila = await prisma.menu.create({
      data: {
        restauranteId,
        ...columnasMenu(datos),
        items: { create: itemsMenu(datos.platoIds) },
      },
      select: seleccionMenu,
    });
    return aMenu(fila);
  },

  async actualizarMenu(restauranteId, id, datos) {
    const fila = await prisma.menu.update({
      where: { id, restauranteId },
      data: {
        ...columnasMenu(datos),
        items: { deleteMany: {}, create: itemsMenu(datos.platoIds) },
      },
      select: seleccionMenu,
    });
    return aMenu(fila);
  },

  async borrarMenu(restauranteId, id) {
    await prisma.menu.delete({ where: { id, restauranteId } });
  },
};
