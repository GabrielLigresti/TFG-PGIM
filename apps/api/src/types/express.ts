import type { Sesion } from '@pgim/shared';

// Contexto que la cadena de middleware deja en el request:
// autenticar → req.sesion; tenant → req.tenant.
export interface Tenant {
  restauranteId: string;
  // null mientras el empleado no eligió sucursal: solo sirve para pantallas
  // de nivel restaurante (sucursales, roles, personal).
  sucursalId: string | null;
}

declare global {
  namespace Express {
    interface Request {
      sesion?: Sesion;
      tenant?: Tenant;
    }
  }
}

export {};
