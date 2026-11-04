import type { Franja } from '@pgim/shared';
import {
  asignacionGolosaBalanceada,
  calcularDotacion,
  faltantes,
  type DotacionRequerida,
  type EmpleadoAsignable,
} from './turnos';

const config = { semanasHistoricoMinimo: 8, cubiertosPorMozo: 20, platosPorCocineroHora: 12 };
const horas = new Map<Franja, number>([
  ['ALMUERZO', 4],
  ['CENA', 4],
]);

function emp(id: string, extra: Partial<EmpleadoAsignable> = {}): EmpleadoAsignable {
  return {
    id,
    nombre: id,
    arquetipo: 'MOZO',
    horasSemanalesMax: 40,
    horasYaAsignadas: 0,
    ocupado: new Set(),
    ...extra,
  };
}
const pide = (
  fecha: string,
  franja: Franja,
  cantidad: number,
  arquetipo: 'MOZO' | 'COCINERO' = 'MOZO',
): DotacionRequerida => ({ fecha, franja, arquetipo, cantidad });

describe('calcularDotacion', () => {
  it('pide mozos por cubiertos y cocineros por platos y horas', () => {
    const d = calcularDotacion(
      [
        {
          id: 'p1',
          fecha: '2026-11-06',
          franja: 'CENA',
          cubiertosEstimados: 45,
          demanda: [{ itemMenuId: 'plato', cantidad: 50 }],
        },
      ],
      config,
      horas,
      new Set(['plato']),
    );
    expect(d).toContainEqual(pide('2026-11-06', 'CENA', 3, 'MOZO'));
    expect(d).toContainEqual(pide('2026-11-06', 'CENA', 2, 'COCINERO'));
  });

  it('las bebidas no suman y 0 cubiertos no genera filas', () => {
    const d = calcularDotacion(
      [
        {
          id: 'p1',
          fecha: '2026-11-06',
          franja: 'CENA',
          cubiertosEstimados: 10,
          demanda: [{ itemMenuId: 'bebida', cantidad: 500 }],
        },
        {
          id: 'p2',
          fecha: '2026-11-07',
          franja: 'CENA',
          cubiertosEstimados: 0,
          demanda: [{ itemMenuId: 'plato', cantidad: 30 }],
        },
      ],
      config,
      horas,
      new Set(['plato']),
    );
    expect(d).toEqual([pide('2026-11-06', 'CENA', 1, 'MOZO')]);
  });
});

describe('asignacionGolosaBalanceada', () => {
  const asignar = asignacionGolosaBalanceada.asignar.bind(asignacionGolosaBalanceada);

  it('elige a quien lleva menos horas y desempata por id', () => {
    const r = asignar(
      [pide('2026-11-06', 'CENA', 1)],
      [emp('c', { horasYaAsignadas: 8 }), emp('b'), emp('a')],
      horas,
    );
    expect(r).toEqual([{ empleadoId: 'a', fecha: '2026-11-06', franja: 'CENA' }]);
  });

  it('recorre de mayor a menor dotación y el faltante cae en la franja de menor demanda', () => {
    const r = asignar(
      [pide('2026-11-06', 'ALMUERZO', 1), pide('2026-11-06', 'CENA', 3)],
      [emp('a', { horasSemanalesMax: 4 }), emp('b', { horasSemanalesMax: 4 })],
      horas,
    );
    expect(r.filter((t) => t.franja === 'CENA')).toHaveLength(2);
    expect(r.filter((t) => t.franja === 'ALMUERZO')).toHaveLength(0);
  });

  it('no repite fecha y franja ni usa a un ocupado', () => {
    const r = asignar(
      [pide('2026-11-06', 'CENA', 3)],
      [emp('a'), emp('b', { ocupado: new Set(['2026-11-06|CENA']) })],
      horas,
    );
    expect(r).toEqual([{ empleadoId: 'a', fecha: '2026-11-06', franja: 'CENA' }]);
  });

  it('respeta el tope exacto y cuenta las horas ya asignadas', () => {
    const d = [pide('2026-11-06', 'ALMUERZO', 1), pide('2026-11-06', 'CENA', 1)];
    expect(asignar(d, [emp('a', { horasSemanalesMax: 8 })], horas)).toHaveLength(2);
    expect(asignar(d, [emp('a', { horasSemanalesMax: 7 })], horas)).toHaveLength(1);
    expect(
      asignar(d, [emp('a', { horasSemanalesMax: 8, horasYaAsignadas: 1 })], horas),
    ).toHaveLength(1);
  });

  it('solo asigna al arquetipo pedido', () => {
    const r = asignar([pide('2026-11-06', 'CENA', 1, 'COCINERO')], [emp('a')], horas);
    expect(r).toEqual([]);
  });

  it('es determinista sin importar el orden de los empleados', () => {
    const d = [pide('2026-11-06', 'CENA', 2), pide('2026-11-07', 'CENA', 2)];
    const es = [emp('a'), emp('b'), emp('c')];
    expect(asignar(d, [...es].reverse(), horas)).toEqual(asignar(d, es, horas));
  });

  it('sin candidatos devuelve []', () => {
    expect(asignar([pide('2026-11-06', 'CENA', 2)], [], horas)).toEqual([]);
  });
});

describe('faltantes', () => {
  it('una alerta crítica por fecha, franja y arquetipo con diferencia', () => {
    const d = [pide('2026-11-06', 'CENA', 3), pide('2026-11-06', 'CENA', 1, 'COCINERO')];
    const es = [emp('a'), emp('k', { arquetipo: 'COCINERO' })];
    const turnos = [
      { empleadoId: 'a', fecha: '2026-11-06', franja: 'CENA' as const },
      { empleadoId: 'k', fecha: '2026-11-06', franja: 'CENA' as const },
    ];
    const r = faltantes(d, turnos, es);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      tipo: 'FALTANTE_PERSONAL',
      severidad: 'CRITICA',
      pronosticoId: null,
      existenciaId: null,
      arquetipo: 'MOZO',
      cantidad: 2,
      fecha: '2026-11-06',
      franja: 'CENA',
    });
    expect(r[0]!.descripcion).toContain('faltan 2');
  });

  it('sin diferencia no hay alertas', () => {
    const turnos = [{ empleadoId: 'a', fecha: '2026-11-06', franja: 'CENA' as const }];
    expect(faltantes([pide('2026-11-06', 'CENA', 1)], turnos, [emp('a')])).toEqual([]);
  });
});
