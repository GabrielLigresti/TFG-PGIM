// Datos ficticios de prueba. Es idempotente: se puede correr varias veces sin
// duplicar filas (npm run db:seed -w @pgim/api).
import {
  PERMISOS,
  ROLES_PREDETERMINADOS,
  type CodigoPermiso,
  type RolPredeterminado,
} from '@pgim/shared';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { CARPETA_MODELOS, borrarModelo, guardarModelo } from '../src/lib/archivos-modelo';
import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/lib/password';
import type { Prisma } from '../src/generated/prisma/client';
import type { UnidadBase, UnidadMedida } from '@pgim/shared';

const PASSWORD_DEMO = 'demo1234';

// Roles de staff que crearía el Administrador; solo existen en el seed.
const ROLES_STAFF: RolPredeterminado[] = [
  {
    nombre: 'Mozo',
    arquetipo: 'MOZO',
    permisos: [
      'reserva.ver',
      'reserva.activar',
      'mesa.cerrar',
      'pedido.ver',
      'pedido.avanzar',
      'pago.ver',
      'menu.ver',
      'turno.ver',
    ],
  },
  {
    nombre: 'Cocinero',
    arquetipo: 'COCINERO',
    permisos: ['stock.registrar', 'pedido.ver', 'pedido.gestionar_cola', 'turno.ver'],
  },
];

const SUCURSALES = [
  { nombre: 'Centro', direccion: 'Av. Siempre Viva 742' },
  { nombre: 'Palermo', direccion: 'Calle Falsa 123' },
] as const;

type NombreSucursal = (typeof SUCURSALES)[number]['nombre'];

// Salón de cada sucursal (CU-14): capacidades en orden de número de mesa,
// ubicadas en una grilla sobre el lienzo de 100 × 60.
interface SalonSeed {
  capacidades: number[];
  columnas: number;
  x0: number;
  pasoX: number;
}

const SALONES: Record<NombreSucursal, SalonSeed> = {
  Centro: { capacidades: [2, 2, 4, 4, 4, 6, 6, 8, 2, 4], columnas: 5, x0: 10, pasoX: 20 },
  Palermo: { capacidades: [2, 4, 4, 6, 2, 8], columnas: 3, x0: 20, pasoX: 30 },
};

const COMENSALES = [
  { email: 'comensal@demo.pgim.test', nombre: 'Carlos Comensal' },
  { email: 'comensal2@demo.pgim.test', nombre: 'Lucía Comensal' },
];

const EMPLEADOS: {
  email: string;
  nombreCompleto: string;
  rol: string;
  sucursales: NombreSucursal[];
}[] = [
  {
    email: 'admin@demo.pgim.test',
    nombreCompleto: 'Ana Admin',
    rol: 'Administrador',
    sucursales: ['Centro', 'Palermo'],
  },
  {
    email: 'gerente@demo.pgim.test',
    nombreCompleto: 'Germán Gerente',
    rol: 'Gerente de sucursal',
    sucursales: ['Centro'],
  },
  {
    email: 'cocina@demo.pgim.test',
    nombreCompleto: 'Julia Jefa',
    rol: 'Jefe de cocina',
    sucursales: ['Centro'],
  },
  {
    email: 'mozo@demo.pgim.test',
    nombreCompleto: 'Mario Mozo',
    rol: 'Mozo',
    sucursales: ['Centro'],
  },
  {
    email: 'cocinero@demo.pgim.test',
    nombreCompleto: 'Carla Cocinera',
    rol: 'Cocinero',
    sucursales: ['Palermo'],
  },
];

// Las columnas time se guardan como DateTime; Prisma ignora la fecha.
function hora(hhmm: string): Date {
  return new Date(`1970-01-01T${hhmm}:00.000Z`);
}

const HORARIOS_SERVICIO = [
  { franja: 'ALMUERZO', horaInicio: hora('12:00'), horaFin: hora('16:00') },
  { franja: 'CENA', horaInicio: hora('20:00'), horaFin: hora('00:00') },
] as const;

const CATEGORIAS = [
  { nombre: 'Entradas', requiereReceta: false },
  { nombre: 'Principales', requiereReceta: true },
  { nombre: 'Postres', requiereReceta: true },
  { nombre: 'Bebidas', requiereReceta: false },
] as const;

type NombreCategoria = (typeof CATEGORIAS)[number]['nombre'];

// Costos ficticios por unidad base; stock inicial de la sucursal Centro.
const INSUMOS: { nombre: string; unidadBase: UnidadBase; costo: number; stock: number }[] = [
  { nombre: 'Carne vacuna', unidadBase: 'GRAMO', costo: 18, stock: 20000 },
  { nombre: 'Queso provolone', unidadBase: 'GRAMO', costo: 14, stock: 5000 },
  { nombre: 'Papa', unidadBase: 'GRAMO', costo: 1.2, stock: 15000 },
  { nombre: 'Tomate', unidadBase: 'GRAMO', costo: 2.5, stock: 6000 },
  { nombre: 'Cebolla', unidadBase: 'GRAMO', costo: 1.5, stock: 6000 },
  { nombre: 'Morrón', unidadBase: 'GRAMO', costo: 4, stock: 3000 },
  { nombre: 'Aceite de oliva', unidadBase: 'MILILITRO', costo: 12, stock: 5000 },
  { nombre: 'Vinagre', unidadBase: 'MILILITRO', costo: 3, stock: 2000 },
  { nombre: 'Sal', unidadBase: 'GRAMO', costo: 0.5, stock: 3000 },
  { nombre: 'Huevo', unidadBase: 'UNIDAD', costo: 250, stock: 120 },
  { nombre: 'Leche', unidadBase: 'MILILITRO', costo: 1.5, stock: 10000 },
  { nombre: 'Azúcar', unidadBase: 'GRAMO', costo: 1.2, stock: 5000 },
];

type LineaSeed = [componente: string, cantidad: number, unidad: UnidadMedida, merma?: number];

interface RecetaSeed {
  rendimiento: number;
  instrucciones: string;
  lineas: LineaSeed[];
}

const SALSA_CRIOLLA: RecetaSeed = {
  rendimiento: 1000,
  instrucciones: 'Picar las verduras chico y mezclar con el aceite, el vinagre y la sal.',
  lineas: [
    ['Tomate', 400, 'GRAMO', 10],
    ['Cebolla', 300, 'GRAMO', 10],
    ['Morrón', 200, 'GRAMO', 15],
    ['Aceite de oliva', 100, 'MILILITRO'],
    ['Vinagre', 50, 'MILILITRO'],
    ['Sal', 10, 'GRAMO'],
  ],
};

// Las fotos están en apps/web/public/fotos-demo (licencias en su LICENCIA.md).
// "Milanesa con puré" queda sin receta a propósito: es un principal y la
// categoría la exige, así que la pantalla de platos lo marca.
const PLATOS: {
  nombre: string;
  categoria: NombreCategoria;
  precio: number;
  descripcion: string;
  foto: string;
  receta?: RecetaSeed;
}[] = [
  {
    nombre: 'Provoleta',
    categoria: 'Entradas',
    precio: 7500,
    descripcion: 'Queso provolone a la parrilla con orégano.',
    foto: 'provoleta.jpg',
    receta: {
      rendimiento: 1,
      instrucciones: 'Grillar el queso en la plancha de hierro hasta dorar.',
      lineas: [
        ['Queso provolone', 200, 'GRAMO'],
        ['Aceite de oliva', 10, 'MILILITRO'],
      ],
    },
  },
  {
    nombre: 'Empanada de carne',
    categoria: 'Entradas',
    precio: 2500,
    descripcion: 'Cortada a cuchillo, al horno.',
    foto: 'empanada-de-carne.jpg',
  },
  {
    nombre: 'Bife de chorizo con papas',
    categoria: 'Principales',
    precio: 18000,
    descripcion: 'Bife de 400 g con papas fritas y salsa criolla.',
    foto: 'bife-de-chorizo-con-papas.jpg',
    receta: {
      rendimiento: 1,
      instrucciones: 'Sellar el bife a fuego fuerte; freír las papas en bastones.',
      lineas: [
        ['Carne vacuna', 400, 'GRAMO', 15],
        ['Papa', 300, 'GRAMO', 20],
        ['Aceite de oliva', 30, 'MILILITRO'],
        ['Sal', 5, 'GRAMO'],
        ['Salsa criolla', 80, 'GRAMO'],
      ],
    },
  },
  {
    nombre: 'Milanesa con puré',
    categoria: 'Principales',
    precio: 14000,
    descripcion: 'Milanesa de ternera con puré de papas.',
    foto: 'milanesa-con-pure.jpg',
  },
  {
    nombre: 'Flan casero',
    categoria: 'Postres',
    precio: 5500,
    descripcion: 'Con dulce de leche o crema.',
    foto: 'flan-casero.jpg',
    receta: {
      rendimiento: 4,
      instrucciones: 'Batir, colar y cocinar a baño María en el horno durante 50 minutos.',
      lineas: [
        ['Huevo', 4, 'UNIDAD'],
        ['Leche', 0.5, 'LITRO'],
        ['Azúcar', 150, 'GRAMO'],
      ],
    },
  },
  {
    nombre: 'Agua mineral',
    categoria: 'Bebidas',
    precio: 2000,
    descripcion: 'Botella de 500 ml, con o sin gas.',
    foto: 'agua-mineral.jpg',
  },
];

async function seedPermisos(tx: Prisma.TransactionClient): Promise<Map<CodigoPermiso, string>> {
  const ids = new Map<CodigoPermiso, string>();
  for (const { codigo, modulo, accion } of PERMISOS) {
    const permiso = await tx.permiso.upsert({
      where: { codigo },
      update: { modulo, accion },
      create: { codigo, modulo, accion },
    });
    ids.set(codigo, permiso.id);
  }
  return ids;
}

async function seedSalon(
  tx: Prisma.TransactionClient,
  sucursalId: string,
  { capacidades, columnas, x0, pasoX }: SalonSeed,
): Promise<void> {
  for (const [i, capacidad] of capacidades.entries()) {
    const numero = i + 1;
    const posicion = {
      capacidad,
      posX: x0 + (i % columnas) * pasoX,
      posY: 15 + Math.floor(i / columnas) * 30,
      activa: true,
    };
    await tx.mesa.upsert({
      where: { sucursalId_numero: { sucursalId, numero } },
      update: posicion,
      create: { sucursalId, numero, ...posicion },
    });
  }
}

async function seedRol(
  tx: Prisma.TransactionClient,
  restauranteId: string,
  rol: RolPredeterminado,
  predeterminado: boolean,
  permisoIds: Map<CodigoPermiso, string>,
): Promise<string> {
  const { id } = await tx.rol.upsert({
    where: { restauranteId_nombre: { restauranteId, nombre: rol.nombre } },
    update: { arquetipo: rol.arquetipo, predeterminado, activo: true },
    create: { restauranteId, nombre: rol.nombre, arquetipo: rol.arquetipo, predeterminado },
  });

  await tx.rolPermiso.deleteMany({ where: { rolId: id } });
  await tx.rolPermiso.createMany({
    data: rol.permisos.map((codigo) => ({ rolId: id, permisoId: permisoIds.get(codigo)! })),
  });
  return id;
}

// Reemplaza la receta del dueño (plato o intermedio) por la del seed.
async function seedReceta(
  tx: Prisma.TransactionClient,
  dueno: { itemMenuId: string } | { productoIntermedioId: string },
  receta: RecetaSeed,
  componentes: Map<string, string>,
): Promise<void> {
  const datos = { rendimiento: receta.rendimiento, instrucciones: receta.instrucciones };
  const { id } = await tx.receta.upsert({
    where: dueno,
    update: datos,
    create: { ...dueno, ...datos },
  });
  await tx.lineaReceta.deleteMany({ where: { recetaId: id } });
  await tx.lineaReceta.createMany({
    data: receta.lineas.map(([componente, cantidad, unidad, merma = 0]) => ({
      recetaId: id,
      componenteId: componentes.get(componente)!,
      cantidad,
      unidad,
      porcentajeMerma: merma,
    })),
  });
}

async function seedComponente(
  tx: Prisma.TransactionClient,
  restauranteId: string,
  datos: {
    nombre: string;
    tipo: 'INSUMO' | 'INTERMEDIO';
    unidadBase: UnidadBase;
    costoCompra: number | null;
  },
): Promise<string> {
  const existente = await tx.componenteInventario.findFirst({
    where: { restauranteId, nombre: datos.nombre },
  });
  const componente = existente
    ? await tx.componenteInventario.update({
        where: { id: existente.id },
        data: { ...datos, activo: true },
      })
    : await tx.componenteInventario.create({ data: { restauranteId, ...datos } });
  return componente.id;
}

async function seedMenuEInventario(
  tx: Prisma.TransactionClient,
  restauranteId: string,
  centroId: string,
  adminId: string,
): Promise<string[]> {
  const categoriaIds = new Map<NombreCategoria, string>();
  for (const { nombre, requiereReceta } of CATEGORIAS) {
    const categoria = await tx.categoria.upsert({
      where: { restauranteId_nombre: { restauranteId, nombre } },
      update: { requiereReceta },
      create: { restauranteId, nombre, requiereReceta },
    });
    categoriaIds.set(nombre, categoria.id);
  }

  const componentes = new Map<string, string>();
  for (const insumo of INSUMOS) {
    const id = await seedComponente(tx, restauranteId, {
      nombre: insumo.nombre,
      tipo: 'INSUMO',
      unidadBase: insumo.unidadBase,
      costoCompra: insumo.costo,
    });
    componentes.set(insumo.nombre, id);

    // El stock es la suma de los movimientos: la existencia nace con un
    // INGRESO. Solo se crea una vez, así que volver a correr el seed no duplica.
    const existencia = await tx.existencia.findUnique({
      where: { sucursalId_componenteId: { sucursalId: centroId, componenteId: id } },
    });
    if (!existencia) {
      await tx.existencia.create({
        data: {
          sucursalId: centroId,
          componenteId: id,
          cantidadActual: insumo.stock,
          movimientos: {
            create: {
              tipo: 'INGRESO',
              cantidad: insumo.stock,
              costoUnitario: insumo.costo,
              motivo: 'Stock inicial',
              empleadoId: adminId,
            },
          },
        },
      });
    }
  }

  const salsaId = await seedComponente(tx, restauranteId, {
    nombre: 'Salsa criolla',
    tipo: 'INTERMEDIO',
    unidadBase: 'GRAMO',
    costoCompra: null,
  });
  componentes.set('Salsa criolla', salsaId);
  await seedReceta(tx, { productoIntermedioId: salsaId }, SALSA_CRIOLLA, componentes);

  const platoIds: string[] = [];
  for (const plato of PLATOS) {
    const datos = {
      categoriaId: categoriaIds.get(plato.categoria)!,
      precio: plato.precio,
      descripcion: plato.descripcion,
      fotoUrl: `/fotos-demo/${plato.foto}`,
      disponible: true,
      activo: true,
    };
    const existente = await tx.itemMenu.findFirst({
      where: { restauranteId, nombre: plato.nombre },
    });
    const item = existente
      ? await tx.itemMenu.update({ where: { id: existente.id }, data: datos })
      : await tx.itemMenu.create({ data: { restauranteId, nombre: plato.nombre, ...datos } });

    if (plato.receta) await seedReceta(tx, { itemMenuId: item.id }, plato.receta, componentes);
    else await tx.receta.deleteMany({ where: { itemMenuId: item.id } });
    platoIds.push(item.id);
  }
  return platoIds;
}

// "Carta principal" queda vigente y activa en Centro; "Menú de invierno" ya
// venció, para ver cómo se marca en el panel.
const MENUS = [
  {
    nombre: 'Carta principal',
    descripcion: 'La carta de todo el año.',
    vigenciaDesde: '2026-10-01',
    vigenciaHasta: null,
  },
  {
    nombre: 'Menú de invierno',
    descripcion: 'Platos de olla y guisos.',
    vigenciaDesde: '2026-06-21',
    vigenciaHasta: '2026-09-20',
  },
] as const;

async function seedMenus(
  tx: Prisma.TransactionClient,
  restauranteId: string,
  platoIds: string[],
): Promise<string> {
  const ids: string[] = [];
  for (const menu of MENUS) {
    const datos = {
      descripcion: menu.descripcion,
      vigenciaDesde: new Date(`${menu.vigenciaDesde}T00:00:00.000Z`),
      vigenciaHasta: menu.vigenciaHasta && new Date(`${menu.vigenciaHasta}T00:00:00.000Z`),
    };
    const existente = await tx.menu.findFirst({ where: { restauranteId, nombre: menu.nombre } });
    const fila = existente
      ? await tx.menu.update({ where: { id: existente.id }, data: datos })
      : await tx.menu.create({ data: { restauranteId, nombre: menu.nombre, ...datos } });
    await tx.menuItem.deleteMany({ where: { menuId: fila.id } });
    await tx.menuItem.createMany({
      data: platoIds.map((itemMenuId) => ({ menuId: fila.id, itemMenuId })),
    });
    ids.push(fila.id);
  }
  return ids[0]!;
}

// Modelos de demo (Kenney, CC0; ver modelos-demo/LICENCIA.md), ya a escala
// real. El resto de los platos queda sin modelo, para ver el menú sin "Ver en RA".
const MODELOS_RA = [
  { plato: 'Flan casero', archivo: 'flan.glb', porcionGramos: 120 },
  { plato: 'Bife de chorizo con papas', archivo: 'bife.glb', porcionGramos: 400 },
];

// Fuera de la transacción porque escribe archivos. Si el plato ya tiene su
// modelo y el archivo existe, lo deja como está.
async function seedModelosRa(restauranteId: string): Promise<void> {
  for (const modelo of MODELOS_RA) {
    const plato = await prisma.itemMenu.findFirstOrThrow({
      where: { restauranteId, nombre: modelo.plato },
      include: { modeloRa: true },
    });
    const actual = plato.modeloRa?.urlModelo;
    if (actual && existsSync(path.join(CARPETA_MODELOS, path.basename(actual)))) continue;

    const archivo = await readFile(path.join(__dirname, 'modelos-demo', modelo.archivo));
    const datos = {
      urlModelo: await guardarModelo(archivo, 'glb'),
      urlModeloIos: null,
      escalaReal: 1,
      porcionGramos: modelo.porcionGramos,
    };
    await prisma.modeloRA.upsert({
      where: { itemMenuId: plato.id },
      update: datos,
      create: { itemMenuId: plato.id, ...datos },
    });
    await borrarModelo(actual);
  }
}

async function main(): Promise<void> {
  const passwordHash = await hashPassword(PASSWORD_DEMO);

  const restauranteId = await prisma.$transaction(async (tx) => {
    const permisoIds = await seedPermisos(tx);

    const restaurante = await tx.restaurante.upsert({
      where: { cuit: '30-00000000-0' },
      update: { nombre: 'La Parrilla Demo' },
      create: { nombre: 'La Parrilla Demo', cuit: '30-00000000-0' },
    });

    const sucursalIds = new Map<NombreSucursal, string>();
    for (const { nombre, direccion } of SUCURSALES) {
      const datos = {
        direccion,
        horarioApertura: hora('12:00'),
        horarioCierre: hora('00:00'),
        toleranciaNoShowMin: 15,
        activa: true,
      };
      const existente = await tx.sucursal.findFirst({
        where: { restauranteId: restaurante.id, nombre },
      });
      const sucursal = existente
        ? await tx.sucursal.update({ where: { id: existente.id }, data: datos })
        : await tx.sucursal.create({ data: { restauranteId: restaurante.id, nombre, ...datos } });
      sucursalIds.set(nombre, sucursal.id);

      await tx.horarioServicio.deleteMany({ where: { sucursalId: sucursal.id } });
      await tx.horarioServicio.createMany({
        data: HORARIOS_SERVICIO.map((h) => ({ sucursalId: sucursal.id, ...h })),
      });

      await seedSalon(tx, sucursal.id, SALONES[nombre]);
    }

    const rolIds = new Map<string, string>();
    for (const rol of ROLES_PREDETERMINADOS) {
      rolIds.set(rol.nombre, await seedRol(tx, restaurante.id, rol, true, permisoIds));
    }
    for (const rol of ROLES_STAFF) {
      rolIds.set(rol.nombre, await seedRol(tx, restaurante.id, rol, false, permisoIds));
    }

    for (const empleado of EMPLEADOS) {
      const usuario = await tx.usuario.upsert({
        where: { email: empleado.email },
        update: { passwordHash, activo: true },
        create: { email: empleado.email, passwordHash, tipo: 'EMPLEADO' },
      });
      const datos = {
        restauranteId: restaurante.id,
        rolId: rolIds.get(empleado.rol)!,
        nombreCompleto: empleado.nombreCompleto,
        horasSemanalesMax: 48,
      };
      await tx.empleado.upsert({
        where: { usuarioId: usuario.id },
        update: datos,
        create: { usuarioId: usuario.id, ...datos },
      });

      await tx.empleadoSucursal.deleteMany({ where: { empleadoId: usuario.id } });
      await tx.empleadoSucursal.createMany({
        data: empleado.sucursales.map((nombre) => ({
          empleadoId: usuario.id,
          sucursalId: sucursalIds.get(nombre)!,
        })),
      });
    }

    const admin = await tx.usuario.findUniqueOrThrow({ where: { email: 'admin@demo.pgim.test' } });
    const platoIds = await seedMenuEInventario(
      tx,
      restaurante.id,
      sucursalIds.get('Centro')!,
      admin.id,
    );
    const cartaId = await seedMenus(tx, restaurante.id, platoIds);
    await tx.sucursal.update({
      where: { id: sucursalIds.get('Centro')! },
      data: { menuActivoId: cartaId },
    });

    for (const { email, nombre } of COMENSALES) {
      const comensal = await tx.usuario.upsert({
        where: { email },
        update: { passwordHash, activo: true },
        create: { email, passwordHash, tipo: 'COMENSAL' },
      });
      await tx.comensal.upsert({
        where: { usuarioId: comensal.id },
        update: { nombre },
        create: { usuarioId: comensal.id, nombre },
      });
    }
    return restaurante.id;
  });
  await seedModelosRa(restauranteId);

  const [permisos, roles, sucursales, usuarios, componentes, platos, movimientos] =
    await Promise.all([
      prisma.permiso.count(),
      prisma.rol.count(),
      prisma.sucursal.count(),
      prisma.usuario.count(),
      prisma.componenteInventario.count(),
      prisma.itemMenu.count(),
      prisma.movimientoStock.count(),
    ]);
  console.log(
    `Seed listo: ${permisos} permisos, ${roles} roles, ${sucursales} sucursales, ${usuarios} usuarios, ` +
      `${componentes} componentes, ${platos} platos, ${movimientos} movimientos (contraseña: ${PASSWORD_DEMO}).`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
