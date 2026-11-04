import type { EstadoPlanificacion } from '@pgim/shared';
import { AppError } from '../lib/errors';

// Patrón State de la planificación de turnos (diagrama estado/planificacion-turnos/v1).
// En BORRADOR se puede regenerar y confirmar; CONFIRMADA es final. El
// repositorio lee el estado dentro del lock y persiste el cambio.

export interface EstadoDePlanificacion {
  readonly nombre: EstadoPlanificacion;
  // No devuelve nada: solo comprueba que se pueda regenerar.
  regenerar(): void;
  confirmar(): EstadoPlanificacion;
}

class PlanificacionBorrador implements EstadoDePlanificacion {
  readonly nombre = 'BORRADOR';

  regenerar(): void {}

  confirmar(): EstadoPlanificacion {
    return 'CONFIRMADA';
  }
}

class PlanificacionConfirmada implements EstadoDePlanificacion {
  readonly nombre = 'CONFIRMADA';

  regenerar(): void {
    throw new AppError(409, 'La planificación ya está confirmada y no se puede regenerar');
  }

  confirmar(): EstadoPlanificacion {
    throw new AppError(409, 'La planificación ya está confirmada');
  }
}

const ESTADOS: Record<EstadoPlanificacion, EstadoDePlanificacion> = {
  BORRADOR: new PlanificacionBorrador(),
  CONFIRMADA: new PlanificacionConfirmada(),
};

export function estadoDePlanificacion(nombre: EstadoPlanificacion): EstadoDePlanificacion {
  return ESTADOS[nombre];
}
