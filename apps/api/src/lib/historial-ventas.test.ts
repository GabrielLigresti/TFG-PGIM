import { pronosticarSemana } from '../domain/pronostico';
import {
  generarReservasHistorial,
  SEMILLA_HISTORIAL,
  type EntradaHistorial,
} from './historial-ventas';

// Mesas, horarios y platos como los del seed (Centro: 10 mesas; Palermo: 6).
const mesasDe = (capacidades: number[]) =>
  capacidades.map((capacidad, i) => ({ id: `mesa-${i + 1}`, numero: i + 1, capacidad }));

const HORARIOS = [
  { franja: 'ALMUERZO', horaInicio: '12:00', horaFin: '16:00' },
  { franja: 'CENA', horaInicio: '20:00', horaFin: '00:00' },
] as const;

const PLATOS = [
  { id: 'p1', precio: 7500 },
  { id: 'p2', precio: 2500 },
  { id: 'p3', precio: 18000 },
  { id: 'p4', precio: 14000 },
  { id: 'p5', precio: 5500 },
  { id: 'p6', precio: 2000 },
];

const HOY = new Date('2026-11-03T15:00:00Z');

const centro: EntradaHistorial = {
  semilla: SEMILLA_HISTORIAL,
  hoy: HOY,
  semanas: 12,
  mesas: mesasDe([2, 2, 4, 4, 4, 6, 6, 8, 2, 4]),
  horarios: [...HORARIOS],
  platos: PLATOS,
};

const items = PLATOS.map((p) => ({ ...p, nombre: p.id }));

describe('generarReservasHistorial', () => {
  const reservas = generarReservasHistorial(centro);

  it('es determinista', () => {
    expect(generarReservasHistorial(centro)).toEqual(reservas);
  });

  it('respeta la capacidad y no repite mesa en la misma hora', () => {
    const capacidad = new Map(centro.mesas.map((m) => [m.id, m.capacidad]));
    const usadas = new Set<string>();
    for (const r of reservas) {
      expect(r.cantidadPersonas).toBeLessThanOrEqual(capacidad.get(r.mesaId)!);
      const clave = `${r.mesaId}|${r.inicio.toISOString()}`;
      expect(usadas.has(clave)).toBe(false);
      usadas.add(clave);
      expect(r.lineas.reduce((s, l) => s + l.cantidad, 0)).toBe(r.cantidadPersonas);
    }
  });

  it('Centro: el método elegido de cada franja tiene MAPE <= 25 % (criterio 1.11)', () => {
    const r = pronosticarSemana(
      { reservas, horarios: [...HORARIOS], items },
      { semanasHistoricoMinimo: 8 },
      HOY,
    );
    expect(r.progreso.suficiente).toBe(true);
    expect(r.filas).toHaveLength(14);
    for (const fila of r.filas) {
      expect(fila.errorMape).toBeLessThanOrEqual(25);
      expect(fila.cubiertosEstimados).toBeGreaterThan(0);
    }
  });

  it('Palermo con 5 semanas no alcanza el mínimo', () => {
    const palermo = generarReservasHistorial({
      ...centro,
      semanas: 5,
      mesas: mesasDe([2, 4, 4, 6, 2, 8]),
    });
    const r = pronosticarSemana(
      { reservas: palermo, horarios: [...HORARIOS], items },
      { semanasHistoricoMinimo: 8 },
      HOY,
    );
    expect(r.progreso).toEqual({ semanas: 5, minimo: 8, suficiente: false });
    expect(r.filas).toEqual([]);
  });
});
