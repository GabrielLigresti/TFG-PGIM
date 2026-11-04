import type { ConfiguracionApertura, Franja } from '@pgim/shared';
import { momentoLegible, type AlertaNueva, type PronosticoAVerificar } from './verificadores';

// Dotación requerida por fecha y franja, y asignación de turnos (Strategy).
// Dominio puro: no se guarda la dotación, se recalcula.

export type ArquetipoTurno = 'MOZO' | 'COCINERO';

export interface DotacionRequerida {
  fecha: string;
  franja: Franja;
  arquetipo: ArquetipoTurno;
  cantidad: number;
}

export interface EmpleadoAsignable {
  id: string;
  nombre: string;
  arquetipo: ArquetipoTurno;
  horasSemanalesMax: number;
  horasYaAsignadas: number; // en otras sucursales, esa semana
  ocupado: Set<string>; // `${fecha}|${franja}` en otras sucursales
}

export interface TurnoAsignado {
  empleadoId: string;
  fecha: string;
  franja: Franja;
}

export interface EstrategiaAsignacionTurnos {
  asignar(
    dotacion: DotacionRequerida[],
    empleados: EmpleadoAsignable[],
    horas: Map<Franja, number>,
  ): TurnoAsignado[];
}

const EPSILON = 1e-9;
const ORDEN_FRANJA: Record<Franja, number> = { ALMUERZO: 0, CENA: 1 };
const porId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function calcularDotacion(
  pronosticos: PronosticoAVerificar[],
  config: ConfiguracionApertura,
  horas: Map<Franja, number>,
  conReceta: Set<string>,
): DotacionRequerida[] {
  const filas: DotacionRequerida[] = [];
  for (const p of pronosticos) {
    if (p.cubiertosEstimados <= 0) continue;
    const mozos = Math.ceil(p.cubiertosEstimados / config.cubiertosPorMozo - EPSILON);
    const platos = p.demanda
      .filter((d) => conReceta.has(d.itemMenuId))
      .reduce((suma, d) => suma + d.cantidad, 0);
    const capacidadCocinero = config.platosPorCocineroHora * (horas.get(p.franja) ?? 0);
    const cocineros = capacidadCocinero > 0 ? Math.ceil(platos / capacidadCocinero - EPSILON) : 0;
    if (mozos > 0)
      filas.push({ fecha: p.fecha, franja: p.franja, arquetipo: 'MOZO', cantidad: mozos });
    if (cocineros > 0) {
      filas.push({ fecha: p.fecha, franja: p.franja, arquetipo: 'COCINERO', cantidad: cocineros });
    }
  }
  return filas;
}

export const asignacionGolosaBalanceada: EstrategiaAsignacionTurnos = {
  asignar(dotacion, empleados, horas) {
    // Franjas de mayor a menor dotación total; desempate por fecha y franja.
    const franjas = new Map<string, { fecha: string; franja: Franja; total: number }>();
    for (const d of dotacion) {
      const clave = `${d.fecha}|${d.franja}`;
      const f = franjas.get(clave) ?? { fecha: d.fecha, franja: d.franja, total: 0 };
      f.total += d.cantidad;
      franjas.set(clave, f);
    }
    const orden = [...franjas.values()].sort(
      (a, b) =>
        b.total - a.total ||
        porId(a.fecha, b.fecha) ||
        ORDEN_FRANJA[a.franja] - ORDEN_FRANJA[b.franja],
    );

    const acumuladas = new Map<string, number>(); // horas asignadas acá
    const tomados = new Set<string>(); // `${empleado}|${fecha}|${franja}`
    const turnos: TurnoAsignado[] = [];
    const candidatos = [...empleados].sort((a, b) => porId(a.id, b.id));

    for (const f of orden) {
      const duracion = horas.get(f.franja) ?? 0;
      for (const arquetipo of ['MOZO', 'COCINERO'] as const) {
        const pedida = dotacion
          .filter((d) => d.fecha === f.fecha && d.franja === f.franja && d.arquetipo === arquetipo)
          .reduce((suma, d) => suma + d.cantidad, 0);
        const carga = (e: EmpleadoAsignable) => e.horasYaAsignadas + (acumuladas.get(e.id) ?? 0);
        const disponibles = candidatos
          .filter(
            (e) =>
              e.arquetipo === arquetipo &&
              !e.ocupado.has(`${f.fecha}|${f.franja}`) &&
              !tomados.has(`${e.id}|${f.fecha}|${f.franja}`) &&
              carga(e) + duracion <= e.horasSemanalesMax + EPSILON,
          )
          .sort((a, b) => carga(a) - carga(b) || porId(a.id, b.id));
        for (const e of disponibles.slice(0, pedida)) {
          turnos.push({ empleadoId: e.id, fecha: f.fecha, franja: f.franja });
          tomados.add(`${e.id}|${f.fecha}|${f.franja}`);
          acumuladas.set(e.id, (acumuladas.get(e.id) ?? 0) + duracion);
        }
      }
    }
    return turnos;
  },
};

const NOMBRE_ARQUETIPO: Record<ArquetipoTurno, [string, string]> = {
  MOZO: ['mozo', 'mozos'],
  COCINERO: ['cocinero', 'cocineros'],
};

export function faltantes(
  dotacion: DotacionRequerida[],
  turnos: TurnoAsignado[],
  empleados: EmpleadoAsignable[],
): AlertaNueva[] {
  const arquetipoDe = new Map(empleados.map((e) => [e.id, e.arquetipo]));
  const alertas: AlertaNueva[] = [];
  for (const d of dotacion) {
    const cubiertos = turnos.filter(
      (t) =>
        t.fecha === d.fecha &&
        t.franja === d.franja &&
        arquetipoDe.get(t.empleadoId) === d.arquetipo,
    ).length;
    const diferencia = d.cantidad - cubiertos;
    if (diferencia <= 0) continue;
    const [singular, plural] = NOMBRE_ARQUETIPO[d.arquetipo];
    alertas.push({
      tipo: 'FALTANTE_PERSONAL',
      severidad: 'CRITICA',
      descripcion: `El ${momentoLegible(d.fecha, d.franja)} se necesitan ${d.cantidad} ${d.cantidad === 1 ? singular : plural} y solo se pudo cubrir ${cubiertos}: ${diferencia === 1 ? 'falta 1' : `faltan ${diferencia}`}.`,
      pronosticoId: null,
      existenciaId: null,
      fecha: d.fecha,
      franja: d.franja,
      arquetipo: d.arquetipo,
      cantidad: diferencia,
    });
  }
  return alertas;
}
