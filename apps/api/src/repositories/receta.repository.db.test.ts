import { prisma } from '../lib/prisma';
import { crearEscenario, limpiarBase, type Escenario } from '../test/db-setup';
import { pedidoRepository } from './pedido.repository';
import { recetaRepository } from './receta.repository';

afterAll(() => prisma.$disconnect());

describe('recetaRepository: salir del stock', () => {
  let e: Escenario;
  let palermoId: string;
  let salsaId: string;

  const salsa = () => prisma.componenteInventario.findUniqueOrThrow({ where: { id: salsaId } });
  const poner = (sucursalId: string, cantidadActual: number) =>
    prisma.existencia.upsert({
      where: { sucursalId_componenteId: { sucursalId, componenteId: salsaId } },
      create: { sucursalId, componenteId: salsaId, cantidadActual },
      update: { cantidadActual },
    });

  beforeEach(async () => {
    await limpiarBase();
    e = await crearEscenario();
    const hora = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);
    palermoId = (
      await prisma.sucursal.create({
        data: {
          restauranteId: e.restauranteId,
          nombre: 'Palermo',
          direccion: 'Calle Falsa 456',
          horarioApertura: hora('12:00'),
          horarioCierre: hora('00:00'),
          toleranciaNoShowMin: 15,
        },
      })
    ).id;
    salsaId = (
      await prisma.componenteInventario.create({
        data: {
          restauranteId: e.restauranteId,
          tipo: 'INTERMEDIO',
          nombre: 'Salsa',
          unidadBase: 'GRAMO',
          llevaStock: true,
          costoCompraVigente: 3,
        },
      })
    ).id;
  });

  it('desactivarLlevaStock con existencia devuelve la sucursal y no escribe', async () => {
    await poner(e.sucursalId, 5);
    await poner(palermoId, 0);

    expect(await recetaRepository.desactivarLlevaStock(e.restauranteId, salsaId)).toEqual({
      ok: false,
      motivo: 'EXISTENCIAS',
      sucursales: [{ sucursal: 'Centro', cantidad: 5 }],
    });
    expect(await salsa()).toMatchObject({ llevaStock: true });
  });

  it('desactivarLlevaStock con todo en cero apaga la marca y limpia el costo', async () => {
    await poner(e.sucursalId, 0);

    expect(await recetaRepository.desactivarLlevaStock(e.restauranteId, salsaId)).toEqual({
      ok: true,
    });
    expect(await salsa()).toMatchObject({ llevaStock: false, costoCompraVigente: null });
  });

  it('desactivarIntermedio con existencia no da de baja; con todo en cero sí', async () => {
    await poner(palermoId, 2);

    expect(await recetaRepository.desactivarIntermedio(e.restauranteId, salsaId)).toEqual({
      ok: false,
      motivo: 'EXISTENCIAS',
      sucursales: [{ sucursal: 'Palermo', cantidad: 2 }],
    });
    expect(await salsa()).toMatchObject({ activo: true });

    await poner(palermoId, 0);
    expect(await recetaRepository.desactivarIntermedio(e.restauranteId, salsaId)).toEqual({
      ok: true,
    });
    expect(await salsa()).toMatchObject({ activo: false });
  });

  it('activarLlevaStock no activa un intermedio dado de baja', async () => {
    await prisma.componenteInventario.update({
      where: { id: salsaId },
      data: { llevaStock: false, activo: false },
    });

    expect(await recetaRepository.activarLlevaStock(e.restauranteId, salsaId, 3)).toBe(false);
    expect(await salsa()).toMatchObject({ llevaStock: false, activo: false });
  });

  it('activarLlevaStock activa un intermedio activo', async () => {
    await prisma.componenteInventario.update({
      where: { id: salsaId },
      data: { llevaStock: false },
    });

    expect(await recetaRepository.activarLlevaStock(e.restauranteId, salsaId, 4)).toBe(true);
    expect(await salsa()).toMatchObject({ llevaStock: true });
  });

  describe('con un pedido que descontó la masa', () => {
    const masa = () => prisma.componenteInventario.findUniqueOrThrow({ where: { id: e.masaId } });

    async function pedidoConMasa() {
      await prisma.componenteInventario.update({
        where: { id: e.masaId },
        data: { llevaStock: true, costoCompraVigente: 0.5 },
      });
      await prisma.existencia.create({
        data: { sucursalId: e.sucursalId, componenteId: e.masaId, cantidadActual: 100 },
      });
      const cuenta = (await pedidoRepository.buscarCuentaDelComensal(
        e.comensalId,
        e.cuentaMesaId,
      ))!;
      // La pizza consume 100 g de masa: la existencia queda en 0.
      return pedidoRepository.confirmar(cuenta, [
        {
          itemMenuId: e.pizzaId,
          cantidad: 1,
          precioUnitario: 1000,
          observaciones: null,
          insumos: new Map([
            [e.masaId, 100],
            [e.quesoId, 50],
          ]),
        },
      ]);
    }

    it('con el pedido confirmado no desactiva la marca ni da de baja', async () => {
      await pedidoConMasa();

      expect(await recetaRepository.desactivarLlevaStock(e.restauranteId, e.masaId)).toEqual({
        ok: false,
        motivo: 'PEDIDOS_CONFIRMADOS',
      });
      expect(await recetaRepository.desactivarIntermedio(e.restauranteId, e.masaId)).toEqual({
        ok: false,
        motivo: 'PEDIDOS_CONFIRMADOS',
      });
      expect(await masa()).toMatchObject({ llevaStock: true, activo: true });
    });

    it('con el pedido en preparación sí desactiva', async () => {
      const pedido = await pedidoConMasa();
      await prisma.pedido.update({ where: { id: pedido.id }, data: { estado: 'EN_PREPARACION' } });

      expect(await recetaRepository.desactivarLlevaStock(e.restauranteId, e.masaId)).toEqual({
        ok: true,
      });
      expect(await masa()).toMatchObject({ llevaStock: false });
    });
    it('con el pedido cancelado no bloquea', async () => {
      const pedido = await pedidoConMasa();
      expect(
        await pedidoRepository.cancelar(e.restauranteId, e.sucursalId, pedido.id, 'Prueba'),
      ).toBe(true);
      // Cancelar devuelve la masa a la existencia: se la deja en cero.
      await prisma.existencia.update({
        where: { sucursalId_componenteId: { sucursalId: e.sucursalId, componenteId: e.masaId } },
        data: { cantidadActual: 0 },
      });

      expect(await recetaRepository.desactivarLlevaStock(e.restauranteId, e.masaId)).toEqual({
        ok: true,
      });
      expect(await masa()).toMatchObject({ llevaStock: false });
    });

    it('con un pedido confirmado en otra sucursal del restaurante sí bloquea', async () => {
      await prisma.componenteInventario.update({
        where: { id: e.masaId },
        data: { llevaStock: true, costoCompraVigente: 0.5 },
      });
      const mesa = await prisma.mesa.create({
        data: { sucursalId: palermoId, numero: 1, capacidad: 4, posX: 10, posY: 10 },
      });
      const inicio = new Date();
      inicio.setUTCMinutes(0, 0, 0);
      const reserva = await prisma.reserva.create({
        data: {
          sucursalId: palermoId,
          mesaId: mesa.id,
          comensalId: e.comensalId,
          inicio,
          cantidadPersonas: 2,
          modoAsignacion: 'MANUAL',
          estado: 'ACTIVA',
          cuentaMesa: { create: {} },
        },
        include: { cuentaMesa: true },
      });
      await prisma.existencia.createMany({
        data: [
          { sucursalId: palermoId, componenteId: e.masaId, cantidadActual: 100 },
          { sucursalId: palermoId, componenteId: e.quesoId, cantidadActual: 100 },
        ],
      });
      const cuenta = (await pedidoRepository.buscarCuentaDelComensal(
        e.comensalId,
        reserva.cuentaMesa!.id,
      ))!;
      await pedidoRepository.confirmar(cuenta, [
        {
          itemMenuId: e.pizzaId,
          cantidad: 1,
          precioUnitario: 1000,
          observaciones: null,
          insumos: new Map([
            [e.masaId, 100],
            [e.quesoId, 50],
          ]),
        },
      ]);

      expect(await recetaRepository.desactivarLlevaStock(e.restauranteId, e.masaId)).toEqual({
        ok: false,
        motivo: 'PEDIDOS_CONFIRMADOS',
      });
      expect(await masa()).toMatchObject({ llevaStock: true });
    });
  });

  it('no mira otros restaurantes', async () => {
    await poner(e.sucursalId, 5);

    await expect(
      recetaRepository.desactivarLlevaStock('01900000-0000-7000-8000-0000000000ff', salsaId),
    ).rejects.toThrow();
    expect(await salsa()).toMatchObject({ llevaStock: true });
  });
});
