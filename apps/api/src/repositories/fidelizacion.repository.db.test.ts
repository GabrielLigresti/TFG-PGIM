import type { Prisma } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';
import { crearEscenario, limpiarBase, type Escenario } from '../test/db-setup';

afterAll(() => prisma.$disconnect());

let e: Escenario;

beforeEach(async () => {
  await limpiarBase();
  e = await crearEscenario();
});

// Inserta directo, sin pasar por la validación de la API, para probar que la
// base sola rechaza lo inválido.
function crearBeneficioCrudo(datos: Partial<Prisma.BeneficioUncheckedCreateInput> = {}) {
  return prisma.beneficio.create({
    data: {
      restauranteId: e.restauranteId,
      nombre: 'Postre de regalo',
      clase: 'RECOMPENSA',
      criterioTipo: 'VISITAS',
      criterioValor: 3,
      tipoDescuento: 'PORCENTAJE',
      valor: 10,
      vigenciaDesde: new Date('2026-11-01T00:00:00Z'),
      vigenciaHasta: new Date('2026-11-30T00:00:00Z'),
      ...datos,
    },
  });
}

describe('restricciones de beneficio en la base', () => {
  it('acepta un beneficio válido', async () => {
    await expect(crearBeneficioCrudo({ stockInicial: 5, stockDisponible: 5 })).resolves.toBeDefined();
  });

  it('rechaza un stock disponible mayor al inicial', async () => {
    await expect(crearBeneficioCrudo({ stockInicial: 5, stockDisponible: 6 })).rejects.toThrow(
      /beneficio_stock_check/,
    );
  });

  it('rechaza stock disponible sin stock inicial', async () => {
    await expect(crearBeneficioCrudo({ stockDisponible: 3 })).rejects.toThrow(
      /beneficio_stock_check/,
    );
  });

  it('rechaza una vigencia que termina antes de empezar', async () => {
    await expect(
      crearBeneficioCrudo({ vigenciaHasta: new Date('2026-10-01T00:00:00Z') }),
    ).rejects.toThrow(/beneficio_vigencia_check/);
  });

  it('rechaza un porcentaje mayor a 100', async () => {
    await expect(crearBeneficioCrudo({ valor: 120 })).rejects.toThrow(/beneficio_valor_check/);
  });

  it('rechaza una promoción sin menú y una recompensa sin criterio', async () => {
    await expect(
      crearBeneficioCrudo({ clase: 'PROMOCION', criterioTipo: null, criterioValor: null }),
    ).rejects.toThrow(/beneficio_campos_por_clase_check/);
    await expect(crearBeneficioCrudo({ criterioTipo: null, criterioValor: null })).rejects.toThrow(
      /beneficio_campos_por_clase_check/,
    );
    await expect(
      crearBeneficioCrudo({ clase: 'PROMOCION', menuId: e.menuId, criterioTipo: null, criterioValor: null }),
    ).resolves.toBeDefined();
  });

  it('rechaza un valor de criterio no positivo', async () => {
    await expect(crearBeneficioCrudo({ criterioValor: 0 })).rejects.toThrow(
      /beneficio_criterio_valor_check/,
    );
  });
});

describe('restricciones de cuenta de fidelidad en la base', () => {
  it('rechaza puntos negativos', async () => {
    await expect(
      prisma.cuentaFidelidad.create({
        data: { comensalId: e.comensalId, restauranteId: e.restauranteId, puntos: -1 },
      }),
    ).rejects.toThrow(/cuenta_fidelidad_puntos_check/);
  });
});
