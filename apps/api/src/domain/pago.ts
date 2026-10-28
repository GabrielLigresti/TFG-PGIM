import { AppError } from '../lib/errors';

// Patrón State del pago (diagrama de estados estado/pago/v1). PENDIENTE se
// aprueba con la notificación de Mercado Pago o se rechaza al vencer; los dos
// destinos son finales.

export type EstadoPago = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';

export interface EstadoDePago {
  readonly nombre: EstadoPago;
  aprobar(): 'APROBADO';
  rechazar(): 'RECHAZADO';
}

// Minutos que un pago puede quedar PENDIENTE; la preferencia de Mercado Pago
// vence a la vez.
export const PAGO_VENCE_MIN = 15;

// La tarea de vencimiento espera unos minutos más antes de rechazar: Mercado
// Pago puede tardar en mostrar un cobro hecho en el último segundo.
export const MARGEN_VENCIMIENTO_MIN = 3;

// Hasta cuándo se puede pagar: la preferencia vence a la vez.
export const vencimientoDe = (creadoEn: Date) =>
  new Date(creadoEn.getTime() + PAGO_VENCE_MIN * 60_000);

class Pendiente implements EstadoDePago {
  readonly nombre = 'PENDIENTE';
  aprobar() {
    return 'APROBADO' as const;
  }
  rechazar() {
    return 'RECHAZADO' as const;
  }
}

class Final implements EstadoDePago {
  constructor(
    readonly nombre: EstadoPago,
    private readonly etiqueta: string,
  ) {}
  private invalida(): never {
    throw new AppError(409, `El pago ya está ${this.etiqueta}`);
  }
  aprobar(): 'APROBADO' {
    return this.invalida();
  }
  rechazar(): 'RECHAZADO' {
    return this.invalida();
  }
}

const ESTADOS: Record<EstadoPago, EstadoDePago> = {
  PENDIENTE: new Pendiente(),
  APROBADO: new Final('APROBADO', 'aprobado'),
  RECHAZADO: new Final('RECHAZADO', 'rechazado'),
};

export function estadoDePago(estado: EstadoPago): EstadoDePago {
  return ESTADOS[estado];
}

// Comprobante interno, sin validez fiscal: correlativo por sucursal.
export function formatearComprobante(numero: number): string {
  return `C-${String(numero).padStart(6, '0')}`;
}
