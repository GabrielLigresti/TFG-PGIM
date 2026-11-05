import { prisma } from '../lib/prisma';
import { crearEscenario, limpiarBase, type Escenario } from '../test/db-setup';
import { pagosDelDiaRepository } from './pagos-del-dia.repository';

afterAll(() => prisma.$disconnect());

const FECHA = '2026-11-05';

describe('pagos del día (CU-23)', () => {
  let e: Escenario;

  beforeEach(async () => {
    await limpiarBase();
    e = await crearEscenario();
  });

  async function pago(
    escenario: Escenario,
    fecha: string,
    estado: 'APROBADO' | 'RECHAZADO' | 'PENDIENTE',
    extra: { monto?: number; comprobante?: string } = {},
  ) {
    const monto = extra.monto ?? 1500;
    const creado = await prisma.pago.create({
      data: {
        cuentaMesaId: escenario.cuentaMesaId,
        comensalId: escenario.comensalId,
        monto,
        estado,
        fecha: new Date(fecha),
        metodo: estado === 'APROBADO' ? 'TARJETA' : null,
      },
    });
    if (extra.comprobante) {
      await prisma.comprobante.create({
        data: {
          pagoId: creado.id,
          sucursalId: escenario.sucursalId,
          numero: extra.comprobante,
          total: monto,
        },
      });
    }
    return creado;
  }

  const delDia = (escenario: Escenario = e, fecha = FECHA) =>
    pagosDelDiaRepository.delDia(escenario.restauranteId, escenario.sucursalId, fecha);

  it('devuelve solo los resueltos, más nuevos primero', async () => {
    await pago(e, '2026-11-05T15:00:00Z', 'APROBADO', { comprobante: '0001' });
    await pago(e, '2026-11-05T16:00:00Z', 'RECHAZADO');
    await pago(e, '2026-11-05T17:00:00Z', 'PENDIENTE');

    const filas = await delDia();

    expect(filas.map((f) => f.estado)).toEqual(['RECHAZADO', 'APROBADO']);
    expect(filas[1]!).toMatchObject({
      mesaNumero: 4,
      comensalNombre: 'Comensal de prueba',
      monto: 1500,
      metodo: 'TARJETA',
      comprobanteNumero: '0001',
      fecha: '2026-11-05T15:00:00.000Z',
    });
    expect(typeof filas[1]!.monto).toBe('number');
    expect(filas[0]!.comprobanteNumero).toBeNull();
  });

  it('respeta el borde del día de Argentina (03:00 UTC)', async () => {
    await pago(e, '2026-11-05T02:30:00Z', 'APROBADO', { monto: 1 });
    await pago(e, '2026-11-05T03:10:00Z', 'APROBADO', { monto: 2 });
    await pago(e, '2026-11-06T02:59:00Z', 'APROBADO', { monto: 3 });
    await pago(e, '2026-11-06T03:00:00Z', 'APROBADO', { monto: 4 });

    const filas = await delDia();

    expect(filas.map((f) => f.monto)).toEqual([3, 2]);
  });

  it('no muestra pagos de otra sucursal ni de otro restaurante', async () => {
    // Otra sucursal del mismo restaurante, con su mesa, reserva, cuenta y pago.
    const otraSucursal = await prisma.sucursal.create({
      data: {
        restauranteId: e.restauranteId,
        nombre: 'Norte',
        direccion: 'Otra calle 456',
        horarioApertura: new Date('1970-01-01T12:00:00Z'),
        horarioCierre: new Date('1970-01-01T00:00:00Z'),
        toleranciaNoShowMin: 15,
      },
    });
    const otraMesa = await prisma.mesa.create({
      data: { sucursalId: otraSucursal.id, numero: 9, capacidad: 4, posX: 1, posY: 1 },
    });
    const reserva = await prisma.reserva.create({
      data: {
        sucursalId: otraSucursal.id,
        mesaId: otraMesa.id,
        comensalId: e.comensalId,
        inicio: new Date('2026-11-05T15:00:00Z'),
        cantidadPersonas: 2,
        modoAsignacion: 'MANUAL',
        estado: 'ACTIVA',
        cuentaMesa: { create: {} },
      },
      include: { cuentaMesa: true },
    });
    const deOtraSucursal: Escenario = {
      ...e,
      sucursalId: otraSucursal.id,
      cuentaMesaId: reserva.cuentaMesa!.id,
    };
    const deOtroRestaurante = await crearEscenario();

    await pago(e, '2026-11-05T15:00:00Z', 'APROBADO', { monto: 100 });
    await pago(deOtraSucursal, '2026-11-05T15:00:00Z', 'APROBADO', { monto: 200 });
    await pago(deOtroRestaurante, '2026-11-05T15:00:00Z', 'APROBADO', { monto: 300 });

    expect((await delDia()).map((f) => f.monto)).toEqual([100]);
    expect((await delDia(deOtraSucursal)).map((f) => f.monto)).toEqual([200]);
    expect((await delDia(deOtroRestaurante)).map((f) => f.monto)).toEqual([300]);
    // Mezclar restaurante y sucursal ajena tampoco devuelve nada.
    expect(
      await pagosDelDiaRepository.delDia(deOtroRestaurante.restauranteId, e.sucursalId, FECHA),
    ).toEqual([]);
  });
});
