import { prisma } from '../lib/prisma';
import { crearEscenario, limpiarBase, type Escenario } from '../test/db-setup';
import {
  AjusteSinDiferenciaError,
  ExistenciaInsuficienteError,
  stockRepository,
} from './stock.repository';

afterAll(() => prisma.$disconnect());

// Restricciones de la migración de intermedios con stock (der/convenciones.md).
describe('CHECK de stock y producción', () => {
  let e: Escenario;
  let existenciaId: string;

  beforeAll(async () => {
    await limpiarBase();
    e = await crearEscenario();
    existenciaId = (
      await prisma.existencia.findFirstOrThrow({
        where: { sucursalId: e.sucursalId, componenteId: e.harinaId },
      })
    ).id;
  });

  const movimiento = (datos: object) =>
    prisma.movimientoStock.create({
      data: { existenciaId, cantidad: -1, costoUnitario: 0, tipo: 'AJUSTE', motivo: 'x', ...datos },
    });

  it('la base rechaza lleva_stock en un insumo', async () => {
    await expect(
      prisma.componenteInventario.update({ where: { id: e.harinaId }, data: { llevaStock: true } }),
    ).rejects.toThrow(/componente_lleva_stock_ck/);
  });

  it('la base rechaza una merma sin motivo', async () => {
    await expect(movimiento({ tipo: 'MERMA' })).rejects.toThrow(/movimiento_motivo_merma_ck/);
  });

  it('la base rechaza un motivo de merma en otro tipo de movimiento', async () => {
    await expect(movimiento({ tipo: 'AJUSTE', motivoMerma: 'OTRO' })).rejects.toThrow(
      /movimiento_motivo_merma_ck/,
    );
  });

  it('la base rechaza una producción sin tanda', async () => {
    await expect(movimiento({ tipo: 'PRODUCCION', cantidad: 1 })).rejects.toThrow(
      /movimiento_tanda_ck/,
    );
  });

  it('la base rechaza cantidad_teorica en un ingreso', async () => {
    await expect(movimiento({ tipo: 'INGRESO', cantidad: 1, cantidadTeorica: 1 })).rejects.toThrow(
      /movimiento_cantidad_teorica_ck/,
    );
  });

  it('la base acepta una merma con motivo', async () => {
    await expect(movimiento({ tipo: 'MERMA', motivoMerma: 'VENCIMIENTO' })).resolves.toBeTruthy();
  });
});

describe('movimientos manuales', () => {
  let e: Escenario;
  let empleadoId: string;
  let ctx: { restauranteId: string; sucursalId: string; empleadoId: string };

  const existencia = async (componenteId: string) =>
    Number(
      (await prisma.existencia.findFirst({ where: { sucursalId: e.sucursalId, componenteId } }))
        ?.cantidadActual ?? 0,
    );
  const cantidadDeMovimientos = () => prisma.movimientoStock.count();

  beforeEach(async () => {
    await limpiarBase();
    e = await crearEscenario();
    const rol = await prisma.rol.create({
      data: { restauranteId: e.restauranteId, nombre: 'Encargado', arquetipo: 'OTRO' },
    });
    const usuario = await prisma.usuario.create({
      data: {
        email: `empleado-${Date.now()}@prueba.test`,
        passwordHash: 'x',
        tipo: 'EMPLEADO',
        empleado: {
          create: {
            restauranteId: e.restauranteId,
            rolId: rol.id,
            nombreCompleto: 'Empleado de prueba',
            horasSemanalesMax: 40,
          },
        },
      },
    });
    empleadoId = usuario.id;
    ctx = { restauranteId: e.restauranteId, sucursalId: e.sucursalId, empleadoId };
  });

  it('un ingreso sin fila de existencia la crea, suma y reemplaza el costo vigente', async () => {
    const nuevo = await prisma.componenteInventario.create({
      data: {
        restauranteId: e.restauranteId,
        tipo: 'INSUMO',
        nombre: 'Sal',
        unidadBase: 'GRAMO',
        costoCompraVigente: 1,
      },
    });

    const res = await stockRepository.registrarMovimiento(ctx, {
      tipo: 'INGRESO',
      componenteId: nuevo.id,
      cantidad: 500,
      costoUnitario: 3,
    });

    expect(res.existencia).toBe(500);
    expect(await existencia(nuevo.id)).toBe(500);
    const actualizado = await prisma.componenteInventario.findUniqueOrThrow({
      where: { id: nuevo.id },
    });
    expect(Number(actualizado.costoCompraVigente)).toBe(3);
    const mov = await prisma.movimientoStock.findFirstOrThrow({ where: { tipo: 'INGRESO' } });
    expect(Number(mov.cantidad)).toBe(500);
    expect(Number(mov.costoUnitario)).toBe(3);
    expect(mov.empleadoId).toBe(empleadoId);
  });

  it('una merma que dejaría negativo se rechaza y no deja movimientos', async () => {
    const antes = await cantidadDeMovimientos();

    await expect(
      stockRepository.registrarMovimiento(ctx, {
        tipo: 'MERMA',
        componenteId: e.harinaId,
        cantidad: 1500,
        costoUnitario: 2,
        motivoMerma: 'VENCIMIENTO',
        observacion: null,
      }),
    ).rejects.toBeInstanceOf(ExistenciaInsuficienteError);

    expect(await existencia(e.harinaId)).toBe(1000);
    expect(await cantidadDeMovimientos()).toBe(antes);
  });

  it('una merma resta y guarda el motivo', async () => {
    const res = await stockRepository.registrarMovimiento(ctx, {
      tipo: 'MERMA',
      componenteId: e.harinaId,
      cantidad: 250,
      costoUnitario: 2,
      motivoMerma: 'DETERIORO',
      observacion: 'bolsa rota',
    });

    expect(res.existencia).toBe(750);
    const mov = await prisma.movimientoStock.findFirstOrThrow({ where: { tipo: 'MERMA' } });
    expect(Number(mov.cantidad)).toBe(-250);
    expect(mov.motivoMerma).toBe('DETERIORO');
    expect(mov.motivo).toBe('bolsa rota');
  });

  it('un ajuste a 0 de 1000 g registra -1000 con el motivo', async () => {
    const res = await stockRepository.registrarMovimiento(ctx, {
      tipo: 'AJUSTE',
      componenteId: e.harinaId,
      cantidadContada: 0,
      costoUnitario: 2,
      motivo: 'se tiró todo',
    });

    expect(res.existencia).toBe(0);
    const mov = await prisma.movimientoStock.findFirstOrThrow({ where: { tipo: 'AJUSTE' } });
    expect(Number(mov.cantidad)).toBe(-1000);
    expect(mov.motivo).toBe('se tiró todo');
  });

  it('un ajuste sobre una fila inexistente con contado 50 la crea y registra +50', async () => {
    const nuevo = await prisma.componenteInventario.create({
      data: {
        restauranteId: e.restauranteId,
        tipo: 'INSUMO',
        nombre: 'Pimienta',
        unidadBase: 'GRAMO',
      },
    });

    const res = await stockRepository.registrarMovimiento(ctx, {
      tipo: 'AJUSTE',
      componenteId: nuevo.id,
      cantidadContada: 50,
      costoUnitario: 0,
      motivo: 'primer conteo',
    });

    expect(res.existencia).toBe(50);
    const mov = await prisma.movimientoStock.findFirstOrThrow({ where: { tipo: 'AJUSTE' } });
    expect(Number(mov.cantidad)).toBe(50);
  });

  it('un ajuste igual a la existencia se rechaza', async () => {
    await expect(
      stockRepository.registrarMovimiento(ctx, {
        tipo: 'AJUSTE',
        componenteId: e.harinaId,
        cantidadContada: 1000,
        costoUnitario: 2,
        motivo: 'conteo',
      }),
    ).rejects.toBeInstanceOf(AjusteSinDiferenciaError);
  });

  it('dos mermas de 600 g en paralelo sobre 1000 g: una se rechaza y quedan 400', async () => {
    const merma = () =>
      stockRepository.registrarMovimiento(ctx, {
        tipo: 'MERMA',
        componenteId: e.harinaId,
        cantidad: 600,
        costoUnitario: 2,
        motivoMerma: 'ERROR',
        observacion: null,
      });

    const resultados = await Promise.allSettled([merma(), merma()]);

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rechazada = resultados.find((r) => r.status === 'rejected');
    expect((rechazada as PromiseRejectedResult).reason).toBeInstanceOf(ExistenciaInsuficienteError);
    expect(await existencia(e.harinaId)).toBe(400);
    expect(await prisma.movimientoStock.count({ where: { tipo: 'MERMA' } })).toBe(1);
  });

  it('listarMovimientos de otra sucursal no devuelve nada y la propia sí', async () => {
    await stockRepository.registrarMovimiento(ctx, {
      tipo: 'MERMA',
      componenteId: e.harinaId,
      cantidad: 10,
      costoUnitario: 2,
      motivoMerma: 'OTRO',
      observacion: null,
    });
    const otra = await prisma.sucursal.create({
      data: {
        restauranteId: e.restauranteId,
        nombre: 'Otra',
        direccion: 'Otra 1',
        horarioApertura: new Date('1970-01-01T12:00:00Z'),
        horarioCierre: new Date('1970-01-01T23:00:00Z'),
        toleranciaNoShowMin: 15,
      },
    });

    const propia = await stockRepository.listarMovimientos(e.restauranteId, e.sucursalId, {
      pagina: 1,
    });
    const ajena = await stockRepository.listarMovimientos(e.restauranteId, otra.id, { pagina: 1 });
    const otroRestaurante = await stockRepository.listarMovimientos(
      '00000000-0000-0000-0000-000000000000',
      e.sucursalId,
      { pagina: 1 },
    );

    expect(propia.total).toBeGreaterThan(0);
    expect(propia.filas[0]!.empleado).toBe('Empleado de prueba');
    expect(ajena).toMatchObject({ filas: [], total: 0 });
    expect(otroRestaurante.total).toBe(0);
  });
});
