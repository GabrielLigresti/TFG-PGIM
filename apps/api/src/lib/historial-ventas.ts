import type { Franja } from '@pgim/shared';
import {
  elegirMesa,
  iniciosDelDia,
  sumarDias,
  fechaDe,
  type MesaCandidata,
} from '../domain/franjas';
import { crearPrng } from './prng';

// Generador puro del historial de ventas del seed: mismas reservas para la misma
// semilla y el mismo `hoy`. No toca la base; el seed le pone ids, comensales,
// cuentas, pagos y numeración de pedidos.

export const SEMILLA_HISTORIAL = 20261103;

export interface EntradaHistorial {
  semilla: number;
  hoy: Date;
  semanas: number;
  mesas: MesaCandidata[];
  horarios: { franja: Franja; horaInicio: string; horaFin: string }[];
  platos: { id: string; precio: number }[];
}

export interface ReservaGenerada {
  inicio: Date;
  cantidadPersonas: number;
  mesaId: string;
  lineas: { itemMenuId: string; cantidad: number; precioUnitario: number }[];
}

// Ocupación objetivo sobre la capacidad de la franja: más demanda el viernes y
// el sábado, menos el lunes (índice = día de la semana, 0 = domingo).
const FACTOR_DIA = [0.75, 0.45, 0.5, 0.55, 0.65, 0.9, 1];
const FACTOR_FRANJA: Record<Franja, number> = { ALMUERZO: 0.8, CENA: 1 };
const OCUPACION_PICO = 0.6;
const TENDENCIA_TOTAL = 0.15; // crecimiento a lo largo de todo el historial
const RUIDO = 0.1; // ±10 %
const TAMANOS_GRUPO = [1, 2, 2, 2, 3, 3, 4, 4, 5, 6];
const PESOS_PLATO = [3, 4, 5, 4, 2, 5];

const diaSemana = (fecha: string) => new Date(`${fecha}T00:00:00Z`).getUTCDay();

export function generarReservasHistorial(entrada: EntradaHistorial): ReservaGenerada[] {
  const { hoy, semanas, mesas, horarios, platos } = entrada;
  const azar = crearPrng(entrada.semilla);
  const entre = (n: number) => Math.floor(azar() * n);
  const dias = semanas * 7;
  const ultimo = sumarDias(fechaDe(hoy), -1);
  const primero = sumarDias(ultimo, -(dias - 1));
  const asientos = mesas.reduce((s, m) => s + m.capacidad, 0);
  const mayor = Math.max(0, ...mesas.map((m) => m.capacidad));

  const pesoTotal = platos.reduce((s, _, i) => s + PESOS_PLATO[i % PESOS_PLATO.length]!, 0);
  const elegirPlato = () => {
    let r = azar() * pesoTotal;
    for (const [i, p] of platos.entries()) {
      r -= PESOS_PLATO[i % PESOS_PLATO.length]!;
      if (r < 0) return p;
    }
    return platos[platos.length - 1]!;
  };

  const reservas: ReservaGenerada[] = [];
  for (let d = 0; d < dias; d++) {
    const fecha = sumarDias(primero, d);
    const tendencia = 1 + TENDENCIA_TOTAL * (d / dias);
    for (const h of horarios) {
      const inicios = iniciosDelDia(fecha, h.horaInicio, h.horaFin);
      if (inicios.length === 0) continue;
      const ocupadas = inicios.map(() => new Set<string>());
      const ruido = 1 + (azar() * 2 - 1) * RUIDO;
      let faltan = Math.round(
        asientos *
          inicios.length *
          OCUPACION_PICO *
          FACTOR_DIA[diaSemana(fecha)]! *
          FACTOR_FRANJA[h.franja] *
          tendencia *
          ruido,
      );

      // Grupos al azar hasta cubrir el objetivo; el último se ajusta a lo que falta.
      let intentos = 0;
      while (faltan > 0 && intentos++ < 500) {
        const personas = Math.min(faltan, mayor, TAMANOS_GRUPO[entre(TAMANOS_GRUPO.length)]!);
        let asignada: { hora: number; mesaId: string } | null = null;
        const primera = entre(inicios.length);
        for (let k = 0; k < inicios.length && !asignada; k++) {
          const hora = (primera + k) % inicios.length;
          const mesa = elegirMesa(mesas, ocupadas[hora]!, personas);
          if (mesa) asignada = { hora, mesaId: mesa.id };
        }
        if (!asignada) break; // la franja se llenó
        ocupadas[asignada.hora]!.add(asignada.mesaId);

        const porPlato = new Map<string, { cantidad: number; precio: number }>();
        for (let i = 0; i < personas; i++) {
          const plato = elegirPlato();
          const actual = porPlato.get(plato.id) ?? { cantidad: 0, precio: plato.precio };
          actual.cantidad++;
          porPlato.set(plato.id, actual);
        }
        reservas.push({
          inicio: inicios[asignada.hora]!,
          cantidadPersonas: personas,
          mesaId: asignada.mesaId,
          lineas: [...porPlato].map(([itemMenuId, v]) => ({
            itemMenuId,
            cantidad: v.cantidad,
            precioUnitario: v.precio,
          })),
        });
        faltan -= personas;
      }
    }
  }
  return reservas.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
}
