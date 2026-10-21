import type { CategoriaInput, PlatoInput } from '@pgim/shared';
import { AppError } from '../lib/errors';
import { menuRepository, type MenuRepository } from '../repositories/menu.repository';

export function createMenuService(repo: MenuRepository) {
  async function obtenerCategoria(restauranteId: string, id: string) {
    const categoria = await repo.buscarCategoria(restauranteId, id);
    if (!categoria) throw new AppError(404, 'La categoría no existe');
    return categoria;
  }

  async function verificarNombreCategoria(
    restauranteId: string,
    nombre: string,
    excluirId?: string,
  ) {
    if (await repo.existeCategoria(restauranteId, nombre, excluirId)) {
      throw new AppError(409, `Ya existe una categoría llamada "${nombre}"`);
    }
  }

  async function obtenerPlato(restauranteId: string, id: string) {
    const plato = await repo.buscarPlato(restauranteId, id);
    if (!plato) throw new AppError(404, 'El plato no existe');
    return plato;
  }

  async function verificarPlato(restauranteId: string, datos: PlatoInput, excluirId?: string) {
    await obtenerCategoria(restauranteId, datos.categoriaId);
    if (await repo.existePlato(restauranteId, datos.nombre, excluirId)) {
      throw new AppError(409, `Ya existe un plato llamado "${datos.nombre}"`);
    }
  }

  return {
    listarCategorias: (restauranteId: string) => repo.listarCategorias(restauranteId),

    async crearCategoria(restauranteId: string, datos: CategoriaInput) {
      await verificarNombreCategoria(restauranteId, datos.nombre);
      return repo.crearCategoria(restauranteId, datos);
    },

    async actualizarCategoria(restauranteId: string, id: string, datos: CategoriaInput) {
      await obtenerCategoria(restauranteId, id);
      await verificarNombreCategoria(restauranteId, datos.nombre, id);
      return repo.actualizarCategoria(restauranteId, id, datos);
    },

    // La tabla no tiene baja lógica: se borra solo si no tiene platos.
    async borrarCategoria(restauranteId: string, id: string) {
      const categoria = await obtenerCategoria(restauranteId, id);
      if (categoria.cantidadPlatos > 0) {
        throw new AppError(
          409,
          `La categoría "${categoria.nombre}" tiene ${categoria.cantidadPlatos} plato(s): movelos a otra categoría antes de borrarla`,
        );
      }
      await repo.borrarCategoria(restauranteId, id);
    },

    listarPlatos: (restauranteId: string) => repo.listarPlatos(restauranteId),

    async crearPlato(restauranteId: string, datos: PlatoInput) {
      await verificarPlato(restauranteId, datos);
      return repo.crearPlato(restauranteId, datos);
    },

    async actualizarPlato(restauranteId: string, id: string, datos: PlatoInput) {
      await obtenerPlato(restauranteId, id);
      await verificarPlato(restauranteId, datos, id);
      return repo.actualizarPlato(restauranteId, id, datos);
    },

    async desactivarPlato(restauranteId: string, id: string) {
      await obtenerPlato(restauranteId, id);
      await repo.desactivarPlato(restauranteId, id);
    },
  };
}

export const menuService = createMenuService(menuRepository);
