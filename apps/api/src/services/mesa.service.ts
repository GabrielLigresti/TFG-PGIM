import { administraModulo, type CodigoPermiso, type Mesa, type MesaInput } from '@pgim/shared';
import { ocupaLaMesa } from '../domain/reserva';
import { AppError } from '../lib/errors';
import { mesaRepository, type MesaRepository } from '../repositories/mesa.repository';

// CU-14 Configurar mapa del salón.
export function createMesaService(repo: MesaRepository, ahora: () => Date = () => new Date()) {
  async function verificarSucursal(restauranteId: string, sucursalId: string) {
    if (!(await repo.existeSucursal(restauranteId, sucursalId))) {
      throw new AppError(404, 'La sucursal no existe');
    }
  }

  async function obtenerMesa(restauranteId: string, sucursalId: string, id: string) {
    const mesa = await repo.buscar(restauranteId, sucursalId, id);
    if (!mesa) throw new AppError(404, 'La mesa no existe');
    return mesa;
  }

  async function verificarNumero(
    restauranteId: string,
    sucursalId: string,
    numero: number,
    excluirId?: string,
  ) {
    if (await repo.existeNumero(restauranteId, sucursalId, numero, excluirId)) {
      throw new AppError(409, `Ya existe la mesa ${numero} en esta sucursal`);
    }
  }

  // Una mesa con reservas que todavía la ocupan no se da de baja ni se achica
  // por debajo del grupo más grande: esas reservas quedarían sin mesa. Una
  // pendiente vencida o una activa de una franja ya terminada no cuentan.
  async function verificarReservas(
    restauranteId: string,
    sucursalId: string,
    mesa: Mesa,
    cambios: Partial<MesaInput>,
  ) {
    const momento = ahora();
    const ocupan = (await repo.reservasVigentes(restauranteId, sucursalId, mesa.id)).filter((r) =>
      ocupaLaMesa(r, momento),
    );
    const cantidad = ocupan.length;
    if (cantidad === 0) return;
    const maxPersonas = Math.max(...ocupan.map((r) => r.cantidadPersonas));
    // Solo el paso de activa a inactiva: una mesa ya dada de baja se puede mover.
    if (mesa.activa && cambios.activa === false) {
      throw new AppError(
        409,
        `La mesa tiene ${cantidad} ${cantidad === 1 ? 'reserva vigente' : 'reservas vigentes'}: no se puede dar de baja`,
      );
    }
    if (cambios.capacidad !== undefined && cambios.capacidad < maxPersonas) {
      throw new AppError(
        409,
        `La mesa tiene una reserva para ${maxPersonas} personas: la capacidad no puede ser menor`,
      );
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
      await verificarNumero(restauranteId, sucursalId, datos.numero);
      return repo.crear(restauranteId, sucursalId, datos);
    },

    async actualizar(restauranteId: string, sucursalId: string, id: string, datos: MesaInput) {
      const mesa = await obtenerMesa(restauranteId, sucursalId, id);
      await verificarNumero(restauranteId, sucursalId, datos.numero, id);
      await verificarReservas(restauranteId, sucursalId, mesa, datos);
      return repo.actualizar(restauranteId, sucursalId, id, datos);
    },

    async desactivar(restauranteId: string, sucursalId: string, id: string) {
      const mesa = await obtenerMesa(restauranteId, sucursalId, id);
      await verificarReservas(restauranteId, sucursalId, mesa, { activa: false });
      await repo.desactivar(restauranteId, sucursalId, id);
    },
  };
}

export const mesaService = createMesaService(mesaRepository);
