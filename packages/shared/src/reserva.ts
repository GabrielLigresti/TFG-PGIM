import { z } from 'zod';
import { fechaSchema, type Referencia } from './comun';

// CU-03, CU-12 y CU-21: reservas de mesa por franja de 1 h.

export const ESTADOS_RESERVA = [
  'PENDIENTE',
  'ACTIVA',
  'FINALIZADA',
  'CANCELADA',
  'VENCIDA',
] as const;
export type EstadoReserva = (typeof ESTADOS_RESERVA)[number];

export const DIAS_ANTICIPACION_RESERVA = 30;
// La reserva se puede activar desde este margen antes del inicio de la franja.
export const MINUTOS_ANTES_ACTIVACION = 30;
export const MAX_PERSONAS_RESERVA = 20;

const personasSchema = z.coerce.number().int().min(1).max(MAX_PERSONAS_RESERVA);

export const consultaFranjasSchema = z.object({ fecha: fechaSchema, personas: personasSchema });
export const consultaMapaSchema = z.object({ inicio: z.iso.datetime(), personas: personasSchema });

export const reservaInputSchema = z.object({
  sucursalId: z.uuid(),
  inicio: z.iso.datetime(),
  personas: z.number().int().min(1).max(MAX_PERSONAS_RESERVA),
  // null: el sistema asigna la mesa (modo automático).
  mesaId: z.uuid().nullable(),
});

export type ReservaInput = z.infer<typeof reservaInputSchema>;

export interface FranjaDisponible {
  inicio: string;
  // "HH:mm" en hora de Argentina.
  hora: string;
  mesasLibres: number;
}

export type EstadoMesaMapa = 'LIBRE' | 'RESERVADA' | 'CHICA';

export interface MesaMapa {
  id: string;
  numero: number;
  capacidad: number;
  posX: number;
  posY: number;
  estado: EstadoMesaMapa;
}

export interface MapaDeFranja {
  inicio: string;
  mesas: MesaMapa[];
}

export type ModoAsignacion = 'MANUAL' | 'AUTOMATICA';

export interface ReservaComensal {
  id: string;
  sucursal: Referencia;
  mesa: { id: string; numero: number };
  inicio: string;
  cantidadPersonas: number;
  modoAsignacion: ModoAsignacion;
  estado: EstadoReserva;
  limiteLlegada: string;
  cancelable: boolean;
}

// Tiempo real (Socket.IO). El comensal recibe los cambios de sus reservas en
// su sala; la sala de la sucursal recibe los cambios de mesas, sin datos
// personales.
export const EVENTOS_SOCKET = {
  seguirSalon: 'salon:seguir',
  dejarSalon: 'salon:dejar',
  cambioSalon: 'salon:cambio',
  cambioReserva: 'reserva:cambio',
  pedidoNuevo: 'pedido:nuevo',
  pedidoCambio: 'pedido:cambio',
  mesaCambio: 'mesa:cambio',
  alertaNueva: 'alerta:nueva',
} as const;

export interface CambioSalon {
  sucursalId: string;
  inicio: string;
  mesaId: string;
}

export interface CambioReserva {
  id: string;
  estado: EstadoReserva;
}

export const salaSucursal = (id: string) => `sucursal:${id}`;
export const salaComensal = (id: string) => `comensal:${id}`;
// Solo personal con pedido.ver o stock.registrar: cola de cocina y alertas.
export const salaPersonal = (id: string) => `personal:${id}`;

// CU-12: reservas del día de la sucursal de trabajo, en el panel.
export const consultaReservasPanelSchema = z.object({ fecha: fechaSchema });

export interface ReservaPanel {
  id: string;
  comensal: { nombre: string; telefono: string | null };
  mesa: { id: string; numero: number };
  inicio: string;
  cantidadPersonas: number;
  estado: EstadoReserva;
  limiteLlegada: string;
  activable: boolean;
  // ACTIVA: se puede cerrar la mesa (CU-18).
  cerrable: boolean;
  // PENDIENTE y todavía dentro de la tolerancia: el staff la puede cancelar.
  cancelable: boolean;
}
