import type { Sucursal, SucursalInput } from '@pgim/shared';
import { AppError } from '../lib/errors';
import { sucursalRepository, type SucursalRepository } from '../repositories/sucursal.repository';

export function createSucursalService(repo: SucursalRepository) {
  async function obtener(restauranteId: string, id: string): Promise<Sucursal> {
    const sucursal = await repo.buscar(restauranteId, id);
    if (!sucursal) throw new AppError(404, 'La sucursal no existe');
    return sucursal;
  }

  async function verificarNombre(restauranteId: string, nombre: string, excluirId?: string) {
    if (await repo.existeNombre(restauranteId, nombre, excluirId)) {
      throw new AppError(409, `Ya existe una sucursal llamada "${nombre}"`);
    }
  }

  async function verificarQueNoSeaLaUltima(restauranteId: string, sucursal: Sucursal) {
    if (sucursal.activa && (await repo.contarActivas(restauranteId)) <= 1) {
      throw new AppError(409, 'No se puede dar de baja la única sucursal activa');
    }
  }

  return {
    listar: (restauranteId: string) => repo.listar(restauranteId),

    async crear(restauranteId: string, empleadoId: string, datos: SucursalInput) {
      await verificarNombre(restauranteId, datos.nombre);
      return repo.crear(restauranteId, datos, empleadoId);
    },

    async actualizar(restauranteId: string, id: string, datos: SucursalInput) {
      const actual = await obtener(restauranteId, id);
      await verificarNombre(restauranteId, datos.nombre, id);
      if (datos.activa === false) await verificarQueNoSeaLaUltima(restauranteId, actual);
      return repo.actualizar(restauranteId, id, datos);
    },

    async desactivar(restauranteId: string, id: string) {
      const actual = await obtener(restauranteId, id);
      await verificarQueNoSeaLaUltima(restauranteId, actual);
      await repo.desactivar(restauranteId, id);
    },
  };
}

export const sucursalService = createSucursalService(sucursalRepository);
