import { z } from 'zod';
import type { Referencia } from './comun';

// CU-04 y CU-05: pedidos de la mesa y cola de cocina; CU-18: cierre de mesa.

export const ESTADOS_PEDIDO = [
  'CONFIRMADO',
  'EN_PREPARACION',
  'LISTO',
  'ENTREGADO',
  'CANCELADO',
] as const;
export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number];

export const MAX_CANTIDAD_LINEA = 20;
export const MAX_LINEAS_PEDIDO = 30;

export const lineaPedidoInputSchema = z.object({
  itemMenuId: z.uuid(),
  cantidad: z.number().int().min(1).max(MAX_CANTIDAD_LINEA),
  observaciones: z
    .string()
    .trim()
    .max(200)
    .nullable()
    .transform((v) => v || null),
});

export const pedidoInputSchema = z.object({
  cuentaMesaId: z.uuid(),
  lineas: z.array(lineaPedidoInputSchema).min(1).max(MAX_LINEAS_PEDIDO),
});

export type PedidoInput = z.infer<typeof pedidoInputSchema>;

// El estado que vio la pantalla: si otro lo cambió antes, no se avanza dos veces.
export const avanzarPedidoSchema = z.object({ desde: z.enum(ESTADOS_PEDIDO) });

export const cancelarPedidoSchema = z.object({ motivo: z.string().trim().min(1).max(200) });

// Motivos sugeridos al cancelar; "Otro" se completa con texto libre.
export const MOTIVOS_CANCELACION = [
  'Sin stock',
  'Pedido duplicado',
  'Lo pidió el cliente',
] as const;

export const cerrarMesaSchema = z.object({ confirmarSaldo: z.boolean().optional() });

export const consultaMiMesaSchema = z.object({ sucursalId: z.uuid().optional() });

export interface LineaPedidoVista {
  id: string;
  plato: Referencia;
  cantidad: number;
  precioUnitario: number;
  observaciones: string | null;
}

export interface PedidoCola {
  id: string;
  numero: number;
  mesa: { numero: number };
  creadoEn: string;
  listoEn: string | null;
  estado: EstadoPedido;
  lineas: LineaPedidoVista[];
}

export interface PedidoComensal {
  id: string;
  numero: number;
  creadoEn: string;
  estado: EstadoPedido;
  total: number;
  lineas: LineaPedidoVista[];
}

// "Mi mesa": la cuenta de mesa abierta del comensal.
export interface MiMesa {
  cuentaMesaId: string;
  sucursal: Referencia;
  mesa: { numero: number };
  abiertaEn: string;
  pedidos: PedidoComensal[];
  total: number;
  pagado: number;
  // Lo que cubrieron los beneficios de pagos aprobados.
  descuentos: number;
  saldo: number;
  pagoHabilitado: boolean;
  // Pago esperando el resultado de Mercado Pago; urlPago null si ya no se
  // puede retomar (vence solo).
  pagoEnCurso: { pagoId: string; urlPago: string | null } | null;
}

// Detalle del 409 cuando no alcanza el stock de un plato.
export interface FaltaStock {
  itemMenuId: string;
  nombre: string;
}

// Detalle del 409 del cierre de mesa.
export interface BloqueoCierre {
  pedidosSinEntregar?: number;
  saldoPendiente?: number;
  // Un pago esperando el resultado de Mercado Pago (vence a los 15 minutos).
  pagoEnCurso?: true;
  // Vencido, pero Mercado Pago lo sigue revisando: se cierra con confirmación.
  pagoEnRevision?: true;
}

export interface CambioPedido {
  id: string;
  estado: EstadoPedido;
  listoEn: string | null;
}

export interface CambioMesa {
  cuentaMesaId: string;
}
