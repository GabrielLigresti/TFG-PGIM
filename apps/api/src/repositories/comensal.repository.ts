import type { ModeloRa, RestauranteComensal } from '@pgim/shared';
import type { Prisma } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';

// Lectura del menú para el comensal. El comensal no pertenece a un tenant: el
// restaurante sale de la sucursal pedida y todas las consultas filtran por él.

export interface PlatoDelMenu {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  fotoUrl: string | null;
  disponible: boolean;
  activo: boolean;
  categoria: { id: string; nombre: string; requiereReceta: boolean };
  tieneReceta: boolean;
  modeloRa: ModeloRa | null;
}

export interface SucursalConMenu {
  id: string;
  nombre: string;
  direccion: string;
  restaurante: { id: string; nombre: string };
  menuActivo: {
    nombre: string;
    descripcion: string | null;
    vigenciaDesde: string;
    vigenciaHasta: string | null;
    platos: PlatoDelMenu[];
  } | null;
}

export interface ComensalRepository {
  listarSucursales(): Promise<RestauranteComensal[]>;
  // Solo sucursales activas; null si no existe o está dada de baja.
  buscarSucursalConMenu(sucursalId: string): Promise<SucursalConMenu | null>;
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
  modeloRa: {
    select: { urlModelo: true, urlModeloIos: true, escalaReal: true, porcionGramos: true },
  },
} satisfies Prisma.ItemMenuSelect;

type FilaPlato = Prisma.ItemMenuGetPayload<{ select: typeof seleccionPlato }>;

function aPlato({ receta, modeloRa, ...fila }: FilaPlato): PlatoDelMenu {
  return {
    ...fila,
    precio: Number(fila.precio),
    tieneReceta: receta !== null,
    modeloRa: modeloRa && { ...modeloRa, escalaReal: Number(modeloRa.escalaReal) },
  };
}

const aFecha = (fecha: Date) => fecha.toISOString().slice(0, 10);

export const comensalRepository: ComensalRepository = {
  async listarSucursales() {
    const restaurantes = await prisma.restaurante.findMany({
      where: { sucursales: { some: { activa: true } } },
      select: {
        id: true,
        nombre: true,
        sucursales: {
          where: { activa: true },
          select: { id: true, nombre: true, direccion: true },
          orderBy: { nombre: 'asc' },
        },
      },
      orderBy: { nombre: 'asc' },
    });
    return restaurantes;
  },

  async buscarSucursalConMenu(sucursalId) {
    const sucursal = await prisma.sucursal.findFirst({
      where: { id: sucursalId, activa: true },
      select: {
        id: true,
        nombre: true,
        direccion: true,
        restauranteId: true,
        restaurante: { select: { id: true, nombre: true } },
        menuActivo: {
          select: {
            nombre: true,
            descripcion: true,
            vigenciaDesde: true,
            vigenciaHasta: true,
            restauranteId: true,
            items: { select: { itemMenuId: true } },
          },
        },
      },
    });
    if (!sucursal) return null;

    const { restauranteId, menuActivo, ...datos } = sucursal;
    // Un menú de otro restaurante no debería llegar nunca a ser el activo; si
    // pasara, no se muestra.
    if (!menuActivo || menuActivo.restauranteId !== restauranteId) {
      return { ...datos, menuActivo: null };
    }
    const platos = await prisma.itemMenu.findMany({
      where: { restauranteId, id: { in: menuActivo.items.map((i) => i.itemMenuId) } },
      select: seleccionPlato,
      orderBy: [{ categoria: { nombre: 'asc' } }, { nombre: 'asc' }],
    });
    return {
      ...datos,
      menuActivo: {
        nombre: menuActivo.nombre,
        descripcion: menuActivo.descripcion,
        vigenciaDesde: aFecha(menuActivo.vigenciaDesde),
        vigenciaHasta: menuActivo.vigenciaHasta && aFecha(menuActivo.vigenciaHasta),
        platos: platos.map(aPlato),
      },
    };
  },
};
