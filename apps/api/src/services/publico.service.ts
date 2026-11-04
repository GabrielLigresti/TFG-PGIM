import {
  nombreBarrio,
  type Barrio,
  type BarrioConSucursales,
  type CategoriaMenu,
  type DetallePlato,
  type MenuSucursal,
  type PlatoMenu,
  type ResultadoBusqueda,
} from '@pgim/shared';
import { AppError } from '../lib/errors';
import { normalizar } from '../lib/texto';
import { comensalRepository, type ComensalRepository } from '../repositories/comensal.repository';
import { menuVisible, type MenuVisible } from './menu-visible';

const MAX_PLATOS_COINCIDENTES = 3;
const MIN_CARACTERES_BUSQUEDA = 2;

function agrupar(platos: PlatoMenu[]): CategoriaMenu[] {
  const categorias = new Map<string, CategoriaMenu>();
  for (const plato of platos) {
    const categoria = categorias.get(plato.categoria.id) ?? { ...plato.categoria, platos: [] };
    categoria.platos.push(plato);
    categorias.set(plato.categoria.id, categoria);
  }
  return [...categorias.values()];
}

const comparar = (a: string, b: string) => a.localeCompare(b, 'es');

// Lo que ve cualquier visitante: buscador, barrios, carta y ficha de un plato.
// La búsqueda es la única consulta que cruza restaurantes, y por eso devuelve
// solo los campos públicos de ResultadoBusqueda.
export function createPublicoService(repo: ComensalRepository, menuDeSucursal: MenuVisible) {
  // Platos a la vista de la sucursal; una sucursal sin menú vigente (o dada de
  // baja mientras se buscaba) no tiene platos, pero no rompe la búsqueda.
  async function nombresDePlatos(sucursalId: string): Promise<string[]> {
    try {
      const { platos } = await menuDeSucursal(sucursalId);
      return platos.map((p) => p.plato.nombre);
    } catch (error) {
      if (error instanceof AppError && error.status === 404) return [];
      throw error;
    }
  }

  return {
    async buscar(q?: string, barrio?: Barrio): Promise<ResultadoBusqueda[]> {
      const restaurantes = await repo.listarSucursales();
      const sucursales = restaurantes
        .flatMap((r) =>
          r.sucursales
            .filter((s) => !barrio || s.barrio === barrio)
            .map((s) => ({ restaurante: { id: r.id, nombre: r.nombre }, sucursal: s })),
        )
        .sort(
          (a, b) =>
            comparar(a.restaurante.nombre, b.restaurante.nombre) ||
            comparar(a.sucursal.nombre, b.sucursal.nombre),
        );

      const texto = normalizar(q ?? '');
      if (texto.length < MIN_CARACTERES_BUSQUEDA) {
        return sucursales.map((s) => ({ ...s, platosCoincidentes: [] }));
      }

      const resultados = await Promise.all(
        sucursales.map(async ({ restaurante, sucursal }) => {
          const coincideSucursal = [restaurante.nombre, sucursal.nombre, sucursal.direccion].some(
            (campo) => normalizar(campo).includes(texto),
          );
          const platos = (await nombresDePlatos(sucursal.id)).filter((nombre) =>
            normalizar(nombre).includes(texto),
          );
          return {
            restaurante,
            sucursal,
            coincide: coincideSucursal || platos.length > 0,
            platosCoincidentes: platos.slice(0, MAX_PLATOS_COINCIDENTES),
          };
        }),
      );
      return resultados
        .filter((r) => r.coincide)
        .map(({ coincide: _coincide, ...resultado }) => resultado);
    },

    async barrios(): Promise<BarrioConSucursales[]> {
      const valores = new Set(
        (await repo.listarSucursales()).flatMap((r) => r.sucursales.map((s) => s.barrio)),
      );
      return [...valores]
        .map((valor) => ({ valor, nombre: nombreBarrio(valor) }))
        .sort((a, b) => comparar(a.nombre, b.nombre));
    },

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

export const publicoService = createPublicoService(comensalRepository, menuVisible);
