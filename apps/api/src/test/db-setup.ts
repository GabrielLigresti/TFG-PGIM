import { prisma } from '../lib/prisma';

// Helpers de los tests contra la base de prueba (ver jest.db.config.js).

export interface Escenario {
  restauranteId: string;
  sucursalId: string;
  comensalId: string;
  reservaId: string;
  cuentaMesaId: string;
  harinaId: string;
  quesoId: string;
  pizzaId: string;
  aguaId: string;
  menuId: string;
}

// Vacía todas las tablas de la app (no las de Prisma).
export async function limpiarBase(): Promise<void> {
  const tablas = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\_prisma%'`;
  const lista = tablas.map((t) => `"${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${lista} RESTART IDENTITY CASCADE`);
}

const hora = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);

// Lo mínimo para pedir: una mesa activa con su cuenta abierta, un menú vigente
// con una pizza (masa intermedia + queso) y un agua sin receta, y stock de
// 1000 g de harina y 100 g de queso. Cada pizza usa 50 g de harina y 50 g de queso.
export async function crearEscenario(): Promise<Escenario> {
  const restaurante = await prisma.restaurante.create({
    data: { nombre: 'Restaurante de prueba', cuit: `30-${Date.now()}-9` },
  });
  const restauranteId = restaurante.id;
  const sucursal = await prisma.sucursal.create({
    data: {
      restauranteId,
      nombre: 'Centro',
      direccion: 'Calle Falsa 123',
      horarioApertura: hora('12:00'),
      horarioCierre: hora('00:00'),
      toleranciaNoShowMin: 15,
    },
  });
  const mesa = await prisma.mesa.create({
    data: { sucursalId: sucursal.id, numero: 4, capacidad: 4, posX: 10, posY: 10 },
  });
  const usuario = await prisma.usuario.create({
    data: {
      email: `comensal-${Date.now()}@prueba.test`,
      passwordHash: 'x',
      tipo: 'COMENSAL',
      comensal: { create: { nombre: 'Comensal de prueba' } },
    },
  });
  const inicio = new Date();
  inicio.setUTCMinutes(0, 0, 0);
  const reserva = await prisma.reserva.create({
    data: {
      sucursalId: sucursal.id,
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

  const harina = await prisma.componenteInventario.create({
    data: {
      restauranteId,
      tipo: 'INSUMO',
      nombre: 'Harina',
      unidadBase: 'GRAMO',
      costoCompraVigente: 2,
    },
  });
  const queso = await prisma.componenteInventario.create({
    data: { restauranteId, tipo: 'INSUMO', nombre: 'Queso', unidadBase: 'GRAMO' },
  });
  const masa = await prisma.componenteInventario.create({
    data: {
      restauranteId,
      tipo: 'INTERMEDIO',
      nombre: 'Masa',
      unidadBase: 'GRAMO',
      receta: {
        create: {
          rendimiento: 400,
          lineas: { create: [{ componenteId: harina.id, cantidad: 200, unidad: 'GRAMO' }] },
        },
      },
    },
  });

  const categoria = await prisma.categoria.create({
    data: { restauranteId, nombre: 'Principales' },
  });
  const pizza = await prisma.itemMenu.create({
    data: {
      restauranteId,
      categoriaId: categoria.id,
      nombre: 'Pizza',
      precio: 1000,
      receta: {
        create: {
          rendimiento: 1,
          lineas: {
            create: [
              { componenteId: masa.id, cantidad: 100, unidad: 'GRAMO' },
              { componenteId: queso.id, cantidad: 50, unidad: 'GRAMO' },
            ],
          },
        },
      },
    },
  });
  const agua = await prisma.itemMenu.create({
    data: { restauranteId, categoriaId: categoria.id, nombre: 'Agua', precio: 300 },
  });
  const menu = await prisma.menu.create({
    data: {
      restauranteId,
      nombre: 'Carta',
      vigenciaDesde: new Date('2020-01-01'),
      items: { create: [{ itemMenuId: pizza.id }, { itemMenuId: agua.id }] },
    },
  });
  await prisma.sucursal.update({ where: { id: sucursal.id }, data: { menuActivoId: menu.id } });

  await prisma.existencia.createMany({
    data: [
      { sucursalId: sucursal.id, componenteId: harina.id, cantidadActual: 1000 },
      { sucursalId: sucursal.id, componenteId: queso.id, cantidadActual: 100 },
    ],
  });

  return {
    restauranteId,
    sucursalId: sucursal.id,
    comensalId: usuario.id,
    reservaId: reserva.id,
    cuentaMesaId: reserva.cuentaMesa!.id,
    harinaId: harina.id,
    quesoId: queso.id,
    pizzaId: pizza.id,
    aguaId: agua.id,
    menuId: menu.id,
  };
}
