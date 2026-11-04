import type { MiTurno } from '@pgim/shared';
import { fechaDe } from '../domain/franjas';
import {
  planificacionRepository,
  type PlanificacionRepository,
} from '../repositories/planificacion.repository';

// Turnos propios del empleado (CU-09). `ahora` se inyecta para fijar el reloj en los tests.
export function createTurnoService(plan: Pick<PlanificacionRepository, 'turnosDe'>) {
  return {
    // De hoy en adelante y solo de planificaciones confirmadas.
    misTurnos(restauranteId: string, empleadoId: string, ahora: Date): Promise<MiTurno[]> {
      return plan.turnosDe(restauranteId, empleadoId, fechaDe(ahora));
    },
  };
}

export const turnoService = createTurnoService(planificacionRepository);
