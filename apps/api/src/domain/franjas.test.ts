import { elegirMesa, esFechaReservable, fechaDe, iniciosDelDia, sumarDias } from './franjas';

const iso = (fechas: Date[]) => fechas.map((f) => f.toISOString());

describe('iniciosDelDia', () => {
  it('un cierre a medianoche da franjas hasta las 23:00', () => {
    const inicios = iso(iniciosDelDia('2026-10-30', '12:00', '00:00'));

    expect(inicios).toHaveLength(12);
    expect(inicios[0]).toBe('2026-10-30T15:00:00.000Z');
    expect(inicios.at(-1)).toBe('2026-10-31T02:00:00.000Z');
  });

  it('una apertura que no es en punto empieza en la hora siguiente', () => {
    expect(iso(iniciosDelDia('2026-10-30', '12:30', '15:00'))).toEqual([
      '2026-10-30T16:00:00.000Z',
      '2026-10-30T17:00:00.000Z',
    ]);
  });

  it('sin una hora completa no hay franjas', () => {
    expect(iniciosDelDia('2026-10-30', '12:00', '12:30')).toEqual([]);
  });
});

describe('fechas', () => {
  it('fechaDe toma el día de Argentina', () => {
    expect(fechaDe(new Date('2026-10-31T02:00:00.000Z'))).toBe('2026-10-30');
  });

  it('sumarDias pasa de mes', () => {
    expect(sumarDias('2026-10-30', 2)).toBe('2026-11-01');
  });

  describe('esFechaReservable', () => {
    const ahora = new Date('2026-10-23T15:00:00.000Z');

    it.each([
      ['2026-10-23', true],
      ['2026-11-22', true],
      ['2026-11-23', false],
      ['2026-10-22', false],
    ])('%s → %s', (fecha, esperado) => {
      expect(esFechaReservable(fecha, ahora)).toBe(esperado);
    });
  });
});

describe('elegirMesa', () => {
  const mesas = [
    { id: 'a', numero: 1, capacidad: 2 },
    { id: 'c', numero: 3, capacidad: 4 },
    { id: 'b', numero: 2, capacidad: 4 },
    { id: 'd', numero: 4, capacidad: 6 },
  ];

  it('elige la más chica que alcanza y, a igual capacidad, la de menor número', () => {
    expect(elegirMesa(mesas, new Set(), 3)?.numero).toBe(2);
  });

  it('saltea las ocupadas', () => {
    expect(elegirMesa(mesas, new Set(['b']), 3)?.numero).toBe(3);
  });

  it('sin mesa que alcance da null', () => {
    expect(elegirMesa(mesas, new Set(), 7)).toBeNull();
  });

  it('para 2 personas elige la de 2', () => {
    expect(elegirMesa(mesas, new Set(), 2)?.numero).toBe(1);
  });
});
