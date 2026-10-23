import { MINUTOS_ANTES_ACTIVACION, type EstadoReserva } from '@pgim/shared';
import { AppError } from '../lib/errors';

// Patrón State de la reserva (diagrama de estados estado/reserva/v1). Cada
// estado decide qué transiciones admite y devuelve el estado siguiente; el
// servicio persiste el cambio. El cierre de mesa (cerrar) llega con el Hito 4.

export interface ContextoReserva {
  inicio: Date;
  toleranciaNoShowMin: number;
  ahora: Date;
}

export interface EstadoDeReserva {
  readonly nombre: EstadoReserva;
  activar(ctx: ContextoReserva): EstadoReserva;
  cancelar(ctx: ContextoReserva): EstadoReserva;
  vencer(ctx: ContextoReserva): EstadoReserva;
}

const MINUTO = 60_000;

export function limiteDeLlegada(
  ctx: Pick<ContextoReserva, 'inicio' | 'toleranciaNoShowMin'>,
): Date {
  return new Date(ctx.inicio.getTime() + ctx.toleranciaNoShowMin * MINUTO);
}

export function puedeActivarse(ctx: ContextoReserva): boolean {
  const desde = ctx.inicio.getTime() - MINUTOS_ANTES_ACTIVACION * MINUTO;
  return ctx.ahora.getTime() >= desde && ctx.ahora <= limiteDeLlegada(ctx);
}

export function puedeCancelarse(ctx: ContextoReserva): boolean {
  return ctx.ahora < ctx.inicio;
}

abstract class EstadoBase implements EstadoDeReserva {
  constructor(readonly nombre: EstadoReserva) {}

  protected invalida(): never {
    throw new AppError(409, `La reserva está ${this.nombre.toLowerCase()}`);
  }

  activar(_ctx: ContextoReserva): EstadoReserva {
    return this.invalida();
  }

  cancelar(_ctx: ContextoReserva): EstadoReserva {
    return this.invalida();
  }

  vencer(_ctx: ContextoReserva): EstadoReserva {
    return this.invalida();
  }
}

class ReservaPendiente extends EstadoBase {
  constructor() {
    super('PENDIENTE');
  }

  override activar(ctx: ContextoReserva): EstadoReserva {
    if (!puedeActivarse(ctx)) {
      throw new AppError(
        409,
        'La reserva se puede activar desde 30 minutos antes del inicio hasta el fin de la tolerancia de llegada',
      );
    }
    return 'ACTIVA';
  }

  override cancelar(ctx: ContextoReserva): EstadoReserva {
    if (!puedeCancelarse(ctx)) {
      throw new AppError(409, 'La reserva solo se puede cancelar antes de que empiece la franja');
    }
    return 'CANCELADA';
  }

  // No-show: vence recién cuando pasó la tolerancia de llegada.
  override vencer(ctx: ContextoReserva): EstadoReserva {
    if (ctx.ahora <= limiteDeLlegada(ctx)) {
      throw new AppError(409, 'La reserva todavía está dentro de la tolerancia de llegada');
    }
    return 'VENCIDA';
  }
}

class ReservaActiva extends EstadoBase {
  constructor() {
    super('ACTIVA');
  }
}

// FINALIZADA, CANCELADA y VENCIDA: estados finales, sin transiciones.
class ReservaFinalizada extends EstadoBase {}

const ESTADOS: Record<EstadoReserva, EstadoDeReserva> = {
  PENDIENTE: new ReservaPendiente(),
  ACTIVA: new ReservaActiva(),
  FINALIZADA: new ReservaFinalizada('FINALIZADA'),
  CANCELADA: new ReservaFinalizada('CANCELADA'),
  VENCIDA: new ReservaFinalizada('VENCIDA'),
};

export function estadoDeReserva(nombre: EstadoReserva): EstadoDeReserva {
  return ESTADOS[nombre];
}
