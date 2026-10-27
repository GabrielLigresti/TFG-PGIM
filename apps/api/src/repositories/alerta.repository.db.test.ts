import { prisma } from '../lib/prisma';
import { crearEscenario, limpiarBase, type Escenario } from '../test/db-setup';
import { alertaRepository } from './alerta.repository';

afterAll(() => prisma.$disconnect());

let e: Escenario;

beforeEach(async () => {
  await limpiarBase();
  e = await crearEscenario();
});

describe('alertaRepository', () => {
  const sinStock = () =>
    alertaRepository.crearSiNoHay({
      sucursalId: e.sucursalId,
      tipo: 'STOCK_INSUFICIENTE',
      componenteId: e.quesoId,
      itemMenuId: e.pizzaId,
    });

  it('no repite una alerta igual sin resolver', async () => {
    const primera = await sinStock();
    expect(primera).toMatchObject({
      tipo: 'STOCK_INSUFICIENTE',
      severidad: 'CRITICA',
      descripcion: 'No alcanzó Queso para Pizza',
      insumo: { id: e.quesoId, nombre: 'Queso' },
      plato: { id: e.pizzaId, nombre: 'Pizza' },
    });
    expect(await sinStock()).toBeNull();
  });

  it('una vez resuelta, se puede volver a crear', async () => {
    const alerta = await sinStock();
    expect(await alertaRepository.resolver(e.restauranteId, e.sucursalId, alerta!.id)).toBe(true);
    expect(await sinStock()).not.toBeNull();
  });

  it('crea en 0 la existencia que faltaba', async () => {
    await prisma.existencia.deleteMany({ where: { componenteId: e.quesoId } });
    expect(await sinStock()).not.toBeNull();
    const existencia = await prisma.existencia.findFirstOrThrow({
      where: { componenteId: e.quesoId },
    });
    expect(Number(existencia.cantidadActual)).toBe(0);
  });

  it('un plato sin receta genera una advertencia', async () => {
    const alerta = await alertaRepository.crearSiNoHay({
      sucursalId: e.sucursalId,
      tipo: 'PLATO_SIN_RECETA',
      itemMenuId: e.aguaId,
    });
    expect(alerta).toMatchObject({
      severidad: 'ADVERTENCIA',
      descripcion: 'Agua se pidió sin receta: no descontó stock',
      insumo: null,
    });
  });

  it('lista las sin resolver de la sucursal y no resuelve las de otra', async () => {
    const alerta = await sinStock();
    expect(await alertaRepository.listarSinResolver(e.restauranteId, e.sucursalId)).toHaveLength(1);
    expect(await alertaRepository.listarSinResolver(e.restauranteId, e.harinaId)).toEqual([]);
    expect(await alertaRepository.resolver(e.restauranteId, e.harinaId, alerta!.id)).toBe(false);
  });
});
