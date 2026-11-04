import type { CodigoPermiso } from '@pgim/shared';
import type { AperturaRepository } from '../repositories/apertura.repository';
import type { MetricaRepository } from '../repositories/metrica.repository';
import { AppError } from '../lib/errors';
import { createMetricaService, type ContextoMetricas } from './metrica.service';

const AHORA = new Date('2026-11-04T15:00:00Z');
const CENTRO = { id: 's1', nombre: 'Centro' };
const PALERMO = { id: 's2', nombre: 'Palermo' };

const repo = (): jest.Mocked<MetricaRepository> => ({
  sucursalesActivas: jest.fn().mockResolvedValue([CENTRO, PALERMO]),
  pagosAprobados: jest.fn().mockResolvedValue([]),
  lineasEntregadas: jest.fn().mockResolvedValue([]),
  costosDePlatos: jest.fn().mockResolvedValue(new Map()),
  mermaPorMotivo: jest.fn().mockResolvedValue([]),
  datosDeOcupacion: jest.fn().mockResolvedValue([]),
});
const apertura = (): jest.Mocked<AperturaRepository> => ({
  obtenerConfiguracion: jest.fn().mockResolvedValue(null),
  actualizarConfiguracion: jest.fn(),
  historial: jest.fn(),
  pronosticosDeSemana: jest.fn().mockResolvedValue([]),
});

const ctx = (permisos: CodigoPermiso[], sucursales = [CENTRO]): ContextoMetricas => ({
  restauranteId: 'r1',
  permisos,
  sucursales,
});

describe('alcance por sucursal', () => {
  it('quien administra sucursales ve todas las activas y el total se llama "Todas las sucursales"', async () => {
    const r = repo();
    const m = await createMetricaService(r, apertura()).consultar(
      ctx(['metrica.ver', 'sucursal.crear']),
      {},
      AHORA,
    );
    expect(m.alcance).toEqual({
      sucursales: [CENTRO, PALERMO],
      etiquetaTotal: 'Todas las sucursales',
    });
    expect(r.pagosAprobados).toHaveBeenCalledWith('r1', ['s1', 's2'], '2026-10-05', '2026-11-03');
  });

  it('el resto ve las asignadas: "Mis sucursales" con varias y null con una', async () => {
    const svc = createMetricaService(repo(), apertura());
    const varias = await svc.consultar(ctx(['metrica.ver'], [CENTRO, PALERMO]), {}, AHORA);
    expect(varias.alcance.etiquetaTotal).toBe('Mis sucursales');
    const una = await svc.consultar(ctx(['metrica.ver']), {}, AHORA);
    expect(una.alcance).toEqual({ sucursales: [CENTRO], etiquetaTotal: null });
  });

  it('una sucursal fuera del alcance responde 403 y no consulta nada', async () => {
    const r = repo();
    const svc = createMetricaService(r, apertura());
    const error = await svc
      .consultar(ctx(['metrica.ver']), { sucursalId: PALERMO.id }, AHORA)
      .catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error.status).toBe(403);
    expect(r.pagosAprobados).not.toHaveBeenCalled();
  });

  it('con una sucursal elegida, consulta solo esa', async () => {
    const r = repo();
    await createMetricaService(r, apertura()).consultar(
      ctx(['metrica.ver'], [CENTRO, PALERMO]),
      { sucursalId: PALERMO.id },
      AHORA,
    );
    expect(r.mermaPorMotivo).toHaveBeenCalledWith('r1', ['s2'], '2026-10-05', '2026-11-03');
  });

  it('un período inválido responde 400', async () => {
    const svc = createMetricaService(repo(), apertura());
    const error = await svc
      .consultar(ctx(['metrica.ver']), { desde: '2024-01-01' }, AHORA)
      .catch((e) => e);
    expect(error.status).toBe(400);
  });
});

describe('ranking por margen', () => {
  it('divide el costo de la receta por su rendimiento y deja los platos sin dato al final', async () => {
    const r = repo();
    r.lineasEntregadas.mockResolvedValue([
      { itemMenuId: 'sin', nombre: 'Sin receta', unidades: 50, ingresos: 5000 },
      // Rendimiento 4: el repositorio informa el costo por porción (500 / 4 = 125).
      { itemMenuId: 'tarta', nombre: 'Tarta', unidades: 10, ingresos: 3000 },
      { itemMenuId: 'agua', nombre: 'Agua', unidades: 20, ingresos: 6000 },
    ]);
    r.costosDePlatos.mockResolvedValue(
      new Map([
        ['sin', null],
        ['tarta', 125],
        ['agua', 100],
      ]),
    );
    const { margenPorPlato } = await createMetricaService(r, apertura()).consultar(
      ctx(['metrica.ver']),
      {},
      AHORA,
    );
    expect(margenPorPlato.map((p) => p.itemMenuId)).toEqual(['agua', 'tarta', 'sin']);
    expect(margenPorPlato[1]).toMatchObject({
      precioPromedio: 300,
      costo: 125,
      margenUnitario: 175,
      margenTotal: 1750,
    });
    expect(margenPorPlato[2]).toMatchObject({
      costo: null,
      margenUnitario: null,
      margenTotal: null,
    });
  });
});
