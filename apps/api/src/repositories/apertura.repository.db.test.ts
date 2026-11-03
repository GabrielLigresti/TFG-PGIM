import type { FilaPronostico } from '../domain/pronostico';
import { prisma } from '../lib/prisma';
import { crearEscenario, limpiarBase, type Escenario } from '../test/db-setup';
import { aperturaRepository } from './apertura.repository';

afterAll(() => prisma.$disconnect());

const SEMANA = '2026-11-09'; // lunes

const fila = (
  fecha: string,
  franja: 'ALMUERZO' | 'CENA',
  demanda: FilaPronostico['demanda'] = [],
  cubiertos = 10,
): FilaPronostico => ({
  fecha,
  franja,
  cubiertosEstimados: cubiertos,
  limiteInferior: 8,
  limiteSuperior: 12,
  ingresoEstimado: 1234.5,
  metodo: 'NAIVE_ESTACIONAL',
  errorMape: 12.34,
  demanda,
});

describe('apertura: pronósticos', () => {
  let e: Escenario;
  let tenant: { restauranteId: string; sucursalId: string };

  beforeEach(async () => {
    await limpiarBase();
    e = await crearEscenario();
    tenant = { restauranteId: e.restauranteId, sucursalId: e.sucursalId };
  });

  const contar = () => prisma.pronostico.count({ where: { sucursalId: e.sucursalId } });

  it('guarda y lee la semana ordenada, con nombres de ítem y números', async () => {
    const generado = await aperturaRepository.generarSiFalta(tenant, SEMANA, async () => [
      fila('2026-11-10', 'CENA'),
      fila('2026-11-09', 'CENA'),
      fila('2026-11-09', 'ALMUERZO', [{ itemMenuId: e.pizzaId, cantidad: 3 }]),
    ]);
    expect(generado).toBe(true);
    const r = await aperturaRepository.pronosticosDeSemana(e.restauranteId, e.sucursalId, SEMANA);
    expect(r.map((p) => `${p.fecha} ${p.franja}`)).toEqual([
      '2026-11-09 ALMUERZO',
      '2026-11-09 CENA',
      '2026-11-10 CENA',
    ]);
    expect(r[0]).toMatchObject({ ingresoEstimado: 1234.5, errorMape: 12.34 });
    expect(r[0]!.demanda).toEqual([{ itemMenuId: e.pizzaId, nombre: 'Pizza', cantidad: 3 }]);
  });

  it('no lee fuera de los 7 días de la semana', async () => {
    await aperturaRepository.generarSiFalta(tenant, SEMANA, async () => [
      fila('2026-11-08', 'CENA'),
      fila('2026-11-15', 'CENA'),
      fila('2026-11-16', 'CENA'),
    ]);
    const r = await aperturaRepository.pronosticosDeSemana(e.restauranteId, e.sucursalId, SEMANA);
    expect(r.map((p) => p.fecha)).toEqual(['2026-11-15']);
  });

  it('aísla entre restaurantes', async () => {
    await aperturaRepository.generarSiFalta(tenant, SEMANA, async () => [
      fila('2026-11-09', 'CENA'),
    ]);
    const otro = await crearEscenario();
    expect(
      await aperturaRepository.pronosticosDeSemana(otro.restauranteId, e.sucursalId, SEMANA),
    ).toEqual([]);
    await expect(
      aperturaRepository.generarSiFalta(
        { restauranteId: otro.restauranteId, sucursalId: e.sucursalId },
        '2026-11-16',
        async () => [fila('2026-11-16', 'CENA')],
      ),
    ).rejects.toThrow();
    expect(await contar()).toBe(1);
    expect(await aperturaRepository.historial(otro.restauranteId, e.sucursalId)).toMatchObject({
      reservas: [],
      horarios: [],
      items: [],
    });
    expect(
      await aperturaRepository.obtenerConfiguracion(otro.restauranteId, e.sucursalId),
    ).toBeNull();
  });

  it('regenerar reemplaza la semana sin duplicar y respeta otras semanas', async () => {
    await aperturaRepository.generarSiFalta(tenant, SEMANA, async () => [
      fila('2026-11-09', 'CENA', [{ itemMenuId: e.pizzaId, cantidad: 3 }]),
    ]);
    await aperturaRepository.generarSiFalta(tenant, '2026-11-16', async () => [
      fila('2026-11-16', 'CENA'),
    ]);
    await aperturaRepository.reemplazarSemana(tenant, SEMANA, async () => [
      fila('2026-11-09', 'CENA', [{ itemMenuId: e.aguaId, cantidad: 5 }], 20),
    ]);
    expect(await contar()).toBe(2);
    expect(await prisma.demandaItem.count()).toBe(1);
    const r = await aperturaRepository.pronosticosDeSemana(e.restauranteId, e.sucursalId, SEMANA);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ cubiertosEstimados: 20 });
    expect(r[0]!.demanda).toEqual([{ itemMenuId: e.aguaId, nombre: 'Agua', cantidad: 5 }]);
  });

  it('si calcular falla al regenerar, la semana queda como estaba', async () => {
    await aperturaRepository.generarSiFalta(tenant, SEMANA, async () => [
      fila('2026-11-09', 'CENA'),
    ]);
    await expect(
      aperturaRepository.reemplazarSemana(tenant, SEMANA, async () => {
        throw new Error('falla');
      }),
    ).rejects.toThrow('falla');
    expect(await contar()).toBe(1);
  });

  it('dos generarSiFalta en paralelo dejan una sola tanda', async () => {
    const calcular = jest.fn(async () => {
      await new Promise((r) => setTimeout(r, 200));
      return [fila('2026-11-09', 'ALMUERZO'), fila('2026-11-09', 'CENA')];
    });
    const [a, b] = await Promise.all([
      aperturaRepository.generarSiFalta(tenant, SEMANA, calcular),
      aperturaRepository.generarSiFalta(tenant, SEMANA, calcular),
    ]);
    expect([a, b].sort()).toEqual([false, true]);
    expect(calcular).toHaveBeenCalledTimes(1);
    expect(await contar()).toBe(2);
  });
});

describe('apertura: historial', () => {
  let e: Escenario;

  beforeEach(async () => {
    await limpiarBase();
    e = await crearEscenario();
  });

  const reservaCon = async (
    estadoReserva: 'FINALIZADA' | 'ACTIVA',
    estadoCuenta: 'CERRADA' | 'ABIERTA',
    pedidos: ('ENTREGADO' | 'CANCELADO')[],
    personas: number,
  ) => {
    const mesa = await prisma.mesa.findFirstOrThrow({ where: { sucursalId: e.sucursalId } });
    const r = await prisma.reserva.create({
      data: {
        sucursalId: e.sucursalId,
        mesaId: mesa.id,
        comensalId: e.comensalId,
        inicio: new Date('2026-10-01T15:00:00Z'),
        cantidadPersonas: personas,
        modoAsignacion: 'MANUAL',
        estado: estadoReserva,
        cuentaMesa: { create: { estado: estadoCuenta } },
      },
      include: { cuentaMesa: true },
    });
    for (const estado of pedidos) {
      await prisma.pedido.create({
        data: {
          cuentaMesaId: r.cuentaMesa!.id,
          sucursalId: e.sucursalId,
          numero: Math.floor(Math.random() * 1e9),
          estado,
          lineas: { create: [{ itemMenuId: e.pizzaId, cantidad: 2, precioUnitario: 1000 }] },
        },
      });
    }
  };

  it('solo cuenta reservas finalizadas con cuenta cerrada y pedidos entregados', async () => {
    await reservaCon('FINALIZADA', 'CERRADA', ['ENTREGADO', 'CANCELADO'], 4);
    await reservaCon('ACTIVA', 'CERRADA', ['ENTREGADO'], 5);
    await reservaCon('FINALIZADA', 'ABIERTA', ['ENTREGADO'], 6);
    // Reserva de la escenario (ACTIVA) tampoco entra.
    const h = await aperturaRepository.historial(e.restauranteId, e.sucursalId);
    expect(h.reservas).toEqual([
      {
        inicio: new Date('2026-10-01T15:00:00Z'),
        cantidadPersonas: 4,
        lineas: [{ itemMenuId: e.pizzaId, cantidad: 2 }],
      },
    ]);
  });

  it('devuelve horarios como HH:mm e ítems del menú activo con precio numérico', async () => {
    await prisma.horarioServicio.create({
      data: {
        sucursalId: e.sucursalId,
        franja: 'CENA',
        horaInicio: new Date('1970-01-01T20:00:00Z'),
        horaFin: new Date('1970-01-01T00:00:00Z'),
      },
    });
    await prisma.itemMenu.update({ where: { id: e.aguaId }, data: { activo: false } });
    const h = await aperturaRepository.historial(e.restauranteId, e.sucursalId);
    expect(h.horarios).toEqual([{ franja: 'CENA', horaInicio: '20:00', horaFin: '00:00' }]);
    expect(h.items).toEqual([{ id: e.pizzaId, nombre: 'Pizza', precio: 1000 }]);
  });

  it('lee y actualiza la configuración filtrando por restaurante', async () => {
    await prisma.configuracionApertura.create({
      data: { sucursalId: e.sucursalId, cubiertosPorMozo: 20, platosPorCocineroHora: 12 },
    });
    const nueva = { semanasHistoricoMinimo: 6, cubiertosPorMozo: 18.5, platosPorCocineroHora: 10 };
    expect(
      await aperturaRepository.actualizarConfiguracion(e.restauranteId, e.sucursalId, nueva),
    ).toEqual(nueva);
    const otro = await crearEscenario();
    expect(
      await aperturaRepository.actualizarConfiguracion(otro.restauranteId, e.sucursalId, {
        ...nueva,
        semanasHistoricoMinimo: 9,
      }),
    ).toBeNull();
    expect(await aperturaRepository.obtenerConfiguracion(e.restauranteId, e.sucursalId)).toEqual(
      nueva,
    );
  });
});
