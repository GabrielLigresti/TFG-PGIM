import { calcularDesvio, costoTanda } from './tanda';

describe('calcularDesvio', () => {
  it('rendimiento bajo y tomate de más', () => {
    const d = calcularDesvio({
      esperada: 5000,
      obtenida: 4100,
      consumos: [{ componenteId: 'tomate', teorica: 6000, usada: 6600, costoUnitario: 0.002 }],
    });
    expect(d.rendimientoReal).toBeCloseTo(0.82);
    expect(d.faltanteRendimiento).toBeCloseTo(900 * (12 / 5000));
    expect(d.usoDeMas).toBeCloseTo(600 * 0.002);
    expect(d.total).toBeCloseTo(d.faltanteRendimiento + d.usoDeMas);
    expect(d.costoTeorico).toBeCloseTo(12);
  });

  it('rinde más y usa menos: desvío 0, no negativo', () => {
    const d = calcularDesvio({
      esperada: 1000,
      obtenida: 1200,
      consumos: [{ componenteId: 'tomate', teorica: 1000, usada: 900, costoUnitario: 0.002 }],
    });
    expect(d.rendimientoReal).toBeCloseTo(1.2);
    expect(d.faltanteRendimiento).toBe(0);
    expect(d.usoDeMas).toBe(0);
    expect(d.total).toBe(0);
  });

  it('componente agregado a mano (teorica 0) cuenta completo en usoDeMas', () => {
    const d = calcularDesvio({
      esperada: 1000,
      obtenida: 1000,
      consumos: [
        { componenteId: 'tomate', teorica: 1000, usada: 1000, costoUnitario: 0.002 },
        { componenteId: 'azucar', teorica: 0, usada: 50, costoUnitario: 0.004 },
      ],
    });
    expect(d.usoDeMas).toBeCloseTo(0.2);
    expect(d.total).toBeCloseTo(0.2);
  });
});

describe('costoTanda', () => {
  it('divide el costo real por lo obtenido', () => {
    const consumos = [
      { componenteId: 'tomate', teorica: 1000, usada: 1100, costoUnitario: 0.002 },
      { componenteId: 'cebolla', teorica: 100, usada: 100, costoUnitario: 0.001 },
    ];
    // (1100 × 0,002 + 100 × 0,001) ÷ 900 = 2,3 ÷ 900
    expect(costoTanda(consumos, 900)).toBeCloseTo(2.3 / 900);
  });
});
