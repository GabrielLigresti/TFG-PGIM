import type { CodigoPermiso, EstadoPedido } from '@pgim/shared';
import { AppError } from '../lib/errors';

// Patrón State del pedido (diagrama de estados estado/pedido/v1). Cada estado
// decide qué transición admite y con qué permiso: "preparar pedidos"
// (pedido.gestionar_cola) lo lleva hasta LISTO y lo cancela; "entregar
// pedidos" (pedido.avanzar) lo pasa de LISTO a ENTREGADO. El servicio
// comprueba el permiso y persiste el cambio.

export interface Transicion {
  hacia: EstadoPedido;
  permiso: CodigoPermiso;
}

export interface EstadoDePedido {
  readonly nombre: EstadoPedido;
  avanzar(): Transicion;
  cancelar(): Transicion;
}

// Los que todavía están en la cola: la mesa no se puede cerrar con ellos.
export const ESTADOS_ACTIVOS: EstadoPedido[] = ['CONFIRMADO', 'EN_PREPARACION', 'LISTO'];

const ETIQUETA: Record<EstadoPedido, string> = {
  CONFIRMADO: 'confirmado',
  EN_PREPARACION: 'en preparación',
  LISTO: 'listo',
  ENTREGADO: 'entregado',
  CANCELADO: 'cancelado',
};

abstract class EstadoBase implements EstadoDePedido {
  constructor(readonly nombre: EstadoPedido) {}

  protected invalida(): never {
    throw new AppError(409, `El pedido ya está ${ETIQUETA[this.nombre]}`);
  }

  avanzar(): Transicion {
    return this.invalida();
  }

  cancelar(): Transicion {
    return this.invalida();
  }
}

class PedidoConfirmado extends EstadoBase {
  constructor() {
    super('CONFIRMADO');
  }

  override avanzar(): Transicion {
    return { hacia: 'EN_PREPARACION', permiso: 'pedido.gestionar_cola' };
  }

  // Solo antes de empezar a prepararlo; el stock vuelve.
  override cancelar(): Transicion {
    return { hacia: 'CANCELADO', permiso: 'pedido.gestionar_cola' };
  }
}

class PedidoEnPreparacion extends EstadoBase {
  constructor() {
    super('EN_PREPARACION');
  }

  override avanzar(): Transicion {
    return { hacia: 'LISTO', permiso: 'pedido.gestionar_cola' };
  }
}

class PedidoListo extends EstadoBase {
  constructor() {
    super('LISTO');
  }

  override avanzar(): Transicion {
    return { hacia: 'ENTREGADO', permiso: 'pedido.avanzar' };
  }
}

// ENTREGADO y CANCELADO: estados finales, sin transiciones.
class PedidoFinalizado extends EstadoBase {}

const ESTADOS: Record<EstadoPedido, EstadoDePedido> = {
  CONFIRMADO: new PedidoConfirmado(),
  EN_PREPARACION: new PedidoEnPreparacion(),
  LISTO: new PedidoListo(),
  ENTREGADO: new PedidoFinalizado('ENTREGADO'),
  CANCELADO: new PedidoFinalizado('CANCELADO'),
};

export function estadoDePedido(nombre: EstadoPedido): EstadoDePedido {
  return ESTADOS[nombre];
}
