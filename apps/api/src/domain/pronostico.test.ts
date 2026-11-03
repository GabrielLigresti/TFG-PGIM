import type { Franja, MetodoPronostico } from '@pgim/shared';
import { crearPrng } from '../lib/prng';
import { sumarDias } from './franjas';
import {
  backtestMape,
  demandaPorItem,
  elegirMetodo,
  ingresoEstimado,
  naiveEstacional,
  progresoDatos,
  promedioMovilPonderado,
  pronosticarSemana,
  rango,
  regresionEstacional,
  semanaSiguiente,
  servicioDeReserva,
  type EstrategiaPronostico,
  type HistorialVentas,
  type HorarioServicioDatos,
  type Observacion,
} from './pronostico';

const HORARIOS: HorarioServicioDatos[] = [
  { franja: 'ALMUERZO', horaInicio: '12:00', horaFin: '16:00' },
  { franja: 'CENA', horaInicio: '20:00', horaFin: '00:00' },
];

// Hora local de Argentina (UTC−3) de una fecha, como instante UTC.
const local = (fecha: string, hora: number, minuto = 0) => {
  const [a, m, d] = fecha.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, d, hora + 3, minuto));
};

// Serie diaria desde una fecha (el 2026-10-05 es lunes).
const serieDesde = (inicio: string, valores: number[]): Observacion[] =>
  valores.map((valor, i) => ({ fecha: sumarDias(inicio, i), valor }));

const BASE_SEMANA = [10, 20, 30, 40, 50, 60, 70]; // lunes a domingo

describe('servicioDeReserva', () => {
  it('una cena de las 23:00 locales (02:00 UTC del día siguiente) es del día local', () => {
    const inicio = new Date('2026-11-03T02:00:00.000Z');

    expect(servicioDeReserva(inicio, HORARIOS)).toEqual({ fecha: '2026-11-02', franja: 'CENA' });
  });

  it('el almuerzo se ubica por la hora local y el fin del intervalo no entra', () => {
    expect(servicioDeReserva(local('2026-11-02', 12), HORARIOS)).toEqual({
      fecha: '2026-11-02',
      franja: 'ALMUERZO',
    });
    expect(servicioDeReserva(local('2026-11-02', 16), HORARIOS)).toBeNull();
  });

  it('una reserva a las 17:00 no cae en ninguna franja', () => {
    expect(servicioDeReserva(local('2026-11-02', 17), HORARIOS)).toBeNull();
  });

  it('con una cena que cruza la medianoche, las 00:30 son del servicio del día anterior', () => {
    const horarios: HorarioServicioDatos[] = [
      { franja: 'CENA', horaInicio: '20:00', horaFin: '01:00' },
    ];

    expect(servicioDeReserva(local('2026-11-03', 0, 30), horarios)).toEqual({
      fecha: '2026-11-02',
      franja: 'CENA',
    });
    expect(servicioDeReserva(local('2026-11-02', 21), horarios)).toEqual({
      fecha: '2026-11-02',
      franja: 'CENA',
    });
    expect(servicioDeReserva(local('2026-11-03', 1), horarios)).toBeNull();
  });
});

describe('progresoDatos', () => {
  it('cuenta ambos días extremos y redondea a semanas completas', () => {
    expect(progresoDatos('2026-10-01', '2026-10-14', 2)).toEqual({
      semanas: 2,
      minimo: 2,
      suficiente: true,
    });
    expect(progresoDatos('2026-10-01', '2026-10-13', 2)).toEqual({
      semanas: 1,
      minimo: 2,
      suficiente: false,
    });
  });

  it('sin reservas válidas no hay semanas', () => {
    expect(progresoDatos(null, '2026-10-13', 8)).toEqual({
      semanas: 0,
      minimo: 8,
      suficiente: false,
    });
  });
});

describe('semanaSiguiente', () => {
  it('desde un martes es el lunes siguiente y sus seis días', () => {
    const s = semanaSiguiente(new Date('2026-11-03T15:00:00.000Z'));

    expect(s.desde).toBe('2026-11-09');
    expect(s.fechas).toHaveLength(7);
    expect(s.fechas.at(-1)).toBe('2026-11-15');
  });

  it('desde un lunes es el lunes de la semana próxima', () => {
    expect(semanaSiguiente(new Date('2026-11-09T15:00:00.000Z')).desde).toBe('2026-11-16');
  });

  it('un domingo por la noche local (ya lunes en UTC) sigue siendo domingo', () => {
    expect(semanaSiguiente(new Date('2026-11-09T01:00:00.000Z')).desde).toBe('2026-11-09');
  });
});

describe('estrategias', () => {
  const dosSemanas = serieDesde('2026-10-05', [...BASE_SEMANA, ...BASE_SEMANA.map((v) => v + 5)]);

  it('naive: el último valor del mismo día de la semana', () => {
    expect(naiveEstacional.pronosticar(dosSemanas, '2026-10-19')).toBe(15); // lunes
    expect(naiveEstacional.pronosticar(dosSemanas, '2026-10-22')).toBe(45); // jueves
  });

  it('naive sin observaciones del día da 0', () => {
    expect(naiveEstacional.pronosticar(serieDesde('2026-10-05', [1, 2]), '2026-10-09')).toBe(0);
  });

  it('promedio móvil: pesos 4, 3, 2, 1 sobre los últimos cuatro mismos días', () => {
    // Lunes: 10, 20, 30, 40, 50 -> (50*4 + 40*3 + 30*2 + 20*1) / 10 = 40.
    const serie = serieDesde(
      '2026-10-05',
      Array.from({ length: 35 }, (_, i) => (i % 7 === 0 ? 10 * (i / 7 + 1) : 0)),
    );

    expect(promedioMovilPonderado.pronosticar(serie, '2026-11-09')).toBe(40);
  });

  it('promedio móvil con menos de cuatro usa los pesos más altos', () => {
    // Lunes 10 y 20 -> (20*4 + 10*3) / 7 = 15.71 -> 16.
    expect(
      promedioMovilPonderado.pronosticar(
        serieDesde('2026-10-05', [10, 0, 0, 0, 0, 0, 0, 20]),
        '2026-10-19',
      ),
    ).toBe(16);
  });

  it('regresión: recupera exacto un patrón semanal con tendencia común', () => {
    // y = base_d + 5t, con t en semanas: el lunes de la semana 3 (t = 2) vale 20.
    expect(regresionEstacional.pronosticar(dosSemanas, '2026-10-19')).toBe(20);
    expect(regresionEstacional.pronosticar(dosSemanas, '2026-10-21')).toBe(40); // miércoles
  });

  it('regresión: nunca da negativos', () => {
    const bajando = serieDesde('2026-10-05', [
      ...BASE_SEMANA.map((v) => v),
      ...BASE_SEMANA.map((v) => v - 9),
    ]);

    expect(regresionEstacional.pronosticar(bajando, '2026-11-30')).toBe(0);
  });
});

describe('backtest y selección', () => {
  const constante = serieDesde('2026-10-05', Array(40).fill(100));
  const fija = (n: number): EstrategiaPronostico => ({ pronosticar: () => n });
  const con = (
    pmp: EstrategiaPronostico,
    naive: EstrategiaPronostico,
    reg: EstrategiaPronostico,
  ): Record<MetodoPronostico, EstrategiaPronostico> => ({
    PROMEDIO_MOVIL_PONDERADO: pmp,
    NAIVE_ESTACIONAL: naive,
    REGRESION_ESTACIONAL: reg,
  });

  it('el empate se resuelve en el orden promedio móvil, naive, regresión', () => {
    expect(elegirMetodo(constante)).toEqual({ metodo: 'PROMEDIO_MOVIL_PONDERADO', errorMape: 0 });
    expect(elegirMetodo(constante, con(fija(80), fija(90), fija(90)))).toEqual({
      metodo: 'NAIVE_ESTACIONAL',
      errorMape: 10,
    });
  });

  it('elige el de menor error aunque esté último en el orden', () => {
    expect(elegirMetodo(constante, con(fija(80), fija(90), fija(95)))).toEqual({
      metodo: 'REGRESION_ESTACIONAL',
      errorMape: 5,
    });
  });

  it('los días con 0 cubiertos reales no entran en el promedio', () => {
    // Una semana de 10, otra de 10 y 28 días más con ceros al final: solo cuentan los 10.
    const valores = [...Array(14).fill(10), ...Array(21).fill(0)];
    const serie = serieDesde('2026-10-05', valores);

    expect(backtestMape(serie, naiveEstacional)).toBe(0);
  });

  it('sin cubiertos reales en la ventana se elige naive con error 0', () => {
    const vacia = serieDesde('2026-10-05', Array(40).fill(0));

    expect(backtestMape(vacia, naiveEstacional)).toBeNull();
    expect(elegirMetodo(vacia)).toEqual({ metodo: 'NAIVE_ESTACIONAL', errorMape: 0 });
  });

  it('el error se limita a 999.99', () => {
    const r = elegirMetodo(constante, con(fija(100_000), fija(100_000), fija(100_000)));

    expect(r.errorMape).toBe(999.99);
  });
});

describe('rango', () => {
  it('calcula los límites con el error porcentual', () => {
    expect(rango(100, 12.5)).toEqual({ limiteInferior: 87, limiteSuperior: 113 });
  });

  it('el límite inferior nunca es negativo', () => {
    expect(rango(10, 150)).toEqual({ limiteInferior: 0, limiteSuperior: 25 });
  });
});

describe('demanda e ingreso', () => {
  const items = [
    { id: 'a', nombre: 'Milanesa', precio: 100 },
    { id: 'b', nombre: 'Ensalada', precio: 50.5 },
    { id: 'c', nombre: 'Flan', precio: 30 },
    { id: 'd', nombre: 'Café', precio: 10 },
  ];
  // 40 cubiertos históricos; 'x' ya no está en el menú activo; 'c' participa muy poco.
  const platos = new Map([
    ['a', 30],
    ['b', 10],
    ['c', 1],
    ['x', 40],
  ]);

  it('reparte los cubiertos estimados por participación y omite ceros e ítems fuera del menú', () => {
    expect(demandaPorItem(20, platos, 40, items)).toEqual([
      { itemMenuId: 'a', cantidad: 15 },
      { itemMenuId: 'b', cantidad: 5 },
      // 'c': round(20 * 1/40) = round(0.5) = 1
      { itemMenuId: 'c', cantidad: 1 },
    ]);
    expect(demandaPorItem(10, platos, 40, items).map((d) => d.itemMenuId)).toEqual(['a', 'b']);
  });

  it('sin cubiertos históricos no hay demanda', () => {
    expect(demandaPorItem(20, platos, 0, items)).toEqual([]);
  });

  it('el ingreso es la suma de cantidad por precio vigente, a 2 decimales', () => {
    expect(
      ingresoEstimado(
        [
          { itemMenuId: 'a', cantidad: 15 },
          { itemMenuId: 'b', cantidad: 5 },
        ],
        items,
      ),
    ).toBe(1752.5);
  });
});

// Historial sintético: patrón semanal por franja y ±10 % de ruido, una reserva
// por día y franja, que consume dos tipos de plato.
function historialSintetico(semanas: number, hoyLocal: string): HistorialVentas {
  const azar = crearPrng(20261103);
  const base: Record<Franja, number[]> = {
    ALMUERZO: [60, 55, 58, 62, 80, 110, 120],
    CENA: [50, 48, 52, 60, 110, 150, 90],
  };
  const reservas: HistorialVentas['reservas'] = [];
  const dias = semanas * 7;
  // Empieza en lunes para que la semana de patrón coincida con el índice.
  const inicio = sumarDias(hoyLocal, -dias);
  for (let i = 0; i < dias; i++) {
    const fecha = sumarDias(inicio, i);
    const dia = (new Date(`${fecha}T00:00:00Z`).getUTCDay() + 6) % 7;
    for (const [franja, hora] of [
      ['ALMUERZO', 13],
      ['CENA', 21],
    ] as const) {
      const ruido = 1 + (azar() * 2 - 1) * 0.1;
      const cubiertos = Math.round(base[franja][dia]! * ruido);
      reservas.push({
        inicio: local(fecha, hora),
        cantidadPersonas: cubiertos,
        lineas: [
          { itemMenuId: 'a', cantidad: cubiertos },
          { itemMenuId: 'b', cantidad: Math.round(cubiertos / 2) },
        ],
      });
    }
  }
  return {
    reservas,
    horarios: HORARIOS,
    items: [
      { id: 'a', nombre: 'Milanesa', precio: 100 },
      { id: 'b', nombre: 'Postre', precio: 40 },
    ],
  };
}

describe('pronosticarSemana', () => {
  const hoy = new Date('2026-11-03T15:00:00.000Z');

  it('con historial insuficiente informa el progreso y no pronostica', () => {
    const historial = historialSintetico(3, '2026-11-03');

    const r = pronosticarSemana(historial, { semanasHistoricoMinimo: 8 }, hoy);

    expect(r.progreso).toEqual({ semanas: 3, minimo: 8, suficiente: false });
    expect(r.filas).toEqual([]);
    expect(r.semanaDesde).toBe('2026-11-09');
  });

  it('criterio 1.11: 12 semanas dan MAPE ≤ 25 % en cada franja y se generan en menos de 10 s', () => {
    const historial = historialSintetico(12, '2026-11-03');

    const t0 = performance.now();
    const r = pronosticarSemana(historial, { semanasHistoricoMinimo: 8 }, hoy);
    const segundos = (performance.now() - t0) / 1000;

    expect(segundos).toBeLessThan(10);
    expect(r.progreso).toMatchObject({ semanas: 12, suficiente: true });
    expect(r.filas).toHaveLength(14); // 7 días × 2 franjas
    expect(new Set(r.filas.map((f) => f.fecha)).size).toBe(7);
    for (const fila of r.filas) {
      expect(fila.errorMape).toBeLessThanOrEqual(25);
      expect(fila.cubiertosEstimados).toBeGreaterThan(0);
      expect(fila.limiteInferior).toBeLessThanOrEqual(fila.cubiertosEstimados);
      expect(fila.limiteSuperior).toBeGreaterThanOrEqual(fila.cubiertosEstimados);
      expect(fila.ingresoEstimado).toBeGreaterThan(0);
      expect(fila.demanda.length).toBeGreaterThan(0);
    }
  });
});
