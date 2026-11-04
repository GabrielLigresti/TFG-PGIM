import { consultaMetricasSchema, resolverPeriodo } from '@pgim/shared';

describe('consultaMetricasSchema', () => {
  it('acepta una consulta vacía', () => {
    expect(consultaMetricasSchema.safeParse({}).success).toBe(true);
  });

  it('rechaza un desde posterior al hasta', () => {
    const r = consultaMetricasSchema.safeParse({ desde: '2026-10-10', hasta: '2026-10-01' });
    expect(r.success).toBe(false);
  });

  it('rechaza más de 366 días y acepta exactamente 366', () => {
    const largo = consultaMetricasSchema.safeParse({ desde: '2025-01-01', hasta: '2026-01-02' });
    expect(largo.success).toBe(false);
    const justo = consultaMetricasSchema.safeParse({ desde: '2025-01-01', hasta: '2026-01-01' });
    expect(justo.success).toBe(true);
  });

  it('rechaza una sucursal que no es uuid', () => {
    expect(consultaMetricasSchema.safeParse({ sucursalId: 'x' }).success).toBe(false);
  });
});

describe('resolverPeriodo', () => {
  it('por defecto toma los últimos 30 días hasta ayer', () => {
    expect(resolverPeriodo({}, '2026-11-04')).toEqual({ desde: '2026-10-05', hasta: '2026-11-03' });
  });

  it('respeta lo que viene informado', () => {
    expect(resolverPeriodo({ desde: '2026-10-01', hasta: '2026-10-10' }, '2026-11-04')).toEqual({
      desde: '2026-10-01',
      hasta: '2026-10-10',
    });
  });
});
