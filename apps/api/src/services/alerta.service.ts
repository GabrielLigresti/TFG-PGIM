import type { AlertaPanel, TipoAlertaPanel } from '@pgim/shared';
import { AppError } from '../lib/errors';
import { alertaRepository, type AlertaRepository } from '../repositories/alerta.repository';

// Alertas del panel de la sucursal de trabajo. El llamador indica qué tipos ve
// la sesión (según sus permisos): un tipo ajeno se trata como inexistente.
export function createAlertaService(repo: AlertaRepository) {
  return {
    sinResolver: (
      restauranteId: string,
      sucursalId: string,
      tipos: TipoAlertaPanel[],
    ): Promise<AlertaPanel[]> => repo.listarSinResolver(restauranteId, sucursalId, tipos),

    async resolver(
      restauranteId: string,
      sucursalId: string,
      id: string,
      tipos: TipoAlertaPanel[],
    ): Promise<void> {
      if (!(await repo.resolver(restauranteId, sucursalId, id, tipos))) {
        throw new AppError(404, 'La alerta no existe');
      }
    },
  };
}

export const alertaService = createAlertaService(alertaRepository);
