import type { Insumo, InsumoInput } from '@pgim/shared';
import { AppError } from '../lib/errors';
import { insumoRepository, type InsumoRepository } from '../repositories/insumo.repository';

export function createInsumoService(repo: InsumoRepository) {
  async function obtener(restauranteId: string, id: string): Promise<Insumo> {
    const insumo = await repo.buscar(restauranteId, id);
    if (!insumo) throw new AppError(404, 'El insumo no existe');
    return insumo;
  }

  async function verificarNombre(restauranteId: string, nombre: string, excluirId?: string) {
    if (await repo.existeNombre(restauranteId, nombre, excluirId)) {
      throw new AppError(409, `Ya existe un insumo o producto intermedio llamado "${nombre}"`);
    }
  }

  // Un insumo que se usa en recetas o que un plato revende como viene no se
  // da de baja ni cambia de unidad base: dejaría líneas inválidas o haría que
  // cada venta descuente otra cosa.
  async function verificarSinUsos(
    restauranteId: string,
    insumo: Insumo,
    cambio: 'baja' | 'unidad',
  ) {
    const usos = await repo.usosEnRecetas(restauranteId, insumo.id);
    if (usos.length > 0) {
      const motivo =
        cambio === 'baja'
          ? 'sacalo de esas recetas antes de darlo de baja'
          : 'no se puede cambiar su unidad base';
      throw new AppError(
        409,
        `${insumo.nombre} se usa en las recetas de ${usos.join(', ')}: ${motivo}`,
      );
    }
    const platos = await repo.platosDeReventa(restauranteId, insumo.id);
    if (platos.length > 0) {
      const motivo =
        cambio === 'baja'
          ? `sacalo de ${platos.length === 1 ? 'ese plato' : 'esos platos'} antes de darlo de baja`
          : 'no se puede cambiar su unidad base';
      throw new AppError(
        409,
        `${insumo.nombre} se vende como viene en ${platos.join(', ')}: ${motivo}`,
      );
    }
  }

  return {
    listar: (restauranteId: string, sucursalId: string | null) =>
      repo.listar(restauranteId, sucursalId),

    async crear(restauranteId: string, datos: InsumoInput) {
      await verificarNombre(restauranteId, datos.nombre);
      return repo.crear(restauranteId, datos);
    },

    async actualizar(restauranteId: string, id: string, datos: InsumoInput) {
      const actual = await obtener(restauranteId, id);
      await verificarNombre(restauranteId, datos.nombre, id);
      if (datos.unidadBase !== actual.unidadBase) {
        await verificarSinUsos(restauranteId, actual, 'unidad');
      }
      if (actual.activo && datos.activo === false) {
        await verificarSinUsos(restauranteId, actual, 'baja');
      }
      return repo.actualizar(restauranteId, id, datos);
    },

    async desactivar(restauranteId: string, id: string) {
      const actual = await obtener(restauranteId, id);
      await verificarSinUsos(restauranteId, actual, 'baja');
      await repo.desactivar(restauranteId, id);
    },
  };
}

export const insumoService = createInsumoService(insumoRepository);
