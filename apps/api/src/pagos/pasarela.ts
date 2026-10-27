import { env } from '../config/env';

// Pasarela de pago intercambiable. En el Hito 4 la cuenta se paga con una
// pasarela simulada, que aprueba al instante y solo se habilita en desarrollo;
// Mercado Pago la reemplaza con la misma interfaz.

export type ResultadoCobro =
  { estado: 'APROBADO'; referenciaExterna: string } | { estado: 'RECHAZADO' };

export interface PasarelaPago {
  readonly habilitada: boolean;
  cobrar(pago: { id: string; monto: number }): Promise<ResultadoCobro>;
}

export const PREFIJO_PAGO_SIMULADO = 'SIM-';

export function crearPasarelaSimulada(habilitada: boolean): PasarelaPago {
  return {
    habilitada,
    async cobrar(pago) {
      if (!habilitada) throw new Error('La pasarela simulada no está habilitada');
      return { estado: 'APROBADO', referenciaExterna: `${PREFIJO_PAGO_SIMULADO}${pago.id}` };
    },
  };
}

export const pasarela = crearPasarelaSimulada(env.NODE_ENV !== 'production' || env.PAGO_SIMULADO);
