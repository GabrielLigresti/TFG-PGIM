import type { EstadoReserva } from '@pgim/shared';
import { situacionDeMesa } from './salon';

// 20:30 en Argentina; la reserva es a las 21:00 con 15 minutos de tolerancia.
const AHORA = new Date('2026-10-30T23:30:00.000Z');

function reserva(id: string, estado: EstadoReserva, inicio: string) {
  return { id, estado, inicio: new Date(inicio), toleranciaNoShowMin: 15 };
}

const PEND_21 = () => reserva('p21', 'PENDIENTE', '2026-10-31T00:00:00.000Z');
const PEND_20 = () => reserva('p20', 'PENDIENTE', '2026-10-30T23:00:00.000Z');
const ACT_20 = () => reserva('a20', 'ACTIVA', '2026-10-30T23:00:00.000Z');
const ACT_19 = () => reserva('a19', 'ACTIVA', '2026-10-30T22:00:00.000Z');

describe('situacionDeMesa', () => {
  it('sin reservas está libre', () => {
    expect(situacionDeMesa([], AHORA)).toEqual({ estado: 'LIBRE', reserva: null });
  });

  it('un segundo antes de la ventana sigue libre', () => {
    const r = situacionDeMesa([PEND_21()], new Date('2026-10-30T23:29:59.000Z'));
    expect(r).toEqual({ estado: 'LIBRE', reserva: null });
  });

  it('al abrir la ventana está reservada', () => {
    const p = PEND_21();
    const r = situacionDeMesa([p], new Date('2026-10-30T23:30:00.000Z'));
    expect(r).toEqual({ estado: 'RESERVADA', reserva: p });
  });

  it('al fin de la tolerancia sigue reservada', () => {
    const r = situacionDeMesa([PEND_21()], new Date('2026-10-31T00:15:00.000Z'));
    expect(r.estado).toBe('RESERVADA');
  });

  it('pasada la tolerancia queda libre', () => {
    const r = situacionDeMesa([PEND_21()], new Date('2026-10-31T00:15:01.000Z'));
    expect(r).toEqual({ estado: 'LIBRE', reserva: null });
  });

  it('una activa que pasó su franja sigue ocupada', () => {
    const a = reserva('a', 'ACTIVA', '2026-10-31T00:00:00.000Z');
    const r = situacionDeMesa([a], new Date('2026-10-31T02:30:00.000Z'));
    expect(r).toEqual({ estado: 'OCUPADA', reserva: a });
  });

  it('una activa de un día anterior sigue ocupada', () => {
    const a = reserva('a', 'ACTIVA', '2026-10-29T00:00:00.000Z');
    expect(situacionDeMesa([a], AHORA)).toEqual({ estado: 'OCUPADA', reserva: a });
  });

  it('la activa gana a la pendiente', () => {
    const a = ACT_20();
    const r = situacionDeMesa([a, PEND_21()], new Date('2026-10-30T23:45:00.000Z'));
    expect(r).toEqual({ estado: 'OCUPADA', reserva: a });
  });

  it('con dos activas muestra la más reciente, sin importar el orden', () => {
    const a20 = ACT_20();
    const a19 = ACT_19();
    expect(situacionDeMesa([a19, a20], AHORA).reserva).toBe(a20);
    expect(situacionDeMesa([a20, a19], AHORA).reserva).toBe(a20);
    expect(situacionDeMesa([a19, a20], AHORA).estado).toBe('OCUPADA');
  });

  it('con dos pendientes en la ventana muestra la de inicio más cercano', () => {
    // A las 20:10 están en ventana la de las 20:00 (tolerancia hasta 20:15) y la de las 20:20.
    const p2020 = reserva('p2020', 'PENDIENTE', '2026-10-30T23:20:00.000Z');
    const p20 = PEND_20();
    const r = situacionDeMesa([p2020, p20], new Date('2026-10-30T23:10:00.000Z'));
    expect(r).toEqual({ estado: 'RESERVADA', reserva: p20 });
  });
});
