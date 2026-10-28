import { z } from 'zod';

// Pago de la cuenta de la mesa (CU-06): siempre por el saldo total, con un
// beneficio opcional (uno por mesa).

export const METODOS_PAGO = ['TARJETA', 'BILLETERA_VIRTUAL'] as const;
export type MetodoPago = (typeof METODOS_PAGO)[number];

export const ESTADOS_PAGO = ['PENDIENTE', 'APROBADO', 'RECHAZADO'] as const;
export type EstadoPago = (typeof ESTADOS_PAGO)[number];

export const pagoInputSchema = z.object({
  beneficioId: z.uuid().nullish(),
  metodo: z.enum(METODOS_PAGO),
});
export type PagoInput = z.infer<typeof pagoInputSchema>;

// urlPago null: ya quedó resuelto, sin pasar por Mercado Pago (pago de $0 o
// pasarela de prueba).
export interface PagoIniciado {
  pagoId: string;
  urlPago: string | null;
}

// Comprobante interno, sin validez fiscal.
export interface ComprobanteComensal {
  numero: string;
  fecha: string;
  total: number;
  descuento: number;
  beneficio: string | null;
}

export interface EstadoPagoComensal {
  pagoId: string;
  estado: EstadoPago;
  monto: number;
  comprobante: ComprobanteComensal | null;
  puntosSumados: number | null;
}

// Aviso en tiempo real al comensal cuando su pago se resuelve.
export interface ResultadoPago {
  pagoId: string;
  cuentaMesaId: string;
  estado: 'APROBADO' | 'RECHAZADO';
  puntosSumados: number;
  desbloqueados: string[];
}
