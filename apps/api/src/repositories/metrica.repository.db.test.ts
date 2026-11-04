import { prisma } from '../lib/prisma';
import { crearEscenario, limpiarBase, type Escenario } from '../test/db-setup';
import { createMetricaService, type ContextoMetricas } from '../services/metrica.service';
import { aperturaRepository } from './apertura.repository';
import { metricaRepository } from './metrica.repository';

afterAll(() => prisma.$disconnect());

// Miércoles: la semana siguiente arranca el lunes 2026-11-09.
const AHORA = new Date('2026-11-04T15:00:00Z');
const PERIODO = { desde: '2026-10-01', hasta: '2026-10-07' }; // 7 días
const hora = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);
const servicio = createMetricaService(metricaRepository, aperturaRepository);

describe('métricas (CU-19)', () => {
  let e: Escenario;
  let ctx: ContextoMetricas;
  let numeroPedido: number;

  beforeEach(async () => {
    await limpiarBase();
    e = await crearEscenario();
    numeroPedido = 0;
    ctx = {
      restauranteId: e.restauranteId,
      permisos: ['metrica.ver'],
      sucursales: [{ id: e.sucursalId, nombre: 'Centro' }],
    };
  });

  const consultar = (c: ContextoMetricas = ctx, sucursalId?: string) =>
    servicio.consultar(c, { ...PERIODO, sucursalId }, AHORA);

  async function pago(monto: number, fecha: string, estado: 'APROBADO' | 'PENDIENTE' = 'APROBADO') {
    await prisma.pago.create({
      data: {
        cuentaMesaId: e.cuentaMesaId,
        comensalId: e.comensalId,
        monto,
        estado,
        fecha: new Date(fecha),
        metodo: estado === 'APROBADO' ? 'BILLETERA_VIRTUAL' : null,
      },
    });
  }

  async function pedido(
    lineas: { itemMenuId: string; cantidad: number; precioUnitario: number }[],
    estado: 'ENTREGADO' | 'CONFIRMADO' = 'ENTREGADO',
    creadoEn = '2026-10-02T15:00:00Z',
    escenario: Escenario = e,
  ) {
    await prisma.pedido.create({
      data: {
        cuentaMesaId: escenario.cuentaMesaId,
        sucursalId: escenario.sucursalId,
        numero: ++numeroPedido,
        estado,
        creadoEn: new Date(creadoEn),
        lineas: { create: lineas },
      },
    });
  }

  async function merma(
    motivo: 'VENCIMIENTO' | 'DETERIORO',
    cantidad: number,
    costoUnitario: number,
    fecha = '2026-10-02T15:00:00Z',
    escenario: Escenario = e,
    tipo: 'MERMA' | 'INGRESO' = 'MERMA',
  ) {
    const existencia = await prisma.existencia.findFirstOrThrow({
      where: { sucursalId: escenario.sucursalId, componenteId: escenario.harinaId },
    });
    await prisma.movimientoStock.create({
      data: {
        existenciaId: existencia.id,
        tipo,
        // Como el stock real: una merma resta, así que se guarda con signo negativo.
        cantidad: tipo === 'MERMA' ? -cantidad : cantidad,
        costoUnitario,
        fecha: new Date(fecha),
        motivoMerma: tipo === 'MERMA' ? motivo : null,
      },
    });
  }

  async function reservaFinalizada(
    sucursalId: string,
    inicio: string,
    personas: number,
    estado: 'FINALIZADA' | 'CANCELADA' = 'FINALIZADA',
    cuenta?: 'CERRADA',
  ) {
    const mesa = await prisma.mesa.findFirstOrThrow({ where: { sucursalId } });
    await prisma.reserva.create({
      data: {
        sucursalId,
        mesaId: mesa.id,
        comensalId: e.comensalId,
        inicio: new Date(inicio),
        cantidadPersonas: personas,
        modoAsignacion: 'MANUAL',
        estado,
        ...(cuenta && { cuentaMesa: { create: { estado: cuenta } } }),
      },
    });
  }

  async function sucursalNueva(nombre: string, conMesa = true) {
    const s = await prisma.sucursal.create({
      data: {
        restauranteId: e.restauranteId,
        nombre,
        direccion: 'Otra 1',
        barrio: 'SAN_NICOLAS',
        horarioApertura: hora('12:00'),
        horarioCierre: hora('00:00'),
        toleranciaNoShowMin: 15,
      },
    });
    if (conMesa) {
      await prisma.mesa.create({
        data: { sucursalId: s.id, numero: 1, capacidad: 4, posX: 1, posY: 1 },
      });
    }
    await prisma.horarioServicio.create({
      data: {
        sucursalId: s.id,
        franja: 'ALMUERZO',
        horaInicio: hora('12:00'),
        horaFin: hora('16:00'),
      },
    });
    return s;
  }

  describe('ventas', () => {
    it('cuenta solo pagos APROBADO dentro del período, por día de Argentina', async () => {
      await pago(1000, '2026-10-02T15:00:00Z');
      await pago(500.5, '2026-10-02T20:00:00Z');
      await pago(250, '2026-10-03T12:00:00Z');
      await pago(999, '2026-10-02T15:00:00Z', 'PENDIENTE');
      await pago(4000, '2026-10-20T15:00:00Z');
      // 02:00 UTC del día 8 todavía es el día 7 en Argentina.
      await pago(100, '2026-10-08T02:00:00Z');
      const { ventas } = await consultar();
      expect(ventas).toEqual({
        total: 1850.5,
        porDia: [
          { fecha: '2026-10-02', monto: 1500.5 },
          { fecha: '2026-10-03', monto: 250 },
          { fecha: '2026-10-07', monto: 100 },
        ],
      });
    });
  });

  describe('platos y margen', () => {
    it('cuenta solo pedidos ENTREGADO, calcula el margen y deja los platos sin costo al final', async () => {
      const harina = await prisma.componenteInventario.findFirstOrThrow({
        where: { id: e.harinaId },
      });
      const categoria = await prisma.categoria.findFirstOrThrow({
        where: { restauranteId: e.restauranteId },
      });
      // Rendimiento 4: 400 g de harina a $2 el gramo son $800 en total, $200 por porción.
      const tarta = await prisma.itemMenu.create({
        data: {
          restauranteId: e.restauranteId,
          categoriaId: categoria.id,
          nombre: 'Tarta',
          precio: 500,
          receta: {
            create: {
              rendimiento: 4,
              lineas: { create: [{ componenteId: harina.id, cantidad: 400, unidad: 'GRAMO' }] },
            },
          },
        },
      });
      // Reventa: el costo vigente del insumo es el costo por unidad.
      const gaseosaInsumo = await prisma.componenteInventario.create({
        data: {
          restauranteId: e.restauranteId,
          tipo: 'INSUMO',
          nombre: 'Gaseosa',
          unidadBase: 'UNIDAD',
          costoCompraVigente: 80,
        },
      });
      const gaseosa = await prisma.itemMenu.create({
        data: {
          restauranteId: e.restauranteId,
          categoriaId: categoria.id,
          nombre: 'Gaseosa',
          precio: 150,
          insumoId: gaseosaInsumo.id,
        },
      });
      await pedido([
        { itemMenuId: e.pizzaId, cantidad: 2, precioUnitario: 1000 },
        { itemMenuId: e.pizzaId, cantidad: 1, precioUnitario: 1200 },
        { itemMenuId: tarta.id, cantidad: 4, precioUnitario: 500 },
        { itemMenuId: e.aguaId, cantidad: 2, precioUnitario: 300 },
        { itemMenuId: gaseosa.id, cantidad: 5, precioUnitario: 150 },
      ]);
      // No cuentan: pedido sin entregar y pedido fuera del período.
      await pedido([{ itemMenuId: e.pizzaId, cantidad: 50, precioUnitario: 1000 }], 'CONFIRMADO');
      await pedido(
        [{ itemMenuId: e.pizzaId, cantidad: 50, precioUnitario: 1000 }],
        'ENTREGADO',
        '2026-10-20T15:00:00Z',
      );

      const m = await consultar();
      expect(m.platosMasPedidos).toEqual([
        { itemMenuId: gaseosa.id, nombre: 'Gaseosa', unidades: 5 },
        { itemMenuId: tarta.id, nombre: 'Tarta', unidades: 4 },
        { itemMenuId: e.pizzaId, nombre: 'Pizza', unidades: 3 },
        { itemMenuId: e.aguaId, nombre: 'Agua', unidades: 2 },
      ]);
      // Pizza: masa a $1 el gramo × 100 g = $100 (el queso no tiene costo cargado).
      expect(m.margenPorPlato).toEqual([
        {
          itemMenuId: e.pizzaId,
          nombre: 'Pizza',
          unidades: 3,
          precioPromedio: 1066.67,
          costo: 100,
          margenUnitario: 966.67,
          margenTotal: 2900,
        },
        {
          itemMenuId: tarta.id,
          nombre: 'Tarta',
          unidades: 4,
          precioPromedio: 500,
          costo: 200,
          margenUnitario: 300,
          margenTotal: 1200,
        },
        {
          itemMenuId: gaseosa.id,
          nombre: 'Gaseosa',
          unidades: 5,
          precioPromedio: 150,
          costo: 80,
          margenUnitario: 70,
          margenTotal: 350,
        },
        {
          itemMenuId: e.aguaId,
          nombre: 'Agua',
          unidades: 2,
          precioPromedio: 300,
          costo: null,
          margenUnitario: null,
          margenTotal: null,
        },
      ]);
    });

    it('un plato de reventa sin costo cargado queda sin dato', async () => {
      const categoria = await prisma.categoria.findFirstOrThrow({
        where: { restauranteId: e.restauranteId },
      });
      const insumo = await prisma.componenteInventario.create({
        data: {
          restauranteId: e.restauranteId,
          tipo: 'INSUMO',
          nombre: 'Alfajor',
          unidadBase: 'UNIDAD',
        },
      });
      const alfajor = await prisma.itemMenu.create({
        data: {
          restauranteId: e.restauranteId,
          categoriaId: categoria.id,
          nombre: 'Alfajor',
          precio: 200,
          insumoId: insumo.id,
        },
      });
      await pedido([{ itemMenuId: alfajor.id, cantidad: 3, precioUnitario: 200 }]);
      const { margenPorPlato } = await consultar();
      expect(margenPorPlato[0]).toMatchObject({
        costo: null,
        margenUnitario: null,
        margenTotal: null,
      });
    });

    it('los platos más pedidos son 10', async () => {
      const categoria = await prisma.categoria.findFirstOrThrow({
        where: { restauranteId: e.restauranteId },
      });
      const lineas = [];
      for (let k = 1; k <= 12; k++) {
        const item = await prisma.itemMenu.create({
          data: {
            restauranteId: e.restauranteId,
            categoriaId: categoria.id,
            nombre: `Plato ${k}`,
            precio: 100,
          },
        });
        lineas.push({ itemMenuId: item.id, cantidad: k, precioUnitario: 100 });
      }
      await pedido(lineas);
      const { platosMasPedidos } = await consultar();
      expect(platosMasPedidos).toHaveLength(10);
      expect(platosMasPedidos[0]).toMatchObject({ nombre: 'Plato 12', unidades: 12 });
      expect(platosMasPedidos[9]).toMatchObject({ nombre: 'Plato 3', unidades: 3 });
    });
  });

  describe('merma', () => {
    it('valora cantidad × costo por motivo y no cuenta otros movimientos', async () => {
      await merma('VENCIMIENTO', 10, 2);
      await merma('VENCIMIENTO', 5, 2.5);
      await merma('DETERIORO', 1, 4);
      await merma('DETERIORO', 100, 4, '2026-10-02T15:00:00Z', e, 'INGRESO');
      await merma('DETERIORO', 100, 4, '2026-10-20T15:00:00Z');
      const { merma: m } = await consultar();
      expect(m).toEqual({
        total: 36.5,
        porMotivo: [
          { motivo: 'VENCIMIENTO', valor: 32.5 },
          { motivo: 'DETERIORO', valor: 4 },
        ],
      });
    });
  });

  describe('ocupación', () => {
    beforeEach(async () => {
      await prisma.mesa.createMany({
        data: [
          { sucursalId: e.sucursalId, numero: 5, capacidad: 2, posX: 1, posY: 1 },
          { sucursalId: e.sucursalId, numero: 6, capacidad: 10, posX: 1, posY: 1, activa: false },
        ],
      });
      await prisma.horarioServicio.createMany({
        data: [
          {
            sucursalId: e.sucursalId,
            franja: 'ALMUERZO',
            horaInicio: hora('12:00'),
            horaFin: hora('16:00'),
          },
          {
            sucursalId: e.sucursalId,
            franja: 'CENA',
            horaInicio: hora('20:00'),
            horaFin: hora('01:00'),
          },
        ],
      });
    });

    it('divide los cubiertos de reservas FINALIZADA por la capacidad de los días del período', async () => {
      const s = e.sucursalId;
      await reservaFinalizada(s, '2026-10-02T15:00:00Z', 4); // almuerzo 12:00
      await reservaFinalizada(s, '2026-10-03T16:00:00Z', 6); // almuerzo 13:00
      await reservaFinalizada(s, '2026-10-04T01:00:00Z', 6); // cena 22:00 del 3
      await reservaFinalizada(s, '2026-10-04T03:00:00Z', 2); // 00:00: la cena cruza la medianoche, es del servicio del 3
      await reservaFinalizada(s, '2026-10-01T03:00:00Z', 9); // 00:00 del 1: servicio del 30/9, fuera del período
      await reservaFinalizada(s, '2026-10-03T15:00:00Z', 9, 'CANCELADA');
      await reservaFinalizada(s, '2026-10-10T15:00:00Z', 9);
      // Mesas activas 4 + 2: almuerzo de 4 h = 24 por día (168 en 7 días); cena de 5 h = 30 por día (210).
      const { ocupacion } = await consultar();
      expect(ocupacion).toEqual({
        porcentaje: 4.8, // 18 / 378
        porFranja: [
          { franja: 'ALMUERZO', porcentaje: 6 }, // 10 / 168
          { franja: 'CENA', porcentaje: 3.8 }, // 8 / 210
        ],
      });
    });

    it('sin mesas activas la capacidad es 0 y la ocupación es null', async () => {
      const sinMesas = await sucursalNueva('Sin mesas', false);
      await reservaFinalizada(e.sucursalId, '2026-10-02T15:00:00Z', 4);
      const m = await consultar({ ...ctx, sucursales: [{ id: sinMesas.id, nombre: 'Sin mesas' }] });
      expect(m.ocupacion).toEqual({
        porcentaje: null,
        porFranja: [{ franja: 'ALMUERZO', porcentaje: null }],
      });
    });
  });

  describe('proyección de ingresos', () => {
    it('suma las sucursales con historial suficiente y excluye a las que no llegan al mínimo', async () => {
      const palermo = await sucursalNueva('Palermo');
      const belgrano = await sucursalNueva('Belgrano');
      for (const id of [e.sucursalId, palermo.id, belgrano.id]) {
        await prisma.configuracionApertura.create({
          data: {
            sucursalId: id,
            semanasHistoricoMinimo: id === e.sucursalId ? 8 : 2,
            cubiertosPorMozo: 20,
            platosPorCocineroHora: 12,
          },
        });
      }
      await prisma.horarioServicio.create({
        data: {
          sucursalId: e.sucursalId,
          franja: 'ALMUERZO',
          horaInicio: hora('12:00'),
          horaFin: hora('16:00'),
        },
      });
      // Centro: 4 semanas de 8 (no llega). Palermo y Belgrano: más de 2.
      await reservaFinalizada(e.sucursalId, '2026-10-02T15:00:00Z', 4, 'FINALIZADA', 'CERRADA');
      await reservaFinalizada(palermo.id, '2026-09-01T15:00:00Z', 4, 'FINALIZADA', 'CERRADA');
      await reservaFinalizada(belgrano.id, '2026-09-01T15:00:00Z', 4, 'FINALIZADA', 'CERRADA');
      const fila = (sucursalId: string, fecha: string, ingreso: number) => ({
        sucursalId,
        fechaServicio: new Date(`${fecha}T00:00:00Z`),
        franja: 'ALMUERZO' as const,
        cubiertosEstimados: 10,
        limiteInferior: 8,
        limiteSuperior: 12,
        ingresoEstimado: ingreso,
        errorMape: 10,
        metodo: 'NAIVE_ESTACIONAL' as const,
      });
      await prisma.pronostico.createMany({
        data: [
          fila(palermo.id, '2026-11-09', 1000.1),
          fila(palermo.id, '2026-11-10', 2000.2),
          fila(e.sucursalId, '2026-11-09', 9999),
          // Fuera de la semana siguiente: no suma.
          fila(palermo.id, '2026-11-16', 5000),
        ],
      });
      const { proyeccion, alcance } = await consultar({
        ...ctx,
        sucursales: [
          { id: e.sucursalId, nombre: 'Centro' },
          { id: palermo.id, nombre: 'Palermo' },
          { id: belgrano.id, nombre: 'Belgrano' },
        ],
      });
      expect(alcance.etiquetaTotal).toBe('Mis sucursales');
      expect(proyeccion).toEqual({
        total: 3000.3,
        semanaDesde: '2026-11-09',
        excluidas: [{ sucursal: 'Centro', semanas: 4, minimo: 8 }],
        sinPronostico: ['Belgrano'],
      });
    });
  });

  describe('período sin datos y aislamiento', () => {
    it('una sucursal sin movimientos devuelve ceros y listas vacías', async () => {
      const m = await consultar();
      expect(m.ventas).toEqual({ total: 0, porDia: [] });
      expect(m.platosMasPedidos).toEqual([]);
      expect(m.margenPorPlato).toEqual([]);
      expect(m.merma).toEqual({ total: 0, porMotivo: [] });
      expect(m.ocupacion).toEqual({ porcentaje: null, porFranja: [] });
      expect(m.proyeccion.total).toBe(0);
    });

    it('otro restaurante y una sucursal fuera del alcance no aportan datos', async () => {
      await new Promise((r) => setTimeout(r, 5)); // el CUIT del escenario sale de Date.now()
      const otro = await crearEscenario();
      // Datos del otro restaurante.
      await prisma.pago.create({
        data: {
          cuentaMesaId: otro.cuentaMesaId,
          comensalId: otro.comensalId,
          monto: 777,
          estado: 'APROBADO',
          fecha: new Date('2026-10-02T15:00:00Z'),
        },
      });
      await pedido(
        [{ itemMenuId: otro.pizzaId, cantidad: 9, precioUnitario: 1000 }],
        'ENTREGADO',
        undefined,
        otro,
      );
      await merma('VENCIMIENTO', 10, 2, undefined, otro);
      // Una sucursal del mismo restaurante, fuera del alcance de quien consulta.
      const palermo = await sucursalNueva('Palermo');
      const mesa = await prisma.mesa.findFirstOrThrow({ where: { sucursalId: palermo.id } });
      const cuenta = await prisma.reserva.create({
        data: {
          sucursalId: palermo.id,
          mesaId: mesa.id,
          comensalId: e.comensalId,
          inicio: new Date('2026-10-02T15:00:00Z'),
          cantidadPersonas: 4,
          modoAsignacion: 'MANUAL',
          estado: 'FINALIZADA',
          cuentaMesa: { create: {} },
        },
        include: { cuentaMesa: true },
      });
      await prisma.pago.create({
        data: {
          cuentaMesaId: cuenta.cuentaMesa!.id,
          comensalId: e.comensalId,
          monto: 555,
          estado: 'APROBADO',
          fecha: new Date('2026-10-02T15:00:00Z'),
        },
      });

      const m = await consultar();
      expect(m.ventas.total).toBe(0);
      expect(m.platosMasPedidos).toEqual([]);
      expect(m.merma.total).toBe(0);

      // Pedir la sucursal ajena o la de otro restaurante responde 403.
      for (const id of [palermo.id, otro.sucursalId]) {
        await expect(consultar(ctx, id)).rejects.toMatchObject({ status: 403 });
      }

      // Aunque el servicio fallara, el repositorio también filtra por restaurante.
      const { desde, hasta } = PERIODO;
      expect(
        await metricaRepository.pagosAprobados(e.restauranteId, [otro.sucursalId], desde, hasta),
      ).toEqual([]);
      expect(
        await metricaRepository.lineasEntregadas(e.restauranteId, [otro.sucursalId], desde, hasta),
      ).toEqual([]);
      expect(
        await metricaRepository.mermaPorMotivo(e.restauranteId, [otro.sucursalId], desde, hasta),
      ).toEqual([]);
      expect(
        await metricaRepository.datosDeOcupacion(e.restauranteId, [otro.sucursalId], desde, hasta),
      ).toEqual([]);
    });
  });
});
