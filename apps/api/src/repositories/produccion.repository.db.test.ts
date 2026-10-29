import { prisma } from '../lib/prisma';
import { crearEscenario, limpiarBase, type Escenario } from '../test/db-setup';
import { produccionRepository } from './produccion.repository';
import { ExistenciaInsuficienteError } from './stock.repository';

afterAll(() => prisma.$disconnect());

describe('producción por tandas', () => {
  let e: Escenario;
  let salsaId: string;
  let ctx: { restauranteId: string; sucursalId: string; empleadoId: string };

  const existencia = async (componenteId: string) =>
    Number(
      (await prisma.existencia.findFirst({ where: { sucursalId: e.sucursalId, componenteId } }))
        ?.cantidadActual ?? 0,
    );

  // Salsa: 5000 g con 6000 g de harina (el insumo del escenario, 1000 g en stock: se sube).
  const tandaBase = (parcial: object = {}) => ({
    intermedioId: salsaId,
    esperada: 5000,
    obtenida: 4500,
    observacion: null,
    consumos: [{ componenteId: e.harinaId, teorica: 600, usada: 700, costoUnitario: 2 }],
    costoUnitarioTanda: 0.3111,
    ...parcial,
  });

  beforeEach(async () => {
    await limpiarBase();
    e = await crearEscenario();
    const rol = await prisma.rol.create({
      data: { restauranteId: e.restauranteId, nombre: 'Cocinero', arquetipo: 'OTRO' },
    });
    const usuario = await prisma.usuario.create({
      data: {
        email: `cocinero-${Date.now()}@prueba.test`,
        passwordHash: 'x',
        tipo: 'EMPLEADO',
        empleado: {
          create: {
            restauranteId: e.restauranteId,
            rolId: rol.id,
            nombreCompleto: 'Cocinero de prueba',
            horasSemanalesMax: 40,
          },
        },
      },
    });
    ctx = {
      restauranteId: e.restauranteId,
      sucursalId: e.sucursalId,
      empleadoId: usuario.id,
    };
    const salsa = await prisma.componenteInventario.create({
      data: {
        restauranteId: e.restauranteId,
        tipo: 'INTERMEDIO',
        nombre: 'Salsa',
        unidadBase: 'GRAMO',
        llevaStock: true,
        receta: {
          create: {
            rendimiento: 5000,
            lineas: { create: [{ componenteId: e.harinaId, cantidad: 600, unidad: 'GRAMO' }] },
          },
        },
      },
    });
    salsaId = salsa.id;
  });

  it('una tanda correcta baja el insumo, crea la existencia y fija el costo', async () => {
    const id = await produccionRepository.registrarTanda(ctx, tandaBase());

    expect(await existencia(e.harinaId)).toBe(300);
    expect(await existencia(salsaId)).toBe(4500);
    const consumo = await prisma.movimientoStock.findFirstOrThrow({
      where: { tandaId: id, tipo: 'CONSUMO_PRODUCCION' },
    });
    expect(Number(consumo.cantidad)).toBe(-700);
    expect(Number(consumo.cantidadTeorica)).toBe(-600);
    expect(consumo.empleadoId).toBe(ctx.empleadoId);
    const produccion = await prisma.movimientoStock.findFirstOrThrow({
      where: { tandaId: id, tipo: 'PRODUCCION' },
    });
    expect(Number(produccion.cantidad)).toBe(4500);
    expect(Number(produccion.costoUnitario)).toBe(0.3111);
    const salsa = await prisma.componenteInventario.findUniqueOrThrow({ where: { id: salsaId } });
    expect(Number(salsa.costoCompraVigente)).toBe(0.3111);
  });

  it('un componente que no alcanza no deja tanda, movimientos ni cambio de costo', async () => {
    const insuficiente = tandaBase({
      consumos: [
        { componenteId: e.harinaId, teorica: 600, usada: 700, costoUnitario: 2 },
        { componenteId: e.quesoId, teorica: 0, usada: 500, costoUnitario: 1 },
      ],
    });

    const err = await produccionRepository.registrarTanda(ctx, insuficiente).catch((x) => x);

    expect(err).toBeInstanceOf(ExistenciaInsuficienteError);
    expect(err).toMatchObject({ componenteId: e.quesoId, existencia: 100 });
    expect(await prisma.tandaProduccion.count()).toBe(0);
    expect(await prisma.movimientoStock.count()).toBe(0);
    expect(await existencia(e.harinaId)).toBe(1000);
    expect(await existencia(e.quesoId)).toBe(100);
    const salsa = await prisma.componenteInventario.findUniqueOrThrow({ where: { id: salsaId } });
    expect(salsa.costoCompraVigente).toBeNull();
  });

  it('un componente de la receta que no se usó se guarda con cantidad 0 y su teórica', async () => {
    const id = await produccionRepository.registrarTanda(
      ctx,
      tandaBase({
        consumos: [
          { componenteId: e.harinaId, teorica: 600, usada: 700, costoUnitario: 2 },
          { componenteId: e.quesoId, teorica: 50, usada: 0, costoUnitario: 1 },
        ],
      }),
    );

    expect(await existencia(e.quesoId)).toBe(100);
    const mov = await prisma.movimientoStock.findFirstOrThrow({
      where: { tandaId: id, tipo: 'CONSUMO_PRODUCCION', existencia: { componenteId: e.quesoId } },
    });
    expect(Number(mov.cantidad)).toBe(0);
    expect(Number(mov.cantidadTeorica)).toBe(-50);
    const fila = await produccionRepository.buscarTanda(e.restauranteId, e.sucursalId, id);
    expect(fila!.consumos).toContainEqual(
      expect.objectContaining({ componenteId: e.quesoId, usada: 0, teorica: 50 }),
    );
  });

  it('un consumo con usada y teórica en 0 no se guarda', async () => {
    const id = await produccionRepository.registrarTanda(
      ctx,
      tandaBase({
        consumos: [
          { componenteId: e.harinaId, teorica: 600, usada: 700, costoUnitario: 2 },
          { componenteId: e.quesoId, teorica: 0, usada: 0, costoUnitario: 1 },
        ],
      }),
    );

    expect(await prisma.movimientoStock.count({ where: { tandaId: id } })).toBe(2);
  });

  it('lee la tanda con magnitudes positivas', async () => {
    const id = await produccionRepository.registrarTanda(ctx, tandaBase());

    const fila = await produccionRepository.buscarTanda(e.restauranteId, e.sucursalId, id);

    expect(fila).toMatchObject({
      id,
      esperada: 5000,
      obtenida: 4500,
      costoUnitario: 0.3111,
      empleado: 'Cocinero de prueba',
      intermedio: { id: salsaId, nombre: 'Salsa' },
    });
    expect(fila!.consumos).toEqual([
      expect.objectContaining({
        componenteId: e.harinaId,
        teorica: 600,
        usada: 700,
        costoUnitario: 2,
      }),
    ]);
  });

  it('las tandas de otra sucursal o restaurante no aparecen', async () => {
    const id = await produccionRepository.registrarTanda(ctx, tandaBase());
    const otra = await prisma.sucursal.create({
      data: {
        restauranteId: e.restauranteId,
        nombre: 'Norte',
        direccion: 'Otra 456',
        horarioApertura: new Date('1970-01-01T12:00:00Z'),
        horarioCierre: new Date('1970-01-01T00:00:00Z'),
        toleranciaNoShowMin: 15,
      },
    });

    const propia = await produccionRepository.listarTandas(e.restauranteId, e.sucursalId, {
      pagina: 1,
    });
    const deOtraSucursal = await produccionRepository.listarTandas(e.restauranteId, otra.id, {
      pagina: 1,
    });
    const deOtroRestaurante = await produccionRepository.listarTandas(
      '00000000-0000-7000-8000-000000000000',
      e.sucursalId,
      { pagina: 1 },
    );

    expect(propia.total).toBe(1);
    expect(deOtraSucursal.filas).toEqual([]);
    expect(deOtroRestaurante.filas).toEqual([]);
    expect(await produccionRepository.buscarTanda(e.restauranteId, otra.id, id)).toBeNull();
  });
});
