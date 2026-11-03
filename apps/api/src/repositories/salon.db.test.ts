import { prisma } from '../lib/prisma';
import { crearEscenario, limpiarBase, type Escenario } from '../test/db-setup';
import { pedidoRepository, type CuentaParaPedido } from './pedido.repository';
import { reservaRepository } from './reserva.repository';

afterAll(() => prisma.$disconnect());

let e: Escenario;
let cuenta: CuentaParaPedido;

beforeEach(async () => {
  await limpiarBase();
  e = await crearEscenario();
  cuenta = (await pedidoRepository.buscarCuentaDelComensal(e.comensalId, e.cuentaMesaId))!;
});

const HORA = 3_600_000;
let contador = 0;

// La base exige inicios en punto.
const enPunto = (desplazamientoMs: number) => {
  const d = new Date(Date.now() + desplazamientoMs);
  d.setUTCMinutes(0, 0, 0);
  return d;
};

// Una reserva más en una mesa y un comensal nuevos de la sucursal dada.
async function otraReserva(
  sucursalId: string,
  estado: 'PENDIENTE' | 'ACTIVA' | 'FINALIZADA' | 'CANCELADA' | 'VENCIDA',
  inicio: Date,
) {
  contador += 1;
  const mesa = await prisma.mesa.create({
    data: { sucursalId, numero: 100 + contador, capacidad: 2, posX: 20, posY: 20 },
  });
  const usuario = await prisma.usuario.create({
    data: {
      email: `otro-${Date.now()}-${contador}@prueba.test`,
      passwordHash: 'x',
      tipo: 'COMENSAL',
      comensal: { create: { nombre: `Otro ${contador}` } },
    },
  });
  return prisma.reserva.create({
    data: {
      sucursalId,
      mesaId: mesa.id,
      comensalId: usuario.id,
      inicio,
      cantidadPersonas: 2,
      modoAsignacion: 'MANUAL',
      estado,
    },
  });
}

const vigentes = async (hasta: Date, restauranteId = e.restauranteId) =>
  reservaRepository.vigentesDelSalon(restauranteId, e.sucursalId, hasta);

const agua = () => ({
  itemMenuId: e.aguaId,
  cantidad: 2,
  precioUnitario: 300,
  observaciones: null,
  insumos: new Map<string, number>(),
});

describe('reservaRepository.vigentesDelSalon', () => {
  it('devuelve una ACTIVA aunque sea de otro día', async () => {
    const vieja = await otraReserva(e.sucursalId, 'ACTIVA', enPunto(-48 * HORA));
    const ids = (await vigentes(new Date())).map((f) => f.id);
    expect(ids).toContain(vieja.id);
    expect(ids).toContain(e.reservaId);
  });

  it('incluye la PENDIENTE con inicio igual a pendientesHasta y omite la posterior', async () => {
    const hasta = enPunto(5 * HORA);
    const justa = await otraReserva(e.sucursalId, 'PENDIENTE', hasta);
    const despues = await otraReserva(e.sucursalId, 'PENDIENTE', new Date(hasta.getTime() + HORA));
    const ids = (await vigentes(hasta)).map((f) => f.id);
    expect(ids).toContain(justa.id);
    expect(ids).not.toContain(despues.id);
  });

  it('omite FINALIZADA, CANCELADA y VENCIDA', async () => {
    const inicio = enPunto(-HORA);
    const finalizada = await otraReserva(e.sucursalId, 'FINALIZADA', inicio);
    const cancelada = await otraReserva(e.sucursalId, 'CANCELADA', inicio);
    const vencida = await otraReserva(e.sucursalId, 'VENCIDA', inicio);
    const ids = (await vigentes(new Date())).map((f) => f.id);
    expect(ids).not.toContain(finalizada.id);
    expect(ids).not.toContain(cancelada.id);
    expect(ids).not.toContain(vencida.id);
  });

  it('no devuelve reservas de otra sucursal', async () => {
    const otra = await prisma.sucursal.create({
      data: {
        restauranteId: e.restauranteId,
        nombre: 'Otra',
        direccion: 'Calle 2',
        horarioApertura: new Date('1970-01-01T12:00:00Z'),
        horarioCierre: new Date('1970-01-01T23:00:00Z'),
        toleranciaNoShowMin: 15,
      },
    });
    const reservaAjena = (await otraReserva(otra.id, 'ACTIVA', enPunto(0))).id;
    const ids = (await vigentes(new Date())).map((f) => f.id);
    expect(ids).not.toContain(reservaAjena);
  });

  it('no devuelve nada si el restaurante no es el de la sucursal', async () => {
    const ajeno = await prisma.restaurante.create({
      data: { nombre: 'Ajeno', cuit: `30-${Date.now()}-1` },
    });
    const filas = await vigentes(new Date(), ajeno.id);
    expect(filas).toEqual([]);
  });
});

describe('pedidoRepository.delSalon', () => {
  const delSalon = (ids: string[], restauranteId = e.restauranteId) =>
    pedidoRepository.delSalon(restauranteId, e.sucursalId, ids);

  it('agrupa por reserva y ordena por creadoEn', async () => {
    const primero = await pedidoRepository.confirmar(cuenta, [agua()]);
    const segundo = await pedidoRepository.confirmar(cuenta, [agua()]);
    const mapa = await delSalon([e.reservaId]);
    const pedidos = mapa.get(e.reservaId)!;
    expect(pedidos.map((p) => p.id)).toEqual([primero.id, segundo.id]);
    expect(pedidos[0]).toMatchObject({ numero: 1, estado: 'CONFIRMADO' });
    expect(pedidos[0]!.lineas[0]).toMatchObject({ cantidad: 2, precioUnitario: 300 });
  });

  it('incluye ENTREGADO y CANCELADO', async () => {
    const a = await pedidoRepository.confirmar(cuenta, [agua()]);
    const b = await pedidoRepository.confirmar(cuenta, [agua()]);
    await prisma.pedido.update({ where: { id: a.id }, data: { estado: 'ENTREGADO' } });
    await prisma.pedido.update({ where: { id: b.id }, data: { estado: 'CANCELADO' } });
    const estados = (await delSalon([e.reservaId])).get(e.reservaId)!.map((p) => p.estado);
    expect(estados).toEqual(['ENTREGADO', 'CANCELADO']);
  });

  it('omite la cuenta CERRADA', async () => {
    await pedidoRepository.confirmar(cuenta, [agua()]);
    await prisma.cuentaMesa.update({
      where: { id: e.cuentaMesaId },
      data: { estado: 'CERRADA', cerradaEn: new Date() },
    });
    const mapa = await delSalon([e.reservaId]);
    expect(mapa.has(e.reservaId)).toBe(false);
  });

  it('no devuelve pedidos si el restaurante no es el de la sucursal', async () => {
    await pedidoRepository.confirmar(cuenta, [agua()]);
    const ajeno = await prisma.restaurante.create({
      data: { nombre: 'Ajeno', cuit: `30-${Date.now()}-2` },
    });
    const mapa = await delSalon([e.reservaId], ajeno.id);
    expect(mapa.size).toBe(0);
  });

  it('delSalon no devuelve pedidos de otra sucursal', async () => {
    await pedidoRepository.confirmar(cuenta, [agua()]);
    const otra = await prisma.sucursal.create({
      data: {
        restauranteId: e.restauranteId,
        nombre: 'Otra',
        direccion: 'Calle 2',
        horarioApertura: new Date('1970-01-01T12:00:00Z'),
        horarioCierre: new Date('1970-01-01T23:00:00Z'),
        toleranciaNoShowMin: 15,
      },
    });
    const mapa = await pedidoRepository.delSalon(e.restauranteId, otra.id, [e.reservaId]);
    expect(mapa.size).toBe(0);
  });

  it('con una lista vacía devuelve un mapa vacío', async () => {
    await pedidoRepository.confirmar(cuenta, [agua()]);
    expect((await delSalon([])).size).toBe(0);
  });
});
