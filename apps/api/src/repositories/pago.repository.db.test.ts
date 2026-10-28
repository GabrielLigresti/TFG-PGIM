import type { Prisma } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';
import { validarBeneficioElegido } from '../services/pago.service';
import { crearEscenario, limpiarBase, type Escenario } from '../test/db-setup';
import { cuentaMesaRepository } from './cuenta-mesa.repository';
import { contextoMesa } from './elegibilidad';
import { pagoRepository } from './pago.repository';
import { pedidoRepository } from './pedido.repository';

afterAll(() => prisma.$disconnect());

let e: Escenario;

beforeEach(async () => {
  await limpiarBase();
  e = await crearEscenario();
});

const AHORA = () => new Date();
const validar = validarBeneficioElegido(AHORA);

// Un pedido de agua (sin receta) por el precio pedido, en la cuenta indicada.
async function pedir(cuentaMesaId: string, comensalId: string, precio: number) {
  const cuenta = (await pedidoRepository.buscarCuentaDelComensal(comensalId, cuentaMesaId))!;
  await pedidoRepository.confirmar(cuenta, [
    {
      itemMenuId: e.aguaId,
      cantidad: 1,
      precioUnitario: precio,
      observaciones: null,
      insumos: new Map(),
    },
  ]);
}

// Otra mesa activa en la misma sucursal, de otro comensal.
async function otraMesa(): Promise<{ comensalId: string; cuentaMesaId: string }> {
  const mesa = await prisma.mesa.create({
    data: { sucursalId: e.sucursalId, numero: 9, capacidad: 2, posX: 50, posY: 50 },
  });
  const usuario = await prisma.usuario.create({
    data: {
      email: `otro-${Date.now()}@prueba.test`,
      passwordHash: 'x',
      tipo: 'COMENSAL',
      comensal: { create: { nombre: 'Otro comensal' } },
    },
  });
  const inicio = new Date();
  inicio.setUTCMinutes(0, 0, 0);
  const reserva = await prisma.reserva.create({
    data: {
      sucursalId: e.sucursalId,
      mesaId: mesa.id,
      comensalId: usuario.id,
      inicio,
      cantidadPersonas: 2,
      modoAsignacion: 'MANUAL',
      estado: 'ACTIVA',
      cuentaMesa: { create: {} },
    },
    include: { cuentaMesa: true },
  });
  return { comensalId: usuario.id, cuentaMesaId: reserva.cuentaMesa!.id };
}

function crearBeneficio(datos: Partial<Prisma.BeneficioUncheckedCreateInput> = {}) {
  return prisma.beneficio.create({
    data: {
      restauranteId: e.restauranteId,
      nombre: 'Promo de prueba',
      clase: 'PROMOCION',
      menuId: e.menuId,
      tipoDescuento: 'PORCENTAJE',
      valor: 10,
      vigenciaDesde: new Date(Date.now() - 86_400_000),
      vigenciaHasta: new Date(Date.now() + 86_400_000),
      ...datos,
    },
  });
}

const programa = () =>
  prisma.programaFidelidad.create({
    data: { restauranteId: e.restauranteId, puntosPorUnidad: 0.01 },
  });

const crear = (datos: { cuentaMesaId?: string; comensalId?: string; beneficioId?: string } = {}) =>
  pagoRepository.crearPendiente(
    {
      comensalId: datos.comensalId ?? e.comensalId,
      cuentaMesaId: datos.cuentaMesaId ?? e.cuentaMesaId,
      beneficioId: datos.beneficioId ?? null,
      ahora: AHORA(),
    },
    validar,
  );

const aprobar = (pagoId: string) =>
  pagoRepository.resolver(pagoId, {
    estado: 'APROBADO',
    referenciaExterna: `MP-${pagoId}`,
    metodo: 'BILLETERA_VIRTUAL',
  });

describe('pagoRepository.crearPendiente', () => {
  it('crea un pago pendiente por el saldo y no deja abrir otro', async () => {
    await pedir(e.cuentaMesaId, e.comensalId, 600);
    const r = await crear();
    expect(r).toMatchObject({ resultado: 'CREADO', monto: 600, sucursalId: e.sucursalId });
    // El medio lo elige el comensal en Mercado Pago: hasta aprobarse, sin medio.
    expect((await prisma.pago.findFirstOrThrow()).metodo).toBeNull();
    expect(await crear()).toEqual({
      resultado: 'EN_CURSO',
      pagoId: (r as { pagoId: string }).pagoId,
    });
    expect(await prisma.pago.count()).toBe(1);
  });

  it('sin saldo no crea el pago; una mesa cerrada tampoco', async () => {
    expect(await crear()).toEqual({ resultado: 'SIN_SALDO' });
    await pedir(e.cuentaMesaId, e.comensalId, 600);
    await prisma.cuentaMesa.update({ where: { id: e.cuentaMesaId }, data: { estado: 'CERRADA' } });
    expect(await crear()).toEqual({ resultado: 'CERRADA' });
    expect(await prisma.pago.count()).toBe(0);
  });

  it('aplica el descuento del beneficio y reserva su stock', async () => {
    await pedir(e.cuentaMesaId, e.comensalId, 20000);
    const b = await crearBeneficio({ stockInicial: 3, stockDisponible: 3 });
    expect(await crear({ beneficioId: b.id })).toMatchObject({ resultado: 'CREADO', monto: 18000 });
    expect(await prisma.beneficioAplicado.findFirstOrThrow()).toMatchObject({
      beneficioId: b.id,
    });
    expect(
      (await prisma.beneficio.findUniqueOrThrow({ where: { id: b.id } })).stockDisponible,
    ).toBe(2);
  });

  it('el descuento de un pago aprobado también cubre el saldo', async () => {
    await pedir(e.cuentaMesaId, e.comensalId, 20000);
    const b = await crearBeneficio({ valor: 50 });
    const { pagoId } = (await crear({ beneficioId: b.id })) as { pagoId: string };
    await aprobar(pagoId);

    expect(await crear()).toEqual({ resultado: 'SIN_SALDO' });
    const mesa = await cuentaMesaRepository.buscarDelComensal(e.comensalId, e.cuentaMesaId);
    expect(mesa).toMatchObject({ pagado: 10000, descuentos: 10000 });
    expect(await contextoMesa(prisma, e.comensalId, e.cuentaMesaId)).toMatchObject({ saldo: 0 });
  });

  it('la última unidad de un beneficio se la lleva un solo pago', async () => {
    const otra = await otraMesa();
    await pedir(e.cuentaMesaId, e.comensalId, 1000);
    await pedir(otra.cuentaMesaId, otra.comensalId, 1000);
    const b = await crearBeneficio({ stockInicial: 1, stockDisponible: 1 });

    const resultados = await Promise.all([
      crear({ beneficioId: b.id }),
      crear({ beneficioId: b.id, ...otra }),
    ]);
    expect(resultados.map((r) => r.resultado).sort()).toEqual(['BENEFICIO_AGOTADO', 'CREADO']);
    expect(
      (await prisma.beneficio.findUniqueOrThrow({ where: { id: b.id } })).stockDisponible,
    ).toBe(0);
    expect(await prisma.pago.count()).toBe(1);
  });

  it('si la mesa ya usó un beneficio en un pago aprobado, no se aplica otro', async () => {
    await pedir(e.cuentaMesaId, e.comensalId, 1000);
    const b = await crearBeneficio();
    const primero = await crear({ beneficioId: b.id });
    await aprobar((primero as { pagoId: string }).pagoId);
    await pedir(e.cuentaMesaId, e.comensalId, 500);
    expect(await crear({ beneficioId: b.id })).toEqual({ resultado: 'BENEFICIO_NO_DISPONIBLE' });
  });

  it('una promoción de otro menú no se aplica', async () => {
    await pedir(e.cuentaMesaId, e.comensalId, 1000);
    const otroMenu = await prisma.menu.create({
      data: { restauranteId: e.restauranteId, nombre: 'Otro', vigenciaDesde: new Date() },
    });
    const b = await crearBeneficio({ menuId: otroMenu.id });
    expect(await crear({ beneficioId: b.id })).toEqual({ resultado: 'BENEFICIO_NO_DISPONIBLE' });
  });
});

describe('pagoRepository.resolver', () => {
  it('al aprobar acredita puntos y monto y emite el comprobante de la sucursal', async () => {
    await programa();
    await pedir(e.cuentaMesaId, e.comensalId, 20000);
    const b = await crearBeneficio();
    const { pagoId } = (await crear({ beneficioId: b.id })) as { pagoId: string };

    expect(await aprobar(pagoId)).toMatchObject({
      estado: 'APROBADO',
      pagoId,
      sucursalId: e.sucursalId,
      comensalId: e.comensalId,
      puntosSumados: 180,
    });
    expect(await prisma.pago.findUniqueOrThrow({ where: { id: pagoId } })).toMatchObject({
      estado: 'APROBADO',
      referenciaExterna: `MP-${pagoId}`,
      metodo: 'BILLETERA_VIRTUAL',
    });
    const cuenta = await prisma.cuentaFidelidad.findFirstOrThrow({
      include: { movimientos: true },
    });
    expect(cuenta.puntos).toBe(180);
    expect(Number(cuenta.montoAcumulado)).toBe(18000);
    expect(cuenta.movimientos).toEqual([
      expect.objectContaining({ tipo: 'ACREDITACION', puntos: 180, pagoId }),
    ]);
    expect(await prisma.comprobante.findFirstOrThrow()).toMatchObject({
      pagoId,
      sucursalId: e.sucursalId,
      numero: 'C-000001',
    });
  });

  it('dos notificaciones iguales al mismo tiempo acreditan una sola vez', async () => {
    await programa();
    await pedir(e.cuentaMesaId, e.comensalId, 20000);
    const { pagoId } = (await crear()) as { pagoId: string };

    const resultados = await Promise.all([aprobar(pagoId), aprobar(pagoId)]);
    expect(resultados.filter((r) => r === null)).toHaveLength(1);
    expect(await prisma.movimientoPuntos.count()).toBe(1);
    expect(await prisma.comprobante.count()).toBe(1);
    expect((await prisma.cuentaFidelidad.findFirstOrThrow()).puntos).toBe(200);
  });

  it('una recompensa por puntos descuenta los puntos del saldo', async () => {
    await programa();
    await prisma.cuentaFidelidad.create({
      data: { comensalId: e.comensalId, restauranteId: e.restauranteId, puntos: 500 },
    });
    await pedir(e.cuentaMesaId, e.comensalId, 10000);
    const b = await crearBeneficio({
      clase: 'RECOMPENSA',
      menuId: null,
      criterioTipo: 'PUNTOS',
      criterioValor: 300,
    });
    const { pagoId } = (await crear({ beneficioId: b.id })) as { pagoId: string };
    await aprobar(pagoId);

    const cuenta = await prisma.cuentaFidelidad.findFirstOrThrow({
      include: { movimientos: true },
    });
    expect(cuenta.puntos).toBe(500 - 300 + 90);
    expect(cuenta.movimientos.map((m) => [m.tipo, m.puntos]).sort()).toEqual([
      ['ACREDITACION', 90],
      ['CANJE', -300],
    ]);
  });

  it('al rechazar devuelve exactamente la unidad reservada', async () => {
    await pedir(e.cuentaMesaId, e.comensalId, 1000);
    const b = await crearBeneficio({ stockInicial: 2, stockDisponible: 2 });
    const { pagoId } = (await crear({ beneficioId: b.id })) as { pagoId: string };

    expect(await pagoRepository.resolver(pagoId, { estado: 'RECHAZADO' })).toMatchObject({
      estado: 'RECHAZADO',
      puntosSumados: 0,
    });
    expect(
      (await prisma.beneficio.findUniqueOrThrow({ where: { id: b.id } })).stockDisponible,
    ).toBe(2);
    expect(await pagoRepository.resolver(pagoId, { estado: 'RECHAZADO' })).toBeNull();
    expect(
      (await prisma.beneficio.findUniqueOrThrow({ where: { id: b.id } })).stockDisponible,
    ).toBe(2);
  });

  it('dos aprobaciones simultáneas de la misma sucursal reciben números distintos', async () => {
    const otra = await otraMesa();
    await pedir(e.cuentaMesaId, e.comensalId, 1000);
    await pedir(otra.cuentaMesaId, otra.comensalId, 1000);
    const a = (await crear()) as { pagoId: string };
    const b = (await crear(otra)) as { pagoId: string };

    await Promise.all([aprobar(a.pagoId), aprobar(b.pagoId)]);
    const numeros = (await prisma.comprobante.findMany()).map((c) => c.numero).sort();
    expect(numeros).toEqual(['C-000001', 'C-000002']);
  });

  it('sin programa de puntos acredita el monto pero no puntos', async () => {
    await pedir(e.cuentaMesaId, e.comensalId, 1000);
    const { pagoId } = (await crear()) as { pagoId: string };
    expect(await aprobar(pagoId)).toMatchObject({ puntosSumados: 0 });
    const cuenta = await prisma.cuentaFidelidad.findFirstOrThrow();
    expect(Number(cuenta.montoAcumulado)).toBe(1000);
    expect(cuenta.puntos).toBe(0);
    expect(await prisma.movimientoPuntos.count()).toBe(0);
  });
});

describe('pagoRepository, consultas', () => {
  it('un pago pendiente se puede retomar solo por su comensal, y uno resuelto no', async () => {
    await pedir(e.cuentaMesaId, e.comensalId, 1000);
    const { pagoId } = (await crear()) as { pagoId: string };
    expect(await pagoRepository.pendienteDelComensal(e.comensalId, pagoId)).toMatchObject({
      pagoId,
      monto: 1000,
      mesaNumero: 4,
    });
    const otra = await otraMesa();
    expect(await pagoRepository.pendienteDelComensal(otra.comensalId, pagoId)).toBeNull();
    await aprobar(pagoId);
    expect(await pagoRepository.pendienteDelComensal(e.comensalId, pagoId)).toBeNull();
    expect(await pagoRepository.buscar(pagoId)).toEqual({
      estado: 'APROBADO',
      referenciaExterna: `MP-${pagoId}`,
    });
  });

  it('lista los pendientes anteriores al límite', async () => {
    await pedir(e.cuentaMesaId, e.comensalId, 1000);
    const { pagoId } = (await crear()) as { pagoId: string };
    expect(await pagoRepository.pendientesVencidos(new Date(Date.now() - 60_000))).toEqual([]);
    expect(await pagoRepository.pendientesVencidos(new Date(Date.now() + 60_000))).toEqual([
      pagoId,
    ]);
  });

  it('el estado de un pago aprobado trae el comprobante, y solo para su comensal', async () => {
    await programa();
    await pedir(e.cuentaMesaId, e.comensalId, 20000);
    const b = await crearBeneficio();
    const { pagoId } = (await crear({ beneficioId: b.id })) as { pagoId: string };
    await aprobar(pagoId);

    expect(await pagoRepository.estadoDelComensal(e.comensalId, pagoId)).toMatchObject({
      pagoId,
      estado: 'APROBADO',
      monto: 18000,
      puntosSumados: 180,
      comprobante: {
        numero: 'C-000001',
        total: 18000,
        descuento: 2000,
        beneficio: 'Promo de prueba',
      },
    });
    const otra = await otraMesa();
    expect(await pagoRepository.estadoDelComensal(otra.comensalId, pagoId)).toBeNull();
  });
});
