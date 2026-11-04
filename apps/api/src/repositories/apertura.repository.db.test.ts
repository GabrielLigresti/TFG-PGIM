import { prisma } from '../lib/prisma';
import { crearEscenario, limpiarBase, type Escenario } from '../test/db-setup';
import { aperturaRepository } from './apertura.repository';

afterAll(() => prisma.$disconnect());

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
