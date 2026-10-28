import {
  calcularDescuento,
  calcularPuntos,
  criterioDe,
  desdeDelCiclo,
  estadoBeneficio,
  relanzar,
  type DatosBeneficio,
  type DatosElegibilidad,
} from './beneficio';

const base: DatosBeneficio = {
  clase: 'RECOMPENSA',
  criterioTipo: 'VISITAS',
  criterioValor: 3,
  tipoDescuento: 'PORCENTAJE',
  valor: 10,
  vigenciaDesde: new Date('2026-11-01T00:00:00Z'),
  vigenciaHasta: new Date('2026-11-30T00:00:00Z'),
  stockInicial: 5,
  stockDisponible: 5,
  activo: true,
};

const datos = (d: Partial<DatosElegibilidad> = {}): DatosElegibilidad => ({
  visitas: 0,
  montoGastado: 0,
  puntos: 0,
  tienePagosAprobados: true,
  ...d,
});

describe('estadoBeneficio', () => {
  it('programado antes de empezar, vigente dentro de la vigencia', () => {
    expect(estadoBeneficio(base, new Date('2026-10-31T23:59:59Z'))).toBe('PROGRAMADO');
    expect(estadoBeneficio(base, new Date('2026-11-01T00:00:00Z'))).toBe('VIGENTE');
    expect(estadoBeneficio(base, new Date('2026-11-10T00:00:00Z'))).toBe('VIGENTE');
  });

  it('termina al vencer o al agotarse el stock', () => {
    expect(estadoBeneficio(base, new Date('2026-11-30T00:00:00Z'))).toBe('TERMINADO');
    expect(estadoBeneficio({ ...base, stockDisponible: 0 }, new Date('2026-11-10'))).toBe(
      'TERMINADO',
    );
  });

  it('sin límite de stock sigue vigente', () => {
    const sinLimite = { ...base, stockInicial: null, stockDisponible: null };
    expect(estadoBeneficio(sinLimite, new Date('2026-11-10'))).toBe('VIGENTE');
  });

  it('dado de baja pesa más que la vigencia', () => {
    expect(estadoBeneficio({ ...base, activo: false }, new Date('2026-11-10'))).toBe('BAJA');
  });
});

describe('calcularDescuento', () => {
  it('porcentaje sobre el saldo, redondeado a centavos', () => {
    expect(calcularDescuento(base, 18750)).toBe(1875);
    expect(calcularDescuento({ ...base, valor: 33 }, 100.01)).toBe(33);
  });

  it('monto fijo con tope en el saldo', () => {
    const fijo = { ...base, tipoDescuento: 'MONTO_FIJO' as const, valor: 5000 };
    expect(calcularDescuento(fijo, 20000)).toBe(5000);
    expect(calcularDescuento(fijo, 3000)).toBe(3000);
  });
});

describe('criterios de elegibilidad', () => {
  it('por visitas', () => {
    expect(criterioDe('VISITAS', 5).progreso(datos({ visitas: 3 }))).toEqual({
      actual: 3,
      requerido: 5,
    });
    expect(criterioDe('VISITAS', 5).esElegible(datos({ visitas: 4 }))).toBe(false);
    expect(criterioDe('VISITAS', 5).esElegible(datos({ visitas: 5 }))).toBe(true);
  });

  it('por monto', () => {
    expect(criterioDe('MONTO', 20000).progreso(datos({ montoGastado: 12000 }))).toEqual({
      actual: 12000,
      requerido: 20000,
    });
    expect(criterioDe('MONTO', 20000).esElegible(datos({ montoGastado: 20000 }))).toBe(true);
  });

  it('por puntos, con el saldo total', () => {
    expect(criterioDe('PUNTOS', 300).esElegible(datos({ puntos: 299 }))).toBe(false);
    expect(criterioDe('PUNTOS', 300).esElegible(datos({ puntos: 300 }))).toBe(true);
  });

  it('nuevo cliente: sin pagos aprobados en el restaurante, ignora el valor', () => {
    expect(criterioDe('NUEVO_CLIENTE', 1).esElegible(datos({ tienePagosAprobados: false }))).toBe(
      true,
    );
    expect(criterioDe('NUEVO_CLIENTE', 1).esElegible(datos())).toBe(false);
    expect(criterioDe('NUEVO_CLIENTE', 1).progreso(datos())).toEqual({ actual: 0, requerido: 1 });
    expect(
      criterioDe('NUEVO_CLIENTE', null).progreso(datos({ tienePagosAprobados: false })),
    ).toEqual({
      actual: 1,
      requerido: 1,
    });
  });
});

describe('desdeDelCiclo', () => {
  it('lo más reciente entre el inicio de la vigencia y el último canje', () => {
    expect(desdeDelCiclo(new Date('2026-11-01'), new Date('2026-11-05'))).toEqual(
      new Date('2026-11-05'),
    );
    expect(desdeDelCiclo(new Date('2026-11-01'), new Date('2026-10-20'))).toEqual(
      new Date('2026-11-01'),
    );
    expect(desdeDelCiclo(new Date('2026-11-01'), null)).toEqual(new Date('2026-11-01'));
  });
});

describe('calcularPuntos', () => {
  it('redondea hacia abajo', () => {
    expect(calcularPuntos(18750, 0.01)).toBe(187);
    expect(calcularPuntos(99.99, 0.01)).toBe(0);
    expect(calcularPuntos(0, 0.01)).toBe(0);
    expect(calcularPuntos(1000, 0.1)).toBe(100);
  });
});

describe('relanzar', () => {
  it('nueva vigencia desde ahora con la misma duración y el stock repuesto', () => {
    expect(relanzar({ ...base, stockDisponible: 0 }, new Date('2026-11-10T12:00:00Z'))).toEqual({
      vigenciaDesde: new Date('2026-11-10T12:00:00Z'),
      vigenciaHasta: new Date('2026-12-09T12:00:00Z'),
      stockDisponible: 5,
    });
  });

  it('solo un beneficio terminado', () => {
    expect(() => relanzar(base, new Date('2026-11-10'))).toThrow('vigente');
    expect(() => relanzar(base, new Date('2026-10-10'))).toThrow('todavía no empezó');
  });
});
