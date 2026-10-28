import {
  Armchair,
  Check,
  CheckCheck,
  Circle,
  Clock,
  Flame,
  Ban,
  CalendarClock,
  Pencil,
  Receipt,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { EstadoBeneficio, EstadoPedido, EstadoReserva } from '@pgim/shared';

// Única fuente de etiqueta, tono e ícono de cada estado. Ninguna pantalla
// elige colores de estado por su cuenta.
//   acento = en curso ahora · ok = bien · warn = en riesgo · bad = faltante o error

export type Tono = 'neutro' | 'acento' | 'ok' | 'warn' | 'bad';
export type Publico = 'personal' | 'comensal';

export interface InfoEstado {
  etiqueta: string;
  tono: Tono;
  icono: LucideIcon;
}

// Hasta que estos enums lleguen a @pgim/shared con sus hitos.
type EstadoPagoUI = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';

export const ESTADOS = {
  reserva: {
    PENDIENTE: { etiqueta: 'Reservada', tono: 'neutro', icono: Clock },
    ACTIVA: { etiqueta: 'En curso', tono: 'acento', icono: Armchair },
    FINALIZADA: { etiqueta: 'Finalizada', tono: 'neutro', icono: Check },
    CANCELADA: { etiqueta: 'Cancelada', tono: 'neutro', icono: X },
    VENCIDA: { etiqueta: 'Inasistencia', tono: 'warn', icono: TriangleAlert },
  } satisfies Record<EstadoReserva, InfoEstado>,
  pedido: {
    CONFIRMADO: { etiqueta: 'Nuevo', tono: 'neutro', icono: Circle },
    EN_PREPARACION: { etiqueta: 'En preparación', tono: 'acento', icono: Flame },
    LISTO: { etiqueta: 'Listo', tono: 'ok', icono: Check },
    ENTREGADO: { etiqueta: 'Entregado', tono: 'neutro', icono: CheckCheck },
    CANCELADO: { etiqueta: 'Cancelado', tono: 'bad', icono: X },
  } satisfies Record<EstadoPedido, InfoEstado>,
  pago: {
    PENDIENTE: { etiqueta: 'Pendiente', tono: 'neutro', icono: Clock },
    APROBADO: { etiqueta: 'Aprobado', tono: 'ok', icono: Check },
    RECHAZADO: { etiqueta: 'Rechazado', tono: 'bad', icono: X },
  } satisfies Record<EstadoPagoUI, InfoEstado>,
  cuenta: {
    ABIERTA: { etiqueta: 'Abierta', tono: 'acento', icono: Receipt },
    CERRADA: { etiqueta: 'Cerrada', tono: 'neutro', icono: Check },
  } satisfies Record<'ABIERTA' | 'CERRADA', InfoEstado>,
  planificacion: {
    BORRADOR: { etiqueta: 'Borrador', tono: 'neutro', icono: Pencil },
    CONFIRMADA: { etiqueta: 'Confirmada', tono: 'ok', icono: Check },
  } satisfies Record<'BORRADOR' | 'CONFIRMADA', InfoEstado>,
  beneficio: {
    PROGRAMADO: { etiqueta: 'Programado', tono: 'neutro', icono: CalendarClock },
    VIGENTE: { etiqueta: 'Vigente', tono: 'acento', icono: Check },
    TERMINADO: { etiqueta: 'Terminado', tono: 'neutro', icono: Clock },
    BAJA: { etiqueta: 'Dado de baja', tono: 'neutro', icono: Ban },
  } satisfies Record<EstadoBeneficio, InfoEstado>,
  verificacion: {
    OK: { etiqueta: 'OK', tono: 'ok', icono: Check },
    EN_RIESGO: { etiqueta: 'En riesgo', tono: 'warn', icono: TriangleAlert },
    FALTANTE: { etiqueta: 'Faltante', tono: 'bad', icono: X },
  } satisfies Record<'OK' | 'EN_RIESGO' | 'FALTANTE', InfoEstado>,
} as const;

export type EntidadConEstado = keyof typeof ESTADOS;

// Al comensal, la inasistencia se le muestra sin tono de reproche.
const NO_ASISTIO: InfoEstado = { etiqueta: 'No asististe', tono: 'neutro', icono: X };
// Para el comensal, su pedido confirmado ya lo recibió la cocina.
const RECIBIDO: InfoEstado = { etiqueta: 'Recibido', tono: 'neutro', icono: Circle };

export function infoEstado(
  entidad: EntidadConEstado,
  valor: string,
  publico: Publico = 'personal',
): InfoEstado {
  if (entidad === 'reserva' && valor === 'VENCIDA' && publico === 'comensal') return NO_ASISTIO;
  if (entidad === 'pedido' && valor === 'CONFIRMADO' && publico === 'comensal') return RECIBIDO;
  const tabla: Record<string, InfoEstado> = ESTADOS[entidad];
  // Un valor nuevo de la API que todavía no está mapeado no rompe la pantalla.
  return tabla[valor] ?? { etiqueta: valor, tono: 'neutro', icono: Circle };
}
