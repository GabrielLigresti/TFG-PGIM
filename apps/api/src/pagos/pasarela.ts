import { env } from '../config/env';
import { crearPasarelaMercadoPago } from './mercado-pago';

// Pasarela de pago intercambiable. Mercado Pago (Checkout Pro) redirige al
// comensal y avisa el resultado por el webhook; la simulada aprueba al instante
// y queda como respaldo de la demo. Las dos terminan en la misma aprobación.

export type MetodoPago = 'TARJETA' | 'BILLETERA_VIRTUAL';

export interface CobroAIniciar {
  id: string;
  monto: number;
  metodo: MetodoPago;
  descripcion: string;
  // Hasta cuándo se puede pagar (15 minutos desde que se creó el pago).
  venceEn: Date;
}

export type InicioCobro =
  | { tipo: 'REDIRECCION'; urlPago: string }
  | { tipo: 'APROBADO_AL_INSTANTE'; referenciaExterna: string };

// Lo que informa la pasarela sobre todos los intentos de un pago.
export type ConsultaCobro =
  | { estado: 'APROBADO'; referenciaExterna: string; metodo: MetodoPago }
  | { estado: 'EN_PROCESO' }
  | { estado: 'SIN_APROBAR' };

export interface PasarelaPago {
  readonly habilitada: boolean;
  iniciarCobro(pago: CobroAIniciar): Promise<InicioCobro>;
  consultarPago(pagoId: string): Promise<ConsultaCobro>;
}

export const PREFIJO_PAGO_SIMULADO = 'SIM-';

export function crearPasarelaSimulada(habilitada: boolean): PasarelaPago {
  return {
    habilitada,
    async iniciarCobro(pago) {
      if (!habilitada) throw new Error('La pasarela simulada no está habilitada');
      return {
        tipo: 'APROBADO_AL_INSTANTE',
        referenciaExterna: `${PREFIJO_PAGO_SIMULADO}${pago.id}`,
      };
    },
    // Aprueba al instante, así que nunca deja un pago pendiente que consultar.
    async consultarPago() {
      return { estado: 'SIN_APROBAR' };
    },
  };
}

// Mercado Pago, si está configurado completo (sin la clave del webhook no se
// podría verificar ninguna notificación); si no, la simulada (fuera de
// producción o con PAGO_SIMULADO=true).
export const configMercadoPago =
  env.MP_ACCESS_TOKEN && env.MP_WEBHOOK_SECRET && env.PUBLIC_URL
    ? {
        accessToken: env.MP_ACCESS_TOKEN,
        webhookSecret: env.MP_WEBHOOK_SECRET,
        publicUrl: env.PUBLIC_URL,
      }
    : null;

export const pasarela: PasarelaPago = configMercadoPago
  ? crearPasarelaMercadoPago(configMercadoPago)
  : crearPasarelaSimulada(env.NODE_ENV !== 'production' || env.PAGO_SIMULADO);
