import { MINUTOS_ANTES_ACTIVACION, type EstadoReserva } from '@pgim/shared';
import { AppError } from '../lib/errors';

// Patrón State de la reserva (diagrama de estados estado/reserva/v1). Cada
// estado decide qué transiciones admite y devuelve el estado siguiente; el
// servicio persiste el cambio.

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
  // El staff la cancela desde el panel (por ejemplo, avisaron que no vienen).
  cancelarPorStaff(ctx: ContextoReserva): EstadoReserva;
  // CU-18 Cerrar mesa.
  cerrar(): EstadoReserva;
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

// Mientras no haya cierre de mesa (Hito 4), una reserva activa se da por
// terminada al final de su franja de 1 h.
const DURACION_FRANJA_MIN = 60;

// Si la reserva todavía compromete la mesa: una pendiente hasta el fin de la
// tolerancia (después vence) y una activa mientras dura su franja o la
// tolerancia, lo que termine más tarde.
export function ocupaLaMesa(
  r: { estado: EstadoReserva; inicio: Date; toleranciaNoShowMin: number },
  ahora: Date,
): boolean {
  if (r.estado === 'PENDIENTE') return ahora <= limiteDeLlegada(r);
  if (r.estado === 'ACTIVA') {
    // Con una tolerancia de más de 1 h, el grupo pudo sentarse después de que
    // terminó la franja: la mesa sigue ocupada hasta el fin de la tolerancia.
    const finFranja = r.inicio.getTime() + DURACION_FRANJA_MIN * MINUTO;
    return ahora.getTime() < finFranja || ahora <= limiteDeLlegada(r);
  }
  return false;
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

  cancelarPorStaff(_ctx: ContextoReserva): EstadoReserva {
    return this.invalida();
  }

  cerrar(): EstadoReserva {
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
        `La reserva se puede activar desde ${MINUTOS_ANTES_ACTIVACION} minutos antes del inicio hasta el fin de la tolerancia de llegada`,
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

  // Hasta el fin de la tolerancia; después la vence la tarea programada.
  override cancelarPorStaff(ctx: ContextoReserva): EstadoReserva {
    if (ctx.ahora > limiteDeLlegada(ctx)) throw new AppError(409, 'La reserva ya venció');
    return 'CANCELADA';
  }
}

class ReservaActiva extends EstadoBase {
  constructor() {
    super('ACTIVA');
  }

  // Las condiciones (pedidos sin entregar, saldo) las controla el cierre.
  override cerrar(): EstadoReserva {
    return 'FINALIZADA';
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
