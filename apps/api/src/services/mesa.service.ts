import { administraModulo, type CodigoPermiso, type MesaInput } from '@pgim/shared';
import { AppError } from '../lib/errors';
import { mesaRepository, type MesaRepository } from '../repositories/mesa.repository';

// CU-14 Configurar mapa del salón.
export function createMesaService(repo: MesaRepository) {
  async function verificarSucursal(restauranteId: string, sucursalId: string) {
    if (!(await repo.existeSucursal(restauranteId, sucursalId))) {
      throw new AppError(404, 'La sucursal no existe');
    }
  }

  async function verificarMesa(restauranteId: string, sucursalId: string, id: string) {
    if (!(await repo.buscar(restauranteId, sucursalId, id))) {
      throw new AppError(404, 'La mesa no existe');
    }
  }

  async function verificarNumero(sucursalId: string, numero: number, excluirId?: string) {
    if (await repo.existeNumero(sucursalId, numero, excluirId)) {
      throw new AppError(409, `Ya existe la mesa ${numero} en esta sucursal`);
    }
  }

  return {
    // Mismo alcance que las sucursales: quien solo las ve, ve el salón de las suyas.
    async listar(
      restauranteId: string,
      permisos: readonly CodigoPermiso[],
      asignadas: string[],
      sucursalId: string,
    ) {
      if (!administraModulo(permisos, 'sucursal') && !asignadas.includes(sucursalId)) {
        throw new AppError(404, 'La sucursal no existe');
      }
      await verificarSucursal(restauranteId, sucursalId);
      return repo.listar(restauranteId, sucursalId);
    },

    async crear(restauranteId: string, sucursalId: string, datos: MesaInput) {
      await verificarSucursal(restauranteId, sucursalId);
      await verificarNumero(sucursalId, datos.numero);
      return repo.crear(sucursalId, datos);
    },

    async actualizar(restauranteId: string, sucursalId: string, id: string, datos: MesaInput) {
      await verificarMesa(restauranteId, sucursalId, id);
      await verificarNumero(sucursalId, datos.numero, id);
      return repo.actualizar(restauranteId, sucursalId, id, datos);
    },

    async desactivar(restauranteId: string, sucursalId: string, id: string) {
      await verificarMesa(restauranteId, sucursalId, id);
      await repo.desactivar(restauranteId, sucursalId, id);
    },
  };
}

export const mesaService = createMesaService(mesaRepository);
