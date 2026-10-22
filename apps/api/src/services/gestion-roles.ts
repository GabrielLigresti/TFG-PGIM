import { AppError } from '../lib/errors';
import type { ContarGestoresDeRoles, ExclusionGestores } from '../repositories/gestores-roles';

// Invariante de la E2 del CU-02: siempre queda al menos un usuario activo con un
// rol activo que puede gestionar roles. La usan los servicios de roles y de personal.
export async function verificarGestorDeRoles(
  contar: ContarGestoresDeRoles,
  restauranteId: string,
  excluir: ExclusionGestores,
): Promise<void> {
  if ((await contar(restauranteId, excluir)) === 0) {
    throw new AppError(
      409,
      'Tiene que quedar al menos un usuario activo con permiso para gestionar roles',
    );
  }
}
