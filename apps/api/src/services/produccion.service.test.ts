import type { Componente } from '../domain/receta';
import type { ProduccionRepository, TandaFila } from '../repositories/produccion.repository';
import { ExistenciaInsuficienteError } from '../repositories/stock.repository';
import { createProduccionService } from './produccion.service';

const ctx = { restauranteId: 'r', sucursalId: 's', empleadoId: 'e' };

const tomate: Componente = {
  id: 'tomate',
  nombre: 'Tomate',
  tipo: 'INSUMO',
  unidadBase: 'GRAMO',
  activo: true,
  costoCompraVigente: 2,
  llevaStock: false,
  receta: null,
};
const sal: Componente = { ...tomate, id: 'sal', nombre: 'Sal', costoCompraVigente: 1 };

// Rinde 5000 g con 6 kg de tomate, sin merma.
const salsa: Componente = {
  id: 'salsa',
  nombre: 'Salsa',
  tipo: 'INTERMEDIO',
  unidadBase: 'GRAMO',
  activo: true,
  costoCompraVigente: null,
  llevaStock: true,
  receta: {
    rendimiento: 5000,
    instrucciones: null,
    lineas: [{ componente: tomate, cantidad: 6, unidad: 'KILOGRAMO', porcentajeMerma: 0 }],
  },
};

function fila(parcial: Partial<TandaFila> = {}): TandaFila {
  return {
    id: 't1',
    fecha: new Date('2026-10-29T12:00:00Z'),
    intermedio: { id: 'salsa', nombre: 'Salsa' },
    esperada: 5000,
    obtenida: 4500,
    observacion: null,
    empleado: 'Ana',
    costoUnitario: 2.4,
    consumos: [
      {
        componenteId: 'tomate',
        componente: { id: 'tomate', nombre: 'Tomate', unidadBase: 'GRAMO' },
        teorica: 6000,
        usada: 6000,
        costoUnitario: 2,
      },
    ],
    ...parcial,
  };
}

function servicio(
  catalogoItems: Componente[] = [salsa, tomate, sal],
  repoParcial: Partial<ProduccionRepository> = {},
) {
  const repo: jest.Mocked<ProduccionRepository> = {
    registrarTanda: jest.fn().mockResolvedValue('t1'),
    listarTandas: jest.fn(),
    buscarTanda: jest.fn().mockResolvedValue(fila()),
    ...repoParcial,
  } as jest.Mocked<ProduccionRepository>;
  const catalogo = {
    cargarCatalogo: jest.fn().mockResolvedValue(new Map(catalogoItems.map((c) => [c.id, c]))),
  };
  const existencias = { existencias: jest.fn().mockResolvedValue(new Map([['tomate', 8000]])) };
  return { repo, service: createProduccionService(repo, catalogo, existencias) };
}

const input = {
  intermedioId: 'salsa',
  cantidadPlaneada: 5,
  cantidadObtenida: 4.5,
  unidad: 'KILOGRAMO' as const,
  consumos: [{ componenteId: 'tomate', cantidad: 6, unidad: 'KILOGRAMO' as const }],
};

describe('produccionService.plan', () => {
  it('calcula lo esperado y los consumos teóricos, con la existencia', async () => {
    const { service } = servicio();

    const plan = await service.plan('r', 's', {
      intermedioId: 'salsa',
      cantidad: 5,
      unidad: 'KILOGRAMO',
    });

    expect(plan.esperada).toBe(5000);
    expect(plan.intermedio).toEqual({ id: 'salsa', nombre: 'Salsa', unidadBase: 'GRAMO' });
    expect(plan.consumos).toEqual([
      {
        componente: { id: 'tomate', nombre: 'Tomate', unidadBase: 'GRAMO' },
        teorica: 6000,
        existencia: 8000,
      },
    ]);
  });

  it('rechaza una unidad de otra dimensión', async () => {
    const { service } = servicio();

    await expect(
      service.plan('r', 's', { intermedioId: 'salsa', cantidad: 5, unidad: 'LITRO' }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('produccionService.registrar', () => {
  it('recalcula lo teórico en el servidor y toma lo usado del cliente', async () => {
    const { repo, service } = servicio();

    await service.registrar(ctx, {
      ...input,
      consumos: [{ ...input.consumos[0]!, cantidad: 6.5 }],
    });

    expect(repo.registrarTanda).toHaveBeenCalledWith(ctx, {
      intermedioId: 'salsa',
      esperada: 5000,
      obtenida: 4500,
      observacion: null,
      consumos: [{ componenteId: 'tomate', teorica: 6000, usada: 6500, costoUnitario: 2 }],
      // 6500 g × $2 ÷ 4500 g
      costoUnitarioTanda: 2.8889,
    });
  });

  it('un componente agregado que no está en la receta tiene teórica 0', async () => {
    const { repo, service } = servicio();

    await service.registrar(ctx, {
      ...input,
      consumos: [...input.consumos, { componenteId: 'sal', cantidad: 100, unidad: 'GRAMO' }],
    });

    const { consumos } = repo.registrarTanda.mock.calls[0]![1];
    expect(consumos).toContainEqual({
      componenteId: 'sal',
      teorica: 0,
      usada: 100,
      costoUnitario: 1,
    });
  });

  it('un componente de la receta que se quita llega con usada 0 y cuenta en el desvío', async () => {
    const { repo, service } = servicio();

    await service.registrar(ctx, {
      ...input,
      consumos: [{ componenteId: 'sal', cantidad: 100, unidad: 'GRAMO' }],
    });

    const { consumos } = repo.registrarTanda.mock.calls[0]![1];
    expect(consumos).toContainEqual({
      componenteId: 'tomate',
      teorica: 6000,
      usada: 0,
      costoUnitario: 2,
    });
  });

  it('responde con el detalle y el desvío de la tanda guardada', async () => {
    const { repo, service } = servicio();

    const detalle = await service.registrar(ctx, input);

    expect(repo.buscarTanda).toHaveBeenCalledWith('r', 's', 't1');
    expect(detalle.id).toBe('t1');
    expect(detalle.desvio.rendimientoReal).toBeCloseTo(0.9);
    // Faltan 500 g de 5000 a $2,4 teóricos por gramo.
    expect(detalle.desvio.faltanteRendimiento).toBeCloseTo(1200);
    expect(detalle.consumos[0]).toMatchObject({ diferencia: 0, diferenciaCosto: 0 });
  });

  it('el desvío leído con detalle coincide con el de registrar si se quita un componente', async () => {
    // Lo que el repo guardaría: el tomate quitado queda con usada 0 y su teórica.
    const guardada = fila({
      obtenida: 4500,
      consumos: [{ ...fila().consumos[0]!, usada: 0 }],
    });
    const { service } = servicio(undefined, {
      buscarTanda: jest.fn().mockResolvedValue(guardada),
    });

    const alRegistrar = await service.registrar(ctx, {
      ...input,
      consumos: [{ componenteId: 'sal', cantidad: 100, unidad: 'GRAMO' }],
    });
    const leido = await service.detalle('r', 's', 't1');

    expect(alRegistrar.desvio.faltanteRendimiento).toBeCloseTo(1200);
    expect(leido.desvio.faltanteRendimiento).toBe(alRegistrar.desvio.faltanteRendimiento);
  });

  it('rechaza un intermedio sin stock, inactivo o sin receta', async () => {
    for (const malo of [
      { ...salsa, llevaStock: false },
      { ...salsa, activo: false },
      { ...salsa, receta: null },
    ]) {
      const { repo, service } = servicio([malo, tomate]);
      await expect(service.registrar(ctx, input)).rejects.toMatchObject({ status: 422 });
      expect(repo.registrarTanda).not.toHaveBeenCalled();
    }
  });

  it('rechaza un componente repetido, el propio intermedio o uno sin stock', async () => {
    const sinStock: Componente = { ...salsa, id: 'otro', nombre: 'Otro', llevaStock: false };
    const casos = [
      [...input.consumos, ...input.consumos],
      [{ componenteId: 'salsa', cantidad: 1, unidad: 'KILOGRAMO' as const }],
      [{ componenteId: 'otro', cantidad: 1, unidad: 'KILOGRAMO' as const }],
    ];
    for (const consumos of casos) {
      const { repo, service } = servicio([salsa, tomate, sinStock]);
      await expect(service.registrar(ctx, { ...input, consumos })).rejects.toMatchObject({
        status: 422,
      });
      expect(repo.registrarTanda).not.toHaveBeenCalled();
    }
  });

  it('rechaza un componente dado de baja', async () => {
    const { service } = servicio([salsa, { ...tomate, activo: false }]);

    await expect(service.registrar(ctx, input)).rejects.toMatchObject({ status: 422 });
  });

  it('rechaza una unidad de otra dimensión en un consumo', async () => {
    const { service } = servicio();

    await expect(
      service.registrar(ctx, {
        ...input,
        consumos: [{ componenteId: 'tomate', cantidad: 1, unidad: 'LITRO' }],
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'La unidad no corresponde a Tomate, que se mide en g',
    });
  });

  it('traduce la falta de stock en un 409 con el componente y su existencia', async () => {
    const { service } = servicio(undefined, {
      registrarTanda: jest.fn().mockRejectedValue(new ExistenciaInsuficienteError('tomate', 150)),
    });

    await expect(service.registrar(ctx, input)).rejects.toMatchObject({
      status: 409,
      message: 'No alcanza el stock de Tomate: hay 150 g',
    });
  });
});

describe('produccionService.listar y detalle', () => {
  it('lista con el desvío de cada tanda', async () => {
    const { service } = servicio(undefined, {
      listarTandas: jest
        .fn()
        .mockResolvedValue({ filas: [fila()], total: 1, pagina: 1, porPagina: 25 }),
    });

    const pagina = await service.listar('r', 's', { pagina: 1 });

    expect(pagina.total).toBe(1);
    expect(pagina.filas[0]).toMatchObject({ id: 't1', fecha: '2026-10-29T12:00:00.000Z' });
    expect(pagina.filas[0]!.desvio.total).toBeCloseTo(1200);
  });

  it('el detalle de una tanda inexistente es 404', async () => {
    const { service } = servicio(undefined, { buscarTanda: jest.fn().mockResolvedValue(null) });

    await expect(service.detalle('r', 's', 'x')).rejects.toMatchObject({ status: 404 });
  });

  it('la diferencia puede ser negativa en el detalle', async () => {
    const { service } = servicio(undefined, {
      buscarTanda: jest.fn().mockResolvedValue(
        fila({
          consumos: [{ ...fila().consumos[0]!, usada: 5000 }],
        }),
      ),
    });

    const detalle = await service.detalle('r', 's', 't1');

    expect(detalle.consumos[0]).toMatchObject({ diferencia: -1000, diferenciaCosto: -2000 });
    expect(detalle.desvio.usoDeMas).toBe(0);
  });
});
