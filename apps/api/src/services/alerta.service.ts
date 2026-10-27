import type { AlertaPanel } from '@pgim/shared';
import { AppError } from '../lib/errors';
import { alertaRepository, type AlertaRepository } from '../repositories/alerta.repository';

// Alertas de stock del panel (con stock.registrar), de la sucursal de trabajo.
export function createAlertaService(repo: AlertaRepository) {
  return {
    sinResolver: (restauranteId: string, sucursalId: string): Promise<AlertaPanel[]> =>
      repo.listarSinResolver(restauranteId, sucursalId),

    async resolver(restauranteId: string, sucursalId: string, id: string): Promise<void> {
      if (!(await repo.resolver(restauranteId, sucursalId, id))) {
        throw new AppError(404, 'La alerta no existe');
      }
    },
  };
}

export const alertaService = createAlertaService(alertaRepository);
