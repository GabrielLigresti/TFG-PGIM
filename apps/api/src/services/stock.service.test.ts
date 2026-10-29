import type { Componente } from '../domain/receta';
import {
  AjusteSinDiferenciaError,
  ExistenciaInsuficienteError,
  type StockRepository,
} from '../repositories/stock.repository';
import { createStockService } from './stock.service';

const ctx = { restauranteId: 'r', sucursalId: 's', empleadoId: 'e' };

const base: Componente = {
  id: 'c',
  nombre: 'Tomate',
  tipo: 'INSUMO',
  unidadBase: 'GRAMO',
  activo: true,
  costoCompraVigente: 2,
  llevaStock: false,
  receta: null,
};

function servicio(componente: Componente, repoParcial: Partial<StockRepository> = {}) {
  const repo: jest.Mocked<StockRepository> = {
    listarComponentes: jest.fn(),
    registrarMovimiento: jest.fn().mockResolvedValue({ existencia: 10 }),
    listarMovimientos: jest.fn(),
    ...repoParcial,
  } as jest.Mocked<StockRepository>;
  const catalogo = { cargarCatalogo: jest.fn().mockResolvedValue(new Map([['c', componente]])) };
  return { repo, service: createStockService(repo, catalogo) };
}

describe('stockService.registrar', () => {
  it('convierte un ingreso de 2 kg a $3000/kg en gramos y costo por gramo', async () => {
    const { repo, service } = servicio(base);

    await service.registrar(ctx, {
      tipo: 'INGRESO',
      componenteId: 'c',
      cantidad: 2,
      unidad: 'KILOGRAMO',
      costoUnitario: 3000,
    });

    expect(repo.registrarMovimiento).toHaveBeenCalledWith(ctx, {
      tipo: 'INGRESO',
      componenteId: 'c',
      cantidad: 2000,
      costoUnitario: 3,
    });
  });

  it('rechaza el ingreso de un intermedio', async () => {
    const intermedio = { ...base, tipo: 'INTERMEDIO' as const, llevaStock: true };
    const { repo, service } = servicio(intermedio);

    await expect(
      service.registrar(ctx, {
        tipo: 'INGRESO',
        componenteId: 'c',
        cantidad: 1,
        unidad: 'GRAMO',
        costoUnitario: 1,
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(repo.registrarMovimiento).not.toHaveBeenCalled();
  });

  it('rechaza un movimiento de un intermedio sin stock', async () => {
    const intermedio = { ...base, tipo: 'INTERMEDIO' as const, llevaStock: false };
    const { service } = servicio(intermedio);

    await expect(
      service.registrar(ctx, {
        tipo: 'AJUSTE',
        componenteId: 'c',
        cantidadContada: 5,
        unidad: 'GRAMO',
        motivo: 'conteo',
      }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('rechaza un movimiento de un componente dado de baja', async () => {
    const { service } = servicio({ ...base, activo: false });

    await expect(
      service.registrar(ctx, {
        tipo: 'MERMA',
        componenteId: 'c',
        cantidad: 1,
        unidad: 'GRAMO',
        motivoMerma: 'OTRO',
      }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('rechaza una unidad de otra dimensión', async () => {
    const { service } = servicio(base);

    await expect(
      service.registrar(ctx, {
        tipo: 'MERMA',
        componenteId: 'c',
        cantidad: 1,
        unidad: 'UNIDAD',
        motivoMerma: 'OTRO',
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'La unidad no corresponde a Tomate, que se mide en g',
    });
  });

  it('valoriza una merma y un ajuste con el costo unitario del dominio', async () => {
    const { repo, service } = servicio(base);

    await service.registrar(ctx, {
      tipo: 'MERMA',
      componenteId: 'c',
      cantidad: 1,
      unidad: 'KILOGRAMO',
      motivoMerma: 'VENCIMIENTO',
    });
    await service.registrar(ctx, {
      tipo: 'AJUSTE',
      componenteId: 'c',
      cantidadContada: 3,
      unidad: 'KILOGRAMO',
      motivo: 'conteo',
    });

    expect(repo.registrarMovimiento).toHaveBeenNthCalledWith(
      1,
      ctx,
      expect.objectContaining({ tipo: 'MERMA', cantidad: 1000, costoUnitario: 2 }),
    );
    expect(repo.registrarMovimiento).toHaveBeenNthCalledWith(
      2,
      ctx,
      expect.objectContaining({ tipo: 'AJUSTE', cantidadContada: 3000, costoUnitario: 2 }),
    );
  });

  it('traduce el stock insuficiente a un 409 con la existencia', async () => {
    const { service } = servicio(base, {
      registrarMovimiento: jest.fn().mockRejectedValue(new ExistenciaInsuficienteError('c', 150)),
    });

    await expect(
      service.registrar(ctx, {
        tipo: 'MERMA',
        componenteId: 'c',
        cantidad: 500,
        unidad: 'GRAMO',
        motivoMerma: 'OTRO',
      }),
    ).rejects.toMatchObject({ status: 409, message: 'No alcanza el stock de Tomate: hay 150 g' });
  });

  it('traduce un ajuste sin diferencia a un 422', async () => {
    const { service } = servicio(base, {
      registrarMovimiento: jest.fn().mockRejectedValue(new AjusteSinDiferenciaError()),
    });

    await expect(
      service.registrar(ctx, {
        tipo: 'AJUSTE',
        componenteId: 'c',
        cantidadContada: 5,
        unidad: 'GRAMO',
        motivo: 'conteo',
      }),
    ).rejects.toMatchObject({
      status: 422,
      message: 'El conteo coincide con el stock; no hay nada que ajustar',
    });
  });
});
