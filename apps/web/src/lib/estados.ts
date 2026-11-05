import {
  Armchair,
  Check,
  CheckCheck,
  Circle,
  Clock,
  Eye,
  Flame,
  Loader,
  Ban,
  CalendarClock,
  Pencil,
  Receipt,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react';
import type {
  EstadoBeneficio,
  EstadoEscaneo,
  EstadoMesaSalon,
  EstadoPago,
  EstadoPedido,
  EstadoReserva,
  NivelCalidad,
} from '@pgim/shared';

// Única fuente de etiqueta, tono e ícono de cada estado. Ninguna pantalla
// elige colores de estado por su cuenta.
//   acento = en curso ahora · ok = bien · warn = en riesgo · bad = faltante o error

export type Tono = 'neutro' | 'acento' | 'ok' | 'warn' | 'bad';
export type Publico = 'personal' | 'comensal';

export interface InfoEstado {
  etiqueta: string;
  tono: Tono;
  icono: LucideIcon;
  // El ícono gira (algo en curso); respeta "reducir movimiento".
  gira?: boolean;
}

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
  mesa: {
    LIBRE: { etiqueta: 'Libre', tono: 'ok', icono: Circle },
    RESERVADA: { etiqueta: 'Reservada', tono: 'neutro', icono: Clock },
    OCUPADA: { etiqueta: 'Ocupada', tono: 'acento', icono: Armchair },
  } satisfies Record<EstadoMesaSalon, InfoEstado>,
  pago: {
    PENDIENTE: { etiqueta: 'Pago en curso', tono: 'warn', icono: Clock },
    APROBADO: { etiqueta: 'Pagado', tono: 'ok', icono: Check },
    RECHAZADO: { etiqueta: 'No aprobado', tono: 'bad', icono: X },
  } satisfies Record<EstadoPago, InfoEstado>,
  cuenta: {
    ABIERTA: { etiqueta: 'Abierta', tono: 'acento', icono: Receipt },
    CERRADA: { etiqueta: 'Cerrada', tono: 'neutro', icono: Check },
  } satisfies Record<'ABIERTA' | 'CERRADA', InfoEstado>,
  planificacion: {
    BORRADOR: { etiqueta: 'Sin confirmar', tono: 'warn', icono: Pencil },
    CONFIRMADA: { etiqueta: 'Confirmada', tono: 'ok', icono: Check },
  } satisfies Record<'BORRADOR' | 'CONFIRMADA', InfoEstado>,
  beneficio: {
    PROGRAMADO: { etiqueta: 'Programado', tono: 'neutro', icono: CalendarClock },
    VIGENTE: { etiqueta: 'Vigente', tono: 'acento', icono: Check },
    TERMINADO: { etiqueta: 'Terminado', tono: 'neutro', icono: Clock },
    BAJA: { etiqueta: 'Dado de baja', tono: 'neutro', icono: Ban },
  } satisfies Record<EstadoBeneficio, InfoEstado>,
  tanda: {
    EN_RANGO: { etiqueta: 'En rango', tono: 'ok', icono: Check },
    CON_PERDIDA: { etiqueta: 'Con pérdida', tono: 'warn', icono: TriangleAlert },
  } satisfies Record<'EN_RANGO' | 'CON_PERDIDA', InfoEstado>,
  verificacion: {
    OK: { etiqueta: 'OK', tono: 'ok', icono: Check },
    EN_RIESGO: { etiqueta: 'En riesgo', tono: 'warn', icono: TriangleAlert },
    FALTANTE: { etiqueta: 'Faltante', tono: 'bad', icono: X },
  } satisfies Record<'OK' | 'EN_RIESGO' | 'FALTANTE', InfoEstado>,
  escaneo: {
    PENDIENTE: { etiqueta: 'Generando', tono: 'acento', icono: Loader, gira: true },
    PROCESANDO: { etiqueta: 'Generando', tono: 'acento', icono: Loader, gira: true },
    EN_REVISION: { etiqueta: 'Para revisar', tono: 'warn', icono: Eye },
    PUBLICADO: { etiqueta: 'Con modelo', tono: 'ok', icono: Check },
    DESCARTADO: { etiqueta: 'Descartado', tono: 'neutro', icono: X },
    FALLIDO: { etiqueta: 'Falló', tono: 'bad', icono: TriangleAlert },
  } satisfies Record<EstadoEscaneo, InfoEstado>,
  // Nivel de cada criterio del informe de calidad del video.
  calidad: {
    OK: { etiqueta: 'Bien', tono: 'ok', icono: Check },
    ADVERTENCIA: { etiqueta: 'Atención', tono: 'warn', icono: TriangleAlert },
    RECHAZO: { etiqueta: 'No sirve', tono: 'bad', icono: X },
  } satisfies Record<NivelCalidad, InfoEstado>,
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
