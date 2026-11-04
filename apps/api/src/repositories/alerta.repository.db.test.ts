import type { TipoAlertaPanel } from '@pgim/shared';
import { prisma } from '../lib/prisma';
import { crearEscenario, limpiarBase, type Escenario } from '../test/db-setup';
import { alertaRepository } from './alerta.repository';

afterAll(() => prisma.$disconnect());

const TIPOS_STOCK: TipoAlertaPanel[] = ['STOCK_INSUFICIENTE', 'PLATO_SIN_RECETA'];

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
    expect(
      await alertaRepository.resolver(e.restauranteId, e.sucursalId, alerta!.id, TIPOS_STOCK),
    ).toBe(true);
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
    expect(
      await alertaRepository.listarSinResolver(e.restauranteId, e.sucursalId, TIPOS_STOCK),
    ).toHaveLength(1);
    expect(
      await alertaRepository.listarSinResolver(e.restauranteId, e.harinaId, TIPOS_STOCK),
    ).toEqual([]);
    expect(
      await alertaRepository.resolver(e.restauranteId, e.harinaId, alerta!.id, TIPOS_STOCK),
    ).toBe(false);
  });

  describe('inasistencia', () => {
    const inasistencia = async (inicio: Date) => {
      const reserva = await prisma.reserva.findUniqueOrThrow({ where: { id: e.reservaId } });
      return alertaRepository.crearInasistencia({ ...reserva, inicio });
    };

    beforeEach(async () => {
      await prisma.horarioServicio.createMany({
        data: [
          {
            sucursalId: e.sucursalId,
            franja: 'CENA',
            horaInicio: new Date('1970-01-01T20:00:00Z'),
            horaFin: new Date('1970-01-01T23:59:00Z'),
          },
        ],
      });
    });

    it('crea una alerta INFO con fecha y franja locales y el texto de la reserva', async () => {
      // 23:00 UTC = 20:00 en Argentina.
      const alerta = await inasistencia(new Date('2026-11-04T23:00:00Z'));
      expect(alerta).toMatchObject({
        tipo: 'INASISTENCIA',
        severidad: 'INFO',
        descripcion: 'Comensal de prueba no llegó a su reserva de las 20:00 h, mesa 4',
        insumo: null,
        plato: null,
      });
      const fila = await prisma.alerta.findFirstOrThrow({ where: { id: alerta!.id } });
      expect(fila.franja).toBe('CENA');
      expect(fila.fechaServicio?.toISOString()).toBe('2026-11-04T00:00:00.000Z');
    });

    it('deja la franja vacía si la hora no cae en ninguna', async () => {
      const alerta = await inasistencia(new Date('2026-11-04T15:00:00Z')); // 12:00 local
      const fila = await prisma.alerta.findFirstOrThrow({ where: { id: alerta!.id } });
      expect(fila.franja).toBeNull();
      expect(fila.fechaServicio).toBeNull();
    });

    it('resolver con un tipo fuera de la lista no la toca y responde como inexistente', async () => {
      const alerta = await inasistencia(new Date('2026-11-04T23:00:00Z'));
      const stock = ['STOCK_INSUFICIENTE', 'PLATO_SIN_RECETA'] as const;
      expect(
        await alertaRepository.resolver(e.restauranteId, e.sucursalId, alerta!.id, [...stock]),
      ).toBe(false);
      expect(
        await alertaRepository.listarSinResolver(e.restauranteId, e.sucursalId, [...stock]),
      ).toEqual([]);
      expect(
        await alertaRepository.listarSinResolver(e.restauranteId, e.sucursalId, ['INASISTENCIA']),
      ).toHaveLength(1);
      expect(
        await alertaRepository.resolver(e.restauranteId, e.sucursalId, alerta!.id, [
          'INASISTENCIA',
        ]),
      ).toBe(true);
    });

    it('filtra por tenant', async () => {
      const alerta = await inasistencia(new Date('2026-11-04T23:00:00Z'));
      const otro = await prisma.restaurante.create({ data: { nombre: 'Otro', cuit: 'otro-2' } });
      expect(
        await alertaRepository.listarSinResolver(otro.id, e.sucursalId, ['INASISTENCIA']),
      ).toEqual([]);
      expect(
        await alertaRepository.resolver(otro.id, e.sucursalId, alerta!.id, ['INASISTENCIA']),
      ).toBe(false);
    });
  });

  it('un plato de otro restaurante no genera alertas en esta sucursal', async () => {
    const otro = await prisma.restaurante.create({ data: { nombre: 'Otro', cuit: 'otro-cuit' } });
    const categoria = await prisma.categoria.create({
      data: { restauranteId: otro.id, nombre: 'Varios' },
    });
    const ajeno = await prisma.itemMenu.create({
      data: { restauranteId: otro.id, categoriaId: categoria.id, nombre: 'Ajeno', precio: 1 },
    });
    await expect(
      alertaRepository.crearSiNoHay({
        sucursalId: e.sucursalId,
        tipo: 'PLATO_SIN_RECETA',
        itemMenuId: ajeno.id,
      }),
    ).rejects.toThrow();
    expect(await prisma.alerta.count()).toBe(0);
  });
});
